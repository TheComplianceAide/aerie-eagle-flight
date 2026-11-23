# Aerie forecast job on Azure

The job refreshes Aerie’s 13 regional forecasts with the self-hosted upstream server. The Functions app reads one private JSON blob using its existing managed identity. The game continues to request the same first-party `/api/aerie/air` route.

The template creates one Consumption environment, one job and the private `aerie-weather` container in Aerie’s existing storage account. It grants the job’s system-assigned identity write access and the existing Function identity read access only on that container. Existing storage and checkout resources are referenced by name.

## Validate the first run

Use the tested worker image pinned to an immutable digest. Run the Bicep what-if in the intended Aerie resource group. The plan should create five resources, including the two container-scoped role assignments. The Container Apps provider and a managed-environment quota of at least one are required.

Deploy initially with `scheduleEnabled=false`. Start a manual execution after the new role assignment has propagated. Confirm that the job succeeds and its private `air.json` includes all 13 regions and current observations. Enable the Functions app’s `AERIE_ACOUSTIC_SNAPSHOT_STORAGE_ENABLED` setting after this check. Verify live readings on both domains and confirm that the checkout mode and price stayed as configured.

Set `scheduleEnabled=true` for the hourly UTC refresh only after the first execution and the API checks succeed. The API shares a read across regions and uses valid observations at most two hours old. To stop refreshes, redeploy in manual mode. To switch the API back to its configured direct provider, remove the snapshot setting. The live-mode API uses the built-in regional atmosphere when no valid commercial input is available.

## Cost and source

The job uses one replica with 1 vCPU and 2 GiB of memory. It exits after publishing a verified snapshot or an error, with a three-minute platform timeout. The Consumption environment is configured without log export. Use the job execution history and the age of the private blob to check publish status.

Forecast data comes from Open-Meteo’s open archive, licensed CC BY 4.0. Aerie credits Open-Meteo and the weather models in `game/soundscape-credits.txt`. [Dataset](https://github.com/open-meteo/open-data) · [Azure job billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)
