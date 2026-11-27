// param environment and allowed value must be placed simultaneously
@description('Environment name')
@allowed([
  'dev'
  'test'
  'prod'
  'public'
])
param environment string
param projectName string
param location string
param region string

resource userAssignedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${projectName}-${environment}-${region}'
  location: location
}
output userAssignedManagedIdentity string = userAssignedIdentity.properties.principalId
