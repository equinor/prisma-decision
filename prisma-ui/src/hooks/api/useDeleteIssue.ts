import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { Edge } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
} from '../../utils/tableShapes/applyOptimisticTables';
import { issueMutationScope } from './useUpdateIssues';

export const useDeleteIssue = () => {
	const queryClient = useQueryClient();
	return useMutation({
		scope: issueMutationScope,
		mutationFn: async (issueId: string) => {
			await apiClient.delete(`/issues/${issueId}`);
		},
		onMutate: (issueId: string) =>
			applyOptimisticTables(queryClient, ({ issues, edges }) => {
				const nodeId = issues.find(issue => issue.id === issueId)?.node.id;
				const touchesIssue = (edge: Edge) =>
					edge.head_issue_id === issueId ||
					edge.tail_issue_id === issueId ||
					edge.head_id === nodeId ||
					edge.tail_id === nodeId;
				return {
					issues: issues.filter(issue => issue.id !== issueId),
					edges: edges.filter(edge => !touchesIssue(edge)),
				};
			}),
		onError: (_err, _issueId, previous) => {
			showErrorToast('Failed to delete issue');
			restoreTables(queryClient, previous);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
		},
		onSettled: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['issues'] }),
				queryClient.invalidateQueries({ queryKey: ['edges'] }),
			]);
		},
	});
};
