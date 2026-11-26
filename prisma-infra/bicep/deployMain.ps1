[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'test', 'prod', 'public')]
    [string]$envName
)

$ErrorActionPreference = 'Stop'

az deployment sub create `
    --subscription 'R107-prisma-decision' `
    --name $envName `
    --location swedencentral `
    --template-file (Join-Path $PSScriptRoot 'main.bicep') `
    --parameters (Join-Path $PSScriptRoot "main.parameter.$envName.json")

if ($LASTEXITCODE -ne 0) {
    throw "Infrastructure deployment failed for '$envName'."
}
