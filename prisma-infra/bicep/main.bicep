targetScope = 'subscription'
// param environment and allowed value must be placed simultaneously
@allowed([
  'dev'
  'test'
  'prod'
  'public'
])
param environment string
param projectName string
param region string
param location string
param prismaDecisionAdminGroupObjectId string = 'b8b5136c-9648-4fce-b709-c68fb12caedd'
param prismaDecisionSubscriptionOwnerGroupObjectId string = '92da3408-8336-4ce8-96a7-42403f07c61b'
param prismaDecisionSubscriptionContributorGroupObjectId string = 'c4196608-a018-4168-b6de-7a1260cfaf4c'

@description('Allowed ip ranges/cidr for accessing the resources')
param allowedRadixCidrBlocks array = [
  '52.178.214.192/29' // (52.178.214.192 – 52.178.214.199)
  '137.135.191.80/28' // (137.135.191.80 – 137.135.191.95)
  '128.251.5.16/28' // (128.251.5.16 – 128.251.5.31)
  '20.234.86.176/28' // (20.234.86.176 – 20.234.86.191)
  '20.105.86.80/28' // (20.105.86.80 – 20.105.86.95)
  '4.231.159.192/28' // (4.231.159.192 – 4.231.159.207)
  '4.208.69.48/28' // (4.208.69.48 – 4.208.69.63)
  '68.219.4.80/28' // (68.219.4.80 – 68.219.4.95)
  '51.107.181.16/28' // (51.107.181.16 – 51.107.181.31)
  '51.107.182.192/28' // (51.107.182.192 – 51.107.182.207)
  '51.107.182.144/28' // (51.107.182.144 – 51.107.182.159)
]
param allowedEquinorCidrBlocks array = ['136.164.1.0/24']

param allowedAllCidrBlocks array = union(allowedRadixCidrBlocks, allowedEquinorCidrBlocks)

@description('SQL Options')
param sqlOptions object

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${projectName}-${environment}-${region}'
  location: location
}

module mangedIdentity 'managedId.bicep' = {
  name: 'id-${projectName}-${environment}-${region}'
  scope: resourceGroup
  params: {
    projectName: projectName
    environment: environment
    location: location
    region: region
  }
}

module appinsights 'appInsights.bicep' = {
  name: 'log-${projectName}-${environment}-${region}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    projectName: projectName
    region: region
  }
}
module keyVault 'keyVault.bicep' = {
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    projectName: projectName
    region: region
    prismaDecisionAdminGroupObjectId: prismaDecisionAdminGroupObjectId
    prismaDecisionSubscriptionOwnerGroupObjectId: prismaDecisionSubscriptionOwnerGroupObjectId
    prismaDecisionSubscriptionContributorGroupObjectId: prismaDecisionSubscriptionContributorGroupObjectId
    managedIdentity: mangedIdentity.outputs.userAssignedManagedIdentity
    allowedAllCidrBlocks: allowedAllCidrBlocks
  }
}
module prismaSql 'sql.bicep' = {
  name: 'sql-${projectName}-${environment}-${region}'
  scope: resourceGroup
  params: {
    projectName: projectName
    environment: environment
    location: location
    region: region
    prismaDecisionAdminGroupObjectId: prismaDecisionAdminGroupObjectId
    sqlOptions: sqlOptions
    userAssignedIdentity: mangedIdentity.outputs.userAssignedManagedIdentity
    allowedAllCidrBlocks: allowedAllCidrBlocks
  }
}
