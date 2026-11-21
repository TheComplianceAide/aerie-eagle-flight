# Steep Creek salmon boardwalk, Juneau

Aerie uses NAD83/UTM and WGS84 data reprojected into WGS84 UTM 8N. The local origin is easting 526511, northing 6477009. Positive x is east and positive z is south. Heights use the existing Mendenhall Lake game datum, 18 m below NAVD88 elevations. The local surface extends from x −228 to −13 and z 1748 to 2040.

With Python 3, NumPy, SciPy, Pillow with WebP, rasterio, requests, laspy with lazrs, and Shapely 2 installed, run from the repository root:

```shell
python tools/geology/steep-creek/acquire.py /tmp/aerie-steep-creek
python tools/geology/steep-creek/bake.py /tmp/aerie-steep-creek /tmp/aerie-steep-creek game
```

Acquisition streams two NOAA COPC archives into temporary files and preserves the cropped returns. It also reprojects four USGS half-metre terrain tiles and records complete archive checksums. The bake writes the one-metre land and stage grids, field mask, measured trees, decks and grove material into `alaska-steep-survey.js` and `alaska-steep-habitat.webp`. The Creek runtime builds geometry from these fields.

The 2013 NOAA collection contains contiguous, level platform surfaces and rails coincident with structures in the 2023 Juneau orthophoto. These determine four separate footprints, platform elevations and the rising access guard. The ground model and Forest Service trail distinguish ground paths from elevated segments. Only existing structures are represented. Local cross-survey offset is registered on shared dry ground. The material map uses public colorized returns. The City orthophoto guides shoreline geometry and validates deck position. It is not part of the distributed texture.

The Alaska Department of Fish and Game catalog identifies this creek and its salmon habitat. Simulated adults face upstream and hold in limited-depth pockets. USGS topographic lidar does not measure the substrate through turbid water. Channel stage transitions, the bed beneath still water, individual cobbles, species at each crown, vehicle type and fish positions are reconstructions. The crown root, height and radius, as well as the thicket distribution, are constrained by actual vegetation returns. A two-bit suitability map built from ground-return color, low vegetation and damp margin geometry places native scanned grasses, sedges and forbs. The scene represents a plausible summer spawning run. The separate May 2013, summer 2023 and 2026 observations are not a single simultaneous survey.

The sources and acquisition dates are recorded in [sources.json](sources.json).
