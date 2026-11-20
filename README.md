# Aerie

Fly a bald eagle over real-world landscapes in a browser. Bank around Horseshoe Bend, ride rising air along an Alaskan icefield, or follow New Hampshire’s Ashuelot River into downtown Keene. The default camera rides over the eagle’s right shoulder. At dawn in Dixville Notch, fly over Lake Gloriette toward the Balsams or follow New Hampshire Route 26 below Table Rock. Each world has its own terrain, departure points, landmarks, and soundscape.

[Play Aerie in your browser](https://aerie-valley-flight.randyb308826.chatgpt.site/) on a phone, tablet, or computer.

## Play locally

[Download the offline game](https://github.com/TheComplianceAide/aerie-eagle-flight/releases/latest/download/Aerie.html) and open it in Chrome. Choose a world and select **Take flight**.

## Run from source

Clone or download this repository. From its root, start a local server with Python 3.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory game
```

Open [Aerie on your computer](http://127.0.0.1:8000/), choose a world and a departure point, and select **Take flight**. A WebGL-capable browser with graphics acceleration enabled is required. All game assets are included, and you can play offline.

For a portable single-file version, run the following command and then open the resulting `Aerie.html` in Chrome.

```sh
python3 tools/build_offline.py
```

## Lac Berté

Cloud shadows cross the spruce ridges, the cabin, and the lake while a sun shower catches the evening light. Choose **Rainbow over the narrows** for a view across the water or **Cabin flyby** to approach the white camp porch. The cabin is reconstructed from photographs. Its placement near the outfitter’s South Camp is approximate. [Outfitter’s lake guide and camp map](https://labrador-airsafari.com/en/lake)

## Flight controls

**Mouse:** move toward the part of the screen where you want to fly. Left and right bank, up climbs, and down dives. Move the pointer back to the center ring to settle into a straight glide.

**Touch:** put one finger on the eagle or the scenery and slide in the direction you want to fly. Lift your finger to glide. On either device, steer farther upward to beat your wings. Tap or click a branch or ledge, then **Land**. Drag to look around while perched and select **Push off** to fly again.

The following keyboard shortcuts are also available.

| Action | Control |
| --- | --- |
| Pitch up or dive | W / S or Up / Down |
| Bank left or right | A / D or Left / Right |
| Flap | Hold Space |
| Spread wings and tail to slow down | Hold B or the on-screen Brake button |
| Change between shoulder and chase views | C |
| Explore landmarks | G |
| Hide or show instruments | H |
| Pause | Esc |

Hold Up or W at low airspeed to start a powered climb. A dive tucks the wings. Pulling up reopens them and costs altitude while the flight path curves upward.

Powered strokes vary with airspeed. Their low-speed cadence draws on a field study of six wild bald eagles, which averaged 2.53 wingbeats per second. The wrist flex and feet-first flare draw on high-speed recordings of a steppe eagle. [Bald eagle field measurements, p. 27](https://raptorresearchfoundation.org/wp-content/uploads/2023/02/conference_program_2017.pdf#page=29) · [Steppe eagle perching study](https://www.biology.ox.ac.uk/publication/209686/pubmed)

Dark patches of rough water travel downwind. A circling bird on open wings marks a thermal. Bank into its circle to use the same rising air. These cues are visible from either camera.

Cloud banks drift across all thirteen ranges. Their shadows follow the ridges, forest and water, and narrow mist banks drift with the local wind. In Alaska, choose [Nugget Falls spray pass](https://aerie-valley-flight.randyb308826.chatgpt.site/#world=alaska&launch=spray) to fly alongside the cascade. Fine spray blows off the ledges while larger drops fall back into the chute.

## Scenery and credits

The playable worlds include Oeschinen Lake, Mendenhall Glacier, Horseshoe Bend, Yosemite Valley, Bryce Canyon, Crater Lake, the Nā Pali Coast, Lofoten, Milford Sound, Lake Winnipesaukee, Moosehead Lake, Surry Mountain Dam with Keene, Lac Berté in Québec, and Dixville Notch at dawn in New Hampshire.

Low passes reveal wind-bent photographed grasses, shrubs, and ferns. Position and head direction shape the stereo field of recorded birds near crowns, shores, and rocky ground. Exposed ridges and higher flight carry a stronger wind. Ten bald-eagle phrases from six field recordings accompany takeoffs, climbing, soaring, shoreline flight, and perching. The seven Yellowstone excerpts include the three recordings on the park’s bald-eagle page. Headphones make the direction of individual calls easiest to hear.

Choose **Wildlife shallows** for a low departure past each region’s fish and shore birds. At Bryce, choose **Tropic Reservoir shallows**. At Moosehead and Winnipesaukee, watch for mixed mallard and American black duck rafts, individual loons or pairs, and passing Canada goose flocks. Lac Berté’s shallows include brook trout.

See the [scenery and field-recording credits](game/credits.txt) for the source imagery, terrain, bird recordings, and their individual licenses. [Three.js](game/three-LICENSE.txt) and the bundled [pako decompressor](tools/pako/LICENSE) include their license notices.
