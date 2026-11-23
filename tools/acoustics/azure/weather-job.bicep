@description('Public upstream Open-Meteo image pinned by its Linux amd64 registry digest.')
param workerImage string = 'ghcr.io/open-meteo/open-meteo@sha256:5f23284824917315514aa356acf4184961d9be19f72b3c74b119faccdacd527f'

@description('Use manual mode for the first run. Enable hourly refresh after the private snapshot passes Aerie API QA.')
param scheduleEnabled bool = false

param location string = resourceGroup().location
param storageAccountName string = 'stplayaerieprod01'
param functionAppName string = 'func-playaerie-prod'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}

resource weather 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'aerie-weather'
  properties: {
    publicAccess: 'None'
  }
}

resource functions 'Microsoft.Web/sites@2023-12-01' existing = {
  name: functionAppName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-aerie-weather'
  location: location
  properties: {
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

var blobUrl = '${storage.properties.primaryEndpoints.blob}aerie-weather/air.json'
var oneReplica = {
  parallelism: 1
  replicaCompletionCount: 1
}
var bootstrap = '''
import os
from pathlib import Path
import runpy
import sys
from tempfile import TemporaryDirectory

with TemporaryDirectory() as folder:
    root = Path(folder)
    snapshot = root / "weather_snapshot.py"
    worker = root / "weather_worker.py"
    snapshot.write_text(os.environ.pop("AERIE_WEATHER_SNAPSHOT_CODE"), encoding="utf-8")
    worker.write_text(os.environ.pop("AERIE_WEATHER_WORKER_CODE"), encoding="utf-8")
    sys.path.insert(0, folder)
    runpy.run_path(str(worker), run_name="__main__")
'''

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: 'job-aerie-weather'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: union({
      replicaTimeout: 180
      replicaRetryLimit: 0
    }, scheduleEnabled ? {
      triggerType: 'Schedule'
      scheduleTriggerConfig: union(oneReplica, {
        cronExpression: '17 * * * *'
      })
    } : {
      triggerType: 'Manual'
      manualTriggerConfig: oneReplica
    })
    template: {
      containers: [
        {
          name: 'refresh'
          image: workerImage
          command: [
            '/usr/bin/python3'
          ]
          args: [
            '-c'
            bootstrap
          ]
          env: [
            {
              name: 'AERIE_WEATHER_BLOB_URL'
              value: blobUrl
            }
            {
              name: 'AERIE_WEATHER_SNAPSHOT_CODE'
              value: loadTextContent('../weather_snapshot.py')
            }
            {
              name: 'AERIE_WEATHER_WORKER_CODE'
              value: loadTextContent('../weather_worker.py')
            }
          ]
          resources: {
            cpu: 1
            memory: '2Gi'
          }
        }
      ]
    }
  }
}

var blobReader = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
var blobContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource apiReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(weather.id, functions.id, blobReader)
  scope: weather
  properties: {
    roleDefinitionId: blobReader
    principalId: functions.identity!.principalId!
    principalType: 'ServicePrincipal'
  }
}

resource jobWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(weather.id, job.id, blobContributor)
  scope: weather
  properties: {
    roleDefinitionId: blobContributor
    principalId: job.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output jobName string = job.name
output snapshotUrl string = blobUrl
