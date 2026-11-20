import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { apiClient } from '../../api';
import { existingIssue } from '../../test/issueFixtures';
import { rebuildTables } from '../../utils/tableShapes/rebuildTables';
import { DiscreteProbability, Edge, Issue } from '../../validators';
import { useCreateEdge } from './useCreateEdge';
import { useDeleteIssue } from './useDeleteIssue';

vi.mock('../../api', () => ({
	apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../components/ShowToast', () => ({
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
}));

const keyUncertainty = (n: number, outcomes: number): Issue => {
	const base = existingIssue();
	const id = `00000000-0000-4000-8000-0000000001${n}0`;
	return {
		...base,
		id,
		type: 'Uncertainty',
		boundary: 'in',
		uncertainty: {
			...base.uncertainty,
			id: `00000000-0000-4000-8000-0000000001${n}1`,
			issue_id: id,
			outcomes: Array.from({ length: outcomes }, (_, index) => ({
				...base.uncertainty.outcomes[0],
				id: `00000000-0000-4000-8000-0000000001${n}${index + 2}`,
				uncertainty_id: `00000000-0000-4000-8000-0000000001${n}1`,
			})),
		},
		node: { ...base.node, id: `00000000-0000-4000-8000-0000000001${n}9`, issue_id: id },
	};
};

const setup = () => {
	const parent = keyUncertainty(1, 2);
	const child = keyUncertainty(2, 2);
	const childCells: DiscreteProbability[] = child.uncertainty.outcomes.map((outcome, index) => ({
		id: `00000000-0000-4000-8000-00000000020${index}`,
		outcome_id: outcome.id,
		uncertainty_id: child.uncertainty.id,
		project_id: child.project_id,
		probability: [0.25, 0.75][index],
		parent_outcome_ids: [],
		parent_option_ids: [],
	}));
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	client.setQueryData(['issues'], [parent, child]);
	client.setQueryData(['edges'], []);
	client.setQueryData(['probabilityTables'], childCells);
	client.setQueryData(['utilityTables'], []);
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const edge: Edge = {
		id: '00000000-0000-4000-8000-000000000300',
		project_id: child.project_id,
		tail_id: parent.node.id,
		head_id: child.node.id,
	};
	const childProbabilities = () =>
		client
			.getQueryData<DiscreteProbability[]>(['probabilityTables'])!
			.filter(cell => cell.uncertainty_id === child.uncertainty.id);
	return { parent, child, childCells, client, wrapper, edge, childProbabilities };
};

beforeEach(() => {
	vi.resetAllMocks();
});

test('connecting a Parent reshapes the child Probability table before the server responds, and rolls back on failure', async () => {
	const { parent, childCells, client, wrapper, edge, childProbabilities } = setup();
	let reject!: (error: Error) => void;
	vi.mocked(apiClient.post).mockImplementation(
		() => new Promise((_, rejectRequest) => (reject = rejectRequest)),
	);
	const { result } = renderHook(() => useCreateEdge(), { wrapper });

	act(() => result.current.mutate(edge));

	await waitFor(() => expect(childProbabilities()).toHaveLength(4));
	const parentOutcomeIds = parent.uncertainty.outcomes.map(outcome => outcome.id);
	expect(childProbabilities()).toEqual(
		expect.arrayContaining(
			parentOutcomeIds.flatMap(parentOutcomeId =>
				childCells.map(cell =>
					expect.objectContaining({
						outcome_id: cell.outcome_id,
						probability: cell.probability,
						parent_outcome_ids: [parentOutcomeId],
					}),
				),
			),
		),
	);
	expect(client.getQueryData(['edges'])).toEqual([edge]);

	await act(async () => reject(new Error('Request failed')));
	await waitFor(() => expect(client.getQueryData(['edges'])).toEqual([]));
	expect(childProbabilities()).toEqual(childCells);
});

test('deleting a Parent Issue removes it from its children’s tables before the server responds', async () => {
	const { parent, child, childCells, client, wrapper, edge, childProbabilities } = setup();
	client.setQueryData(['edges'], [edge]);
	client.setQueryData(
		['probabilityTables'],
		rebuildTables({
			issues: [parent, child],
			edges: [edge],
			discrete_probabilities: childCells,
			discrete_utilities: [],
		}).discrete_probabilities,
	);
	expect(childProbabilities()).toHaveLength(4);
	vi.mocked(apiClient.delete).mockImplementation(() => new Promise(() => {}));
	const { result } = renderHook(() => useDeleteIssue(), { wrapper });

	act(() => result.current.mutate(parent.id));

	await waitFor(() => expect(client.getQueryData(['edges'])).toEqual([]));
	expect(childProbabilities()).toHaveLength(2);
	expect(childProbabilities().every(cell => cell.parent_outcome_ids.length === 0)).toBe(true);
	expect(client.getQueryData<Issue[]>(['issues'])!.map(issue => issue.id)).not.toContain(
		parent.id,
	);
});

test('a failed edge creation refetches Issues instead of only restoring its snapshot', async () => {
	const { client, wrapper, edge } = setup();
	vi.mocked(apiClient.post).mockRejectedValue(new Error('Request failed'));
	const invalidate = vi.spyOn(client, 'invalidateQueries');
	const { result } = renderHook(() => useCreateEdge(), { wrapper });

	await act(async () => result.current.mutate(edge));

	await waitFor(() => expect(result.current.isError).toBe(true));
	for (const queryKey of [['issues'], ['edges'], ['probabilityTables'], ['utilityTables']]) {
		expect(invalidate).toHaveBeenCalledWith({ queryKey });
	}
});
