@description('Public Aerie weather worker image pinned by an immutable registry digest.')
param workerImage string

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
    appLogsConfiguration: {
      destination: 'none'
    }
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
          env: [
            {
              name: 'AERIE_WEATHER_BLOB_URL'
              value: blobUrl
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
