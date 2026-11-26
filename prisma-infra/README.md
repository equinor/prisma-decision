# Prisma infrastructure

Azure Bicep templates and operational scripts for Prisma Decisions.

Imported as a snapshot from
[`equinor/prisma-decision-infrastructure`](https://github.com/equinor/prisma-decision-infrastructure/tree/7eea04ce7266e55d7ab78ec555bb2691c949726b),
starting at version `0.2.7`. Earlier Git history remains in that repository.
The resource templates and parameter values are unchanged by the move.

## Deployment

| Trigger | Result |
| --- | --- |
| Pull request touching infrastructure | Compile Bicep; no Azure login or deployment |
| Push to `main` touching infrastructure | Deploy dev |
| `mise run release:test` | Deploy test, then move `TEST` and migrate |
| `mise run release:public` | Deploy public, then move `PUBLIC` and migrate |
| Merged `prisma-infra` release PR | Deploy prod before creating component release tags |

The [Infra workflow](../.github/workflows/infra.yml) handles dev.
The [release-environment workflow](../.github/workflows/release-environment.yml) handles test and
public, and the [release-please workflow](../.github/workflows/release-please.yml) handles production.
In every environment except dev, infrastructure deploys before the tag Radix builds from is created
or moved, so the API never starts against infrastructure that has not been applied. Tags created
with `GITHUB_TOKEN` do not start other Actions workflows, so both workflows also run the migrations
themselves.

For production, both per-component and
combined release PRs include infrastructure. A failed production infrastructure deployment blocks
all component release tags; fix the failure and rerun the failed jobs. An untagged manifest version
continues to require production deployment on subsequent pushes, so a failed run cannot be bypassed
by an unrelated application change. When releasing infrastructure
and API changes separately, merge the infrastructure release PR first.

The initial addition of `prisma-infra` to the release manifest establishes the imported baseline;
it does not deploy production.

For test and public, a failed infrastructure deployment leaves the tag where it was. Every run
redeploys the infrastructure; unchanged templates make no changes.

## Azure authentication

The workflows authenticate with OIDC as the existing per-environment infrastructure app registrations.
The three identifiers below are non-secret configuration and belong in GitHub **environment variables**,
not source-code credentials or GitHub secrets. The existing EF migration workflow continues to use
its existing environment secrets.

| GitHub environment | Bicep environment | `AZURE_CLIENT_ID` |
| --- | --- | --- |
| Development | dev | `62fad29b-f42a-4055-9e9f-a82de5cd8446` |
| Test | test | `6a9ff0a3-7200-46de-8d66-667eee330bf8` |
| Production | prod | `a7992ecb-425a-4ef5-b100-9fa239a83ba9` |
| Public | public | `7e850348-0352-4dcb-8cfa-ef005fb3e968` |

Each environment also needs:

- `AZURE_TENANT_ID`: `3aa4a235-b6e2-48d5-9195-7fcf05b459b0`
- `AZURE_SUBSCRIPTION_ID`: `aeeafb13-fc22-4e29-8e42-47fb9f966e01` (`R107-prisma-decision`)

Production retains its approval gate and `main` branch restriction. Test permits `main`, where the
release-environment workflow runs, and the `TEST` tag.

### Azure federated credentials

Federated credentials live on the app registrations in **Azure/Entra**, not in this repository.
An app registration owner must add one for the matching GitHub environment. Keep the existing
infrastructure repository's credentials until cutover is complete.

This repository uses immutable OIDC subjects. The issuer is
`https://token.actions.githubusercontent.com`, the audience is `api://AzureADTokenExchange`,
and the subjects are:

```text
repo:equinor@525862/prisma-decision@1461423946:environment:Development
repo:equinor@525862/prisma-decision@1461423946:environment:Test
repo:equinor@525862/prisma-decision@1461423946:environment:Production
repo:equinor@525862/prisma-decision@1461423946:environment:Public
```

For example, an owner of `prisma-decision-infrastructure-dev` can add the development trust with:

```bash
az ad app federated-credential create \
  --id 62fad29b-f42a-4055-9e9f-a82de5cd8446 \
  --parameters '{
    "name": "prisma-decision-monorepo-development",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:equinor@525862/prisma-decision@1461423946:environment:Development",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

Repeat with each environment's client ID, subject, and a distinct credential name.
Reusing these app registrations preserves their Azure RBAC assignments; do not substitute the
Radix runtime managed identities. Deployment requires subscription-scope permissions, including
permission to create the role assignments declared by the templates.

## Local checks and deployment

With Azure CLI installed:

```console
az bicep install
mise run infra:check
```

The entry point has `targetScope = 'subscription'` and creates its resource group. Do not deploy it
with `az deployment group create`. After logging in with the appropriate Azure permissions, preview
development changes without applying them:

```bash
az deployment sub what-if \
  --subscription R107-prisma-decision \
  --location swedencentral \
  --template-file prisma-infra/bicep/main.bicep \
  --parameters prisma-infra/bicep/main.parameter.dev.json
```

Deploy manually:

```bash
az deployment sub create \
  --subscription R107-prisma-decision \
  --name dev \
  --location swedencentral \
  --template-file prisma-infra/bicep/main.bicep \
  --parameters prisma-infra/bicep/main.parameter.dev.json
```

Keep the subscription, parameter values and resource names unchanged during cutover. Moving the
templates does not require migrating a state file or recreating SQL, Key Vault, monitoring or
managed identity resources.

## Cutover

1. Configure the GitHub environment variables, Azure federated credentials and permitted deployment refs.
2. Before merging, disable deployment workflows in the old repository to avoid competing deployers.
3. Review subscription-level what-if and deploy dev, test/public, then production from this repository.
4. After confirming the new flow, remove the old repository's federated credentials and archive it.

No Azure resources should change merely because the templates moved. Azure access is required
to verify that against the deployed resources; compiling Bicep alone does not establish parity.
