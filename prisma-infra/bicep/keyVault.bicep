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
param region string
param location string
param prismaDecisionAdminGroupObjectId string
param prismaDecisionSubscriptionOwnerGroupObjectId string
param prismaDecisionSubscriptionContributorGroupObjectId string
param managedIdentity string
param allowedAllCidrBlocks array

param keyVaultName string = environment == 'public'
  ? 'kv${replace(projectName, '-', '')}${environment}${region}'
  : 'kv${replace(projectName, '-', '')}${environment}${region}'

param KeyVaultAdministratorRoleId string = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '00482a5a-887f-4fb3-b363-3b7fe8e74483'
)

param keyVaultSecretsUserRoleId string = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

@description('keyvault for the batch account')
resource keyVault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    enableRbacAuthorization: true
    tenantId: subscription().tenantId
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      ipRules: [
        for cidr in allowedAllCidrBlocks: {
          value: cidr
        }
      ]
    }
  }
}
resource keyVaultAdminRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in [
    prismaDecisionAdminGroupObjectId
    prismaDecisionSubscriptionOwnerGroupObjectId
    prismaDecisionSubscriptionContributorGroupObjectId
  ]: {
    name: guid(keyVault.id, principalId, KeyVaultAdministratorRoleId)
    scope: keyVault
    properties: {
      roleDefinitionId: KeyVaultAdministratorRoleId
      principalId: principalId
      principalType: 'Group'
    }
  }
]
resource secretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: managedIdentity
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalType: 'ServicePrincipal'
  }
}
