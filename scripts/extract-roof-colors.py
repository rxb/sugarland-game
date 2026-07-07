#!/usr/bin/env python3
"""
extract-roof-colors.py

Extracts real roof colors for every building in the Clewiston, FL Three.js
game from public-domain USDA NAIP aerial imagery (via the USGS National Map
ImageServer, no API key required), and writes public/data/roof-colors.json
mapping building id -> cartoon-ified hex color.

Usage:
    python3 scripts/extract-roof-colors.py

Dependencies:
    This script is self-contained: on first run it creates (or reuses) a
    virtualenv at <scratch>/ov-env (see SCRATCH_VENV_DIR below) and installs
    `pillow` and `requests` into it, then re-execs itself inside that venv.
    You do not need to install anything into system Python.

    If you'd rather manage the environment yourself:
        python3 -m venv .venv-roofcolors
        .venv-roofcolors/bin/pip install pillow requests
        .venv-roofcolors/bin/python scripts/extract-roof-colors.py

Inputs:
    public/data/clewiston.json   (buildings: [{id, poly:[[x,z],...], ...}])

Outputs:
    public/data/roof-colors.json  ({"<buildingId>": "#rrggbb", ...})
    data-src/naip/tile_{i}_{j}.png  (cached NAIP aerial tiles)
"""

import os
import sys
import subprocess

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_VENV_DIR = "/private/tmp/claude-501/-Users-richard-Repos-clewiston/3c31f19f-9013-4120-a9a4-4f6267cdd6b1/scratchpad/ov-env"


def ensure_venv_and_reexec():
    """If not already running inside our venv (or one with deps available),
    create/reuse a venv and re-exec this script inside it."""
    try:
        import PIL  # noqa: F401
        import requests  # noqa: F401
        return  # deps already available in current interpreter
    except ImportError:
        pass

    venv_dir = SCRATCH_VENV_DIR
    venv_python = os.path.join(venv_dir, "bin", "python")

    if not os.path.exists(venv_python):
        # Fallback: create a local venv next to the script if the scratch
        # location isn't available (e.g. running on a different machine).
        if not os.path.isdir(os.path.dirname(venv_dir)):
            venv_dir = os.path.join(REPO_ROOT, ".venv-roofcolors")
            venv_python = os.path.join(venv_dir, "bin", "python")
        if not os.path.exists(venv_python):
            print(f"[setup] Creating venv at {venv_dir} ...", file=sys.stderr)
            subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)

    print("[setup] Ensuring pillow/requests are installed ...", file=sys.stderr)
    subprocess.run(
        [venv_python, "-m", "pip", "install", "--quiet", "pillow", "requests"],
        check=True,
    )

    print(f"[setup] Re-executing under {venv_python}", file=sys.stderr)
    os.execv(venv_python, [venv_python] + sys.argv)


ensure_venv_and_reexec()

# ---------------------------------------------------------------------------
# Real imports (only reached once deps are guaranteed available)
# ---------------------------------------------------------------------------
import json
import math
import time
import colorsys

import requests
from PIL import Image

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

INPUT_JSON = os.path.join(REPO_ROOT, "public", "data", "clewiston.json")
OUTPUT_JSON = os.path.join(REPO_ROOT, "public", "data", "roof-colors.json")
TILE_DIR = os.path.join(REPO_ROOT, "data-src", "naip")

EXPORT_URL = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"

# Game-coordinate <-> lon/lat conversion constants (from the game's own
# projection, given in the task description):
#   x = (lon - LON0) * METERS_PER_DEG_LON * cos(LAT0_RAD)
#   z = -(lat - LAT0) * METERS_PER_DEG_LAT
LON0 = -80.9335
LAT0 = 26.754
METERS_PER_DEG_LON = 111320.0
METERS_PER_DEG_LAT = 110540.0
COS_LAT0 = math.cos(math.radians(LAT0))

MARGIN_M = 50.0
TILE_SIZE_M = 1000.0  # ~1000m square tiles
PIXELS_PER_METER = 2.0  # 0.5 m/px
TILE_PIXELS = int(TILE_SIZE_M * PIXELS_PER_METER)  # 2000 px

SAMPLE_SPACING_M = 1.2
EDGE_MARGIN_M = 1.5
SHRINK_FALLBACK_FRACTION = 0.30  # shift 30% toward centroid for small footprints
MIN_SAMPLES = 4

LIGHTNESS_MIN = 0.28
LIGHTNESS_MAX = 0.82
SATURATION_MULT = 1.25
SATURATION_MAX = 0.9


def game_to_lonlat(x, z):
    lon = LON0 + x / (METERS_PER_DEG_LON * COS_LAT0)
    lat = LAT0 - z / METERS_PER_DEG_LAT
    return lon, lat


def lonlat_to_game(lon, lat):
    x = (lon - LON0) * METERS_PER_DEG_LON * COS_LAT0
    z = -(lat - LAT0) * METERS_PER_DEG_LAT
    return x, z


