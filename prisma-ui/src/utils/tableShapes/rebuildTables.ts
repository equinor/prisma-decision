import type { DiscreteProbability, DiscreteUtility } from '../../validators';
import {
	DEFAULT_VALUE_METRIC_ID,
	getDeterministicProbabilityId,
	getDeterministicUtilityId,
} from './deterministicIds';

/*
 * Rebuilds Probability and Utility tables so their cells match their Table shape.
 * This is a port of the API's TableShapeBuilder, which stays the source of truth. Both are held to
 * the shared fixtures in test-fixtures/table-shape; keep them in sync. Restriction tables are not
 * ported: the UI refetches them after a change is saved.
 */

const MAX_TABLE_ENTRY_COUNT = 500;

type TableShapeState = { id: string };

export type TableShapeIssue = {
	id: string;
	project_id: string;
	type: string;
	boundary: string;
	node?: { id: string } | null;
	uncertainty?: { id: string; is_key: boolean; outcomes: TableShapeState[] } | null;
	decision?: { id: string; type?: string | null; options: TableShapeState[] } | null;
	utility?: { id: string } | null;
};

export type TableShapeEdge = { id: string; tail_id: string; head_id: string };

export type TableShapeProject = {
	issues: TableShapeIssue[];
	edges: TableShapeEdge[];
	discrete_probabilities: DiscreteProbability[];
	discrete_utilities: DiscreteUtility[];
};

/**
 * Rebuilds every Probability and Utility table in a project, after dropping cells that reference States, Issues or edges
 * that no longer exist (the API's database removes those before a rebuild runs).
 * Cells of Issues that are not Uncertainties or Utilities are left untouched.
 */
export const rebuildTables = (project: TableShapeProject) => {
	const issuesByNodeId = new Map(
		project.issues.filter(issue => issue.node).map(issue => [issue.node!.id, issue]),
	);
	const stateIds = new Set(project.issues.flatMap(issue => getAllStates(issue).map(s => s.id)));
	const edges = project.edges.filter(
		edge => issuesByNodeId.has(edge.tail_id) && issuesByNodeId.has(edge.head_id),
	);
	const uncertaintyIds = new Set(
		project.issues.flatMap(i => (i.uncertainty ? [i.uncertainty.id] : [])),
	);
	const utilityIds = new Set(project.issues.flatMap(i => (i.utility ? [i.utility.id] : [])));
	const referencesExistingStates = (cell: {
		parent_outcome_ids: string[];
		parent_option_ids: string[];
	}) => [...cell.parent_outcome_ids, ...cell.parent_option_ids].every(id => stateIds.has(id));

	const probabilities = project.discrete_probabilities.filter(
		probability =>
			uncertaintyIds.has(probability.uncertainty_id) &&
			stateIds.has(probability.outcome_id) &&
			referencesExistingStates(probability),
	);
	const utilities = project.discrete_utilities.filter(
		utility => utilityIds.has(utility.utility_id) && referencesExistingStates(utility),
	);

	const parentsOf = (issue: TableShapeIssue) =>
		issue.node
			? edges
					.filter(edge => edge.head_id === issue.node!.id)
					.map(edge => issuesByNodeId.get(edge.tail_id)!)
			: [];

	const rebuiltUncertaintyIds = new Set<string>();
	const rebuiltUtilityIds = new Set<string>();
	const discreteProbabilities: DiscreteProbability[] = [];
	const discreteUtilities: DiscreteUtility[] = [];
	for (const issue of project.issues) {
		if (issue.type === 'Uncertainty' && issue.uncertainty) {
			const uncertaintyId = issue.uncertainty.id;
			rebuiltUncertaintyIds.add(uncertaintyId);
			discreteProbabilities.push(
				...rebuildProbabilityTable(
					issue,
					parentsOf(issue),
					probabilities.filter(
						probability => probability.uncertainty_id === uncertaintyId,
					),
				),
			);
		} else if (issue.type === 'Utility' && issue.utility) {
			const utilityId = issue.utility.id;
			rebuiltUtilityIds.add(utilityId);
			discreteUtilities.push(
				...rebuildUtilityTable(
					issue,
					parentsOf(issue),
					utilities.filter(utility => utility.utility_id === utilityId),
				),
			);
		}
	}
	discreteProbabilities.push(
		...probabilities.filter(p => !rebuiltUncertaintyIds.has(p.uncertainty_id)),
	);
	discreteUtilities.push(...utilities.filter(u => !rebuiltUtilityIds.has(u.utility_id)));

	return {
		discrete_probabilities: discreteProbabilities,
		discrete_utilities: discreteUtilities,
	};
};

