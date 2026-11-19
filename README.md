# Aerie

Fly a bald eagle over real-world landscapes in a browser. Bank around Horseshoe Bend, ride rising air along an Alaskan icefield, or follow New Hampshire’s Ashuelot River into downtown Keene. The default camera rides over the eagle’s right shoulder. Each world has its own terrain, departure points, landmarks, and soundscape.

## Play locally

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

| Action | Control |
| --- | --- |
| Pitch up or dive | W / S or Up / Down |
| Bank left or right | A / D or Left / Right |
| Flap | Hold Space |
| Change between shoulder and chase views | C |
| Explore landmarks | G |
| Hide or show instruments | H |
| Pause | Esc |

Hold Up or W at low airspeed to start a powered climb. On a touchscreen, drag to steer and hold **Flap** to climb.

## Scenery and credits

The playable worlds include Oeschinen Lake, Mendenhall Glacier, Horseshoe Bend, Yosemite Valley, Bryce Canyon, Crater Lake, the Nā Pali Coast, Lofoten, Milford Sound, Lake Winnipesaukee, Moosehead Lake, and Surry Mountain Dam with Keene.

See the [scenery and field-recording credits](game/credits.txt) for the source imagery, terrain, bird recordings, and their individual licenses. [Three.js](game/three-LICENSE.txt) and the bundled [pako decompressor](tools/pako/LICENSE) include their license notices.

## In development

Selectable branches and ledges, looking around while perched, and taking off again are planned across the worlds. The initial public build supports continuous flight and landmark exploration.
