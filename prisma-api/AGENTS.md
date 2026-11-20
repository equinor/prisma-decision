# Prisma Decision API

`prisma-api/` contains two sub-projects that work together:

- **`src/`** — A C# ASP.NET Core Web API (Clean Architecture)
- **`solver/`** — A Python FastAPI service for Bayesian inference / influence-diagram solving

The .NET API calls the Python API over HTTP for all solver operations.

---

## Architecture

### .NET — Clean Architecture layers

| Layer | Project | Responsibility |
|---|---|---|
| Presentation | `PrismaApi.Api` | Controllers, attributes, security policies |
| Application | `PrismaApi.Application` | Services, repositories, mapping, background jobs |
| Domain | `PrismaApi.Domain` | Entities, DTOs, interfaces, constants |
| Infrastructure | `PrismaApi.Infrastructure` | EF Core context, caching, DB utilities |

Dependencies always point inward. Infrastructure and Application implement interfaces defined in Domain.

### Python — FastAPI layers

| Layer | Location | Responsibility |
|---|---|---|
| Routes | `solver/src/routes/` | FastAPI routers, request/response handling |
| Services | `solver/src/services/` | Business and solver logic |
| DTOs | `solver/src/dtos/` | Pydantic models |
| Utils | `solver/src/utils/` | Shared helpers |

---

## Coding standards

Before writing a controller, service, repository, DTO, mapping, entity, test or solver route, read [`CODING_STANDARDS.md`](CODING_STANDARDS.md) for the pattern to copy.
