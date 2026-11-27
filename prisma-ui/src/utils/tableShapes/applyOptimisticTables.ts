import type { QueryClient } from '@tanstack/react-query';
import type { DiscreteProbability, DiscreteUtility, Edge, Issue } from '../../validators';
import { rebuildTables } from './rebuildTables';

export type OptimisticTableCaches = {
	issues: Issue[];
	edges: Edge[];
	probabilities: DiscreteProbability[];
	utilities: DiscreteUtility[];
};

/** The caches that are loaded; unloaded caches are left alone. */
export type TableCacheSnapshot = Partial<OptimisticTableCaches>;

type TableCacheChange = (caches: OptimisticTableCaches) => Partial<OptimisticTableCaches>;

const queryKeys = {
	issues: ['issues'],
	edges: ['edges'],
	probabilities: ['probabilityTables'],
	utilities: ['utilityTables'],
} as const satisfies Record<keyof OptimisticTableCaches, readonly string[]>;

const cacheNames = Object.keys(queryKeys) as (keyof OptimisticTableCaches)[];

/**
 * Applies a change to the loaded Issues, edges or table cells, then rebuilds the Probability and
 * Utility tables to their new Table shape. Tables are only rebuilt when every cache is loaded, so
 * partial data never drops cells. Restriction tables are left to the refetch.
 */
const rebuildCaches = (
	caches: TableCacheSnapshot,
	change: TableCacheChange,
): TableCacheSnapshot => {
	const current: OptimisticTableCaches = {
		issues: caches.issues ?? [],
		edges: caches.edges ?? [],
		probabilities: caches.probabilities ?? [],
		utilities: caches.utilities ?? [],
	};
	const next = { ...current, ...change(current) };
	if (cacheNames.every(name => caches[name] !== undefined)) {
		const rebuilt = rebuildTables({
			issues: next.issues,
			edges: next.edges,
			discrete_probabilities: next.probabilities,
			discrete_utilities: next.utilities,
		});
		next.probabilities = rebuilt.discrete_probabilities;
		next.utilities = rebuilt.discrete_utilities;
	}
	return Object.fromEntries(
		cacheNames.filter(name => caches[name] !== undefined).map(name => [name, next[name]]),
	);
};

/**
 * Optimistically applies a change to the cached tables (see rebuildCaches).
 * Returns the caches as they were, for restoreTables when the mutation fails.
 */
export const applyOptimisticTables = async (
	queryClient: QueryClient,
	change: TableCacheChange,
): Promise<TableCacheSnapshot> => {
	// In-flight fetches would overwrite the optimistic caches when they land.
	await Promise.all(
		cacheNames.map(name => queryClient.cancelQueries({ queryKey: queryKeys[name] })),
	);
	const previous: TableCacheSnapshot = Object.fromEntries(
		cacheNames.map(name => [name, queryClient.getQueryData(queryKeys[name])]),
	);
	const next = rebuildCaches(previous, change);
	for (const name of cacheNames) {
		if (next[name] !== undefined) queryClient.setQueryData(queryKeys[name], next[name]);
	}
	return previous;
};

/**
 * Restores the caches from before a failed optimistic change, and refetches them so changes saved
 * by other mutations in the meantime are not lost.
 */
export const restoreTables = (queryClient: QueryClient, previous?: TableCacheSnapshot) => {
	for (const name of cacheNames) {
		if (previous?.[name] !== undefined)
			queryClient.setQueryData(queryKeys[name], previous[name]);
		queryClient.invalidateQueries({ queryKey: queryKeys[name] });
	}
};

/** Replaces cached Issues with the given versions, matched by ID. */
export const withUpdatedIssues = (issues: Issue[], updates: Issue[]) =>
	issues.map(issue => {
		const updated = updates.find(update => update.id === issue.id);
		return updated ? { ...issue, ...updated } : issue;
	});