/**
 * Returns the cells an Uncertainty's Probability table must have.
 * Cells whose key already exists are returned as they are; new cells get deterministic IDs.
 * Returns no cells when the table would exceed MAX_TABLE_ENTRY_COUNT.
 * @param parentIssues The tail Issues of every edge into the Issue, in edge order.
 */
const rebuildProbabilityTable = (
	issue: TableShapeIssue,
	parentIssues: TableShapeIssue[],
	existingProbabilities: DiscreteProbability[],
): DiscreteProbability[] => {
	const uncertainty = issue.uncertainty;
	if (!uncertainty) throw new Error('Uncertainty cannot be null during table rebuild');
	const parentGroups = collectParentStateGroups(parentIssues);

	if (
		wouldExceedTableEntryLimit([
			uncertainty.outcomes.length,
			...parentGroups.map(group => group.stateIds.length),
		])
	) {
		return [];
	}

	const expandedByKey = firstByKey(
		copyToNewParents(existingProbabilities, parentGroups),
		probabilityKey,
	);
	const rows = buildRows(parentGroups);
	const desired = uncertainty.outcomes.flatMap(outcome =>
		rows.map(({ parentOutcomeIds, parentOptionIds }) => ({
			outcome,
			parentOutcomeIds,
			parentOptionIds,
		})),
	);
	const desiredProbabilities = desired.map(
		({ outcome, parentOutcomeIds, parentOptionIds }): DiscreteProbability => {
			const key = probabilityKey({
				outcome_id: outcome.id,
				parent_outcome_ids: parentOutcomeIds,
				parent_option_ids: parentOptionIds,
			});
			return {
				id: getDeterministicProbabilityId(
					issue.id,
					outcome.id,
					parentOutcomeIds,
					parentOptionIds,
				),
				outcome_id: outcome.id,
				uncertainty_id: uncertainty.id,
				project_id: issue.project_id,
				probability: expandedByKey.get(key)?.probability ?? 0,
				parent_outcome_ids: parentOutcomeIds,
				parent_option_ids: parentOptionIds,
			};
		},
	);
	return keepExisting(existingProbabilities, desiredProbabilities, probabilityKey);
};

/**
 * Returns the cells a Utility's Utility table must have.
 * Cells whose key already exists are returned as they are; new cells get deterministic IDs.
 * Returns no cells when the Utility has no Parents or the table would exceed MAX_TABLE_ENTRY_COUNT.
 * @param parentIssues The tail Issues of every edge into the Issue, in edge order.
 */
const rebuildUtilityTable = (
	issue: TableShapeIssue,
	parentIssues: TableShapeIssue[],
	existingUtilities: DiscreteUtility[],
): DiscreteUtility[] => {
	const utility = issue.utility;
	if (!utility) throw new Error('Utility cannot be null during table rebuild');
	const parentGroups = collectParentStateGroups(parentIssues);

	if (
		parentGroups.length === 0 ||
		wouldExceedTableEntryLimit(parentGroups.map(group => group.stateIds.length))
	) {
		return [];
	}

	const expandedByKey = firstByKey(copyToNewParents(existingUtilities, parentGroups), utilityKey);
	const desiredUtilities = buildRows(parentGroups).map(
		({ parentOutcomeIds, parentOptionIds }): DiscreteUtility => {
			const key = utilityKey({
				value_metric_id: DEFAULT_VALUE_METRIC_ID,
				parent_outcome_ids: parentOutcomeIds,
				parent_option_ids: parentOptionIds,
			});
			return {
				id: getDeterministicUtilityId(
					issue.id,
					DEFAULT_VALUE_METRIC_ID,
					parentOutcomeIds,
					parentOptionIds,
				),
				value_metric_id: DEFAULT_VALUE_METRIC_ID,
				utility_id: utility.id,
				project_id: issue.project_id,
				utility_value: expandedByKey.get(key)?.utility_value ?? 0,
				parent_outcome_ids: parentOutcomeIds,
				parent_option_ids: parentOptionIds,
			};
		},
	);
	return keepExisting(existingUtilities, desiredUtilities, utilityKey);
};

type ParentCell = { parent_outcome_ids: string[]; parent_option_ids: string[] };
type ParentStateGroup = { stateIds: string[]; isUncertainty: boolean };

const sortIds = (ids: string[]) =>
	[...ids].sort((a, b) => compare(a.toLowerCase(), b.toLowerCase()));
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const lowerSorted = (ids: string[]) => sortIds(ids).map(id => id.toLowerCase());

const probabilityKey = (
	cell: Pick<DiscreteProbability, 'outcome_id' | 'parent_outcome_ids' | 'parent_option_ids'>,
) =>
	`${cell.outcome_id.toLowerCase()}|${lowerSorted(cell.parent_outcome_ids).join(',')}|${lowerSorted(cell.parent_option_ids).join(',')}`;

