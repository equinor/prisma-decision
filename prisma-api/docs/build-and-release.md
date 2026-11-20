# Build & Release

All Prisma components (`prisma-ui`, `prisma-api`) share one release flow driven by
[release-please](../../release-please-config.json). Each component gets its own release PR and its
own tag prefix, and release-please also keeps one combined release PR open
([config](../../release-please-config.all.json)) that releases every component with pending changes
at once. Merging either kind of PR closes the release PRs that are now stale; release-please reopens
any that still have changes.

`prisma-api` covers both the .NET API (`prisma-api/src`) and the solver (`prisma-api/solver`), since
they are components of the same Radix application.

## Backend

* Every PR merged to `main` triggers a Radix build that deploys the API and solver to **DEV**. When
  the merge touches `prisma-api/src/SqlServerMigrations/**`, the
  [migrations workflow](../../.github/workflows/api-ef-migrations.yml) also applies the EF Core
  migrations to the DEV database.
* release-please keeps a `prisma-api` release PR open on `main`, bumping `prisma-api/version.txt` and
  the changelog from the conventional commits since the last release.
* Merging that release PR (or the combined PR) creates the tag `prisma-api-vX.Y.Z`, which Radix
  builds and deploys to **PROD**. The [release-please workflow](../../.github/workflows/release-please.yml)
  applies the migrations to the PROD database at the same time.

## Frontend

* Every PR merged to `main` deploys the UI to **DEV**, and merging the `prisma-ui` release PR (or
  the combined PR) creates the tag `prisma-ui-vX.Y.Z`, which deploys to **PROD**.
* Each environment is built with `npm run build:<env>`, which reads `prisma-ui/.env.<mode>` at build
  time.

## Test, public, design and ai

TEST, PUBLIC, DESIGN and AI build the UI and API from shared moving tags. Check out the commit to deploy
and run:

```console
mise run release:test     # moves TEST: deploys the test environment
mise run release:public   # moves PUBLIC: deploys the public environment
mise run release:design   # moves DESIGN: deploys the design environment
mise run release:ai       # moves AI: deploys the ai environment (UI only)
```

Pushing `TEST` or `PUBLIC` also applies the migrations to that environment's database. The design
and ai environments use the public database and do not migrate it. The ai environment only
deploys the UI, which calls the public API.

## Environments

| Environment | UI                       | API and solver            |
| ----------- | ------------------------ | ------------------------- |
| DEV         | `main`                   | `main`                    |
| TEST        | `TEST` tag               | `TEST` tag                |
| PROD        | `prisma-ui-v*` tags      | `prisma-api-v*` tags      |
| PUBLIC      | `PUBLIC` tag             | `PUBLIC` tag              |
| DESIGN      | `DESIGN` tag             | `DESIGN` tag              |
| AI          | `AI` tag                 |                           |

The migrations workflow logs in to Azure with the `AZURE_*` secrets of the GitHub environment named
after the target (`Development`, `Test`, `Production`, `Public`).
