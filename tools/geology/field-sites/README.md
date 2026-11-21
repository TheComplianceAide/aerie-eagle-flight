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

**Oeschinensee eastern limestone wall.** The field material uses two separately credited summer photographs. The first camera's skyline and central far shore were fitted to the game relief. The second photo was matched to the overlapping exposed face with 709 accepted image correspondences. A deterministic one-in-seven holdout had a 2.56 px median interpolation error on the 1,000 px-wide field photograph. The source files come from different positions, dates and times. Terrain outside the common view uses the first image or the original regional rock material. Each baked texel carries its camera range so an eagle flying behind a visible face does not see a projected forward face. This is a photographically registered surface texture on the surveyed geometry. Sub-pixel details and unseen surfaces are reconstructed.

The two original photographs and the exported textures and paired-pixel table are CC BY-SA 4.0. Copyright Bob Tan and Deralpinbergsteiger. The in-game credits and both WebP files name the creators and link the sources and license. The two photographs were cropped, camera-registered, exposure balanced and blended. [Bob Tan, June 2022 panorama](https://commons.wikimedia.org/wiki/File:Oeschinen_Lake_(Oeschinensee)_panorama_from_above_140622.jpg) · [Deralpinbergsteiger, July 2022 shoreline](https://commons.wikimedia.org/wiki/File:Oeschinensee_panorama_view_with_turquoise_water.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

Run from the repository root with the dependencies listed above. The bake reads only the public images, the included correspondence table, and the existing game elevation fields. Its two outputs are `oeschinen-east-limestone.webp` (2100 × 1199) and `oeschinen-east-limestone-mobile.webp` (1050 × 600).

```sh
python tools/geology/field-sites/bake_oeschinen_wall.py --cache /path/to/cache --output /path/to/comparison
```

| Additional input | SHA-256 |
| --- | --- |
| `oeschinen-drone-june-2022.jpg` | `80dd8eac0aa10b27b1136036541377a241dadef923d0b56b94c5d55f6d9053c9` |
| `oeschinen-shore-july-2022-3840.jpg` | `8c1650f6dee17742678fd6d55ed8f87c52d8ec759d543d0d71867795071abcfa` |

**Hamnøy sheltered water.** `bake_hamnoy_shelter.py` packs wave exposure in the alpha of the existing fjord shore image. It casts 13 inbound bearings through the 2 m local terrain and surrounding fjord DEM up to 2.4 km. The map describes the modeled east-southeast wave field at this departure, with open water outside the local coverage. The original shore color payload is copied intact. Rebuild with `python tools/geology/field-sites/bake_hamnoy_shelter.py --game game --output /path/to/atlas-lofoten-shore.webp`. Original inputs are the credited installed Hamnøy terrain model, fjord survey and shore RGB. Comparison photography of the working harbor is reference only. [Kartverket national terrain model](https://kartverket.no/en/api-and-data/terrengdata) · [Kartverket terms](https://www.kartverket.no/en/api-and-data/terms-of-use) · [Harbor operator](https://rorbuer.no/history/)

**Oeschinensee eastern low-stage fan.** The original high-stage photo and broad 15-triangle lake section hid exposed gravel under surface water color. The revised survey reconstructs the shoreline from 2025 swissALTI3D, adds 4,706 triangles across four existing sections, and updates the signed reach and modeled shoal depth. SWISSIMAGE's historic 2004 map selection contains color flights from 1999 and 2000 over sheet 1248-31. Its 50 cm orthophotography exposes the actual braided alluvium. It was sampled, balanced and clipped to the dry low-stage terrace. Exact archive-day stage, simulated summer flow, and subaqueous details remain estimates. [swisstopo open-data terms](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) · [Cantonal Oeschinensee monitoring and seasonal stage](https://www.bvd.be.ch/content/dam/bvd/dokumente/de/awa/wasser/gew%C3%A4sserschutz/gew%C3%A4sserqualit%C3%A4t/berichte-zur-gew%C3%A4sserqualit%C3%A4t/berichte-2025-2026/kleinseen/2023-kleinseen-oes-gbl.pdf)

The east main stem follows swissTLM3D records 7324093, 7254911, 7722945, 7254910, 7324090, 7324089 and 7254909. They belong to CH0017910000. The 7254908 in-lake continuation was used only as far as the exposed fan. Its submerged, cartographic centerline does not give an active surface channel. The two lower braids instead follow the dark channels in the low-stage photograph to the 2025 contour. [swissTLM3D hydrography](https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d) · [Hydrography service](https://api3.geo.admin.ch/rest/services/api/MapServer/ch.swisstopo.swisstlm3d-gewaessernetz/7254909?geometryFormat=geojson&sr=2056)

Run the following from a git checkout with the earlier pre-bake asset revision available. Install `shapely>=2` and the Python `triangle` package in the geology bake environment alongside the dependencies above. The runtime has no geometric processing dependency.

```sh
python tools/geology/field-sites/bake_oeschinen_fan.py --cache /path/to/cache --output /path/to/comparison
```

| Additional source | SHA-256 |
| --- | --- |
| 2025 east fan swissALTI3D 2 m tile | `e6908d6a1161868d27a02f63f383f68f500bd48b2291baa8cb6c4fbadf578470` |
| Historical low-stage SWISSIMAGE WMS response | `e98ded8ed9f6c5035b5443b069df32b8eaae763d1d424c3361fba7fc9bf15412` |

### Sand Beach and Beehive Lagoon

Build the approximately 295 KB local material atlas with the script below. The script fetches a registered USDA aerial, a one-meter USGS terrain export the NPS/J. Cosgrove shell photograph and the NPS 2026 cultural landscape report. Its 2024 foreground photograph supplies flying-scale sand relief. Install pypdf in the documented bake environment. The script checks all four input SHA-256 digests. It also needs the released Acadia sky panorama in the game directory. Use the dataset URLs and geographic scope in the script to distinguish later NAIP coverage from the original export.

```sh
python tools/geology/field-sites/bake_acadia_sand_beach.py --cache /path/to/cache --output /path/to/comparison
```

The source and ODbL centerline for the mapped western staircase are credited in [Acadia scenery credits](../../../game/acadia-scenery-credits.txt). The shore-class texture's 0.5 m texels combine a resampled aerial with terrestrial elevation. They do not imply a 0.5 m ground survey of the lagoon bed. [NPS shell geology and photographs](https://www.nps.gov/articles/000/geologic-story-of-sand-beach.htm) · [NPS park cultural landscape inventory and as-built stair plan](https://irma.nps.gov/DataStore/Reference/Profile/2319481)

### Lac Berté, Camp Sud and the south narrows

The family-era white cabin occupies the recorded modern campsite at 50.73166° N, 68.50079° W. The two gravel points, dry surface and stand heights use the Government of Québec’s independent 2015/2022 orthophotos and 1 m MNT/MHC lidar products. The 2015 photograph shows through the near-bank water. Its relative transmission constrains modeled shallow depth. No bathymetric survey or discharge measurement is available. The current is animated and follows the constriction described by Labrador Air Safari. Modern roof and craft pixels have been removed from the texture under the historical structure. The MNT retained a peaked 2–3 m rise matching the cyan roof. A harmonic interpolation from its ground perimeter reconstructs the covered surface under the family-era model.

```sh
python tools/geology/field-sites/bake_berte_narrows.py --cache /tmp/berte-source
```

The command uses NumPy, SciPy, Pillow (WebP), rasterio/GDAL, Shapely, Triangle and pydelatin. It rebuilds the relief, optical field and crown/shore JS from the provincial imagery and the small traced shoreline control file. It reads the original ARF1 from commit `da35ced` if the local binary was already regenerated. Raster windows cover 600 × 432 m; tile and raster caches can be reused. Full provider layer IDs, requested bounds, reprojection and processing are in the producer.

The two image windows are 2000 × 1440 (2022) and 1500 × 1080 (2015). Their resolutions are resampling choices. The unmodified source pixel sizes are 15 cm and 30 cm. Inside the 600 × 432 m field, one 1000 × 720 texture carries land color, optical shoals and distance to the edge. A long elliptical falloff blends it into the regional lake. Crown maxima, widths, the colored water field and the underwater terrain are adaptations; credit © Gouvernement du Québec, ministère des Ressources naturelles et des Forêts, CC BY 4.0. [Orthophotos](https://www.donneesquebec.ca/recherche/dataset/imagerie-orthorectifiee-du-quebec) · [LiDAR](https://www.donneesquebec.ca/recherche/dataset/produits-derives-de-base-du-lidar) · [License](https://creativecommons.org/licenses/by/4.0/).

## Fründenhütte and the glacier forefield

Run `python bake_frunden.py --cache /path/to/frunden-inputs --game ../../../game` in this directory. The Swiss federal LV95 survey is cropped at two-metre spacing over the 688 × 676 m forefield, with a four-metre flight grid, measured roofs and rock, light-map samples, sub-metre summer imagery and a 10 cm image of the summit terrace. Two pond levels are estimated from the 2 m ground surface within the observed shorelines. Glacier conditions, lake area and facade colours refer to different capture dates. Two low, shaded windows and the dark doorway use Caumasee’s public-domain field photograph archived at `source/frunden-gable.jpg`; their approximate fenestration is a visual reconstruction. No Swiss Alpine Club image pixels are distributed.

## Korten's rocks and the outer Lofoten coast

`python bake_korten.py --cache /path/to/sources --game ../../../game` reconstructs the 348 × 400 m inset from Kartverket's DTM ImageServer (2 m), with moisture/mineral colour and vegetation reconstructed from Copernicus Sentinel-2 L2A (16 July 2025). Its upstream asset identifiers and acquisition window are pinned in the recipe. `python bake_lofoten_marine.py --cache /path/to/sources --output ../../../game/lofoten-sea-mask.js` restores the offshore mask for the 36 km outer survey from sixteen ten-metre Kartverket extracts. Uncharted bottom depth is illustrative. A protected shore band keeps the mask away from emergent rocks. The official geographic register identifies the central islet as [Korten](https://ws.geonorge.no/stedsnavn/v1/punkt?nord=67.94759&ost=13.15291&radius=80&koordsys=4326).

## Reine church and stockfish wharves

In this directory, run `python bake_reine.py --cache /path/to/cache --game ../../../game` and `python church_art.py --cache /path/to/cache --output ../../../game` with NumPy, SciPy, Pillow/WebP, pyproj, rasterio, Shapely, Triangle and pydelatin. The small source extract is an ODbL snapshot of [OpenStreetMap](https://www.openstreetmap.org/copyright) for the Reine village bounding box 13.0795,67.928,13.1025,67.9398. Its derivative footprints, road widths and marine-work features in lofoten-reine-data.js are available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Roof surfaces and canopy heights are inferred from Norway's registered one-metre bare-ground and surface models [© Kartverket, CC BY 4.0](https://www.kartverket.no/en/api-and-data/terms-of-use). The rebuild checks the source photograph and raster hashes.

The 1,168 × 928 m inset uses local terrain mesh and flight clearance, 193 footprints, 99 mapped fish-flake rows, 14 piers and a ground-material map. The town colour and many roofs use Cappo80's [village photograph](https://commons.wikimedia.org/wiki/File:Reine_vista_dal_Reinebringen.JPG) from the August 2022 Reinebringen viewpoint. The bake projects visible ground, fills occluded areas using surrounding ground, and uses the existing regional satellite colour at the southern photograph boundary. Lukas Beck's [July 2025 church photograph](https://commons.wikimedia.org/wiki/File:Reine_Kirche_lub_2025-07-21_img01.jpg) is rectified into the tower and long nave facade. Both photographs are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The daylight photographs and unchanged fictional copper-twilight flight use different illumination. Ordinary doors, siding, window spacing, timber supports and unobserved surfaces are visual reconstructions. Compare the church's white wooden long nave and square belfry to the [University of Tromsø architecture archive](https://arkitekturguide.uit.no/items/show/1233) and fishing-season practice to [Visit Lofoten](https://visitlofoten.com/en/topic/lofoten-food/skrei-and-stockfish/).

## Reinebringen, Hammarskaftet and Reinevatnet

From this directory run `python bake_reinebringen.py --cache /path/to/cache --game ../../../game` with rasterio/GDAL, Pillow/WebP, NumPy, SciPy, pyproj, Shapely and pydelatin. Use a writable cache with access to the Norwegian elevation API, Sentinel COGs and Wikimedia. The producer checks both original photograph hashes and both Norwegian raster hashes. It excludes Reine's separately measured village inset. The 2,320 × 2,088 m mountain model uses 2 m bare-ground and surface exports. A spatially connected patch of level survey returns gives the 0.169 km² outline of the hanging lake. Four water-level ray traces against the DTM supply the local reflected skyline. No submerged survey was available. Small-scale underwater bed depths are illustrative.

The upper-wall light is modeled at dusk. Landcover and relative reflectance use the 16 July 2025 real [Sentinel-2 acquisition](https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2C_32WPA_20250716_1_L2A). Two separate photographs by Simo Räsänen, [Reinevågen looking toward Reinebringen](https://commons.wikimedia.org/wiki/File:Marken_V_in_Reine,_Lofoten,_Norway,_2015_September.jpg) and [Hammarskaftet](https://commons.wikimedia.org/wiki/File:Hammarskaftet_at_Reine,_Lofoten,_Norway,_2015_September.jpg), contribute visible mineral texture on the registered faces. Nine building and wharf controls determine the first camera pose. The second uses the skyline of the foreground spur. The bake separates local mineral contrast from the real photographs' September light, feathers image edges and rejects surfaces behind the observed wall. Both derivative WebP file headers carry [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) attribution. The [official summer trail guide](https://visitlofoten.com/en/guide/reinebringen-hike/) and [Moskenes field map](https://files.solvecms.com/lofoten-friluftsraad-no/a5f9fe4/Kart%20Moskenes%20%282%29.pdf) give the neighboring peaks and position of the lake.

## Reinevågen west fishing quay

Run `python bake_reine_west.py --cache /path/to/cache --game ../../../game` after the Reine village and Reinebringen producers. The game asset directory must contain both published landform packages, the base shore field and the existing village database. The cache must contain the verified bare-ground raster and original quay photograph from the Reinebringen build. The producer fetches and checks the 1 m Norwegian surface export, reads the preserved ODbL source extract, and checks for geometric overlap with existing town buildings. Both repeated runs and the original Hamnøy shore RGB payload are preserved. Run the original Hamnøy shelter bake before this producer when rebuilding the entire Lofoten field. Relative height and canopy surface use the [Norwegian terrain service](https://www.kartverket.no/en/api-and-data/terrengdata). Building footprints, charted coast, piers and roads derive from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The committed source extract and derivative village database are available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The harbor study records modest circulation in the partly enclosed water. The modeled wind-fetch map samples 13 upwind directions against the national terrain model and actual village skerries. Boat heave and wave height are illustrative. The [SALT Reine harbor study](https://www.statsforvalteren.no/contentassets/a96abc094d8e48c0adb27178c5a8cd18/vedlegg-1---miljoundersokelse-i-reine-havn---salt-rapport-1015.pdf) provides local environmental context. [Visit Lofoten](https://visitlofoten.com/en/destination/reine/) documents the working fishing village. The coastal bank surface combines registered Sentinel-2 summer reflectance, elevation, surveyed vegetation height and mapped pavement. Waterfront buildings use lidar roof geometry and the photographed paint and siding on eight registered faces. The boat represents *Marken V* as documented there in September 2015. Its geometry and approximate 24 m length are inferred from the neighboring survey controls. Its present-day position is unknown. The [source image by Simo Räsänen](https://commons.wikimedia.org/wiki/File:Marken_V_in_Reine,_Lofoten,_Norway,_2015_September.jpg) and resulting rectified facade and hull texture are distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

### Lac Berté bush plane

The original procedural aircraft lives in `game/labrador-floatplane.js`. Its span, length and float spacing use Viking's published drawing of the radial DHC-3 Otter. The mooring is a plausible berth by the mapped south camp. The historical type, livery and operator references are in `game/labrador-credits.txt`. No aircraft registration is assigned. No private or historical photograph was copied into the game's assets.

With NumPy and Pillow installed, run `python tools/geology/field-sites/paint_berte_otter.py game/labrador-otter-skin.webp` to rebuild the original paint, panel seams and worn aluminium. The bake uses the fixed seed and Pillow's bundled bitmap/vector font.

### Oeschinensee western hotels and rowing shore

Run `python tools/geology/field-sites/bake_oeschinen_landing.py --cache /path/to/cache --game game` with the scientific Python packages above plus scikit-image and requests. This rebuilds the roof image, settlement and low-stage shore imagery, licensed surface atlas, five federal LoD2 building shells, the 2 m shoreline profile, recorded terrace canopy centers and the eleven modeled berths. Geometry for the eaves, joinery, furniture, open skiffs and oars is authored in `game/swiss-lake-landing.js`. Roof, terrace and boat clearance use the same local coordinate system and datum as the water. Water is clipped inside each independently moving hull. The Swiss water-surface return locates the edge; the underwater continuation is inferred.

Coordinates use LV95 E2622000/N1150000 and 1,574.9 m LN02 as the simulation origin. The 2004 SWISSIMAGE archive records boats in the exposed northern cove. Modern imagery shows a higher-water southern berth. The eleven hulls and fittings depict a plausible low-stage arrangement, with no claim about present fleet size. Original photographs, creators, licences, changes and direct links are in `game/credits.txt`. The surface atlas embeds its creators and CC BY-SA 4.0 terms in XMP. Each reference has different water, lighting and furnishing dates.

| Cached input | SHA-256 |
| --- | --- |
| `swissbuildings3d_3_0_2021_1248-31_2056_5728.citygml.zip` | `3a73509badc65fbba702a9ff0ebfe6f5eea30d3a7b807c40c44210785a07a458` |
| `swissalti3d_2025_2621-1149_2_2056_5728.tif` | `5cd69912f9f702ac8e8d2e8b5d373f49a566b8430797a002462dd74c7fc1a548` |
| `west-hotel-fine.jpg` | `0646bca0af28933f87995f2295eda9e0f7fb9d70d02c53c00bad3d5c4e3e503b` |
| `low-overview.jpg` | `d759230173dcafe1b53e550a9cb2078272f0d248e01a2b54ce279d04db87f5e3` |
| `full-61888645.jpg` | `e4b9585e3971ef100c7513ca14a55636bae1b43c4b424ac65b6793f48e93bd1f` |
| `full-60724717.jpg` | `2a35b93e8d8477043854d3ee21efa78b2d01a34131de333df663821e50456234` |
| `full-120320903.jpg` | `15b03d747224775011db564d3648da936a695f5b16ba44fbd45e306716484f1c` |
