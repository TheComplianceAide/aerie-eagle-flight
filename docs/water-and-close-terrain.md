# Water contacts and close terrain materials

Water effects follow native water classifications. Small shoreline studies bend the existing reflection near dry-to-wet transitions. Thunder Hole keeps its measured channel and surf timing. The Colorado and Firehole use their native bank fields and downstream directions. Nugget Falls retains separate discharge, impact spray and downstream foam. The Yellowstone thermal pool branch keeps its original water optics, and the close ground pass excludes the colored pool rims. Wildlife contact is tied to actual surface events. Waterfowl landing splashes, unmapped inlets and isolated rock wakes are outside the verified coverage.

The near material sampler varies source origin at continuous triangle edges and uses explicit derivatives for texture filtering. A projected-footprint fade and a 24 m eye-to-fragment limit protect the distant Aerie imagery. Registered imagery, like Crater Lake's close andesite or the Mendenhall cliff colors, still supplies the broad terrain color and structures. Yosemite and Canyon use separate packed material analogues. The other worlds use the existing regional scan classes through the shared ground shader or the native Yellowstone terrain shader. The changes do not redistribute tree placements, modify terrain shape or change lighting, weather or audio.

The land and bank shaders preserve their prior sampler choices. Canyon stores its new sandstone data in the second layer of the existing scarp-map sampler (roughly 12 MiB more mipmapped GPU memory during Canyon flight). Its bank texture combines the original RGB with the small new opacity page in alpha at load time. No complete duplicate bank image is downloaded. New world factories without an assigned atlas can use the conservative freshwater fall page where a chute is actually authored. Shared ground callers without a regional profile receive a neutral temperate default until local materials are assigned.

## Source preparation

See [asset attributions](../game/water-material-credits.txt). The opacity atlas builder verifies the project-provided generic source sheet, the retained Cleetwood Cove and Horseshoe Bend studies, and public-domain source hashes. The old Thunder Hole and Nugget Falls prototype studies had ShareAlike inputs. The runtime uses new studies from NPS and USDA Forest Service material and includes none of those mixed-reference assets.

- Generic `Aerie-Water-Opacity-Atlas-v2.zip` SHA-256 `e10558d32ee60a60176e654454ebbc32346b14bae719fff2252b89c3adb02ed4`.
- Site pack `Aerie-Water-Opacity-Photo-Guided-v3.1.zip` SHA-256 `028437a2c8e5498d18ce23654b42b1c22b1319bf6c3c664969a08afec029567c`. Only the permitted Cleetwood Cove and Horseshoe Bend entries are packed.
- Public-domain and CC0 source references, byte hashes and crop parameters are in `tools/water-opacity/public_domain.py`. Run `python3 tools/water-opacity/repack.py <generic-directory> game --photo <site-directory> --public-domain <reference-directory>` with Pillow and NumPy.
- `tools/close-material/pack.py` takes Poly Haven's 1K diffuse, OpenGL normal and roughness JPGs from each cited material. It writes the packed 512×512 linear-data PNG without embedding the source images. Most worlds reuse the already credited `field-ground-scans.webp` contents. Yellowstone reuses its native mineral and deposit images.

## Regression matrix

Baseline is the v0.33.0 release commit `f7d66e7a3710cbb175db31a0e88a0f80ef5b8acf`. The routes below are deterministic in-game camera replays on the Apple M5 with hardware-backed Chrome, 1280×720 and 4× MSAA. Each ground comparison isolates the close material path. Each water comparison retains the native motion and zeros the additional opacity-mask signal to verify that the masks contribute to actual rendered fragments. All thirteen worlds also passed a normal launch and camera, HUD, bank and pause/resume checks.

| World | Near ground seen in the comparison | Water contact seen in the comparison |
| --- | --- | --- |
| Acadia | Ocean Path upland granite and forest floor | Thunder Hole spray and chamber |
| Mendenhall | Lichen rock and forest floor above the surveyed Nugget bank | Nugget Falls curtain, pool contact and spray |
| Horseshoe Bend | Dry Navajo sandstone near the overlook | Colorado River contact beside the sandstone shelf |
| Crater Lake | Surveyed Watchman andesite | Gentle lap at Cleetwood Cove |
| Dixville Notch | Woodland litter near Huntington Cascades | Cascade curtain and local impact |
| Lac Berté | Spruce-side glade and soil | Quiet lake margin |
| Lofoten | Heath and stony ground by Rostadforsen | Rostadforsen cascade |
| Moosehead Lake | Forest floor near Rockwood | Sheltered lake-bank contact |
| Surry Mountain | Forested upland above the reservoir | Reservoir margin |
| Oeschinensee | Alpine meadow ground | Fründen cascade and nearby lake contact |
| Winnipesaukee | Forest floor on Rattlesnake Island | Paddle and shore ripples at the wildlife departure |
| Yellowstone | Upper Basin gravel and mineral ground | Firehole bank and Kepler Cascades (subtle) |
| Yosemite | Granite on the stock El Capitan terrain | Merced River bank and nearby running water |

Activation in a sampled scene establishes that the material reaches the renderer. Effect strength varies with the shot. Quiet lake features remain restrained. Grand Prismatic was pixel-identical in the sampled control frames. Winnipesaukee offshore samples stayed within four 8-bit values per channel. Sparse Crater Lake differences were along the far shore. No observation here covers a physical iPhone, isolated rock wakes, landing ripples or every stage at every site. WebGL 2 is required for the scan and atlas shaders. Existing native materials remain available when a page fails to load or WebGL 2 is unavailable.
