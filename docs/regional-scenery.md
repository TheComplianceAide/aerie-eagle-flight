# Terrain and forest reconstruction

Aerie uses mapped land cover, elevation, aerial colour and existing tree surveys to choose what grows along a route. The same rules apply throughout each playable footprint. A registered crown keeps its measured or previously generated position. In gaps between tree records, the game estimates plant populations from habitat, elevation, slope and moisture.

## From the Dixville flight study to the game

The prototype compared two routes from the eagle’s right shoulder. One followed the rock below Table Rock for 75 m. The other crossed 71 m of eastern forest outside the high-resolution survey inset. The reference implementation divided the landscape into 128 m cells, fitted branch geometry to airborne returns, and retained the surrounding forest while a closer cell opened. The production renderer uses those cells, three crown geometry levels, photographed plant materials and a separate local shadow pass. Nearby vegetation bends in the existing wind field. Varying the height, crown shape and leaf colour of a shared specimen represents related regional species.

The Table Rock inset contains twelve adjoining cells. A half-metre ground grid follows classified airborne returns, six-inch aerial imagery supplies overhead colour, and individual crown sections constrain the near meshes. Fine branches, the visible sides of trees and species identity are reconstructed. Under forest elsewhere, ground scans represent the expected substrate, such as litter, gravel, moss or wet rock. The source and license lists identify each photographed material. [USGS and FEMA survey metadata](https://www.fisheries.noaa.gov/inport/item/71770) · [NH GRANIT aerial imagery](https://nhgeodata.unh.edu/image/rest/services/ImageServices/NH_2021_2022_6in_RGB/ImageServer) · [Plant specimens](../game/canopy-data/credits.txt) · [Ground scans](../game/field-ground-credits.txt)

## Regional coverage

ESA WorldCover 2021 v200 provides the land-cover classes. The game uses a map clipped to each world and sampled at approximately 13–38 m in the original survey coordinates. The measured Mendenhall ice margin, game shorelines, terrain, surveyed structures, roads and clearings refine placement where available. Smaller features can fall between source samples. Regional plant references guide population mixtures and treeline. [WorldCover dataset](https://doi.org/10.5281/zenodo.7254221) · [Regional habitat references and plant photography](../game/regional-habitat-credits.txt)

| Flight world | Examples along the route |
| --- | --- |
| Mendenhall Glacier | Sitka spruce and western hemlock, alder near disturbed ground, exposed rock and ice |
| Horseshoe Bend | Sand sagebrush and blackbrush on sparse desert ground, open sandstone walls |
| Oeschinen Lake | Norway spruce, European larch and Swiss stone pine below the alpine zone |
| Lake Winnipesaukee | Mixed northern hardwoods and white pine, wet margins and settled shores |
| Surry Mountain Dam and Keene | Oak, beech, hemlock and maple, with clearings at the dam and developed land |
| Dixville Notch | Sugar maple and birches, autumn litter, and exposed notched rock |
| Lac Berté | Black spruce, balsam fir and paper birch with boreal bog vegetation |
| Moosehead Lake | Spruce and hemlock mixed with hardwoods and wet forest margins |
| Yosemite Valley | Ponderosa pine, white fir and incense cedar near open granite |
| Crater Lake | Mountain hemlock and subalpine conifers on volcanic ground |
| Lofoten | Low birch, heath, coastal grass and exposed rock |
| Acadia National Park | Red spruce, balsam fir and paper birch on the wooded Atlantic headlands. Heath covers exposed granite, with ferns and alder in sheltered pockets. |

Close trees share geometry and textures across cells. The game renders distant representations at lower cost and retains the original forest while detailed assets stream. A touch device uses a smaller close radius, lower instance budgets and a smaller shadow target. The regional land-cover payload loads only when its world is selected.
