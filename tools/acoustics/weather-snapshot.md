# Acoustic weather snapshots

Generate a complete forecast for Aerie’s 13 world origins using a private Open-Meteo server. The tool needs Python 3.9+ and its standard library. The default upstream is `http://127.0.0.1:8080/v1/forecast`. Use `--endpoint https://your-private-host/v1/forecast` for a trusted remote deployment.

Start the upstream server with its official S3 remote data directory and a persistent block cache. Keep the upstream private. Cold model reads can exceed the game’s five-second fetch timeout. [Open-Meteo self-hosting instructions](https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md)

On a private host with an existing writable destination directory, run:

```sh
python3 tools/acoustics/weather_snapshot.py /srv/aerie-weather/air.json
```

A single scheduler can refresh the file every 15 minutes. On Linux, `flock -n /srv/aerie-weather/update.lock python3 tools/acoustics/weather_snapshot.py /srv/aerie-weather/air.json` prevents overlapping runs. Serve the JSON from the destination path or upload it only after this command succeeds. On failure the command exits nonzero and preserves the last complete file. Monitor its age using `generatedAt` and each region’s `current.time`. A consumer can use its normal regional fallback when the last good data grows stale.

The version-1 JSON includes `generatedAt` in UTC and `regions` keyed by game world ID. Each region contains the five `current` fields and four single-element `hourly` arrays consumed by the game. Temperatures are °C, surface pressure is hPa, relative humidity is percent, and wind is m/s. The current timestamp is UTC. Lofoten’s regional model can omit both upper-air temperatures. Their one-element arrays then carry JSON null, preserving the game’s existing lapse-rate fallback.

Run the offline tests with `python3 -m unittest discover -s tools/acoustics -p test_weather_snapshot.py`. The single-location test fixture is from the November 23, 2026 Open-Meteo parity comparison. Credit weather data to [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) in the consuming service. Consult [upstream model and attribution details](https://github.com/open-meteo/open-data) for the data being served.
