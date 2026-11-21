# Plaikni Falls, Crater Lake National Park

The game uses USGS 3DEP ground elevations, USDA NAIP imagery (23 September 2022), Carrie Wyler’s 2022 National Park Service field photograph, and the NPS national public trail survey. See sources.json for original URLs, dates, the field report digest and the bounds of each photographed material sample.

From this directory, pass a scratch directory as CACHE and the game directory as GAME. Run fetch.py CACHE, plate.py CACHE, trail.py CACHE GAME, channel.py CACHE GAME and bake.py CACHE GAME in order. Python dependencies include NumPy, SciPy, Rasterio, PyProj, Requests, Shapely, Pillow and pypdfium2. The fetcher requests the public NAIP raster and the NPS field report. Work files stay in CACHE.

The 57 connected bright-water samples fix the photographed route over the main scarp. The approach and exit interpolate to the existing 3DEP channel. The park trail centerline comes from an EOS Arrow Gold+ survey. The acreage of the riparian opening comes from the aerial image. Individual plants and foot-tread spacings are inferred. The original print records surface character and vegetation, rather than a metre-scale texture survey. The material atlas uses three small samples and the site’s orthophoto. Inferred features should not be used for navigation.
