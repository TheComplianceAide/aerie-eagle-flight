# Mendenhall's upper tongue and medial moraine

The Central Alaska regional release already contains a multi-date ArcticDEM surface, with an optical glacier outline. At the two interior destinations this pass replaces its elevation with the southeastern Alaska USGS D22 lidar survey. Values come from the field vertices in UTM zone 8N. The game origin is (526511, 6477009) m, with positive x east, positive z south and world height 18 m below NAVD88.

The lidar unit for Juneau ran from July 7 through October 28, 2023. Its original hydro-flattened raster has a 0.5 m cell. Area averages supply the five-metre continuous tongue. Two 1.1 km square windows at the named destinations preserve one-metre slope and local concavity in the ice material. Confidence decays into the historical surface along the edges, the upper-game boundary and before the existing terminus. Exact cells in the two game targets are represented to the precision of the engine’s 1/8 m base height and 1/7 m residual. Erosion and glacier flow continue after this measurement. [USGS dataset and CC0 terms](https://www.fisheries.noaa.gov/inport/item/80000)

The broad sediment belt uses red, green, blue and near-infrared Sentinel-2A surface reflectance acquired on August 8, 2024, at 20:28 UTC. The map uses the published band scale, offset and solar direction, with a gently smoothed lidar slope correction. Only the fine surface specimen comes from the July 17, 2018 Kienholz et al. UAV ortho of adjacent Suicide Basin. A 51.2 m crop at UTM (528619.2, 6480179.6) was high-pass filtered for surface dirt and small fractures. It gives texture to the ice. The positions, sizes, and orientations of the large crevasses come from the local lidar. Contains modified Copernicus Sentinel data (2024). [Acquisition record](https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_8VNK_20240808_0_L2A) · [Arctic Data Center, CC0](https://arcticdata.io/catalog/view/doi:10.18739/A2GT5FG0B)

A distance field from the existing glacial outline keeps detached margin specimens within 68 m of the ice edge. Old placeholder rock perches above the body of the glacier are replaced with suitable shallow patches of the actual ice surface. Calved ice blocks belong to a separate system in the lake. A 2014 helicopter photograph and Bethan Davies’s June 2022 field photograph were also used to check the shape and material from above. Both remain with their publishers. [EGU / Kondrashov](https://imaggeo.egu.eu/view/2990/) · [Davies et al., Fig. 2B](https://doi.org/10.1038/s41467-024-49269-y)

## Reproduce the derived assets

Install Python with `numpy`, `scipy`, `Pillow`, `rasterio`, `pyproj`, `requests`, `tifffile` and `imagecodecs`. Run the commands below from the repository with an empty or reusable cache. `surface.py` uses the original survey as input, so rebuilding the project produces the same result each time. The original Git blob is `2b5357135f73b5cabb0bcdf7b08e93c85597fbb2`.

```sh
mkdir -p /tmp/mendenhall-data
git cat-file blob 2b5357135f73b5cabb0bcdf7b08e93c85597fbb2 > /tmp/mendenhall-data/regional-base.js
python tools/geology/mendenhall-crevasses/fetch.py /tmp/mendenhall-data
python tools/geology/mendenhall-crevasses/tongue.py /tmp/mendenhall-data
python tools/geology/mendenhall-crevasses/uav.py /tmp/mendenhall-data
python tools/geology/mendenhall-crevasses/surface.py /tmp/mendenhall-data /tmp/mendenhall-data/regional-base.js game
python tools/geology/mendenhall-crevasses/bake.py /tmp/mendenhall-data game
python tools/geology/mendenhall-crevasses/optics.py /tmp/mendenhall-data game
```

Finally run `node tools/geology/terrain-index/bake.mjs http://127.0.0.1:8000/ alaska game/terrain-indices-alaska.bin` against an HTTP server rooted in the resulting `game` directory. This uses the repository’s terrain simplifier on the new elevations. Its fingerprints and tessellation remain tied to the same vertices used by the eagle for clearance. The fetcher writes full tile lists and the bake records the fit against the lidar, source observation times and spectra in its cache.
