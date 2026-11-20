# Regional scenery asset inventory

## Three-world public test

Version 0.17.0 includes 624 authored regional specimen slots across 39 sheets. Mendenhall Glacier has 240, Moosehead Lake has 192, and Lake Winnipesaukee has 192. Each sheet has sixteen independently named cells. Mip levels, mesh detail levels, instances, and the four supplemental Mount Kineo survey models are excluded from those counts. The earlier inventory below describes the preceding game.

A fresh world selection starts at Spruce and stone shoreline in Alaska, Wind across the reeds in Maine, and White-tailed deer above the Broads in New Hampshire. A saved departure link keeps its chosen launch. All twelve worlds remain accessible.

The v0.16 starting point at revision `84d116e` supplies **252 verified asset assignments across twelve worlds** in the categories below. A source used in two worlds counts once in each regional library. The same source has one identity in the shared library. Completing ten times these audited starting categories would require **2,520 regional assignments**. The final target can grow when the world-specific geometry audit is complete.

## Verified starting inventory

Tree forms count the distinct source meshes reachable in the close canopy renderer. The named tree and shrub profiles are listed separately because several use the same mesh. Ground growth counts independently modeled ferns, alder, heath, tussocks and related forms. The rush column counts the additional modeled bulrush clump where it is enabled. Understory counts the photographed close meshes with positive regional weighting. The seven understory positions also include a woody-scrub photograph available at distance. Water and sheltered habitat can select additional plants in the field.

Soil counts the opening, litter, bank, stone and aerial material slots. Talus counts the six source scans only where the game dispatches the scatter renderer or Mendenhall west-ridge equivalent. The perch column counts the single original rock shelf form available in each world. Source variants from tint, rotation, scale, cell seeds, detail level, shadow meshes and viewing angles are excluded.

| World | Tree forms | Canopy shrub form | Regional ground growth | Rush | Scanned understory meshes | Soil | Talus | Perch | Verified subtotal | 10× subtotal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mendenhall Glacier | 4 | 1 | 3 | 0 | 6 | 5 | 6 | 1 | 26 | 260 |
| Oeschinen Lake | 3 | 1 | 2 | 0 | 6 | 5 | 6 | 1 | 24 | 240 |
| Horseshoe Bend | 0 | 1 | 2 | 0 | 3 | 5 | 6 | 1 | 18 | 180 |
| Yosemite Valley | 4 | 1 | 3 | 0 | 6 | 5 | 6 | 1 | 26 | 260 |
| Crater Lake | 3 | 0 | 2 | 0 | 6 | 5 | 0 | 1 | 17 | 170 |
| Lofoten | 1 | 1 | 3 | 0 | 6 | 5 | 0 | 1 | 17 | 170 |
| Milford Sound | 1 | 1 | 3 | 0 | 6 | 5 | 0 | 1 | 17 | 170 |
| Dixville Notch | 4 | 0 | 3 | 1 | 6 | 5 | 6 | 1 | 26 | 260 |
| Lac Berté | 4 | 0 | 3 | 1 | 6 | 5 | 0 | 1 | 20 | 200 |
| Lake Winnipesaukee | 4 | 0 | 3 | 1 | 6 | 5 | 0 | 1 | 20 | 200 |
| Surry Mountain Dam / Keene | 4 | 0 | 3 | 1 | 6 | 5 | 0 | 1 | 20 | 200 |
| Moosehead Lake | 4 | 1 | 3 | 1 | 6 | 5 | 0 | 1 | 21 | 210 |

Species and community names describe assignments reachable under the encoded climate and cover rules. Seeing every one on a specific flight requires an in-game placement census. Low willow and coastal heath are general vegetation labels.

