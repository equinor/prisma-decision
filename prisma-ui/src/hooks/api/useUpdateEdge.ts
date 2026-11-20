import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { Edge } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
} from '../../utils/tableShapes/applyOptimisticTables';

export const useUpdateEdge = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (edge: Edge) => {
			const res = await apiClient.put('/edges', [edge]);
			return res.data[0];
		},
		onMutate: (updatedEdge: Edge) =>
			applyOptimisticTables(queryClient, ({ edges }) => ({
				edges: edges.map(edge => (edge.id === updatedEdge.id ? updatedEdge : edge)),
			})),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
			queryClient.refetchQueries({ queryKey: ['issues'] });
		},
		onError: (_err, _updatedEdge, previous) => {
			restoreTables(queryClient, previous);
			showErrorToast('Failed to update edge');
		},
	});
};
