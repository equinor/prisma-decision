@description('Environment name')
@allowed([
  'dev'
  'test'
  'prod'
  'public'
])
param environment string
param location string
param region string
param projectName string

@description('Database Settings')
param sqlOptions object

param userAssignedIdentity string
param prismaDecisionAdminGroupObjectId string
param allowedAllCidrBlocks array

resource sqlServer 'Microsoft.Sql/servers@2021-11-01' = {
  name: 'sql-${projectName}-${environment}-${region}'
  location: location
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      login: 'prismaDecisionAdmin'
      principalType: 'Group'
      sid: prismaDecisionAdminGroupObjectId
      tenantId: subscription().tenantId
    }
  }
}

resource sqlDb 'Microsoft.Sql/servers/databases@2021-11-01' = {
  parent: sqlServer
  name: 'sqldb-${projectName}-${environment}-${region}'
  location: location
  sku: {
    name: 'S3'
    tier: 'Standard'
    capacity: sqlOptions.sqlCapacity
  }
}

// 2. Loop through the array to create individual firewall rules
resource firewallRules 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = [
  for cidr in allowedAllCidrBlocks: {
    name: 'Allow-${uniqueString(cidr)}' // Generates a safe, unique rule name per CIDR
    parent: sqlServer
    properties: {
      // Dynamically splits each CIDR into start and end bounds
      startIpAddress: parseCidr(cidr).network
      endIpAddress: parseCidr(cidr).broadcast
    }
  }
]

@description('This is the built-in SQL DB Contributor role. See https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/databases#sql-db-contributor')
resource sqlDatabaseContributerRoleDefinition 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: sqlServer
  name: '9b7fa17d-e63e-47b0-bb0a-15c516ac86ec'
}
@description('This is the built-in SQL Server Contributor role. See https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/databases#sql-server-contributor')
resource sqlServerContributerRoleDefinition 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: sqlServer
  name: '6d8ee4ec-f05a-4a1d-8b00-a9b17e38b437'
}

resource sqlDatabaseContributorRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  scope: sqlServer
  name: guid(sqlDb.id, userAssignedIdentity, sqlDatabaseContributerRoleDefinition.id)
  properties: {
    roleDefinitionId: sqlDatabaseContributerRoleDefinition.id
    principalId: userAssignedIdentity
    principalType: 'ServicePrincipal'
  }
}
resource sqlServerContributorRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  scope: sqlServer
  name: guid(sqlServer.id, userAssignedIdentity, sqlServerContributerRoleDefinition.id)
  properties: {
    roleDefinitionId: sqlServerContributerRoleDefinition.id
    principalId: userAssignedIdentity
    principalType: 'ServicePrincipal'
  }
}
