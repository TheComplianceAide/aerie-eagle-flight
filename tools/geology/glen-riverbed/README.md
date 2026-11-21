# Horseshoe Bend riverbed

The canyon uses the published Glen Canyon soundings and substrate classifications where their horizontal positions and quality agree with the game's wet channel. The native source is a one-metre grid. The build first resamples it to two metres in WGS84 UTM zone 12 north, with game origin easting 454517 m and northing 4081578 m. The photogrammetric-only source class is excluded. Of the 354,342 jointly covered two-metre locations in the existing wet mask, 253,762 pass the sounding, wet-stage and uncertainty criteria. Eligible depths reach 13.28 m at the selected stage.

The fixed water level comes from the simulated river's USGS 3DEP interior plateaus. The profile in `regulated-stage.json` records that level at roughly 16-metre intervals along the reach. Each station uses local wet-ground medians and an 11-station median filter. The transferred stage spans approximately 952–955 m NAVD88. The nine NGS GEOID18 samples in `geoid18.json` convert the original GRS80 ellipsoid soundings to this datum. A regulated river's instantaneous state can differ from this profile.

Run with Python 3, NumPy, SciPy, Pillow with WebP and rasterio. The official distribution is checked against its full SHA-256 before extraction. Existing game shoreline controls are input to the build. The numerical output must be shipped as the original lossless RGB PNG.

```shell
python tools/geology/glen-riverbed/register_bed.py /tmp/Glen_Canyon_2014_Data.zip game /tmp/glen-bathy.npz --download
python tools/geology/glen-riverbed/pack_bed.py /tmp/glen-bathy.npz game/habitat-canyon.png game/canyon-surveyed-banks.png
```

The red channel preserves the original shoreline-distance bytes in their original square projection. Green stores the square root of depth in a separate local projection at approximately 1.66 by 2.51 m per pixel. The four blue quadrants store measurement support and independently filtered fractions of vegetation, sparsely vegetated sand/gravel, and exposed rock/cobble. Separate fractions avoid false vegetation at class boundaries. Surveyed unclassified material and unvegetated gravel/cobble receive the neutral coarse bed. Source class 4 is present in the raster's actual value table.

The 2024 USGS FaSTMECH study provides a separate depth-to-speed calibration for the visibly moving surface. The ten-thousand-cubic-foot-per-second scenario has 305,061 computational cells. Its published X/Y columns use only ten distinct eastings and two northings for the whole 15.8-mile reach. It cannot support a local velocity raster at 5 m. The game uses eight median flow speeds from genuinely wet cells across the reach. The direction comes from the existing regional channel. To reproduce `velocity-calibration.json`, extract `Result_10kcfs.csv` from the USGS distribution `Model_Results_AA.7z` and run:

```shell
python tools/geology/glen-riverbed/calibrate_velocity.py /tmp/Result_10kcfs.csv /tmp/velocity-calibration.json
```

The wave disturbance, water-column absorption, substrate colors, pebble-scale details and plant movement are visual reconstructions. No runtime network request to a federal data service is required. For accessions, dates, source archive checksums and licenses, see `sources.json`.
