#!/usr/bin/env python3
"""Extract building height and roof morphology from cached USGS LAZ tiles.

Raw LAZ files are discovered through data-src/lidar/manifest.json. The script
streams them in chunks, keeping only points near the selected footprints.

Usage:
    python3 scripts/extract-building-morphology.py

If the current interpreter lacks the LiDAR dependencies, the script re-execs
under .venv-lidar. Create it with:
    python3 -m venv .venv-lidar
    .venv-lidar/bin/pip install -r scripts/lidar-requirements.txt
"""

import json
import math
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ensure_runtime():
    try:
        import laspy  # noqa: F401
        import numpy  # noqa: F401
        import pyproj  # noqa: F401
        import shapely  # noqa: F401
        return
    except ImportError:
        candidate = os.path.join(REPO_ROOT, ".venv-lidar", "bin", "python")
        if os.path.exists(candidate) and os.path.abspath(sys.prefix) != os.path.join(REPO_ROOT, ".venv-lidar"):
            os.execv(candidate, [candidate] + sys.argv)
        raise RuntimeError(
            "Missing LiDAR dependencies. Create .venv-lidar and install "
            "scripts/lidar-requirements.txt"
        )


ensure_runtime()

import laspy
import numpy as np
from pyproj import CRS, Transformer
from shapely import Polygon, contains_xy
from shapely.ops import transform as transform_geometry

GAME_PATH = os.path.join(REPO_ROOT, "public", "data", "clewiston.json")
MANIFEST_PATH = os.path.join(REPO_ROOT, "data-src", "lidar", "manifest.json")
FULL_OUTPUT = os.path.join(REPO_ROOT, "data-src", "lidar", "building-morphology.full.json")
RUNTIME_OUTPUT = os.path.join(REPO_ROOT, "public", "data", "building-morphology.json")

LAT0 = 26.754
LON0 = -80.9335
M_PER_LON = 111320 * math.cos(math.radians(LAT0))
M_PER_LAT = 110540
Z_TO_METERS = 0.3048006096012192  # source is NAVD88 US survey feet
BUFFER_METERS = 9.0
CHUNK_POINTS = 2_000_000


def game_to_lonlat(x, z):
    return LON0 + x / M_PER_LON, LAT0 - z / M_PER_LAT


def fit_plane(x, y, z, iterations=4):
    """Iteratively trimmed least-squares plane in meter coordinates."""
    if len(z) < 3:
        return None
    x0, y0 = float(np.median(x)), float(np.median(y))
    design = np.column_stack((x - x0, y - y0, np.ones(len(x))))
    keep = np.ones(len(z), dtype=bool)
    coeff = None
    for _ in range(iterations):
        if keep.sum() < 3:
            break
        coeff, *_ = np.linalg.lstsq(design[keep], z[keep], rcond=None)
        residual = z - design @ coeff
        median = np.median(residual[keep])
        mad = np.median(np.abs(residual[keep] - median)) * 1.4826
        limit = max(0.08, 3 * mad)
        keep = np.abs(residual - median) <= limit
    if coeff is None:
        return None
    residual = z - design @ coeff
    rmse = float(np.sqrt(np.mean(residual[keep] ** 2))) if keep.any() else float("inf")
    return {"a": float(coeff[0]), "b": float(coeff[1]), "c": float(coeff[2]), "x0": x0, "y0": y0, "rmse": rmse, "keep": keep}


def predict_plane(model, x, y):
    return model["a"] * (x - model["x0"]) + model["b"] * (y - model["y0"]) + model["c"]


