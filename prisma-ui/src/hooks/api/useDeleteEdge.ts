import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
} from '../../utils/tableShapes/applyOptimisticTables';

export const useDeleteEdge = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiClient.delete(`/edges/${id}`);
			return res.data;
		},
		onMutate: (deletedId: string) =>
			applyOptimisticTables(queryClient, ({ edges }) => ({
				edges: edges.filter(edge => edge.id !== deletedId),
			})),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
			queryClient.refetchQueries({ queryKey: ['issues'] });
		},
		onError: (_err, _deletedId, previous) => {
			showErrorToast('Failed to delete edge');
			restoreTables(queryClient, previous);
		},
	});
};

export const useBulkDeleteEdges = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (ids: string[]) => {
			const params = new URLSearchParams();
			ids.forEach(id => params.append('ids', id));
			await apiClient.delete(`/edges?${params.toString()}`);
		},
		onMutate: async (ids: string[]) => {
			const deletedIds = new Set(ids);
			return applyOptimisticTables(queryClient, ({ edges }) => ({
				edges: edges.filter(edge => !deletedIds.has(edge.id)),
			}));
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
			queryClient.refetchQueries({ queryKey: ['issues'] });
		},
		onError: (_err, _ids, previous) => {
			showErrorToast('Failed to delete edges');
			restoreTables(queryClient, previous);
			queryClient.invalidateQueries({ queryKey: ['influenceDiagramLayout'] });
		},
	});
};
