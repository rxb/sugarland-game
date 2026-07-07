#!/usr/bin/env python3
"""
extract-trees.py

Detects individual tree crowns for the Clewiston, FL Three.js game within the
town-core bbox from cached USDA NAIP aerial imagery tiles (see
scripts/extract-roof-colors.py, which defines the tile grid / coordinate
mapping conventions reused here), and writes public/data/trees.json as a
compact array of [x, z, r] triples (game meters; r = crown radius).

Usage:
    python3 scripts/extract-trees.py

Dependencies: self-contained venv bootstrap identical to extract-roof-colors.py
(pillow only, no requests needed since we only read cached tiles).

Inputs:
    data-src/naip/tile_{i}_{j}.png   (cached NAIP tiles, downloaded previously)
    public/data/clewiston.json       (buildings, for exclusion)

Outputs:
    public/data/trees.json           ([[x,z,r], ...])
    data-src/naip/debug-trees-*.png  (validation overlays)
"""

import os
import sys
import subprocess

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_VENV_DIR = "/private/tmp/claude-501/-Users-richard-Repos-clewiston/3c31f19f-9013-4120-a9a4-4f6267cdd6b1/scratchpad/ov-env"


def ensure_venv_and_reexec():
    try:
        import PIL  # noqa: F401
        return
    except ImportError:
        pass

    venv_dir = SCRATCH_VENV_DIR
    venv_python = os.path.join(venv_dir, "bin", "python")

    if not os.path.exists(venv_python):
        if not os.path.isdir(os.path.dirname(venv_dir)):
            venv_dir = os.path.join(REPO_ROOT, ".venv-roofcolors")
            venv_python = os.path.join(venv_dir, "bin", "python")
        if not os.path.exists(venv_python):
            print(f"[setup] Creating venv at {venv_dir} ...", file=sys.stderr)
            subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)

    print("[setup] Ensuring pillow is installed ...", file=sys.stderr)
    subprocess.run(
        [venv_python, "-m", "pip", "install", "--quiet", "pillow"],
        check=True,
    )

    print(f"[setup] Re-executing under {venv_python}", file=sys.stderr)
    os.execv(venv_python, [venv_python] + sys.argv)


ensure_venv_and_reexec()

import json
import math

from PIL import Image, ImageDraw

# ---------------------------------------------------------------------------
# Config -- must match scripts/extract-roof-colors.py's tile grid exactly so
# cached tile_i_j.png files line up.
# ---------------------------------------------------------------------------

INPUT_JSON = os.path.join(REPO_ROOT, "public", "data", "clewiston.json")
OUTPUT_JSON = os.path.join(REPO_ROOT, "public", "data", "trees.json")
TILE_DIR = os.path.join(REPO_ROOT, "data-src", "naip")

LON0 = -80.9335
LAT0 = 26.754
METERS_PER_DEG_LON = 111320.0
METERS_PER_DEG_LAT = 110540.0
COS_LAT0 = math.cos(math.radians(LAT0))

MARGIN_M = 50.0
TILE_SIZE_M = 1000.0
PIXELS_PER_METER = 2.0  # 0.5 m/px
TILE_PIXELS = int(TILE_SIZE_M * PIXELS_PER_METER)

# Town-core bbox to process (game meters)
BBOX_MIN_X, BBOX_MAX_X = -2600.0, 2400.0
BBOX_MIN_Z, BBOX_MAX_Z = -850.0, 2850.0

# Must match the grid origin extract-roof-colors.py computed from the full
# buildings bbox, so tile indices resolve to the same cached PNGs.
GRID_MIN_X = -2661.31
GRID_MIN_Z = -1766.59
GRID_MAX_X = 5363.98
GRID_MAX_Z = 3346.58


def game_to_lonlat(x, z):
    lon = LON0 + x / (METERS_PER_DEG_LON * COS_LAT0)
    lat = LAT0 - z / METERS_PER_DEG_LAT
    return lon, lat