def two_plane_roof(x, y, z):
    """Search simple split axes for a pair of opposing roof planes."""
    if len(z) < 30:
        return None
    cx, cy = np.median(x), np.median(y)
    xx, yy = x - cx, y - cy
    best = None
    for degrees in range(0, 180, 10):
        theta = math.radians(degrees)
        q = xx * math.cos(theta) + yy * math.sin(theta)
        for quantile in (0.4, 0.5, 0.6):
            split = np.quantile(q, quantile)
            left, right = q <= split, q > split
            if left.sum() < 12 or right.sum() < 12:
                continue
            first = fit_plane(x[left], y[left], z[left], 3)
            second = fit_plane(x[right], y[right], z[right], 3)
            if not first or not second:
                continue
            slope1 = math.degrees(math.atan(math.hypot(first["a"], first["b"])))
            slope2 = math.degrees(math.atan(math.hypot(second["a"], second["b"])))
            gradients_dot = first["a"] * second["a"] + first["b"] * second["b"]
            norms = math.hypot(first["a"], first["b"]) * math.hypot(second["a"], second["b"])
            opposition = -gradients_dot / norms if norms > 1e-8 else -1
            rmse = math.sqrt((first["rmse"] ** 2 * left.sum() + second["rmse"] ** 2 * right.sum()) / len(z))
            if min(slope1, slope2) < 5 or opposition < 0.55:
                continue
            score = rmse + abs(slope1 - slope2) * 0.006 + abs(quantile - 0.5) * 0.1
            if best is None or score < best["score"]:
                # Recover the cross-slope direction from the opposing fitted
                # gradients; this is more precise than the coarse search angle.
                cross_angle = math.degrees(math.atan2(first["b"] - second["b"], first["a"] - second["a"]))
                ridge_bearing = (-cross_angle) % 180
                best = {
                    "score": score, "rmse": rmse, "slope": (slope1 + slope2) / 2,
                    "ridgeBearing": ridge_bearing, "opposition": opposition,
                }
    return best


def confidence_level(score):
    if score >= 0.8:
        return "high"
    if score >= 0.55:
        return "medium"
    if score >= 0.3:
        return "low"
    return "insufficient"


def score_record(point_count, density, coverage, ground_count, ground_rmse, class6_fraction, roof_rmse):
    ground = min(1, ground_count / 40) * max(0, 1 - ground_rmse / 0.25)
    height = 0.30 * min(1, point_count / 80) + 0.25 * min(1, density / 2) + 0.25 * coverage + 0.20 * class6_fraction
    height *= 0.5 + 0.5 * ground
    shape = height * max(0, 1 - roof_rmse / 0.4)
    return ground, height, shape


if "--self-test" in sys.argv:
    rng = np.random.default_rng(1928)
    xx, yy = np.meshgrid(np.linspace(-5, 5, 25), np.linspace(-4, 4, 21))
    x, y = xx.ravel(), yy.ravel()
    flat = 4.2 + rng.normal(0, 0.025, len(x))
    flat_model = fit_plane(x, y, flat)
    flat_slope = math.degrees(math.atan(math.hypot(flat_model["a"], flat_model["b"])))
    assert flat_model["rmse"] < 0.05 and flat_slope < 1

    gable = 6.0 - 0.38 * np.abs(x) + rng.normal(0, 0.035, len(x))
    gable_model = two_plane_roof(x, y, gable)
    assert gable_model is not None
    assert abs(gable_model["slope"] - math.degrees(math.atan(0.38))) < 2
    assert min(abs(gable_model["ridgeBearing"]), abs(gable_model["ridgeBearing"] - 180)) <= 10.1
    print("LiDAR morphology self-test passed: flat plane and north-south gable")
    sys.exit(0)


with open(GAME_PATH) as handle:
    game = json.load(handle)
with open(MANIFEST_PATH) as handle:
    manifest = json.load(handle)

selected_ids = set(manifest.get("buildingIds", []))
buildings = [b for b in game["buildings"] if not selected_ids or b["id"] in selected_ids]
if not buildings:
    raise RuntimeError("LiDAR manifest selects no current buildings")

tile_paths = [os.path.join(REPO_ROOT, "data-src", "lidar", tile["file"]) for tile in manifest["tiles"]]
missing = [path for path in tile_paths if not os.path.exists(path)]
if missing:
    raise RuntimeError(f"Missing cached LAZ files: {', '.join(missing)}")

with laspy.open(tile_paths[0]) as reader:
    source_crs = reader.header.parse_crs()
if source_crs is None or not source_crs.is_compound:
    raise RuntimeError("Expected an explicit compound horizontal + vertical CRS in USGS LAZ")
horizontal_crs = source_crs.sub_crs_list[0]
vertical_crs = source_crs.sub_crs_list[1]
xy_to_meters = horizontal_crs.axis_info[0].unit_conversion_factor
z_to_meters = vertical_crs.axis_info[0].unit_conversion_factor
if abs(z_to_meters - Z_TO_METERS) > 1e-8:
    raise RuntimeError(f"Unexpected vertical unit conversion {z_to_meters}; refusing to infer")

project = Transformer.from_crs(CRS.from_epsg(4326), horizontal_crs, always_xy=True)
prepared = []
for building in buildings:
    lonlat = [game_to_lonlat(x, z) for x, z in building["poly"]]
    poly = transform_geometry(project.transform, Polygon(lonlat))
    if not poly.is_valid:
        poly = poly.buffer(0)
    ground_ring = poly.buffer(BUFFER_METERS / xy_to_meters).difference(poly.buffer(1 / xy_to_meters))
    prepared.append({"building": building, "poly": poly, "groundRing": ground_ring, "roof": [], "fallback": [], "ground": []})

