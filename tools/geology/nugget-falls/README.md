# Rebuild Nugget Falls

Run these commands from the repository root with Python 3.11 or later. The first three acquisitions cover the lower Nugget Creek drainage in EPSG:32608. The scripts discard downloaded LAS tiles after extracting the selected footprint. Keep the processed arrays in the cache for subsequent builds.

```sh
python -m pip install numpy scipy pillow rasterio pyproj pydelatin requests 'laspy[lazrs]'
cache=$(mktemp -d)
site=tools/geology/nugget-falls
python "$site/fetch_surface.py" "$cache"
python "$site/fetch_canopy.py" "$cache"
python "$site/fetch_entwine.py" "$cache"
python "$site/fetch_color.py" "$cache"
python "$site/fetch_sentinel.py" "$cache"
python "$site/wet_channel.py" "$cache" game
python "$site/bake_field.py" "$cache" "$cache" game
```

`nugget-field-receipt.json` records the extent, resolutions, crown count and estimated photographic coverage. The fetchers write source URLs, dates and input checksums or Entwine node IDs into the same cache. The `CBJ1` attachment records where canopy observations are available, including observed bare ground. `FLW1` holds the downhill center and active width of each observed watercourse station. The waterfall sheet samples a second mask for dry rock islands and uncertainty in the photographs.

The ground comes from the 2023 USGS Southeast Alaska landslides survey. Crown heights come from the 2012 USGS and 2013 Juneau lidar. Public 2013 Juneau LAS point colors supply the photographed slabs and historical channel extent. Crown shape and species are inferred from height, spread and local vegetation. Water speed, foam and illumination are animated. Sentinel-2 covers unsampled land. The game credits include project links and dates.