const utilityKey = (
	cell: Pick<DiscreteUtility, 'value_metric_id' | 'parent_outcome_ids' | 'parent_option_ids'>,
) =>
	`${cell.value_metric_id.toLowerCase()}|${lowerSorted(cell.parent_outcome_ids).join(',')}|${lowerSorted(cell.parent_option_ids).join(',')}`;

const firstByKey = <T>(cells: T[], key: (cell: T) => string) => {
	const byKey = new Map<string, T>();
	for (const cell of cells) {
		const cellKey = key(cell);
		if (!byKey.has(cellKey)) byKey.set(cellKey, cell);
	}
	return byKey;
};

/** Keeps the first existing cell for every desired key, so existing IDs and values survive a rebuild. */
const keepExisting = <T>(existing: T[], desired: T[], key: (cell: T) => string) => {
	const existingByKey = firstByKey(existing, key);
	return desired.map(cell => existingByKey.get(key(cell)) ?? cell);
};

/** A row shares all Parent States; groups cells by the API's row key. */
const separateByRow = <T extends ParentCell>(cells: T[]) => {
	const rows = new Map<string, T[]>();
	for (const cell of cells) {
		const rowKey = [
			...sortIds(cell.parent_option_ids),
			...sortIds(cell.parent_outcome_ids),
		].join(',');
		rows.set(rowKey, [...(rows.get(rowKey) ?? []), cell]);
	}
	return [...rows.values()];
};

/**
 * Copies existing values to Parents that have no cells yet: every existing row is repeated for
 * each State of the new Parent. New States of existing Parents and new Outcomes need nothing,
 * since their cells default to 0.
 */
const copyToNewParents = <T extends ParentCell>(cells: T[], parentGroups: ParentStateGroup[]) => {
	let expanded = cells;
	for (const group of parentGroups) {
		const isRepresented = group.stateIds.some(stateId =>
			expanded.some(
				cell =>
					cell.parent_outcome_ids.includes(stateId) ||
					cell.parent_option_ids.includes(stateId),
			),
		);
		if (isRepresented) continue;
		const parentKey = group.isUncertainty ? 'parent_outcome_ids' : 'parent_option_ids';
		expanded = separateByRow(expanded).flatMap(row =>
			group.stateIds.flatMap(stateId =>
				row.map(cell => ({ ...cell, [parentKey]: [...cell[parentKey], stateId] })),
			),
		);
	}
	return expanded;
};

/** Every combination of one State per Parent, split into Parent Outcomes and Options. */
const buildRows = (parentGroups: ParentStateGroup[]) => {
	const outcomeStateIds = new Set(
		parentGroups.filter(group => group.isUncertainty).flatMap(group => group.stateIds),
	);
	const combinations = parentGroups.reduce<string[][]>(
		(results, group) =>
			results.flatMap(existing => group.stateIds.map(id => [...existing, id])),
		[[]],
	);
	return combinations.map(combination => ({
		parentOutcomeIds: sortIds(combination.filter(id => outcomeStateIds.has(id))),
		parentOptionIds: sortIds(combination.filter(id => !outcomeStateIds.has(id))),
	}));
};

/**
 * One State group per Parent. Duplicate edges count once, and only in-scope key Uncertainties
 * and Focus Decisions are Parents.
 */
const collectParentStateGroups = (parentIssues: TableShapeIssue[]): ParentStateGroup[] => {
	const seen = new Set<string>();
	const groups: ParentStateGroup[] = [];
	for (const parent of parentIssues) {
		if (seen.has(parent.id)) continue;
		seen.add(parent.id);
		if (!isBoundaryInScope(parent.boundary)) continue;
		if (parent.type === 'Uncertainty' && parent.uncertainty?.is_key) {
			groups.push({
				stateIds: parent.uncertainty.outcomes.map(o => o.id),
				isUncertainty: true,
			});
		} else if (parent.type === 'Decision' && parent.decision?.type === 'Focus') {
			groups.push({
				stateIds: parent.decision.options.map(o => o.id),
				isUncertainty: false,
			});
		}
	}
	return groups;
};

const getAllStates = (issue: TableShapeIssue) => [
	...(issue.uncertainty?.outcomes ?? []),
	...(issue.decision?.options ?? []),
];

const wouldExceedTableEntryLimit = (stateCounts: number[]) =>
	stateCounts.reduce(
		(count, stateCount) => Math.min(MAX_TABLE_ENTRY_COUNT + 1, count * stateCount),
		1,
	) > MAX_TABLE_ENTRY_COUNT;

const isBoundaryInScope = (boundary: string) => boundary === 'in' || boundary === 'on';
