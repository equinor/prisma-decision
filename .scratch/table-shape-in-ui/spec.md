# Table shape computed in both the UI and the API

Status: ready-for-agent

Base: stacked on `fredrikmwold-edit-issue-sheet` (PR #37, edit issues in a side sheet).

## Problem Statement

Only the API knows how to rebuild a Probability table, Utility table or Restriction table when the Table shape changes. Table shape changes when an Issue's States, type, Boundary, key or Focus flag change, or when an edge is added or removed. Because the UI can't predict the new Table shape, it can't update optimistically after these changes. It has to wait for the server and refetch.

Users see this as inconsistent behaviour. Some edits in the app appear instantly and others lag. In the edit issue side sheet the table is disabled with the banner "The table is disabled until your changes are saved". A user who changes an Issue (for example, adds an Outcome) must save, wait, then reopen or continue to edit the table in its new shape. Two saves are needed for what feels like one edit.

## Solution

The Table shape logic exists in both places:

- **UI (TypeScript):** a pure function computes the rebuilt tables from the cached project data. Every mutation that affects Table shape uses it to update the cache optimistically, so the UI shows the new shape immediately.
- **API (C#):** the same logic, extracted into a pure module, stays the source of truth. The server keeps rebuilding tables on every relevant change. The client's result is only a prediction, replaced by the server's response after the refetch.

Both implementations produce the same cells, values and **deterministic cell IDs**. The API already derives new cell IDs from each cell's Parent-State combination, so the UI can address new cells before the server has responded.

A shared set of JSON fixtures is run by both the C# and TypeScript test suites, so any drift between the two implementations fails CI.

In the edit issue side sheet, the user can change the Issue and immediately edit its table in the new shape, then click **Save** once.

## User Stories

1. As a project member, I want the Probability table in the side sheet to show its new shape as soon as I add an Outcome in the form, so that I can fill in probabilities for the new Outcome without saving first.
2. As a project member, I want to remove an Outcome in the side sheet form and see its column disappear from the Probability table immediately, so that I understand the effect before saving.
3. As a project member, I want to edit cells of the reshaped table while the issue form has unsaved changes, so that I can finish the whole edit in one go.
4. As a project member, I want one Save button to save both my Issue changes and my table edits, so that I don't have to save twice.
5. As a project member, I want the "table is disabled until your changes are saved" banner gone, so that the side sheet doesn't block me.
6. As a project member, I want the sheet to stay open with my table edits still unsaved if saving the table fails after the Issue was saved, so that I can retry without losing work.
7. As a project member, I want retrying Save after a failed table save to send only the table, so that the Issue isn't saved twice.
8. As a project member, I want the tables to be refetched from the server when a table save fails, so that what I see reflects what was actually stored.
9. As a project member, I want changing an Issue's type in the side sheet to show the matching table (Probability or Utility) in its new shape immediately, so that I can fill it in right away.
10. As a project member, I want changing an Issue's Boundary in the side sheet to immediately add or remove it as a Parent in other tables, so that the diagram stays consistent.
11. As a project member, I want toggling an Uncertainty's key flag to immediately reshape the tables of its children, so that I see the effect without waiting.
12. As a project member, I want toggling a Decision's Focus to immediately reshape the tables of its children, so that I see the effect without waiting.
13. As a project member, I want adding an edge in the influence diagram to immediately add the tail Issue as a Parent in the head Issue's table, so that the diagram feels responsive.
14. As a project member, I want removing an edge to immediately remove that Parent from the head Issue's table, so that the diagram feels responsive.
15. As a project member, I want adding an edge to immediately create its Restriction table with the correct entries, so that I can set restrictions without waiting.
16. As a project member, I want adding or removing an Option on a Decision to immediately reshape every table where that Decision is a Parent, so that the tables are never stale.
17. As a project member, I want adding or removing an Outcome on an Uncertainty to immediately reshape its own Probability table and its children's tables, so that the tables are never stale.
18. As a project member, I want adding or removing a State to immediately update the Restriction tables of the edges touching that Issue, so that the restrictions stay valid.
19. As a project member, I want existing probabilities and utilities to be kept wherever their cell still exists after a reshape, so that I don't lose work.
20. As a project member, I want an existing table's values copied across every State of a newly connected Parent, so that I start from my previous estimates instead of zeros.
21. As a project member, I want cells added for a new State of an existing Parent to start at 0, both in the optimistic view and after the server responds, so that the result doesn't change unexpectedly.
22. As a project member, I want a table that would exceed the cell limit to look the same optimistically as it does after the server responds, so that I'm not shown a table that then disappears.
23. As a project member, I want to edit a cell that was just created optimistically before the server has responded, so that I never have to wait to type.
24. As a project member, I want the optimistic tables replaced by the server's tables after every successful change, so that the server remains the source of truth.
25. As a project member, I want optimistic table changes rolled back and refetched when a change fails, so that I'm never left with a table that doesn't exist on the server.
26. As a project member, I want edits to be optimistic in every part of the app, so that the app behaves consistently.
27. As a developer, I want the Table shape rules expressed once per language in a pure module without database or React dependencies, so that they are easy to read and test.
28. As a developer, I want a shared set of fixtures that both the C# and TypeScript test suites must pass, so that drift between the implementations fails CI before deployment.
29. As a developer, I want the fixtures' expected outputs recorded from the current API behaviour before refactoring, so that the refactor provably doesn't change behaviour.
30. As a developer, I want one TypeScript entry point that recomputes every table, called by every mutation that affects Table shape, so that mutation hooks don't each contain table logic.
31. As a developer, I want a mise task that runs only the parity tests on both sides, so that I can check parity quickly while working on either implementation.
32. As a developer, I want UI unit tests to run in CI, so that the TypeScript half of the parity tests is actually enforced.

## Implementation Decisions

### Domain rules (identical on both sides)

- **Parent eligibility:** an Issue is a Parent of another Issue if an edge runs from it to that Issue, its Boundary is In or On, and it is either a key Uncertainty (contributing its Outcomes) or a Focus Decision (contributing its Options). Duplicate edges between the same pair count once. All other Issues are ignored.
- **Probability table shape:** the Uncertainty's own Outcomes × the Cartesian product of the Parents' State groups.
- **Utility table shape:** one cell per combination of Parent States. A Utility with no Parents has no cells.
- **Restriction table shape:** one per edge, with one entry per tail State × head State. The Restriction table is deleted when either end of the edge is not an in-scope key Uncertainty or Focus Decision.
- **Keeping values:**
  - A cell whose key still exists keeps its value.
  - A newly connected Parent copies each existing row's values across all of that Parent's States.
  - A new State of an already-represented Parent adds rows with value 0.
  - A new Outcome of the Uncertainty itself adds cells with value 0.
  - Restriction entries keep their value; new entries use the domain default restriction value.
- **Cell limit:** when a table would exceed 500 cells, its cells are cleared; for Restriction tables, the entries are cleared. The UI shows this the same way it shows the server's result.
- **No normalization:** probabilities are not normalized.
- **Policy tables are out of scope.** The API doesn't rebuild them this way.

### Cell identity

- New cells get the **deterministic IDs the API already uses**:
  - **Probability cells:** an MD5 hash of the issue ID, child Outcome ID and sorted Parent Outcome and Option IDs, in the existing string format.
  - **Utility cells:** the same, using the default Value Metric ID in place of the child Outcome.
  - **Restriction entries:** a hash of the Restriction table ID, parent State ID and child State ID.
- The MD5 hash becomes a GUID through .NET's `Guid(byte[])` constructor. It stores the first three GUID groups in little-endian order, so the TypeScript port must reverse those bytes to produce identical IDs.
- IDs are sorted in lowercase string order. This matches .NET's GUID ordering for these keys.
- Existing cells keep their stored IDs, including any older random IDs.
- Restriction entries whose parent or child State is null currently get random IDs on the server. The TypeScript port must handle this case explicitly and document it.
- Restriction tables themselves are created with IDs generated by the client, as today.

### API (C#)

- Extract the Table shape calculation from `TableRebuildingService` into a pure module in the Domain layer with no database access. The calculation covers Parent eligibility, Cartesian products, value carry-over, the cell limit and deterministic IDs. It takes plain DTO-style input and returns the desired cells for each table.
- `TableRebuildingService` keeps loading from the database, calls the pure module, and reconciles by inserting missing cells, deleting obsolete or duplicate cells and leaving matching cells untouched.
- The API stays authoritative. Its endpoints and request/response contracts don't change, and the API doesn't check what the client predicted.

### UI (TypeScript)

- A pure Table shapes module with one entry point: it takes Issues (type, Boundary, key or Focus, States), edges and the current Probability, Utility and Restriction cells, and returns the rebuilt cells for all three table types. It has no React or React Query dependencies.
- A thin helper writes those results into the React Query caches for the project. Every mutation that affects Table shape calls it before its request is sent; the snapshot is restored on error, and the affected queries are refetched once the request completes. Mutation hooks stay small: they apply their own change to the cached Issues or edges and then call the helper.
- The UI keeps its rule of hiding the Utility table until it has 2 or more Parents ("Connect 2+ parent nodes…"). The shared logic still builds Utility tables with 1 Parent, matching the API.

### Side sheet single save

- While the issue form has unsaved changes, the table tab shows the table computed from the **form's draft values** and is editable. The "disabled until saved" banner is removed.
- Draft table edits are keyed by the deterministic cell IDs. If the draft changes shape again, edits whose cells still exist are kept.
- Save is a two-step mutation: first the existing issue update, then the existing table-value update for **that Issue's own table only**. Neither endpoint changes. Other affected tables are rebuilt optimistically and then replaced by the refetch.
- If step 1 fails, nothing else happens and the form stays dirty.
- If step 2 fails, the sheet stays open with the table edits still unsaved and the tables are refetched. Retrying sends only step 2.

### Parity fixtures and tooling

- Shared golden fixtures live in a repo-root fixtures directory for Table shape. Each fixture is one JSON file with `input` (Issues, edges, existing cells) and `expected` (cells per table, including IDs and values).
- Fixtures use the API's snake_case JSON so both sides can read them with their existing DTO and schema definitions.
- Comparison uses canonical sets: cells sorted by ID. Display order is not part of the contract.
- Add a mise task, `test:parity`, that runs only the parity tests in xUnit and Vitest.
- Add the Vitest run to the UI CI workflow.

### Delivery (three PRs stacked on the side-sheet branch)

1. **Pure logic and parity fixtures:**
   - Record expected outputs from the current C# behaviour as characterization fixtures.
   - Extract the C# pure module.
   - Port it to TypeScript.
   - Add the mise task and the Vitest step in UI CI.
2. **Optimistic tables and side-sheet single save:**
   - Add the cache helper.
   - Make the issue update optimistic.
   - Make the side-sheet table editable with the draft shape, saved in two steps.
3. **Remaining mutations made optimistic:** edges, States, type, Boundary, key or Focus, Restriction tables, cell values and any other mutation that is currently not optimistic.

## Testing Decisions

- Tests check external behaviour: the cells produced for a given input, and what the user sees and what requests are sent. They don't check private helpers or the order of internal steps.
- **Seam 1, Table shape parity (main seam):** the C# pure module and the TypeScript pure module are both tested against the same fixtures. Each fixture is loaded, run, canonicalized and compared to `expected`. Every Table shape rule is tested here and only here.
- The fixtures must cover:
  - no Parents;
  - a single Parent;
  - multiple Parents;
  - a Parent outside the Boundary;
  - a non-key Uncertainty Parent;
  - a non-Focus Decision Parent;
  - duplicate edges;
  - an added Parent (values copied);
  - an added State on an existing Parent (value 0);
  - an added child Outcome;
  - a removed State;
  - a removed Parent;
  - a type change;
  - the 500-cell limit for each table type;
  - Restriction table creation, deletion and entry reconciliation;
  - existing cells with older random IDs;
  - deterministic ID generation.
- **Seam 2, API regression:** the existing xUnit controller and integration tests (shared fixture and collection) must keep passing after the refactor. No new API tests, because the contract doesn't change.
- **Seam 3, UI behaviour:** extend the existing side-sheet and table component tests with the API mocked. Assert that:
  - the reshaped table is editable while the form is unsaved;
  - Save sends the issue update and then the table update;
  - a failed table save keeps the sheet open, keeps the edits and refetches;
  - the cache shows optimistic tables before the server responds.

  The cache helper isn't tested on its own.
- **Prior art:**
  - xUnit `[Theory]` tests in the API test project, and the controller tests for discrete utilities and restrictions;
  - Vitest and Testing Library tests for the side-sheet forms, the shared conditional-table component and the Probability table.

## Out of Scope

- Policy tables.
- Changing or extending the issue update endpoint, or adding a combined save endpoint.
- Runtime checks of client predictions on the server. Drift is caught in CI by the parity fixtures.
- Generating TypeScript from C#, or having the API return computed shapes.
- A randomized differential test harness. It can be added later if fixtures miss edge cases.
- Changing the UI rule that a Utility table needs 2 or more Parents.
- Changing the API's Table shape rules or ID scheme. This work copies them as they are.

## Further Notes

- The probability prepopulation behaviour is easy to miss: a newly connected Parent copies values, while a new State starts at 0. The characterization fixtures must lock it in before the C# refactor.
- The .NET GUID byte order is the most likely source of ID mismatches. The first ID fixture should catch it immediately.
- The glossary terms used here (**Parent**, **Probability table**, **Utility table**, **Restriction table**, **Table shape**) were added to the glossary during design.
- The `TableCleanupService` background job (which removes duplicate cells) is unaffected.
