# Prisma Decision UI

React 19 + Vite app. Server data lives in TanStack Query; client-only state in jotai.

## Server data

- Each API resource has one query hook in `src/hooks/api/useGet*.ts`. Its `queryKey` is the cache that every mutation for that resource must read, write and invalidate. Look the key up in the `useGet*` hook before writing a mutation; a mutation writing any other key updates nothing on screen.
- Table cells are cached as flat lists: `['probabilityTables']` holds every `DiscreteProbability`, `['utilityTables']` every `DiscreteUtility`, `['restrictionTables']` every Restriction table. The `useGet*Tables` hooks group them per Issue.
- Mutations live beside the queries in `src/hooks/api/`; optimistic ones snapshot in `onMutate`, restore in `onError`, and invalidate the queries the server recalculates (tables, `decisionTree`, `solution`).
- Request and response shapes are the Zod schemas in `src/validators.ts`, hand-written to mirror the API's snake_case DTOs.

## Tests

- Vitest + Testing Library in jsdom; shared setup in `src/test/setup.ts`, shared Issue data in `src/test/issueFixtures.ts`.
- Run one file while working: `npx vitest run <path>`. The full suite (`npm test`) takes several minutes.
- Component tests mock the network by replacing `apiClient.defaults.adapter` (see `src/components/common/IssueForms.test.tsx`) and seed the `QueryClient` with `setQueryData`.
