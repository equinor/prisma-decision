# Prisma Decisions API

Two APIs working together:
- **.NET API** — handles the database and delegates to the Python API
- **Python (FastAPI)** — interfaces with Python packages such as [pyagrum](https://pyagrum.readthedocs.io/)

## Layout

- [`src/`](src/) — the .NET solution (`PrismaApi.sln`), the EF Core migration projects and the API `Dockerfile`
- [`solver/`](solver/) — the Python FastAPI service and its `Dockerfile`

Both are deployed as components of the same Radix application and released together as
`prisma-api`; see [Build and release](docs/build-and-release.md).

## Related

- [Prisma Decisions UI](../prisma-ui/) in this repository
- [Prisma Decisions Docs](https://github.com/equinor/prisma-decision-docs) - Documentation and more information about Prisma Decisions

## Running locally

Tooling is managed with [mise](https://mise.jdx.dev/) from the repository root; see the
[root README](../README.md#getting-started).

```bash
mise run dev       # solver on :8000, API on :5199 (Local environment, SQLite), UI on :5004
mise run research  # solver, API and UI in Docker in Research mode (no sign-in)
```

In the `Local` environment the API uses the SQLite database `src/Prisma.db`, which is migrated on
startup.

### .NET user secrets

The .NET API needs `AzureAd:ClientSecret` to call the solver and Microsoft Graph on behalf of the
user; without it every request fails with a 500. Set it once from the repository root, reading the
development secret from Key Vault (requires access to `kvprismadecisiondevsw`):

```bash
az login
dotnet user-secrets set "AzureAd:ClientSecret" "$(az keyvault secret show --vault-name kvprismadecisiondevsw --name prismadecisionapidevsec --query value -o tsv)" --project prisma-api/src/PrismaApi.Api
```

`mise run setup` warns when it is missing.

> **Note:** User secrets are only loaded automatically when `ASPNETCORE_ENVIRONMENT=Development` or `ASPNETCORE_ENVIRONMENT=Local`

## Research mode with Docker Compose

`mise run research` runs [`compose.yaml`](../compose.yaml) from the repository root. It runs the .NET
API in **Research** mode with SQLite:

- `ASPNETCORE_ENVIRONMENT=Research`
- `ConnectionStrings__SqliteConnection=Data Source=/data/Prisma.db`
- `FastApiService__BaseUrl=http://fastapi:8000`

Important networking note:

- From your host machine, FastAPI is available at `http://localhost:8000` and the API at `http://localhost:7075`.
- From the `api` container, FastAPI must be addressed as `http://fastapi:8000` (service DNS name on the compose network).

The API stores SQLite at `/data/Prisma.db` in the `api-data` named volume. Remove containers and
volume (full DB reset) from the repository root:

```bash
docker-compose down -v
```

- The `api` service runs as root in Docker Compose for local development to avoid SQLite write-permission issues on the named volume.
- Normal `docker-compose down` keeps your SQLite data. Use `-v` only when you want to reset it.

## Database Migrations

Migrations use Entity Framework Core with separate projects for SQLite and SQL Server ([docs](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/projects?tabs=dotnet-core-cli)).

**Using mise or the scripts** (recommended — syncs both providers at once):

```bash
mise run db:migration:add YourMigrationName
mise run db:migration:remove
```


| Script | Purpose |
|---|---|
| `scripts/Add-Migrations.sh` | Add migration to SQLite and SQL Server |
| `scripts/Remove-Last-Migration.sh` | Remove the last migration |
| `scripts/Update-Sqlite-Database.sh` | Apply migrations to SQLite |
| `scripts/Update-SqlServer-Database.sh` | Apply migrations to SQL Server |

The scripts are in `src/scripts/` and run from `src/`. Usage instructions are at the top of each script file.

**Manually** (from `src/`):

```bash
dotnet ef migrations add YourMigrationName --project ./SqliteMigrations/SqliteMigrations.csproj --startup-project ./PrismaApi.Api/PrismaApi.Api.csproj -- --provider=sqlite
dotnet ef migrations add YourMigrationName --project ./SqlServerMigrations/SqlServerMigrations.csproj --startup-project ./PrismaApi.Api/PrismaApi.Api.csproj -- --provider=sqlserver
```
