# Regional geology

The per-world JSON manifests in `game/geology-data` identify every source sheet, its sixteen specimens, physical sizes, terrain anchors and distribution bounds. `habitats.json` contains named locations in local east/south metres. `fields.json` bounds additional mapped shore, outcrop and footslope populations. Surry dam armor stays on its engineered faces. River stones follow the mapped Ashuelot, Merced or Dixville brook channels. Mount Kineo rock is confined to its local sector.

Each generated source view provides the observed contour and visible mineral surface. Depth and the unseen faces are reconstructed. Split forms and openings survive where source resolution allows. Each independent cell has a closed volume, two geometry resolutions, filter-safe UVs and a measured-size class in metres. Both levels share the same base-color and tangent-normal atlas. Distance, device class and hysteresis govern the draw radius. Verified lake stage and bank proximity darken and smooth the lower parts of wet stones. Above 14 cm, eagle clearance queries the actual high-detail triangle surface.

Run from the repository with Python, NumPy, Pillow, SciPy, scikit-image and fast-simplification. The production directory supplies `expansion/plans/sheets.json`, `written`, `expansion/written`, `generated` and `expansion/generated`. A sheet must contain sixteen isolated source cells listed in reading order.

```sh
python tools/geology/bake_specimens.py /path/to/regional-art-production --sheet alaska-moraine
python tools/geology/check_models.py --production /path/to/regional-art-production --expect 40
```

The ARG1 binary contains sixteen consecutive forms with near and middle resolution records in each. Every record starts with two little-endian unsigned 16-bit counts for vertices and indices. Vertices contain eight signed 16-bit values in XYZ, normal XYZ, UV order. Divide position by 16,000 and the other fields by 32,767. The index buffer is unsigned 16-bit. The checker verifies the source digest, independent geometry signatures, surface volume, closed edge parity, normals, UV tile allocation, index bounds, per-cell extents and both texture atlases.

The four Mount Kineo GLBs are independently authored geographic and scan assets. Their sources, licenses and interpretation are described in [Kineo credits](../../game/geology-data/kineo-credits.txt). The Mendenhall inset uses a separate 0.5 m lidar measurement resampled to 1 m. Its mapped submerged undulations and individual stone placements are reconstructed. [Mendenhall credits](../../game/mendenhall-geology-credits.txt)

## Distant terrain in Alaska and Yosemite

The near and distant meshes use the same survey positions and surface normals. The distant index buffer keeps every boundary sample and retains extra triangles where slope or elevation changes rapidly. The browser switches at a distance specific to the survey interval. It falls back to the full-resolution surface if a tile's elevation or normal fingerprint has changed.

Serve the game directory locally, then regenerate the packs from the same source revision. The baker runs the world factory in Chrome. Set `CHROME` to its executable path if needed. The upstream Mapbox Martini 0.2.0 implementation and ISC license are included in `terrain-index/`.

```sh
python3 -m http.server 8080 --directory game
# In a separate terminal at the repository root
node tools/geology/terrain-index/bake.mjs http://localhost:8080/ alaska
node tools/geology/terrain-index/bake.mjs http://localhost:8080/ yosemite
node tools/check_terrain_indices.cjs
```
