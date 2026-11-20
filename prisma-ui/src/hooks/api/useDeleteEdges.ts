import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
} from '../../utils/tableShapes/applyOptimisticTables';

export const useDeleteEdges = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (ids: string[]) => {
			if (ids.length === 0) return;
			const params = new URLSearchParams();
			ids.forEach(id => params.append('ids', id));
			await apiClient.delete(`/edges?${params.toString()}`);
		},
		onMutate: async (deletedIds: string[]) => {
			const deletedIdSet = new Set(deletedIds);
			return applyOptimisticTables(queryClient, ({ edges }) => ({
				edges: edges.filter(edge => !deletedIdSet.has(edge.id)),
			}));
		},
		onSuccess: (_data, ids) => {
			if (ids.length === 0) return;
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
			queryClient.refetchQueries({ queryKey: ['issues'] });
		},
		onError: (_err, _deletedIds, previous) => {
			showErrorToast('Failed to delete edges');
			restoreTables(queryClient, previous);
		},
	});
};
