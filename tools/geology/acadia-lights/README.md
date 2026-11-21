# Acadia offshore light stations

Egg Rock and Baker Island are in the same east/up/south metre grid as the mainland. The grid origin is UTM 19N (564651, 4907768). The terrain uses NOAA's Maine coastal topobathymetric lidar supplemented by USGS 3DEP. Offshore areas outside the measured soundings carry a submerged backing. The alpha channel of the upper tidal atlas distinguishes those areas from measured depths. USDA NAIP supplies the surface photograph. Mapped summer landcover and first returns separate Baker Island's evergreen crowns from rock, roofs and the station clearing.

The square Egg Rock tower, Baker Island's round masonry tower and the separate keeper's house follow laser-measured footprints and heights. Finer architectural detail is interpreted from the US Fish and Wildlife Service Egg Rock photograph and the National Park Service Baker Island Historic Structures Report. The 2025 USCG Light List specifies a five-second red light and a ten-second white light. Flash envelopes, camera response, local starlight and sea state are simulated. The radio-activated foghorn is silent on this clear night.

Use Python 3.11 or newer with numpy, scipy, Pillow, requests, laspy with its lazrs backend, pyproj, rasterio, pydelatin and the Poppler pdftoppm executable. Run from the repository root.

```sh
python tools/geology/acadia-lights/rebuild.py /tmp/aerie-acadia-source game
node tools/check_acadia_lights.cjs
```

The source manifest includes the URL, size and SHA-256 of the original snapshots. A changed upstream image export must be reviewed before updating its digest. The cliff, shoreline, sound and architectural source notices are in game/acadia-scenery-credits.txt and game/soundscape-credits.txt. The generated models and software have the project licenses. Their federal source material retains its public-domain status.