min_x = min(item["groundRing"].bounds[0] for item in prepared)
min_y = min(item["groundRing"].bounds[1] for item in prepared)
max_x = max(item["groundRing"].bounds[2] for item in prepared)
max_y = max(item["groundRing"].bounds[3] for item in prepared)

for tile_path in tile_paths:
    print(f"[read] {os.path.basename(tile_path)}", file=sys.stderr)
    with laspy.open(tile_path) as reader:
        tile_crs = reader.header.parse_crs()
        if tile_crs != source_crs:
            raise RuntimeError(f"CRS mismatch in {tile_path}")
        for chunk in reader.chunk_iterator(CHUNK_POINTS):
            x = np.asarray(chunk.x)
            y = np.asarray(chunk.y)
            z = np.asarray(chunk.z)
            classification = np.asarray(chunk.classification)
            nearby = (x >= min_x) & (x <= max_x) & (y >= min_y) & (y <= max_y)
            if not nearby.any():
                continue
            x, y, z, classification = x[nearby], y[nearby], z[nearby], classification[nearby]
            for item in prepared:
                bx0, by0, bx1, by1 = item["groundRing"].bounds
                local = (x >= bx0) & (x <= bx1) & (y >= by0) & (y <= by1)
                if not local.any():
                    continue
                lx, ly, lz, lc = x[local], y[local], z[local], classification[local]
                inside = contains_xy(item["poly"], lx, ly)
                roof = inside & (lc == 6)
                fallback = inside & (lc == 1)
                ground = contains_xy(item["groundRing"], lx, ly) & (lc == 2)
                if roof.any():
                    item["roof"].append(np.column_stack((lx[roof], ly[roof], lz[roof])))
                if fallback.any():
                    item["fallback"].append(np.column_stack((lx[fallback], ly[fallback], lz[fallback])))
                if ground.any():
                    item["ground"].append(np.column_stack((lx[ground], ly[ground], lz[ground])))

