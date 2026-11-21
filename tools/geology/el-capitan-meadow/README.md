# El Capitan Meadow

The site is the grassy opening north of the Merced below El Capitan. On 7 August 2022, USDA's 0.60 m four-band NAIP aerial recorded a summer-drying meadow, its open swales, scattered trees, the gravel bar, and Northside Drive. The NPS/USGS inventory, completed in 2007 using 1997 aerial photography and field plots, maps four contiguous intermittently to seasonally flooded meadow polygons here. The grass material follows the summer red and near-infrared responses of this particular opening. The river bar, paths and road are excluded from its mapped cover.

NCALM acquired airborne lidar for the National Park Service in September 2006. Its ground and first/other returns estimate crown heights and widths. The bake accepts a crown in the simulated meadow or 60 m wooded margin only if the 2022 photo still shows a live vegetation signal there. Existing photographic crowns with no nearby historical measurement are retained where the 2022 image supports them. The oak, cottonwood and mixed-conifer communities are inferred from the mapped stand and crown shape. These two surveys do not record the same year.

## Reproduce

Use Python with NumPy, SciPy, Rasterio, PyProj, Pillow, Shapely, Requests and Laspy with Lazrs. From this directory, run the following, with an empty cache directory and the game directory containing the existing Yosemite crown inventory.

```sh
python fetch.py /path/to/cache
python bake.py /path/to/cache /path/to/game
python ground-optics.py /path/to/cache /path/to/game
python canopy.py /path/to/cache /path/to/game
```

The fetcher requests the public NPS/CDFW vegetation service and the USDA catalogue entry. The canopy bake downloads one 32 MB CC BY 4.0 NCALM tile and checks the 2022 registered foliage in the same projected coordinates. The JSON receipts in the cache record the source, acquisition date, sample counts and location. The original crown records beyond the site remain byte-for-byte unchanged. The plant field uses weighted cover and moisture in a four-metre grid. The terrain mixes the observed summer cover with a two-metre specimen of dry grass and its measured normal. This adds fine, wind-laid litter without changing terrain height or shadow direction.

## Sources

- [El Capitan Meadow, National Park Service](https://www.nps.gov/places/000/el-capitan-meadow.htm). The park's reference photograph is used for visual review. Its pixels are not part of the game.
- [Vegetation Map, Yosemite National Park](https://www.nps.gov/yose/learn/nature/vegetation-map.htm) and [California Department of Fish and Wildlife public service](https://services2.arcgis.com/Uq9r85Potqm3MfRV/arcgis/rest/services/biosds200_fpu/FeatureServer/0).
- [Merced River restoration and meadows](https://www.nps.gov/yose/learn/nature/mercedrestoration-meadows.htm) and [Merced River Plan, Chapter 4](https://www.nps.gov/yose/learn/management/upload/Chapter_4_AffectedEnvironment.pdf).
- [USDA NAIP imagery, August 7, 2022](https://naipeuwest.blob.core.windows.net/naip/v002/ca/2022/ca_060cm_2022/37119/m_3711919_ne_11_060_20220807.tif).
- Stock, G. (2006). *Yosemite, CA: El Portal, Mariposa Grove, Yosemite Canyon & Tuolumne Meadows.* National Center for Airborne Laser Mapping, for NPS. Distributed by OpenTopography under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Aerie derives crown locations, heights and approximate widths from these returns. [Dataset DOI](https://doi.org/10.5069/G9GQ6VP3).

- Charlotte Baglioni, *Withered Grass*, Poly Haven. A two-metre CC0 material sample supplies the sub-metre grass detail. Its location differs from Yosemite. [Material and license](https://polyhaven.com/a/withered_grass).
