import { useGetUtilityTables } from '../../../../hooks/api/useGetUtilityTables';
import { useSelectedProjectIssues } from '../../../../hooks/useSelectedProjectIssues';
import { DiscreteUtility, Issue } from '../../../../validators';
import { getDiscreteValueRows } from '../ConditionalTable/getDiscreteValueRows';

/**
 * Rows for a Utility's Utility table. Pass `utilities` to show cells other than the cached ones,
 * such as a draft Table shape.
 */
export const useUtilityTable = (issue: Issue, utilities?: DiscreteUtility[]) => {
	const issues = useSelectedProjectIssues();
	const { data } = useGetUtilityTables();
	const discreteUtilities =
		utilities ?? data.find(pt => pt.issue_id === issue.id)?.discrete_utilities ?? [];
	return getDiscreteValueRows(discreteUtilities, issues);
};