| World | Named tree profiles | Canopy scrub profiles | Modeled regional ground growth | Soil slot IDs |
| --- | --- | --- | --- | --- |
| Mendenhall Glacier | 3 · Black cottonwood, Sitka spruce, Western hemlock | Sitka alder | alder, fern, tussock | 0, 1, 7, 4, 8 |
| Oeschinen Lake | 3 · European larch, Norway spruce, Swiss stone pine | Low willow | tussock, bilberry | 6, 1, 7, 5, 8 |
| Horseshoe Bend | 0 | Blackbrush, Sand sagebrush | ephedra, tussock | 10, 11, 3, 13, 9 |
| Yosemite Valley | 5 · Black cottonwood, California black oak, Incense cedar, Ponderosa pine, White fir | Low willow | bilberry, fern, tussock | 6, 1, 3, 5, 9 |
| Crater Lake | 3 · Mountain hemlock, Shasta red fir, Whitebark pine | — | bilberry, tussock | 10, 1, 7, 5, 9 |
| Lofoten | 1 · Downy birch | Coastal heath, Low willow | heath, tussock, alder | 0, 6, 7, 4, 8 |
| Milford Sound | 3 · Kāmahi, Rimu, Silver beech | Low willow | tree-fern, tussock, bilberry | 0, 14, 7, 12, 8 |
| Dixville Notch | 8 · American beech, Balsam fir, Northern white cedar, Paper birch, Red maple, Red spruce, Sugar maple, Yellow birch | — | fern, bilberry, tussock | 6, 2, 3, 4, 8 |
| Lac Berté | 3 · Balsam fir, Black spruce, Paper birch | — | tea, heath, tussock | 6, 1, 7, 4, 8 |
| Lake Winnipesaukee | 9 · American beech, Eastern hemlock, Eastern white pine, Northern red oak, Northern white cedar, Red maple, Red spruce, Sugar maple, Yellow birch | — | fern, bilberry, alder | 0, 15, 3, 5, 8 |
| Surry Mountain Dam / Keene | 9 · American beech, Eastern hemlock, Eastern white pine, Northern red oak, Northern white cedar, Red maple, Red spruce, Sugar maple, Yellow birch | — | fern, alder, bilberry | 0, 2, 3, 5, 8 |
| Moosehead Lake | 10 · American beech, Balsam fir, Eastern hemlock, Eastern white pine, Northern white cedar, Paper birch, Red maple, Red spruce, Sugar maple, Yellow birch | Low willow | tea, fern, alder | 0, 1, 7, 4, 8 |

The shared ground atlas contains sixteen distinct captures. The ordered slot IDs above use this key.

 | ID | Source | ID | Source |
| ---: | --- | ---: | --- |
| 0 | Leafy Grass | 8 | Aerial Grass Rock |
| 1 | Ground076 | 9 | Aerial Ground Rock |
| 2 | Leaves Forest Ground | 10 | Dry Ground Rocks |
| 3 | Brown Mud Rocks 01 | 11 | Cracked Red Ground |
| 4 | Lichen Rock | 12 | Ground068 |
| 5 | Ground019 | 13 | Dry Riverbed Rock |
| 6 | Grass Ground | 14 | Moss002 |
| 7 | Moss001 | 15 | Forest Floor |

## Mendenhall pilot delta

The local pilot adds four complete Sitka spruce structures. A mature cone-bearing crown, an open juvenile, a branch broom and a damaged leader have different geometry. Three reconstructed shore rock forms provide worn bedrock, jointed blocks and smaller clasts. Four photographed material sources feed the localized shore atlas. Three already appear in the project-wide credits. Dry River Pebbles adds a source to those credited assets. The georeferenced mask, remapped perches, ground sampling resolution and contact shadows improve presentation without increasing the unique form count. The pilot contributes **seven new structural forms** to Mendenhall. All other worlds keep the starting counts above. [Sitka asset provenance](../game/canopy-data/credits.txt) · [Geology, photograph credits and placement](../game/mendenhall-geology-credits.txt)

## Coverage still to count

Each starting subtotal covers the close-canopy, understory, five soil assignments, shared talus and generic rock perch only. Quantifying every regional asset still requires matching source identity and world dispatch for inherited forest models, location-specific cliffs, water margins, scree, landmark meshes, structures, wetland plants and lake-floor props. In particular, audit the surveyed original fir forests, close hardwood fallback, Nugget and Oeschinen littoral terraces, Horseshoe river shelves, Yosemite granite features, Table Rock and Huntington Falls, Crater Lake formations and bathymetry, Milford fjord walls, Lofoten coastal rock, the Lac Berté camp shoreline and the northeastern shore, town and dam assets. An empty talus column records the absence of that particular six-scan batch. World-specific rock features remain outside these counts.

The geometry headers in `canopy-data/specimens.bin` and the local Sitka file distinguish source models from their three detail levels. `plant-models.js` contains six close geometries and one photograph-only record. The regional growth builder uses eight separate shape recipes across the project. The six talus scans each have two mesh densities. Run `node tools/regional_asset_inventory.cjs` from the repository root for the underlying per-region assignments. [Regional cover and botanical sources](../game/regional-habitat-credits.txt) · [Ground photographs](../game/field-ground-credits.txt)
