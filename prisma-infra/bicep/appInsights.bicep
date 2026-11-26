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

@description('Log Analytics workspace for the dot API')
resource workspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  location: location
  name: 'log-${projectName}-${environment}-${region}'
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    publicNetworkAccessForQuery: 'Enabled'
  }
}
@description('Application Insights for the dot API')
resource dataApiAppInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${projectName}-${environment}-${region}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    publicNetworkAccessForQuery: 'Enabled'
  }
}
