
set -euo pipefail

usage() {
  echo "Usage: $0 --env <dev|test|prod|all>" >&2
  exit 1
}

[[ $# -eq 2 && "$1" == "--env" ]] || usage
TARGET_ENV="$2"
case "$TARGET_ENV" in
  dev|test|prod|all) ;;
  *) usage ;;
esac

# Each entry maps an environment and app ID to the vault and secret that should receive its new credential.
APP_VAULT_SECRET_MAPPINGS=(
  "dev|4251833c-b9c3-4013-afda-cbfd2cc50f3f|kvprismadecisiondevsw|prismadecisionapidevsec"
  "prod|3f7beff4-4f11-4a6b-8c41-1d076701bc00|kvprismadecisionprodsw|prismadecisionapiprodsec"
  "test|e2f38655-db59-4ff3-b40a-c1221e06a49e|kvprismadecisiontestsw|prismadecisionapiptestsec"
)
DISPLAY_NAME="ClientSecret"
SUBSCRIPTION_NAME="R107-prisma-decision" 
RADIX_APP_NAME="prisma-decision-api"
# Old credentials are revoked only after Radix restarts onto the new secrets.
PENDING_REVOCATIONS=()


echo "Starting secret rotation script"
echo "Ensuring Azure CLI is logged in with az login"
# Interactive login via your browser with az login
az login

# Optional: Set the correct subscription context if you have multiple
if [[ -n "$SUBSCRIPTION_NAME" ]]; then
  az account set --subscription "$SUBSCRIPTION_NAME"
fi

for mapping in "${APP_VAULT_SECRET_MAPPINGS[@]}"; do
  IFS='|' read -r mapping_env app_id vault_name secret_name <<< "$mapping"

  if [[ "$TARGET_ENV" != "all" && "$mapping_env" != "$TARGET_ENV" ]]; then
    continue
  fi

  if [[ -z "$app_id" || -z "$vault_name" || -z "$secret_name" || "$app_id" == YOUR_* ]]; then
    echo "Invalid app/vault/secret mapping: $mapping" >&2
    exit 1
  fi
    
  echo "--------------------------------------------------"
  echo "Processing App: $app_id -> Vault: $vault_name ($secret_name)"

  old_key_ids=$(az ad app credential list \
    --id "$app_id" \
    --query "[?displayName=='$DISPLAY_NAME'].keyId" \
    --output tsv)

if [[ "$(uname -s)" == "Darwin" ]]; then
    credential_end_date=$(date -u -v+6m '+%Y-%m-%dT%H:%M:%SZ')
  else
    credential_end_date=$(date -u -d '+6 months' '+%Y-%m-%dT%H:%M:%SZ')
  fi
  echo "Setting new credential for app '$app_id' with expiration date '$credential_end_date'."

  # Generate the secret and capture only the text value.
  secret_value=$(az ad app credential reset \
    --id "$app_id" \
    --append \
    --display-name "$DISPLAY_NAME" \
    --end-date "$credential_end_date" \
    --query "password" \
    --output tsv)

  if [[ -z "$secret_value" || "$secret_value" == "None" ]]; then
    echo "Failed to create a new credential for app '$app_id'." >&2
    exit 1
  fi

  # Deploy the new value to Key Vault (creates a new version automatically).
  az keyvault secret set \
    --vault-name "$vault_name" \
    --name "$secret_name" \
    --value "$secret_value" \
    --expires "$credential_end_date" \
    --output none

  while IFS= read -r old_key_id; do
    if [[ -n "$old_key_id" ]]; then
      PENDING_REVOCATIONS+=("$app_id|$old_key_id")
    fi
  done <<< "$old_key_ids"

  echo "Updated secret '$secret_name' in Key Vault '$vault_name' for app '$app_id'."
done

echo "Successfully rotated and deployed all configured app secrets."


# Radix can now use the updated secret from Key Vault

echo "Log into Radix CLI without az account "

# Radix login
rx login
## Restart the environment to pick up the new secrets

if [[ "$TARGET_ENV" == "all" ]]; then
  rx restart application -a "$RADIX_APP_NAME"
else
  rx restart environment -a "$RADIX_APP_NAME" -e "$TARGET_ENV"
fi

echo "Logging out from Radix CLI"

## Logout from Radix CLI after restarting the environment
rx logout

# The API reads CLIENT_SECRET only at startup, so pods still on the old secret break once it is revoked.
if [[ ${#PENDING_REVOCATIONS[@]} -gt 0 ]]; then
  read -r -p "Confirm the restarted API is healthy in Radix, then press Enter to revoke the previous credentials (Ctrl+C keeps them): "
  for revocation in "${PENDING_REVOCATIONS[@]}"; do
    IFS='|' read -r app_id old_key_id <<< "$revocation"
    az ad app credential delete --id "$app_id" --key-id "$old_key_id"
    echo "Deleted previous '$DISPLAY_NAME' credential '$old_key_id' from app '$app_id'."
  done
fi

# Logout from Azure CLI after completing the secret rotation
echo "Logging out from Azure CLI"
az logout
