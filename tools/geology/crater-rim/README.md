# The Watchman and Cleetwood Cove

The terrain uses USGS 3DEP, Oregon DOGAMI airborne laser returns and USDA NAIP imagery. The local field aligns to bare-earth returns before triangulation. The Watchman surface samples exposed andesite beside the 1932 observation station. The center and orientation of its roof come from the return cloud. Storey dimensions, catwalk, hipped roof, windows and museum wing follow the National Register and National Park Service cultural landscape inventories. Individual stones, timbers, furniture and plant forms are reconstructions. Vegetation positions and heights come from the airborne returns.

At the cove, the land continues into the two-metre USGS multibeam survey. The littoral material combines the aerial image, registered depth and optical attenuation. Where shallow water lay beyond sonar coverage, the bed interpolates into the measured land. The closed marina depicts the documented temporary float and damaged pre-rehabilitation wharf. The trail follows NPS public centerlines, adjusted within three metres to the measured bench. Timber supports are reconstructed on exposed, steep sections. The federal sources and exact input checksums are in [sources.json](sources.json).

Use Python 3.11 or later with NumPy, SciPy, rasterio, scikit-image, shapely, pydelatin, laspy with a LAZ reader, pyproj and Pillow. Run `python rebuild.py scratch site-output` from this directory. The program checks each source before building. Source archives and intermediate point clouds stay under the chosen scratch directory.

The runtime flight check is `node tools/check_crater_rim.cjs` from the repository root.
