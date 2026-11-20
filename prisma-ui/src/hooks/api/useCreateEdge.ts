import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { Edge } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';
import {
	applyOptimisticTables,
	restoreTables,
} from '../../utils/tableShapes/applyOptimisticTables';

export const useCreateEdge = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (edge: Edge) => {
			const res = await apiClient.post('/edges', [edge]);
			return res.data[0];
		},
		onMutate: (newEdge: Edge) =>
			applyOptimisticTables(queryClient, ({ edges }) => ({
				edges: [...edges, newEdge],
			})),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['probabilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['utilityTables'] });
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
			queryClient.invalidateQueries({ queryKey: ['restrictionTables'] });
			queryClient.refetchQueries({ queryKey: ['issues'] });
		},
		onError: (_err, _newEdge, previous) => {
			restoreTables(queryClient, previous);
			showErrorToast('Failed to create edge');
		},
	});
};
