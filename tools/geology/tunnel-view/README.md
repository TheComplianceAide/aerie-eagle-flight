# Rebuild Yosemite Valley walls and eastern summits

Use Python 3.11 or later and a C++17 compiler. Run from the repository root. GDAL in Rasterio reads bounded windows of 3DEP and NAIP cloud-optimized GeoTIFFs. A cache retains the downloaded documentary photos, resampled survey and field-registration receipts.

```sh
python -m pip install numpy scipy pillow rasterio pyproj pydelatin requests pypdfium2
cache=$(mktemp -d)
site=tools/geology/tunnel-view
python "$site/fetch.py" "$cache"
python "$site/register.py" "$cache"
python "$site/summits.py" "$cache" game
python "$site/dome_plate.py" "$cache"
python "$site/micro_plate.py" "$cache"
python "$site/bake.py" "$cache" game
python "$site/cloud_penumbra.py" game
```

The registration solves the two photographic viewpoints against a USGS digital elevation model, then renders the depth of the visible terrain. The wall atlas stores the depth of each photographed rock area in alpha. The shader compares it to the current rock surface before applying detail. The original west-buttress sample, registered Tunnel View and Glacier Point observations, and photographed granite grains share one texture binding. Sunlight and cloud shadows remain live. Dates and authors appear in `game/western-landform-credits.txt`.

The summit mesh and color image use the USGS n38w120 one-third-arcsecond DEM and four USDA August 2022 NAIP quadrangles. The summit DEM resampling distance is 8 m and the collision grid spacing is 16 m. The maximum triangulation error is 2.6 m relative to that resampled DEM. `tunnel-camera.json`, `half-dome-field.json`, `tunnel-summits-images.json`, `tunnel-summits-receipt.json`, `granite-mineral-source.json` and `tunnel-wall-receipt.json` preserve the fitted cameras, contributing sources and observation coverage. Fine details on undocumented faces still use the game's licensed scanned materials.
