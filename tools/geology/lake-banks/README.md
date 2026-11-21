# Moosehead and Winnipesaukee shoreline surveys

Lily Bay, Spencer Bay, Meredith Bay, Wolfeboro Bay, Diamond Island and Sleepers Island use two-metre bare-earth elevation samples and registered one-metre four-band aerial imagery. The six rectangles cover 15.74 square kilometres. The wet/dry fits cover 19.13 kilometres of mapped shore. The regional chart remains the common boundary for visible water, bank wavelets and flight contact.

The fitter samples the near-infrared transition across the chart, rejects weak or reversed transitions, and preserves the chart endpoints where it rejoins the broader lake. The bed beneath the water is modeled from the bank slope. The lake stage is fixed. The terrain illumination field uses the sun direction of each game's lake.

The sources are [USGS 3DEP elevation](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), [USDA NAIP via the National Map](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer), [Maine GeoLibrary's 2018 USDA NAIP mosaic](https://gis.maine.gov/image/rest/services/NAIP/orthoNaip2018/ImageServer) and the game's [USGS National Hydrography Dataset](https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12) lake outline. The service export URLs and raster dimensions are saved in the cache. A future mosaic revision can change the downloaded image.

Run from the repository root with Python, NumPy, SciPy, Pillow, rasterio, affine, Requests, pyproj, pydelatin, scikit-image and Shapely installed. The game reads the baked data directly.

```sh
python tools/geology/lake-banks/banks.py --cache /tmp/aerie-lake-inputs --output /tmp/aerie-lake-surveys --report /tmp/aerie-bank-measurements.json
```

The output contains one terrain mesh and one ground photograph per site, plus the corrected shoreline runs.
