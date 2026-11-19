# Aerie

Fly a bald eagle over real-world landscapes in a browser. Bank around Horseshoe Bend, ride rising air along an Alaskan icefield, or follow New Hampshire’s Ashuelot River into downtown Keene. The default camera rides over the eagle’s right shoulder. Each world has its own terrain, departure points, landmarks, and soundscape.

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

## Flight controls

**Mouse:** move toward the part of the screen where you want to fly. Left and right bank, up climbs, and down dives. Move the pointer back to the center ring to settle into a straight glide.

**Touch:** put one finger on the eagle or the scenery and slide in the direction you want to fly. Lift your finger to glide. On either device, steer farther upward to beat your wings. Tap or click a branch or ledge, then **Land**. Drag to look around while perched and select **Push off** to fly again.

The following keyboard shortcuts are also available.

| Action | Control |
| --- | --- |
| Pitch up or dive | W / S or Up / Down |
| Bank left or right | A / D or Left / Right |
| Flap | Hold Space |
| Change between shoulder and chase views | C |
| Explore landmarks | G |
| Hide or show instruments | H |
| Pause | Esc |

Hold Up or W at low airspeed to start a powered climb.

## Scenery and credits

The playable worlds include Oeschinen Lake, Mendenhall Glacier, Horseshoe Bend, Yosemite Valley, Bryce Canyon, Crater Lake, the Nā Pali Coast, Lofoten, Milford Sound, Lake Winnipesaukee, Moosehead Lake, and Surry Mountain Dam with Keene.

Low passes reveal wind-bent photographed grasses, shrubs, and ferns. Position and head direction shape the stereo field of recorded birds near crowns, shores, and rocky ground. Exposed ridges and higher flight carry a stronger wind. Headphones make the direction of individual calls easiest to hear.

See the [scenery and field-recording credits](game/credits.txt) for the source imagery, terrain, bird recordings, and their individual licenses. [Three.js](game/three-LICENSE.txt) and the bundled [pako decompressor](tools/pako/LICENSE) include their license notices.
