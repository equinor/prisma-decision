# Prisma Decision Framing

Prisma captures matters relevant to a project's decision and the choices and possible results considered when evaluating that decision.

## Language

**Issue**:
A matter relevant to the project's decision.

**Option**:
A possible choice for a Decision.

**Outcome**:
A possible result of an Uncertainty.

**State**:
The collective term for an Option or Outcome.

**Card view**:
A presentation of the Influence diagram in which Issues appear as cards.

**Shape view**:
A presentation of the same Influence diagram in which Decisions appear as rectangles, Uncertainties as ellipses, and Utilities as diamonds.

**Scenario override**:
A scenario assumption that fixes an Issue to a particular State.

**Forced decision**:
A Scenario override that fixes a Decision to one Option.

**Hard evidence**:
A Scenario override that fixes an Uncertainty to one Outcome.

**Issue name**:
The label identifying an Issue, including when displayed as a Board card's title.
_Avoid_: Issue title

**Draft**:
An Issue being prepared that has not yet been added to the project.
_Avoid_: Composer

**Parent**:
An Issue whose States condition another Issue's table, through an edge into that Issue. Only in-scope key Uncertainties and Focus Decisions count as Parents.

**Probability table**:
The probabilities of an Uncertainty's Outcomes for each combination of its Parents' States.

**Utility table**:
The value of a Utility for each combination of its Parents' States.

**Restriction table**:
For one edge, whether each State of the tail Issue is compatible with each State of the head Issue.

**Table shape**:
The set of cells a Probability table, Utility table or Restriction table must have, given the States of the Issues involved. Rebuilding a table brings its cells in line with its Table shape while keeping the values of cells that still exist.
_Avoid_: table dimension
