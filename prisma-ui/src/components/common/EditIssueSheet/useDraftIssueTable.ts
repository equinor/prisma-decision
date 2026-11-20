import { useMemo } from 'react';
import { useGetEdges } from '../../../hooks/api/useGetEdges';
import { useGetIssues } from '../../../hooks/api/useGetIssues';
import { useGetProbabilityTables } from '../../../hooks/api/useGetProbabilityTables';
import { useGetUtilityTables } from '../../../hooks/api/useGetUtilityTables';
import { withUpdatedIssues } from '../../../utils/tableShapes/applyOptimisticTables';
import { rebuildTables } from '../../../utils/tableShapes/rebuildTables';
import { Issue } from '../../../validators';

/** Unsaved table values in the sheet, keyed by cell ID. */
export type DraftTableValues = Record<string, number>;

/**
 * The draft Issue's own Probability and Utility table cells in the Table shape its unsaved form
 * values give it, with unsaved cell values applied. Cell IDs match the ones the API creates.
 */
export const useDraftIssueTable = (draft: Issue, values: DraftTableValues) => {
	const { issues } = useGetIssues();
	const { edges } = useGetEdges();
	const { data: probabilityTables } = useGetProbabilityTables();
	const { data: utilityTables } = useGetUtilityTables();

	const tables = useMemo(
		() =>
			rebuildTables({
				issues: withUpdatedIssues(issues, [draft]),
				edges,
				discrete_probabilities: probabilityTables.flatMap(
					table => table.discrete_probabilities,
				),
				discrete_utilities: utilityTables.flatMap(table => table.discrete_utilities),
			}),
		[draft, edges, issues, probabilityTables, utilityTables],
	);

	return useMemo(() => {
		const probabilities = tables.discrete_probabilities
			.filter(probability => probability.uncertainty_id === draft.uncertainty.id)
			.map(probability =>
				probability.id in values
					? { ...probability, probability: values[probability.id] }
					: probability,
			);
		const utilities = tables.discrete_utilities
			.filter(utility => utility.utility_id === draft.utility.id)
			.map(utility =>
				utility.id in values ? { ...utility, utility_value: values[utility.id] } : utility,
			);
		const cells = draft.type === 'Uncertainty' ? probabilities : utilities;
		return {
			probabilities,
			utilities,
			editedProbabilities: probabilities.filter(probability => probability.id in values),
			editedUtilities: utilities.filter(utility => utility.id in values),
			hasEdits:
				draft.type === 'Uncertainty' || draft.type === 'Utility'
					? cells.some(cell => cell.id in values)
					: false,
		};
	}, [draft.type, draft.uncertainty.id, draft.utility.id, tables, values]);
};
