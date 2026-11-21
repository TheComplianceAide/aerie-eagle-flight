# Moosehead and Winnipesaukee shoreline surveys

Lily Bay, Spencer Bay, Meredith Bay, Wolfeboro Bay, Hesky Park, Diamond Island and Sleepers Island use two-metre bare-earth elevation samples and registered one-metre four-band aerial imagery. The seven rectangles cover 18.26 square kilometres. The wet/dry fits follow 22.74 kilometres of mapped shore. At Wolfeboro and Hesky Park the granite quay edges are registered against six-inch state photography. The regional chart remains the common boundary for visible water, bank wavelets and flight contact.

The fitter samples the near-infrared transition across the chart, rejects weak or reversed transitions, and preserves the chart endpoints where it rejoins the broader lake. The bed beneath the water is modeled from the bank slope. The lake stage is fixed. The terrain illumination field uses the sun direction of each game's lake.

The sources are [USGS 3DEP elevation](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), [USDA NAIP via the National Map](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer), [Maine GeoLibrary's 2018 USDA NAIP mosaic](https://gis.maine.gov/image/rest/services/NAIP/orthoNaip2018/ImageServer) and the game's [USGS National Hydrography Dataset](https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12) lake outline. The service export URLs and raster dimensions are saved in the cache. A future mosaic revision can change the downloaded image.

Run from the repository root with Python, NumPy, SciPy, Pillow, rasterio, affine, Requests, pyproj, pydelatin, scikit-image and Shapely installed. The game reads the baked data directly.

```sh
python tools/geology/lake-banks/banks.py --cache /tmp/aerie-lake-inputs --output /tmp/aerie-lake-surveys --report /tmp/aerie-bank-measurements.json
```

The output contains one terrain mesh and one ground photograph per site, plus the corrected shoreline runs.

## Trees and shore buildings

The first and final lidar returns distinguish crowns that overhang a roof from the lower roof planes. The fitter works in absolute elevation, measures how far each surface extends across the footprint, and anchors its eave to the higher side of the foundation. When too few returns support a roof, the retained record is marked `plan-only`. Doors, window groupings, siding and trim are reconstructions. The tree field stores crown centers, height, width and a broadleaf/conifer estimate. A 16-metre coverage grid preserves observed gaps and open lawns.

With the bank inputs already downloaded, regenerate the crown and building assets with Python, Requests, laspy with lazrs, NumPy, pyproj, SciPy, scikit-image, Shapely, Rasterio and Pillow. Use the game folder containing the regenerated bank outlines.

```sh
python tools/geology/lake-banks/returns.py --cache /tmp/aerie-lake-inputs
python tools/geology/lake-banks/footprints.py --cache /tmp/aerie-lake-inputs
python tools/geology/lake-banks/roof_imagery.py --cache /tmp/aerie-lake-inputs
python tools/geology/lake-banks/habitat.py --cache /tmp/aerie-lake-inputs --game game --output /tmp/aerie-lake-surveys
```

The regional data scripts contain the complete derived building records in each site's `buildings` array. Vertex coordinates are metres east and south of the lake's UTM origin in `sources.py`. Roof and crown dimensions are metric. Upstream footprint attribution, terms and imagery credits are in [the atlas credits](../../../game/atlas-credits.txt).
