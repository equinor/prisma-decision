$UsageMessage = 'Usage: secretAutomation.ps1 --env <dev|test|prod|all>'

# Script args are parsed by hand so the GNU-style --env flag works.
if ($args.Count -ne 2 -or $args[0] -notin @('--env', '-env')) {
    throw $UsageMessage
}
$Environment = $args[1]
if ($Environment -notin @('dev', 'test', 'prod', 'all')) {
    throw $UsageMessage
}

$ErrorActionPreference = 'Stop'

$ClientAPPToKeyVaultMappings = @(
    [pscustomobject]@{ Environment = 'dev'; AppId = '4251833c-b9c3-4013-afda-cbfd2cc50f3f'; VaultName = 'kvprismadecisiondevsw'; SecretName = 'prismadecisionapidevsec' }
    [pscustomobject]@{ Environment = 'prod'; AppId = '3f7beff4-4f11-4a6b-8c41-1d076701bc00'; VaultName = 'kvprismadecisionprodsw'; SecretName = 'prismadecisionapiprodsec' }
    [pscustomobject]@{ Environment = 'test'; AppId = 'e2f38655-db59-4ff3-b40a-c1221e06a49e'; VaultName = 'kvprismadecisiontestsw'; SecretName = 'prismadecisionapiptestsec' }
)

if ($Environment -ne 'all') {
    $ClientAPPToKeyVaultMappings = @($ClientAPPToKeyVaultMappings | Where-Object { $_.Environment -eq $Environment })
}

$DisplayName = 'ClientSecret'
$SubscriptionName = 'R107-prisma-decision'
$RadixAppName = 'prisma-decision-api'

function Assert-LastCommandSucceeded {
    param([string]$FailureMessage)

    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

# Old credentials are revoked only after Radix restarts onto the new secrets.
$PendingRevocations = [System.Collections.Generic.List[object]]::new()
$AzureLoginSucceeded = $false
try {
    Write-Host 'Logging into Azure CLI'
    az login --output none
    Assert-LastCommandSucceeded 'Azure CLI login failed.'
    $AzureLoginSucceeded = $true

    az account set --subscription $SubscriptionName
    Assert-LastCommandSucceeded "Failed to select subscription '$SubscriptionName'."

    foreach ($Mapping in $ClientAPPToKeyVaultMappings) {
        Write-Host "Processing app $($Mapping.AppId) -> vault $($Mapping.VaultName) ($($Mapping.SecretName))"

        $OldKeyIds = @(
            az ad app credential list `
                --id $Mapping.AppId `
                --query "[?displayName=='$DisplayName'].keyId" `
                --output tsv
        )

        $CredentialEndDate = [DateTime]::UtcNow.AddMonths(6).ToString(
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            [Globalization.CultureInfo]::InvariantCulture
        )
        $SecretValue = az ad app credential reset `
            --id $Mapping.AppId `
            --append `
            --display-name $DisplayName `
            --end-date $CredentialEndDate `
            --query password `
            --output tsv
        Assert-LastCommandSucceeded "Failed to create a new credential for app $($Mapping.AppId)."
        if ([string]::IsNullOrWhiteSpace($SecretValue) -or $SecretValue -eq 'None') {
            throw "Azure CLI did not return the new credential password for app $($Mapping.AppId)."
        }

        $CurrentCredentialsJson = az ad app credential list `
            --id $Mapping.AppId `
            --query "[?displayName=='$DisplayName'].{keyId:keyId,endDateTime:endDateTime}" `
            --output json
        Assert-LastCommandSucceeded "Failed to read credential metadata for app $($Mapping.AppId)."

        $CurrentCredentials = @($CurrentCredentialsJson | ConvertFrom-Json)
        $NewCredentials = @($CurrentCredentials | Where-Object { $OldKeyIds -notcontains $_.keyId })
        if ($NewCredentials.Count -ne 1 -or
            [string]::IsNullOrWhiteSpace($NewCredentials[0].endDateTime)) {
            throw "Could not uniquely identify the new credential and its expiration for app $($Mapping.AppId)."
        }

        az keyvault secret set `
            --vault-name $Mapping.VaultName `
            --name $Mapping.SecretName `
            --value $SecretValue `
            --expires $CredentialEndDate `
            --output none
        Assert-LastCommandSucceeded "Failed to store the new secret in Key Vault $($Mapping.VaultName); previous app credentials were left intact."

        foreach ($OldKeyId in $OldKeyIds) {
            if (-not [string]::IsNullOrWhiteSpace([string]$OldKeyId)) {
                $PendingRevocations.Add([pscustomobject]@{ AppId = $Mapping.AppId; KeyId = [string]$OldKeyId })
            }
        }

        Write-Host "Updated secret '$($Mapping.SecretName)' in Key Vault '$($Mapping.VaultName)' for app '$($Mapping.AppId)'."
    }

    $RadixLoginSucceeded = $false
    try {
        Write-Host 'Logging into Radix CLI'
        rx login
        if ($LASTEXITCODE -ne 0) {
            throw 'Radix login failed; previous app credentials were left intact.'
        }
        $RadixLoginSucceeded = $true

        if ($Environment -eq 'all') {
            rx restart application -a $RadixAppName
        }
        else {
            rx restart environment -a $RadixAppName -e $Environment
        }
        if ($LASTEXITCODE -ne 0) {
            throw 'Radix restart failed; previous app credentials were left intact.'
        }
    }
    finally {
        if ($RadixLoginSucceeded) {
            Write-Host 'Logging out from Radix CLI'
            rx logout
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'Radix logout failed.'
            }
        }
    }

    # The API reads CLIENT_SECRET only at startup, so pods still on the old secret break once it is revoked.
    if ($PendingRevocations.Count -gt 0) {
        Read-Host 'Confirm the restarted API is healthy in Radix, then press Enter to revoke the previous credentials (Ctrl+C keeps them)' | Out-Null
        foreach ($Revocation in $PendingRevocations) {
            az ad app credential delete `
                --id $Revocation.AppId `
                --key-id $Revocation.KeyId `
                --output none
            Assert-LastCommandSucceeded "Failed to delete previous credential $($Revocation.KeyId) from app $($Revocation.AppId)."
            Write-Host "Deleted previous $DisplayName credential $($Revocation.KeyId) from app $($Revocation.AppId)."
        }
    }
}
finally {
    if ($AzureLoginSucceeded) {
        Write-Host 'Logging out from Azure CLI'
        az logout --output none
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'Azure CLI logout failed.'
        }
    }
}