class TileGrid:
    def __init__(self, min_x, max_x, min_z, max_z):
        self.min_x = min_x
        self.min_z = min_z
        self.n_cols = max(1, math.ceil((max_x - min_x) / TILE_SIZE_M))
        self.n_rows = max(1, math.ceil((max_z - min_z) / TILE_SIZE_M))
        self.tiles = {}

    def tile_bounds_game(self, i, j):
        x0 = self.min_x + i * TILE_SIZE_M
        x1 = x0 + TILE_SIZE_M
        z0 = self.min_z + j * TILE_SIZE_M
        z1 = z0 + TILE_SIZE_M
        return x0, x1, z0, z1

    def tile_path(self, i, j):
        return os.path.join(TILE_DIR, f"tile_{i}_{j}.png")

    def get_tile(self, i, j):
        key = (i, j)
        if key not in self.tiles:
            path = self.tile_path(i, j)
            if os.path.exists(path):
                try:
                    self.tiles[key] = Image.open(path).convert("RGB")
                except Exception:
                    self.tiles[key] = None
            else:
                self.tiles[key] = None
        return self.tiles[key]

    def tile_index_for(self, x, z):
        i = int((x - self.min_x) // TILE_SIZE_M)
        j = int((z - self.min_z) // TILE_SIZE_M)
        return i, j

    def game_to_pixel(self, x, z, i, j):
        x0, x1, z0, z1 = self.tile_bounds_game(i, j)
        px = (x - x0) / TILE_SIZE_M * TILE_PIXELS
        py = (z - z0) / TILE_SIZE_M * TILE_PIXELS
        return px, py


# ---------------------------------------------------------------------------
# Polygon helpers (for building exclusion)
# ---------------------------------------------------------------------------

def point_in_polygon(px, pz, poly):
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


class BuildingGrid:
    """Coarse spatial grid of building polygons for fast point-in-any-poly."""

    CELL = 50.0

    def __init__(self, buildings):
        self.cells = {}
        self.buildings = buildings
        for b in buildings:
            poly = b["poly"]
            if len(poly) < 3:
                continue
            xs = [p[0] for p in poly]
            zs = [p[1] for p in poly]
            min_x, max_x = min(xs), max(xs)
            min_z, max_z = min(zs), max(zs)
            ci0, ci1 = int(min_x // self.CELL), int(max_x // self.CELL)
            cj0, cj1 = int(min_z // self.CELL), int(max_z // self.CELL)
            for ci in range(ci0, ci1 + 1):
                for cj in range(cj0, cj1 + 1):
                    self.cells.setdefault((ci, cj), []).append(poly)

    def point_in_any_building(self, x, z):
        ci, cj = int(x // self.CELL), int(z // self.CELL)
        polys = self.cells.get((ci, cj))
        if not polys:
            return False
        for poly in polys:
            if point_in_polygon(x, z, poly):
                return True
        return False


# ---------------------------------------------------------------------------
# Vegetation / tree detection
# ---------------------------------------------------------------------------

EXG_THRESHOLD = 22       # excess-green threshold (2G - R - B)
BRIGHTNESS_MAX = 118     # luma ceiling to separate dark canopy from bright lawn
BRIGHTNESS_MIN = 20      # floor to reject near-black shadow/water noise
CELL_M = 1.5             # mask downsample cell size (meters)
MIN_AREA_M2 = 4.0
MAX_AREA_M2 = 2500.0
LARGE_CANOPY_M2 = 120.0  # above this, split into a grid of tree seeds
SEED_SPACING_M = 7.0
SEED_RADIUS = 4.0        # radius assigned to seeded (split) trees
MAX_TREES = 25000


def build_veg_mask_for_bbox(grid, min_x, max_x, min_z, max_z):
    """Returns (mask, n_cols, n_rows, origin_x, origin_z) where mask[row][col]
    is True if that CELL_M x CELL_M cell is classified as tree canopy."""
    n_cols = int(math.ceil((max_x - min_x) / CELL_M))
    n_rows = int(math.ceil((max_z - min_z) / CELL_M))
    mask = [[False] * n_cols for _ in range(n_rows)]

    # iterate tile by tile for cache locality
    i0, j0 = grid.tile_index_for(min_x, min_z)
    i1, j1 = grid.tile_index_for(max_x, max_z)

    for ti in range(i0, i1 + 1):
        for tj in range(j0, j1 + 1):
            img = grid.get_tile(ti, tj)
            if img is None:
                continue
            px_data = img.load()
            x0, x1, z0, z1 = grid.tile_bounds_game(ti, tj)
            # bbox in pixel space overlapping our region of interest
            ov_x0 = max(x0, min_x)
            ov_x1 = min(x1, max_x)
            ov_z0 = max(z0, min_z)
            ov_z1 = min(z1, max_z)
            if ov_x0 >= ov_x1 or ov_z0 >= ov_z1:
                continue

            col0 = int((ov_x0 - min_x) // CELL_M)
            col1 = int((ov_x1 - min_x) // CELL_M)
            row0 = int((ov_z0 - min_z) // CELL_M)
            row1 = int((ov_z1 - min_z) // CELL_M)

            for row in range(row0, min(row1 + 1, n_rows)):
                cz = min_z + (row + 0.5) * CELL_M
                if cz < z0 or cz >= z1:
                    continue
                py = int((cz - z0) / TILE_SIZE_M * TILE_PIXELS)
                py = min(max(py, 0), TILE_PIXELS - 1)
                for col in range(col0, min(col1 + 1, n_cols)):
                    cx = min_x + (col + 0.5) * CELL_M
                    if cx < x0 or cx >= x1:
                        continue
                    px = int((cx - x0) / TILE_SIZE_M * TILE_PIXELS)
                    px = min(max(px, 0), TILE_PIXELS - 1)

                    # sample a small 3x3 neighborhood average for stability
                    rs = gs = bs = n = 0
                    for dx in (-2, 0, 2):
                        for dy in (-2, 0, 2):
                            sx = min(max(px + dx, 0), TILE_PIXELS - 1)
                            sy = min(max(py + dy, 0), TILE_PIXELS - 1)
                            r, g, b = px_data[sx, sy]
                            rs += r
                            gs += g
                            bs += b
                            n += 1
                    r, g, b = rs / n, gs / n, bs / n
                    exg = 2 * g - r - b
                    luma = 0.299 * r + 0.587 * g + 0.114 * b
                    if (
                        exg > EXG_THRESHOLD
                        and g > r
                        and g > b
                        and BRIGHTNESS_MIN < luma < BRIGHTNESS_MAX
                    ):
                        mask[row][col] = True

    return mask, n_cols, n_rows


def connected_components(mask, n_cols, n_rows):
    """4-connected components over the boolean grid. Returns list of lists
    of (row, col)."""
    visited = [[False] * n_cols for _ in range(n_rows)]
    components = []
    for r0 in range(n_rows):
        for c0 in range(n_cols):
            if not mask[r0][c0] or visited[r0][c0]:
                continue
            stack = [(r0, c0)]
            visited[r0][c0] = True
            comp = []
            while stack:
                r, c = stack.pop()
                comp.append((r, c))
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < n_rows and 0 <= nc < n_cols:
                        if mask[nr][nc] and not visited[nr][nc]:
                            visited[nr][nc] = True
                            stack.append((nr, nc))
            components.append(comp)
    return components


def components_to_trees(components, min_x, min_z):
    trees = []
    cell_area = CELL_M * CELL_M
    for comp in components:
        area = len(comp) * cell_area
        if area < MIN_AREA_M2 or area > MAX_AREA_M2:
            continue

        rows = [c[0] for c in comp]
        cols = [c[1] for c in comp]
        min_r, max_r = min(rows), max(rows)
        min_c, max_c = min(cols), max(cols)

        if area <= LARGE_CANOPY_M2:
            cr = sum(rows) / len(rows)
            cc = sum(cols) / len(cols)
            x = min_x + (cc + 0.5) * CELL_M
            z = min_z + (cr + 0.5) * CELL_M
            radius = max(1.5, math.sqrt(area / math.pi))
            trees.append((x, z, radius))
        else:
            # seed a grid of trees across the bounding box of the component,
            # restricted to cells actually in the component
            comp_set = set(comp)
            step = max(1, int(round(SEED_SPACING_M / CELL_M)))
            for r in range(min_r, max_r + 1, step):
                for c in range(min_c, max_c + 1, step):
                    # find nearest in-component cell within a small radius
                    found = None
                    for rad in range(0, step):
                        for dr in range(-rad, rad + 1):
                            for dc in range(-rad, rad + 1):
                                if (r + dr, c + dc) in comp_set:
                                    found = (r + dr, c + dc)
                                    break
                            if found:
                                break
                        if found:
                            break
                    if found is None:
                        continue
                    fr, fc = found
                    x = min_x + (fc + 0.5) * CELL_M
                    z = min_z + (fr + 0.5) * CELL_M
                    trees.append((x, z, SEED_RADIUS))
    return trees


# ---------------------------------------------------------------------------
# Debug overlay rendering
# ---------------------------------------------------------------------------

def render_debug_overlay(grid, trees, cx, cz, half_size_m, out_path):
    """Crop a region centered at (cx, cz) with given half-size, draw tree
    circles, save PNG."""
    min_x, max_x = cx - half_size_m, cx + half_size_m
    min_z, max_z = cz - half_size_m, cz + half_size_m

    px_per_m = PIXELS_PER_METER
    w = int((max_x - min_x) * px_per_m)
    h = int((max_z - min_z) * px_per_m)
    canvas = Image.new("RGB", (w, h), (0, 0, 0))

    i0, j0 = grid.tile_index_for(min_x, min_z)
    i1, j1 = grid.tile_index_for(max_x, max_z)
    for ti in range(i0, i1 + 1):
        for tj in range(j0, j1 + 1):
            img = grid.get_tile(ti, tj)
            if img is None:
                continue
            tx0, tx1, tz0, tz1 = grid.tile_bounds_game(ti, tj)
            ov_x0, ov_x1 = max(tx0, min_x), min(tx1, max_x)
            ov_z0, ov_z1 = max(tz0, min_z), min(tz1, max_z)
            if ov_x0 >= ov_x1 or ov_z0 >= ov_z1:
                continue
            src_px0 = int((ov_x0 - tx0) / TILE_SIZE_M * TILE_PIXELS)
            src_px1 = int((ov_x1 - tx0) / TILE_SIZE_M * TILE_PIXELS)
            src_py0 = int((ov_z0 - tz0) / TILE_SIZE_M * TILE_PIXELS)
            src_py1 = int((ov_z1 - tz0) / TILE_SIZE_M * TILE_PIXELS)
            crop = img.crop((src_px0, src_py0, src_px1, src_py1))
            dst_x = int((ov_x0 - min_x) * px_per_m)
            dst_y = int((ov_z0 - min_z) * px_per_m)
            canvas.paste(crop, (dst_x, dst_y))

    draw = ImageDraw.Draw(canvas)
    n_drawn = 0
    for (x, z, r) in trees:
        if min_x <= x <= max_x and min_z <= z <= max_z:
            px = (x - min_x) * px_per_m
            py = (z - min_z) * px_per_m
            pr = r * px_per_m
            draw.ellipse([px - pr, py - pr, px + pr, py + pr], outline=(255, 0, 0), width=2)
            n_drawn += 1

    canvas.save(out_path)
    print(f"[debug] saved {out_path} with {n_drawn} tree circles drawn", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    with open(INPUT_JSON) as f:
        data = json.load(f)
    buildings = data["buildings"]
    print(f"Loaded {len(buildings)} buildings from {INPUT_JSON}", file=sys.stderr)

    building_grid = BuildingGrid(buildings)

    grid = TileGrid(GRID_MIN_X, GRID_MAX_X, GRID_MIN_Z, GRID_MAX_Z)
    print(
        f"Tile grid: {grid.n_cols} cols x {grid.n_rows} rows, "
        f"processing bbox x[{BBOX_MIN_X},{BBOX_MAX_X}] z[{BBOX_MIN_Z},{BBOX_MAX_Z}]",
        file=sys.stderr,
    )

    global EXG_THRESHOLD, BRIGHTNESS_MAX, LARGE_CANOPY_M2

    attempt = 0
    while True:
        attempt += 1
        print(f"\n[attempt {attempt}] EXG_THRESHOLD={EXG_THRESHOLD} BRIGHTNESS_MAX={BRIGHTNESS_MAX}", file=sys.stderr)

        mask, n_cols, n_rows = build_veg_mask_for_bbox(
            grid, BBOX_MIN_X, BBOX_MAX_X, BBOX_MIN_Z, BBOX_MAX_Z
        )
        veg_cells = sum(sum(row) for row in mask)
        print(f"  vegetation cells: {veg_cells} / {n_cols * n_rows} ({100*veg_cells/(n_cols*n_rows):.1f}%)", file=sys.stderr)

        components = connected_components(mask, n_cols, n_rows)
        print(f"  connected components: {len(components)}", file=sys.stderr)

        trees = components_to_trees(components, BBOX_MIN_X, BBOX_MIN_Z)
        print(f"  raw trees before building-exclusion: {len(trees)}", file=sys.stderr)

        # exclude trees inside buildings
        filtered = [
            (x, z, r) for (x, z, r) in trees
            if not building_grid.point_in_any_building(x, z)
        ]
        excluded = len(trees) - len(filtered)
        print(f"  excluded (inside buildings): {excluded}", file=sys.stderr)
        print(f"  final tree count: {len(filtered)}", file=sys.stderr)

        if len(filtered) <= MAX_TREES:
            trees = filtered
            break

        print(f"  EXCEEDS CAP of {MAX_TREES}, raising thresholds and retrying...", file=sys.stderr)
        EXG_THRESHOLD += 6
        BRIGHTNESS_MAX -= 10
        if attempt > 6:
            print("  giving up raising thresholds further, truncating list", file=sys.stderr)
            trees = filtered[:MAX_TREES]
            break

    # Debug overlays
    render_debug_overlay(grid, trees, 0.0, 0.0, 250.0,
                          os.path.join(TILE_DIR, "debug-trees-downtown.png"))
    render_debug_overlay(grid, trees, 0.0, 600.0, 250.0,
                          os.path.join(TILE_DIR, "debug-trees-residential.png"))

    # Write output: compact array, 1 decimal place
    out = [[round(x, 1), round(z, 1), round(r, 1)] for (x, z, r) in trees]
    with open(OUTPUT_JSON, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    out_size = os.path.getsize(OUTPUT_JSON)

    radii = [t[2] for t in trees]
    print("\n=== SUMMARY ===", file=sys.stderr)
    print(f"Total trees: {len(trees)}", file=sys.stderr)
    if radii:
        print(f"Radius min/median/max: {min(radii):.1f} / {sorted(radii)[len(radii)//2]:.1f} / {max(radii):.1f}", file=sys.stderr)
    print(f"Thresholds used: EXG_THRESHOLD={EXG_THRESHOLD}, BRIGHTNESS_MAX={BRIGHTNESS_MAX}, "
          f"BRIGHTNESS_MIN={BRIGHTNESS_MIN}, CELL_M={CELL_M}, LARGE_CANOPY_M2={LARGE_CANOPY_M2}", file=sys.stderr)
    print(f"Output file: {OUTPUT_JSON} ({out_size} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
