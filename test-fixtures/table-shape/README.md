# Table shape fixtures

Shared fixtures for the **Table shape** rules (see `GLOSSARY.md`). The API's `TableShapeBuilder` (C#) is the source of truth; the UI has a TypeScript port in `prisma-ui/src/utils/tableShapes/` for optimistic updates. Both must produce every fixture's `expected` Probability and Utility tables, so drift between the two fails CI. Restriction tables are only rebuilt by the API, so only its tests check their expectations.

Run both sides with:

```sh
mise run test:parity
```

## Format

Each file is one scenario:

- `description`: what the scenario covers.
- `input`: a project in the API's snake_case JSON: `issues` (type, boundary, node, uncertainty with `is_key` and outcomes, decision with `type` and options, utility), `edges` (node IDs), and the current `discrete_probabilities`, `discrete_utilities` and `restriction_tables`.
- `expected`: the tables after every Probability, Utility and Restriction table is rebuilt. Cells, tables and entries are sorted by ID and Parent State IDs are sorted, so the comparison is order-independent.

## Adding or changing a fixture

1. Write the `input` (set `expected` to `null` for a new file).
2. Record `expected` from the API's database-backed rebuild:

   ```sh
   TABLE_SHAPE_RECORD=1 dotnet test prisma-api/src/PrismaApi.Test/PrismaApi.Test.csproj --filter FullyQualifiedName~TableRebuildingServiceFixtureTests
   ```

3. Review the recorded `expected`, then run `mise run test:parity` to check both implementations.

Only change recorded expectations when the API's behaviour is meant to change, and update the TypeScript port in the same change.
