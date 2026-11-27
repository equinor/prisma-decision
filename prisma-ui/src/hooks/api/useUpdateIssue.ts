import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { Issue } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
	withUpdatedIssues,
} from '../../utils/tableShapes/applyOptimisticTables';
import { issueMutationScope } from './useUpdateIssues';

export const useUpdateIssue = ({ onSuccess }: { onSuccess?: () => void | Promise<void> } = {}) => {
	const queryClient = useQueryClient();
	return useMutation({
		scope: issueMutationScope,
		mutationFn: async (issue: Issue) => {
			const res = await apiClient.put('/issues', [issue]);
			return res.data;
		},
		onMutate: issue =>
			applyOptimisticTables(queryClient, ({ issues }) => ({
				issues: withUpdatedIssues(issues, [issue]),
			})),
		onSuccess: async () => {
			queryClient.refetchQueries({ queryKey: ['issues'] });
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
			await onSuccess?.();
		},
		onError: (_error, _issue, previous) => {
			restoreTables(queryClient, previous);
			showErrorToast('Failed to update issue');
		},
	});
};
