# Rockwood public boat launch

The local coordinate system is EPSG 32619, with x increasing east and z increasing south from easting 442772, northing 5060090. The 256 m square terrain inset has one-metre flight samples. Its adaptive rendered triangles use the same USGS surface and vertical datum. The timber retaining wall has its own top and contact bounds to preserve the abrupt step from the wharf to the berth.

Run the scripts from a checkout containing the shared lake-bank tools. A Python 3 environment with NumPy, SciPy, Rasterio, Shapely, scikit-image, PyDelatin, Pillow, laspy, lazrs, pyproj and requests is required.

```sh
python tools/geology/rockwood-landing/fetch.py --cache /tmp/rockwood-source
python tools/geology/rockwood-landing/bake.py --cache /tmp/rockwood-source
python tools/geology/rockwood-landing/materials.py --cache /tmp/rockwood-source
```

The lettered side uses a bold system sans-serif. Pass a local TrueType font with `--font` when recreating the texture on Linux. The 2018 USDA aerial and USGS elevation feed supply the public assets. The 2022 Maine contracted orthophoto was checked visually for land-use outlines only. The active 2022 service and tile ID are in `game/rockwood-landing-credits.txt`. The geometry does not imply present-day hydrographic or navigation accuracy.

The reproducible shrub retention gate is based on the native `cee5f3e` Moosehead renderer. Its original sequential waterfront walk admitted nine root candidates to the cover test in the Rockwood bounds for both the central and eastern passes combined. Their coordinates are quantized to 1/16 m, east/south from (-425, 1500). The local ground no longer controls remote shrub layouts. Away from the landing, rerun the native tree and waterfront-bush digests when updating the underlying regional generator.
