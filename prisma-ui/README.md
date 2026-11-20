# Prisma Decision UI

A decision quality assessment tool for Equinor that helps teams structure and evaluate decisions using influence diagrams, decision trees, and strategy comparison tables.

## Features

- **Influence Diagrams** — Visual graph-based modeling of decision relationships using React Flow and ELK layout
- **Decision & Solution Trees** — Expandable tree structures for exploring decision options and outcomes
- **Strategy Management** — Create, edit, and compare strategies with icon-based identification
- **Strategy Table** — Side-by-side comparison of how strategies select different options
- **Decision Quality Assessment** — Structured assessment forms for evaluating decision quality
- **Project Import/Export and Duplication** — Import and export project data,also duplicates the project;
- **Issue view** — Reorder issues with dnd-kit.
- **Authentication** — Azure AD (MSAL) integration for Equinor SSO

## Related

- [API and solver](../prisma-api/) in this repository
- [Docs](https://github.com/equinor/prisma-decision-docs)

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build:** Vite 8
- **Styling:** Tailwind CSS v4
- **UI Components:** Equinor EDS (eds-core-react)
- **Graph Visualization:** @xyflow/react (React Flow)
- **Layout:** ELK.js (elkjs)
- **State Management:** Jotai, @tanstack/react-query
- **Forms:** react-hook-form + Zod v4
- **Auth:** @azure/msal-react
- **Drag & Drop:** @dnd-kit

## Installation

Tooling is managed with [mise](https://mise.jdx.dev/) from the repository root; see the
[root README](../README.md#getting-started). `mise run setup` installs the UI dependencies.

## Configuration

The app uses environment-specific `.env` files:

| Variable                    | Description                     |
| --------------------------- | ------------------------------- |
| `VITE_APP_CLIENT_ID`        | Azure AD application client ID  |
| `VITE_APP_REDIRECT_URI`     | OAuth redirect URI              |
| `VITE_APP_PRISMA_API_URL`   | Backend API base URL            |
| `VITE_APP_PRISMA_API_SCOPE` | API scope for token acquisition |

Environment files: `.env.development`, `.env.test`, `.env.production`

For authenticated environments, register the absolute `/redirect.html` URL as a Single-page application redirect URI in the corresponding Entra ID app registration. The protocol, host, port, and path must match exactly.

## Usage

From the repository root:

```bash
mise run dev            # UI, API and solver locally
mise run dev:ui:remote  # UI only, against the remote development API
```

The application runs at `http://localhost:5004`. The commands below run from `prisma-ui/`.

### Other commands

```bash
npm run build          # Type-check + production build
npm run build:dev      # Development build
npm run build:test     # Test environment build
npm run build:prod     # Production build
npm run lint           # ESLint
npm run tsc            # TypeScript type-check
npm run prettier       # Check formatting
npm test               # Vitest + jsdom component and validation tests
```

Tests live beside their source files and use React Testing Library. `src/test/setup.ts`
supplies the native dialog/popover APIs missing from jsdom. Full issue-form tests
replace the HTTP adapter; they do not require or write to a backend.
Use Node 22.22.2+ or Node 24.15+ for the test runner.

Full Create/Edit issue controls use EDS 2.0 beta from `@equinor/eds-core-react/next`,
with its stylesheet layered after Tailwind's base reset in `src/index.css`.
Existing Equinor typography is retained; Inter is loaded separately for beta
controls, whose color-scheme tokens follow the existing theme preference.
Stable Popover and CircularProgress remain because the beta does not provide
counterparts. Reusable issue defaults are
in `src/utils/createIssueDraft.ts`; shared issue, option, and outcome validation is
in `src/validators.ts`. Validation rejects blank required text without trimming
submitted values.

## Project Structure

```
src/
├── auth/           # MSAL authentication config
├── components/     # React components
│   ├── common/     # Shared components (cards, dialogs, drag & drop)
│   ├── CreateProjectPage/
│   ├── Homepage/
│   └── ProjectPage/
│       ├── InfluenceDiagram/
│       ├── Strategies/
│       └── ...
├── config/         # Tree configuration (compact, decision, solution)
├── hooks/          # Custom hooks + API hooks
│   └── api/        # react-query mutation/query hooks
└── utils/          # Utility functions (layout, conversion, validation)
```

## Deployment

Deployed via Docker on [Radix](https://www.radix.equinor.com/) (Equinor's Kubernetes platform). See the [CI/CD](#cicd) section for details.

## Security

This repository uses GitHub Advanced Security (GHAS) features:

- **Dependabot** — Automated dependency vulnerability alerts and update PRs
- **Secret scanning** — Detects accidentally committed secrets and credentials
- **Code scanning** — Static analysis via GitHub's security tooling

For vulnerability reporting, see [SECURITY.md](../SECURITY.md).

## CI/CD

Pull requests that touch `prisma-ui/` run ESLint, TypeScript and Prettier
(`.github/workflows/ui-ci.yml`).

Radix builds the UI from `radixconfig.yaml` and `radixconfig-public.yaml`:

| Environment | Trigger                       | DNS Alias                         |
| ----------- | ----------------------------- | --------------------------------- |
| **dev**     | Push to `main`                | `prisma-dev.radix.equinor.com`    |
| **test**    | `TEST` tag                    | `prisma-test.radix.equinor.com`   |
| **prod**    | `prisma-ui-v*` release tag    | `prisma.radix.equinor.com`        |
| **public**  | `PUBLIC` tag                  | `prisma-public.radix.equinor.com` |
| **design**  | `DESIGN` tag                  |                                   |
| **ai**      | `AI` tag                      |                                   |

See [Build and release](../prisma-api/docs/build-and-release.md). The app is built via Docker
(`Dockerfile`) and served on port 3000 by a Node.js Express server (`deployment/`).

## Research mode

`mise run research` (from the repository root) builds this app with `--mode research`, which reads
[.env.research](.env.research), and runs it in Docker together with the API and solver at
http://localhost:5004. `VITE_APP_PRISMA_API_URL` is baked into the build.

This mode stores a username in browser local storage instead of signing in. If it is missing, the
app redirects to [login.html](login.html):

1. Open http://localhost:5004
2. If redirected, open http://localhost:5004/login.html
3. Submit username
4. Return to influence diagram page

If the Docker build fails at `npm ci`, make sure [package-lock.json](package-lock.json) is in sync
with [package.json](package.json).
