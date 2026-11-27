# Prisma Decisions

Prisma Decisions is Equinor's decision quality tool. Teams structure and evaluate decisions with influence diagrams, decision trees and strategy tables.

This repository contains:

- [`prisma-ui`](prisma-ui/) — the React user interface
- [`prisma-api`](prisma-api/) — the .NET API with its database migrations, and the Python solver service it calls
- [`prisma-infra`](prisma-infra/) — the Azure infrastructure and operational scripts

## Getting started

You need [mise](https://mise.jdx.dev/). From the repository root:

```console
mise install
mise run setup
mise run dev
```

The application starts at <http://localhost:5004>, the API at <http://localhost:5199> and the solver at <http://localhost:8000>. The API uses a local SQLite database. The setup task installs dependencies and pre-commit hooks, and checks the required API secret.

Useful tasks:

| Task | Purpose |
| --- | --- |
| `mise run dev` | Run the solver, API and UI locally with a SQLite database |
| `mise run dev:ui:remote` | Run only the UI against the remote development API |
| `mise run research` | Run the solver, API and UI in Docker in Research mode (no sign-in); needs Docker |
| `mise run check` | Run the same API and UI checks as CI |
| `mise run test` | Run all API, solver and UI tests |
| `mise run db:migration:add <name>` | Add an EF Core migration for SQLite and SQL Server |
| `mise run infra:check` | Check infrastructure templates and release detection without deploying |

Run `mise tasks` to list all available tasks.

## Documentation

- [UI](prisma-ui/README.md)
- [API and solver](prisma-api/README.md)
- [Build and release](prisma-api/docs/build-and-release.md)
- [Infrastructure deployment](prisma-infra/README.md)
- [Contributing](CONTRIBUTING.md)
- [Prisma Decisions Docs](https://github.com/equinor/prisma-decision-docs)
