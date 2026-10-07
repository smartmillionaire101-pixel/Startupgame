#!/usr/bin/env python3
"""
Buildings for the 3D city (Wave 9 §A) from Overture Maps (OpenStreetMap plus
Microsoft and Google machine-learned footprints; ODbL / CDLA), read by bbox
with DuckDB straight from Overture's public GeoParquet on S3 (anonymous,
us-west-2). Overpass times out on full-city building queries; this does not.

Writes scripts/osm/work/buildings-<city>.ndjson: one JSON object per line
with kind ("building" | "part"), class, subtype, height, min_height,
num_floors, min_floor, roof_shape, roof_height, roof_color, facade_color,
facade_material, is_underground and geom (GeoJSON, as a string). tiles.mjs
reads it (buildingsFromOverture in buildings.mjs). Also writes
buildings-<city>.meta.json with the release and the row count.

    pip install duckdb
    python3 scripts/osm/overture.py <city> <west> <south> <east> <north>
    OVERTURE_RELEASE=2025-09-24.0 python3 scripts/osm/overture.py …
"""
import json
import os
import re
import sys
import time
import urllib.request

import duckdb

BUCKET = "overturemaps-us-west-2"
S3_HTTP = f"https://{BUCKET}.s3.us-west-2.amazonaws.com"
STAC = "https://stac.overturemaps.org/catalog.json"
RELEASE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})\.(\d+)")
FIELDS = [
    "class",
    "subtype",
    "height",
    "min_height",
    "num_floors",
    "min_floor",
    "roof_shape",
    "roof_height",
    "roof_color",
    "facade_color",
    "facade_material",
    "is_underground",
]


def get(url):
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


def release_key(name):
    m = RELEASE_RE.fullmatch(name)
    return (m.group(1), int(m.group(2))) if m else ("", -1)


def latest_release():
    """The newest release that has the buildings theme (S3 listing, then STAC)."""
    if os.environ.get("OVERTURE_RELEASE"):
        return os.environ["OVERTURE_RELEASE"]
    names = []
    try:
        xml = get(f"{S3_HTTP}/?list-type=2&prefix=release/&delimiter=/")
        names = re.findall(r"<Prefix>release/([^/<]+)/</Prefix>", xml)
    except Exception as e:  # noqa: BLE001
        print(f"S3 listing failed: {e}", file=sys.stderr)
    if not names:
        cat = json.loads(get(STAC))
        names = [m.group(0) for l in cat.get("links", []) for m in [RELEASE_RE.search(l.get("href", ""))] if m]
        if cat.get("latest"):
            names.append(str(cat["latest"]))
    for name in sorted({n for n in names if RELEASE_RE.fullmatch(n)}, key=release_key, reverse=True):
        probe = get(f"{S3_HTTP}/?list-type=2&max-keys=1&prefix=release/{name}/theme=buildings/type=building/")
        if "<Key>" in probe:
            return name
    raise SystemExit("no Overture release with buildings found")


def load_extension(con, name):
    """LOAD a DuckDB extension: from the PyPI wheel duckdb-extension-<name> when
    installed (no network needed), else INSTALL it from DuckDB's repository."""
    try:
        import importlib

        mod = importlib.import_module(f"duckdb_extension_{name}")
        base = os.path.join(os.path.dirname(mod.__file__), "extensions")
        for root, _dirs, files in os.walk(base):
            if f"{name}.duckdb_extension" in files:
                con.execute(f"LOAD '{os.path.join(root, name + '.duckdb_extension')}'")
                return
    except ImportError:
        pass
    con.execute(f"INSTALL {name}")
    con.execute(f"LOAD {name}")


def main():
    if len(sys.argv) != 6:
        raise SystemExit(__doc__)
    city = sys.argv[1]
    w, s, e, n = (float(v) for v in sys.argv[2:6])
    release = latest_release()
    here = os.path.dirname(os.path.abspath(__file__))
    work = os.path.join(here, "work")
    os.makedirs(work, exist_ok=True)
    out = os.path.join(work, f"buildings-{city}.ndjson")
    print(f"[{city}] Overture {release}, bbox {w},{s},{e},{n}", flush=True)

    con = duckdb.connect()
    for ext in ("spatial", "httpfs"):
        load_extension(con, ext)
    # Anonymous: the bucket is public (and stray AWS_* credentials must not be used).
    con.execute(
        "CREATE OR REPLACE SECRET overture (TYPE s3, PROVIDER config, "
        "KEY_ID '', SECRET '', REGION 'us-west-2')"
    )

    def select(type_, kind):
        src = f"read_parquet('s3://{BUCKET}/release/{release}/theme=buildings/type={type_}/*', hive_partitioning=1)"
        cols = {r[0]: r[1] for r in con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()}
        geom = "geometry" if cols.get("geometry", "").upper().startswith("GEOMETRY") else "ST_GeomFromWKB(geometry)"
        fields = ", ".join(f"{f}" if f in cols else f"NULL AS {f}" for f in FIELDS)
        return (
            f"SELECT '{kind}' AS kind, {fields}, ST_AsGeoJSON({geom}) AS geom FROM {src} "
            f"WHERE bbox.xmin < {e} AND bbox.xmax > {w} AND bbox.ymin < {n} AND bbox.ymax > {s}"
        )

    query = f"{select('building', 'building')} UNION ALL {select('building_part', 'part')}"
    t0 = time.time()
    con.execute(f"COPY ({query}) TO '{out}' (FORMAT JSON)")
    rows = sum(1 for _ in open(out, encoding="utf-8"))
    print(f"[{city}] {rows} rows in {time.time() - t0:.0f} s, {os.path.getsize(out) / 1e6:.0f} MB", flush=True)
    with open(os.path.join(work, f"buildings-{city}.meta.json"), "w", encoding="utf-8") as f:
        json.dump({"release": release, "rows": rows}, f)


if __name__ == "__main__":
    main()