# ---------------------------------------------------------------------------
# Tile grid / download
# ---------------------------------------------------------------------------

class TileGrid:
    """Grid of square tiles in GAME METER space (x,z), each covering
    TILE_SIZE_M x TILE_SIZE_M meters, rendered at PIXELS_PER_METER px/m."""

    def __init__(self, min_x, max_x, min_z, max_z):
        self.min_x = min_x
        self.min_z = min_z
        self.n_cols = max(1, math.ceil((max_x - min_x) / TILE_SIZE_M))
        self.n_rows = max(1, math.ceil((max_z - min_z) / TILE_SIZE_M))
        self.tiles = {}  # (i,j) -> PIL.Image
        os.makedirs(TILE_DIR, exist_ok=True)

    def tile_bounds_game(self, i, j):
        x0 = self.min_x + i * TILE_SIZE_M
        x1 = x0 + TILE_SIZE_M
        z0 = self.min_z + j * TILE_SIZE_M
        z1 = z0 + TILE_SIZE_M
        return x0, x1, z0, z1

    def tile_path(self, i, j):
        return os.path.join(TILE_DIR, f"tile_{i}_{j}.png")

    def download_tile(self, i, j):
        path = self.tile_path(i, j)
        if os.path.exists(path):
            try:
                return Image.open(path).convert("RGB")
            except Exception:
                pass  # corrupted cache, re-download

        x0, x1, z0, z1 = self.tile_bounds_game(i, j)
        # game z increases southward (z = -(lat-lat0)*..), so larger z = smaller lat
        lon0, lat0 = game_to_lonlat(x0, z1)  # (west, south)
        lon1, lat1 = game_to_lonlat(x1, z0)  # (east, north)
        west, east = sorted([lon0, lon1])
        south, north = sorted([lat0, lat1])

        bbox = f"{west},{south},{east},{north}"
        params = {
            "bbox": bbox,
            "bboxSR": 4326,
            "size": f"{TILE_PIXELS},{TILE_PIXELS}",
            "format": "png",
            "f": "image",
        }

        img = None
        for attempt in range(2):
            try:
                print(f"[download] tile_{i}_{j} bbox={bbox}", file=sys.stderr)
                r = requests.get(EXPORT_URL, params=params, timeout=60)
                r.raise_for_status()
                ct = r.headers.get("content-type", "")
                if "image" not in ct:
                    raise RuntimeError(f"unexpected content-type {ct}: {r.text[:200]}")
                with open(path, "wb") as f:
                    f.write(r.content)
                img = Image.open(path).convert("RGB")
                break
            except Exception as e:
                print(f"[download] attempt {attempt+1} failed for tile_{i}_{j}: {e}", file=sys.stderr)
                if attempt == 0:
                    time.sleep(5)
                else:
                    raise
        return img

    def get_tile(self, i, j):
        key = (i, j)
        if key not in self.tiles:
            self.tiles[key] = self.download_tile(i, j)
        return self.tiles[key]

    def sample_rgb(self, x, z):
        """Return RGB tuple at game-meter coords (x, z), or None if out of grid."""
        i = int((x - self.min_x) // TILE_SIZE_M)
        j = int((z - self.min_z) // TILE_SIZE_M)
        if i < 0 or j < 0 or i >= self.n_cols or j >= self.n_rows:
            return None
        img = self.get_tile(i, j)
        if img is None:
            return None
        x0, x1, z0, z1 = self.tile_bounds_game(i, j)
        # pixel col increases with x (west->east), pixel row increases with
        # increasing lat->north being row 0... need to match how the PNG
        # was exported: exportImage returns north-up, so row 0 = north edge.
        # Our tile's "north" edge corresponds to z0 (smaller z = further
        # north since z increases southward). So row increases as z increases.
        px = (x - x0) / TILE_SIZE_M * TILE_PIXELS
        py = (z - z0) / TILE_SIZE_M * TILE_PIXELS
        px = min(max(int(px), 0), TILE_PIXELS - 1)
        py = min(max(int(py), 0), TILE_PIXELS - 1)
        try:
            return img.getpixel((px, py))
        except Exception:
            return None


# ---------------------------------------------------------------------------
# Polygon geometry helpers (all in game-meter x/z space)
# ---------------------------------------------------------------------------

def point_in_polygon(px, pz, poly):
    """Standard ray-casting point-in-polygon test."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if ((zi > pz) != (zj > pz)) and (
            px < (xj - xi) * (pz - zi) / (zj - zi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def point_segment_distance(px, pz, x1, z1, x2, z2):
    dx, dz = x2 - x1, z2 - z1
    seg_len2 = dx * dx + dz * dz
    if seg_len2 < 1e-12:
        return math.hypot(px - x1, pz - z1)
    t = ((px - x1) * dx + (pz - z1) * dz) / seg_len2
    t = max(0.0, min(1.0, t))
    cx, cz = x1 + t * dx, z1 + t * dz
    return math.hypot(px - cx, pz - cz)


def distance_to_polygon_edge(px, pz, poly):
    n = len(poly)
    best = float("inf")
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        d = point_segment_distance(px, pz, x1, z1, x2, z2)
        if d < best:
            best = d
    return best


def centroid(poly):
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    return cx, cz


def sample_points_for_building(poly):
    """Generate interior sample points, eroded ~1.5m from the edge where
    possible, else shrunk 30% toward centroid as a fallback."""
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)

    cx, cz = centroid(poly)

    raw_points = []
    nx = max(1, int((max_x - min_x) / SAMPLE_SPACING_M) + 1)
    nz = max(1, int((max_z - min_z) / SAMPLE_SPACING_M) + 1)
    for a in range(nx):
        x = min_x + a * SAMPLE_SPACING_M
        if x > max_x:
            continue
        for b in range(nz):
            z = min_z + b * SAMPLE_SPACING_M
            if z > max_z:
                continue
            if point_in_polygon(x, z, poly):
                raw_points.append((x, z))

    if not raw_points:
        return []

    eroded = [
        (x, z) for (x, z) in raw_points
        if distance_to_polygon_edge(x, z, poly) >= EDGE_MARGIN_M
    ]

    if len(eroded) >= MIN_SAMPLES:
        return eroded

    # Fallback: shift every point 30% toward centroid (handles small
    # footprints where edge-erosion removes everything).
    shifted = []
    for (x, z) in raw_points:
        nx_ = x + (cx - x) * SHRINK_FALLBACK_FRACTION
        nz_ = z + (cz - z) * SHRINK_FALLBACK_FRACTION
        shifted.append((nx_, nz_))
    return shifted


# ---------------------------------------------------------------------------
# Color processing
# ---------------------------------------------------------------------------

def median(values):
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2.0


def cartoonify(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    l = min(max(l, LIGHTNESS_MIN), LIGHTNESS_MAX)
    s = min(s * SATURATION_MULT, SATURATION_MAX)
    r2, g2, b2 = colorsys.hls_to_rgb(h, l, s)
    r2, g2, b2 = [int(round(min(max(c, 0.0), 1.0) * 255)) for c in (r2, g2, b2)]
    return f"#{r2:02x}{g2:02x}{b2:02x}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    with open(INPUT_JSON) as f:
        data = json.load(f)
    buildings = data["buildings"]
    print(f"Loaded {len(buildings)} buildings from {INPUT_JSON}", file=sys.stderr)

    xs = [p[0] for b in buildings for p in b["poly"]]
    zs = [p[1] for b in buildings for p in b["poly"]]
    min_x, max_x = min(xs) - MARGIN_M, max(xs) + MARGIN_M
    min_z, max_z = min(zs) - MARGIN_M, max(zs) + MARGIN_M

    grid = TileGrid(min_x, max_x, min_z, max_z)
    print(
        f"Tile grid: {grid.n_cols} cols x {grid.n_rows} rows "
        f"({grid.n_cols * grid.n_rows} tiles), "
        f"bbox game-m x[{min_x:.1f},{max_x:.1f}] z[{min_z:.1f},{max_z:.1f}]",
        file=sys.stderr,
    )

    results = {}
    skipped = 0

    for idx, b in enumerate(buildings):
        bid = b["id"]
        poly = b["poly"]
        if len(poly) < 3:
            skipped += 1
            continue

        points = sample_points_for_building(poly)
        if len(points) < MIN_SAMPLES:
            skipped += 1
            continue

        r_vals, g_vals, b_vals = [], [], []
        for (x, z) in points:
            rgb = grid.sample_rgb(x, z)
            if rgb is None:
                continue
            r_vals.append(rgb[0])
            g_vals.append(rgb[1])
            b_vals.append(rgb[2])

        if len(r_vals) < MIN_SAMPLES:
            skipped += 1
            continue

        r_med = median(r_vals)
        g_med = median(g_vals)
        b_med = median(b_vals)

        hex_color = cartoonify(r_med, g_med, b_med)
        results[str(bid)] = hex_color

        if (idx + 1) % 500 == 0:
            print(f"  processed {idx + 1}/{len(buildings)} buildings...", file=sys.stderr)

    with open(OUTPUT_JSON, "w") as f:
        json.dump(results, f)

    out_size = os.path.getsize(OUTPUT_JSON)

    print("\n=== SUMMARY ===", file=sys.stderr)
    print(f"Buildings with colors: {len(results)}", file=sys.stderr)
    print(f"Buildings skipped: {skipped}", file=sys.stderr)
    print(f"Tiles: {grid.n_cols * grid.n_rows} ({grid.n_cols} x {grid.n_rows})", file=sys.stderr)
    print(f"Output file: {OUTPUT_JSON} ({out_size} bytes)", file=sys.stderr)

    for spot_id in (-1002453, 384440246):
        color = results.get(str(spot_id), "MISSING")
        print(f"Spot check building {spot_id}: {color}", file=sys.stderr)


if __name__ == "__main__":
    main()