records = {}
runtime = {}
for item in prepared:
    building = item["building"]
    source_id = building.get("sourceId", str(building["id"]))
    classified_roof_count = sum(len(part) for part in item["roof"])
    roof_raw = np.concatenate(item["roof"]) if item["roof"] else np.empty((0, 3))
    fallback_raw = np.concatenate(item["fallback"]) if item["fallback"] else np.empty((0, 3))
    ground_raw = np.concatenate(item["ground"]) if item["ground"] else np.empty((0, 3))
    flags = []
    if len(roof_raw) < 12 and len(fallback_raw) >= 12:
        roof_raw = fallback_raw
        flags.append("unclassified_roof_fallback")
    if len(roof_raw) < 12 or len(ground_raw) < 10:
        records[source_id] = {
            "buildingId": building["id"], "status": "insufficient",
            "quality": {"groundPointCount": len(ground_raw), "roofPointCount": len(roof_raw), "flags": flags + ["sparse_points"]},
            "provenance": {"tiles": [os.path.basename(path) for path in tile_paths]},
        }
        continue

    gx, gy, gz = ground_raw[:, 0] * xy_to_meters, ground_raw[:, 1] * xy_to_meters, ground_raw[:, 2] * z_to_meters
    ground_model = fit_plane(gx, gy, gz)
    if ground_model is None:
        continue
    rx, ry, rz = roof_raw[:, 0] * xy_to_meters, roof_raw[:, 1] * xy_to_meters, roof_raw[:, 2] * z_to_meters
    ground_at_roof = predict_plane(ground_model, rx, ry)
    heights = rz - ground_at_roof
    valid = (heights >= 1.5) & (heights <= 30)
    rx, ry, heights = rx[valid], ry[valid], heights[valid]
    if len(heights) < 12:
        records[source_id] = {
            "buildingId": building["id"], "status": "insufficient",
            "quality": {"groundPointCount": len(ground_raw), "roofPointCount": len(heights), "flags": flags + ["invalid_height_distribution"]},
            "provenance": {"tiles": [os.path.basename(path) for path in tile_paths]},
        }
        continue

    roof_model = fit_plane(rx, ry, heights)
    two_plane = two_plane_roof(rx, ry, heights)
    eave = float(np.quantile(heights, 0.18))
    ridge = float(np.quantile(heights, 0.92))
    interquartile = float(np.quantile(heights, 0.75) - np.quantile(heights, 0.25))
    single_slope = math.degrees(math.atan(math.hypot(roof_model["a"], roof_model["b"])))
    if single_slope < 4.5 and interquartile < 0.45:
        shape = "flat"
        slope = single_slope
        ridge_bearing = None
        roof_height = float(np.median(heights))
        eave, ridge = roof_height, roof_height
    elif two_plane and two_plane["rmse"] < min(0.35, roof_model["rmse"] * 0.82):
        shape = "gable"
        slope = two_plane["slope"]
        ridge_bearing = two_plane["ridgeBearing"]
    elif roof_model["rmse"] < 0.22 and single_slope >= 4.5:
        shape = "shed"
        slope = single_slope
        ridge_bearing = None
    else:
        shape = "complex"
        slope = single_slope
        ridge_bearing = None

    area_m2 = item["poly"].area * xy_to_meters * xy_to_meters
    density = len(heights) / max(1, area_m2)
    cells = set(zip(np.floor(rx).astype(int), np.floor(ry).astype(int)))
    coverage = min(1.0, len(cells) / max(1, area_m2))
    class6_fraction = classified_roof_count / max(1, len(roof_raw))
    ground_score, height_score, shape_score = score_record(
        len(heights), density, coverage, len(ground_raw), ground_model["rmse"], class6_fraction, roof_model["rmse"]
    )
    stories = max(1, min(6, round(eave / 3.25)))
    if building.get("type") in ("industrial", "warehouse", "hangar", "church", "place_of_worship"):
        stories = 1
    stories_score = min(0.7, height_score * 0.75)

    confidence = {
        "ground": {"score": round(ground_score, 3), "level": confidence_level(ground_score)},
        "height": {"score": round(height_score, 3), "level": confidence_level(height_score)},
        "roofShape": {"score": round(shape_score, 3), "level": confidence_level(shape_score)},
        "stories": {"score": round(stories_score, 3), "level": confidence_level(stories_score)},
    }
    morphology = {
        "eaveHeightM": round(eave, 2), "ridgeHeightM": round(ridge, 2), "storiesEstimate": stories,
        "roof": {
            "shape": shape, "slopeDegrees": round(slope, 1),
            "ridgeBearingDegrees": None if ridge_bearing is None else round(ridge_bearing, 1),
            "riseM": round(max(0, ridge - eave), 2),
        },
    }
    records[source_id] = {
        "buildingId": building["id"], "status": "ok",
        "ground": {"elevationM": round(float(np.median(gz)), 2)},
        "morphology": morphology, "confidence": confidence,
        "quality": {
            "groundPointCount": len(ground_raw), "roofPointCount": len(heights),
            "roofDensityPerM2": round(density, 2), "footprintCoverage": round(coverage, 3),
            "class6Fraction": round(class6_fraction, 3), "modelRmseM": round(roof_model["rmse"], 3),
            "flags": flags + ["stale_source"],
        },
        "provenance": {"tiles": [os.path.basename(path) for path in tile_paths]},
    }
    runtime[source_id] = {
        "buildingId": building["id"], "morphology": morphology, "confidence": confidence,
    }

source = {
    "id": "+".join(manifest["workUnits"]), "project": manifest["project"],
    "workUnits": manifest["workUnits"], "acquisition": manifest["acquisition"],
    "horizontalCrs": horizontal_crs.to_string(), "verticalCrs": vertical_crs.to_string(),
    "horizontalUnit": horizontal_crs.axis_info[0].unit_name,
    "verticalUnit": vertical_crs.axis_info[0].unit_name,
    "scaleToMeters": {"horizontal": xy_to_meters, "vertical": z_to_meters},
}
with open(FULL_OUTPUT, "w") as handle:
    json.dump({"schemaVersion": 1, "source": source, "buildings": records}, handle, indent=2)
    handle.write("\n")
with open(RUNTIME_OUTPUT, "w") as handle:
    json.dump(runtime, handle, separators=(",", ":"))

ok = sum(record["status"] == "ok" for record in records.values())
print(f"{ok}/{len(records)} buildings produced usable morphology")
for source_id, record in records.items():
    if record["status"] == "ok":
        m = record["morphology"]
        print(f"  {source_id}: eave {m['eaveHeightM']}m ridge {m['ridgeHeightM']}m {m['roof']['shape']} ({record['confidence']['height']['level']})")
    else:
        print(f"  {source_id}: insufficient ({record['quality']})")
