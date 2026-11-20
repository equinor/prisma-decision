import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { Issue } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
	withUpdatedIssues,
} from '../../utils/tableShapes/applyOptimisticTables';

export const issueMutationScope = { id: 'issues' };

export const useUpdateIssuesOptimistic = (args?: { errorMessage?: string }) => {
	const queryClient = useQueryClient();
	return useMutation({
		scope: issueMutationScope,
		mutationFn: async (issues: Issue[]) => {
			await apiClient.put('/issues', issues);
		},
		onMutate: async issues => {
			return applyOptimisticTables(queryClient, cache => ({
				issues: withUpdatedIssues(cache.issues, issues),
			}));
		},
		onError: (_err, _issues, previous) => {
			restoreTables(queryClient, previous);
			showErrorToast(args?.errorMessage ?? 'Failed to update issues');
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
		},
	});
};
