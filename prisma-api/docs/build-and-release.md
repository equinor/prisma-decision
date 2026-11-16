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
* To deploy a specific commit to **TEST**, tag it manually:

  ```console
  git tag prisma-api-test-v1.4.0-rc1 <commit>
  git push origin prisma-api-test-v1.4.0-rc1
  ```

  Pushing a `prisma-api-test-v*` tag also applies the migrations to the TEST database.

## Frontend

* Every PR merged to `main` deploys the UI to **DEV**, and merging the `prisma-ui` release PR (or
  the combined PR) creates the tag `prisma-ui-vX.Y.Z`, which deploys to **PROD**.
* To deploy a specific commit to **TEST**, tag it manually:

  ```console
  git tag prisma-ui-test-v1.2.0-rc1 <commit>
  git push origin prisma-ui-test-v1.2.0-rc1
  ```

* Each environment is built with `npm run build:<env>`, which reads `prisma-ui/.env.<mode>` at build
  time.

## Public and design

The public Radix applications (`prisma-decision-web-public`, `prisma-decision-api-public`) build the
UI and API from shared moving tags. Check out the commit to deploy and run:

```console
mise run release:public   # moves PUBLIC: deploys the public environment
mise run release:design   # moves DESIGN: deploys the design environment
```

Pushing `PUBLIC` also applies the migrations to the public database. The design environment uses the
public database and does not migrate it.

## Environments

| Environment | UI                       | API and solver            |
| ----------- | ------------------------ | ------------------------- |
| DEV         | `main`                   | `main`                    |
| TEST        | `prisma-ui-test-v*` tags | `prisma-api-test-v*` tags |
| PROD        | `prisma-ui-v*` tags      | `prisma-api-v*` tags      |
| PUBLIC      | `PUBLIC` tag             | `PUBLIC` tag              |
| DESIGN      | `DESIGN` tag             | `DESIGN` tag              |

The migrations workflow logs in to Azure with the `AZURE_*` secrets of the GitHub environment named
after the target (`Development`, `Test`, `Production`, `Public`).
