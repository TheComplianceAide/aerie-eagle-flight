# Acoustic weather snapshots

Generate a complete forecast for Aerie’s 13 world origins using a private Open-Meteo server. The tool needs Python 3.9+ and its standard library. The default upstream is `http://127.0.0.1:8080/v1/forecast`. Use `--endpoint https://your-private-host/v1/forecast` for a trusted remote deployment. Commercial refresh jobs should use the self-hosted service or a licensed source. [Hosted API terms](https://open-meteo.com/en/terms)

Start the upstream server with its official S3 remote data directory and a persistent block cache. Keep the upstream private. Cold model reads can exceed the game’s five-second fetch timeout. [Open-Meteo self-hosting instructions](https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md)

Write to an existing destination directory on the private host.

```sh
python3 tools/acoustics/weather_snapshot.py /srv/aerie-weather/air.json
```

A single scheduler can refresh the file every 15 minutes. On Linux, `flock -n /srv/aerie-weather/update.lock python3 tools/acoustics/weather_snapshot.py /srv/aerie-weather/air.json` prevents overlapping runs. Serve the JSON from the destination path or upload it only after this command succeeds. On failure the command exits nonzero and preserves the last complete file. Monitor its age using `generatedAt` and each region’s `current.time`. A consumer can use its normal regional fallback when the last good data grows stale.

The version-1 JSON includes `generatedAt` in UTC and `regions` keyed by game world ID. Each region contains the five `current` fields and four single-element `hourly` arrays consumed by the game. Temperatures are °C, surface pressure is hPa, relative humidity is percent, and wind is m/s. The current timestamp is UTC. Lofoten’s regional model can omit both upper-air temperatures. Their one-element arrays then carry JSON null, preserving the game’s existing lapse-rate fallback.

Run the offline tests with `python3 -m unittest discover -s tools/acoustics -p test_weather_snapshot.py`. The single-location test fixture is from the November 23, 2026 Open-Meteo parity comparison. Credit weather data to [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) in the consuming service. Consult [upstream model and attribution details](https://github.com/open-meteo/open-data) for the data being served.

## Azure Container Apps Job

Build the one-shot Linux/amd64 image with the repository’s pinned upstream Open-Meteo image.

```sh
docker build --platform linux/amd64 -f tools/acoustics/Dockerfile.weather-worker -t aerie-weather-worker tools/acoustics
```

Run the image using its default command. Set `AERIE_WEATHER_BLOB_URL` to the private, existing container’s HTTPS blob URL, for example `https://examplestorage.blob.core.windows.net/weather/air.json`. Container Apps injects `IDENTITY_ENDPOINT` and `IDENTITY_HEADER` for its managed identity. For a user-assigned identity also set `AZURE_CLIENT_ID` to its client ID. Grant the writer permission to read and write at the container scope. Assign a separate read-only identity to the API. [Container Apps managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity) · [Azure Blob data roles](https://learn.microsoft.com/en-us/azure/storage/blobs/assign-azure-role-data-access)

The worker starts Open-Meteo on loopback, reads the official AWS data distribution using a disposable 1 GiB cache, and stops the local service after generation. Its six-minute deadline includes startup, both forecast batches, and the storage request. Allow writable storage for `/app/data/` and `/tmp` and outbound access to the AWS distribution, identity endpoint, and target Blob account. The destination is fixed to one `air.json` object in an Azure public-cloud Blob container.

The worker compares the prior file’s per-region source times and generation time. It then uses the Blob ETag, or a create-only precondition for the first file. Concurrent writes trigger a reread. A failed forecast or storage request exits nonzero and leaves the last complete object available. With a fresh destination, `--output-only /tmp/air.json` exercises the entire forecast fetch inside the image and skips Azure. [Azure Blob concurrency](https://learn.microsoft.com/en-us/azure/storage/blobs/concurrency-manage)

Run all producer and worker fixture tests with `python3 -m unittest discover -s tools/acoustics -p 'test_weather*.py'`.
