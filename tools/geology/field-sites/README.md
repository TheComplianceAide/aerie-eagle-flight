# Otter Cliff, Hamnøy and Oeschinensee source bakes

Run from the repository root. The first command downloads public source files into a cache and rebuilds the Otter Cliff granite tile, the two local terrain packages and two aerial maps, and the Swiss shoreline optics. The second rebuilds the Hamnøy building and road tables from the included, attributed OpenStreetMap extract. Both commands accept an output location for an independent comparison.

```sh
python tools/geology/field-sites/bake.py all --cache /path/to/cache --output /path/to/comparison
python tools/geology/field-sites/hamnoy_plan.py --output /path/to/comparison/lofoten-hamnoy.js
```

Individual choices for the first command are `otter`, `hamnoy`, and `oeschinen`. Its existing game asset directory defaults to `game` and can be overridden with `--game`. The Oeschinensee bake reads the unchanged part of the game's lake optics and restores the original local transition from the included margin before applying the surveyed correction. The input to the Hamnøy aerial is the existing Sentinel-2 summer mosaic in the game.

The verified Python environment used NumPy 2.4.6, SciPy 1.17.1, Pillow 13.0.0, rasterio 1.4.4, pyproj 3.7.2, pydelatin 0.4.0 and Shapely 2.2.0. A public map service can update its coverage. For an exact rebuild, place inputs with these names and SHA-256 values in the cache.

| Input | SHA-256 |
| --- | --- |
| `otter-granite.jpg` | `e2fee610579baac0133cefaaa2856ab16009809c442c6fe46081a31b4715fbd0` |
| `hamnoy-dtm.tif` | `d576d8f7ae9244d341e855290b767a976015c3a6aae485bcaeab001d89f64cd3` |
| `oeschinen-dtm.tif` | `5cd69912f9f702ac8e8d2e8b5d373f49a566b8430797a002462dd74c7fc1a548` |
| `oeschinen-photo.jpg` | `ff7fb0cda978a0a4bd0920be0a9e2d6e8ff23b3b78d200e9e9fcea9f5bf0a775` |

**Acadia.** The terrain material uses a photographed section of granite just north of Otter Cliff. The source looks south from Thunder Hole. The crop is rectified, daylight-balanced, and wrapped for use at meter scale. The original USGS photograph is public domain. [USGS source and usage](https://www.usgs.gov/media/images/granite-rocks-thunder-hole)

**Hamnøy.** The terrain uses the national 1 m terrain model from © Kartverket, resampled to 2 m and expressed in ETRS89 / UTM 33N. The baked mesh has 17,418 triangles. Submerged depths are interpolated. Original Sentinel-2 imagery and credits are in the game. [Kartverket terrain](https://kartverket.no/en/api-and-data/terrengdata) · [Kartverket terms](https://www.kartverket.no/en/api-and-data/terms-of-use)

The compressed XML is a 21 November 2026 extract of 103 building footprints, four road approaches and the bridge. It contains the original node coordinates and way IDs, with irrelevant features and contributor metadata removed. Both the extract and derived building and road tables are © OpenStreetMap contributors, available under the Open Database License 1.0. The bridge model uses the documented 60, 120 and 60 m spans. [OpenStreetMap bridge alignment](https://www.openstreetmap.org/way/75118310) · [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [Statens vegvesen bridge record](https://dokument.vegvesen.no/dokument/basis/fil/8561706)

**Oeschinensee.** The 472 × 344 m western survey uses © Federal Office of Topography swisstopo, swissALTI3D 2025 (2 m) and SWISSIMAGE, LV95 E2621180–2621652 / N1149352–1149696. The modeled water elevation is 1,574.9 m. Dry gravel on the western fan is distinguished from the higher water stage in the orthophoto. The mesh has 8,799 triangles. Submerged bed material and depth are reconstructed. [swissALTI3D dataset](https://www.swisstopo.admin.ch/en/height-model-swissalti3d) · [SWISSIMAGE](https://www.swisstopo.admin.ch/en/orthoimage-swissimage) · [swisstopo terms](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)
