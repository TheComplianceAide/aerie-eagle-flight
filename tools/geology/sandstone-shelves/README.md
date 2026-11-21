# Sandstone Shelves at Horseshoe Bend

This 236 × 240 m insert follows the east face of the central promontory, on the west bank of the Colorado River's eastern reach. The July 14, 2023, 30 cm USDA National Agriculture Imagery Program (NAIP) photograph shows an expanse of continuous Navajo Sandstone divided by joints, pale swales, and vegetated pockets. Its two formerly authored projections and unregistered stone scatter have been replaced inside the survey.

The one-metre bare-earth elevations are from USGS 3DEP project AZ NorthEast D23, acquired May 28 to September 16, 2023. Its reference is NAVD88; the world subtracts 950 m. The output uses EPSG:32612 and the local origin (454517 E, 4081578 N), with positive x east and positive z south. The 1 m grid feeds collision and flight. The constrained 10,302-triangle mesh blends into the enclosing visible regional terrain across the outer 20 m. All 952 perimeter metres are sampled. The target simplification error is 9.5 cm before height quantization and boundary blending. Smaller individual joints and loose grains are photograph-derived material detail, not independently measured elevations.

The aerial's RGB is normalized for broad slope illumination using the measured topography. The alpha channel estimates bare mineral exposure using the red, infrared, and visible reflectances. The interleaved ground field includes short-range sky visibility and sun-facing horizon angles. Real-time direct illumination of loose sandstone specimens follows the existing regional horizon map. Existing NPGallery overlook photography and the game's previously licensed rock scans supply close-range grain.

## Rebuild

The scripts use Python with NumPy, SciPy, Pillow (WebP support), rasterio/GDAL, requests, and pydelatin. Give both commands the same external cache directory and point the second at the game's asset directory.

```sh
python tools/geology/sandstone-shelves/fetch.py /tmp/aerie-sandstone-shelves
python tools/geology/sandstone-shelves/bake.py /tmp/aerie-sandstone-shelves game
```

The permanent product links in sources.json identify the exact tiles. fetch.py obtains an expiring read URL from the public Planetary Computer NAIP catalog and reads the required windows of the two rasters. Different image encoders can alter WebP bytes. This bake used 786 × 800 photograph pixels, 5,628 mesh vertices, and a 237 × 241 collision grid.

[National Park Service field site](https://www.nps.gov/places/hsb.htm) · [NPGallery public-domain field photo by Brent and Dawn Davis, October 30, 2017](https://npgallery.nps.gov/AssetDetail/aa4e55ce-aa2c-4c77-96da-08872c5e2c6d) · [USGS 3DEP](https://www.usgs.gov/3d-elevation-program) · [USDA NAIP](https://www.fsa.usda.gov/resources/programs/national-agriculture-imagery-program)
