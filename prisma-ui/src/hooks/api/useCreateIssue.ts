import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { Issue } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
} from '../../utils/tableShapes/applyOptimisticTables';
import { issueMutationScope } from './useUpdateIssues';

export const useCreateIssue = ({ onSuccess }: { onSuccess?: () => void }) => {
	const queryClient = useQueryClient();
	return useMutation({
		scope: issueMutationScope,
		mutationFn: async (issue: Issue) => {
			const res = await apiClient.post('/issues', [issue]);
			return res.data[0];
		},
		onMutate: (issue: Issue) =>
			applyOptimisticTables(queryClient, ({ issues }) => ({
				issues: [...issues, issue],
			})),
		onSuccess: async () => {
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			await queryClient.refetchQueries({ queryKey: ['issues'] });
			await queryClient.refetchQueries({ queryKey: ['nodes'] });
			onSuccess?.();
		},
		onError: (_err, _issue, previous) => {
			restoreTables(queryClient, previous);
			showErrorToast('Failed to create issue');
		},
	});
};
