import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { DiscreteProbability } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';

const probabilityTablesKey = ['probabilityTables'];

export const useBulkUpdateDiscreteProbabilities = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (probabilities: DiscreteProbability[]) => {
			const res = await apiClient.put('/discrete_probabilities', probabilities);
			return res.data;
		},
		onMutate: async updates => {
			await queryClient.cancelQueries({ queryKey: probabilityTablesKey });
			const previous = queryClient.getQueryData<DiscreteProbability[]>(probabilityTablesKey);
			if (previous) {
				queryClient.setQueryData(
					probabilityTablesKey,
					previous.map(p => updates.find(update => update.id === p.id) ?? p),
				);
			}
			return previous;
		},
		onError: (_err, _updates, previous) => {
			showErrorToast('Failed to update probabilities');
			if (previous) queryClient.setQueryData(probabilityTablesKey, previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: probabilityTablesKey });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
		},
	});
};
