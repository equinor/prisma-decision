import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { DiscreteUtility } from '../../validators';
import { showErrorToast } from '../../components/ShowToast';

const utilityTablesKey = ['utilityTables'];

export const useBulkUpdateDiscreteUtilities = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (utilities: DiscreteUtility[]) => {
			const res = await apiClient.put('/discrete_utilities', utilities);
			return res.data;
		},
		onMutate: async updates => {
			await queryClient.cancelQueries({ queryKey: utilityTablesKey });
			const previous = queryClient.getQueryData<DiscreteUtility[]>(utilityTablesKey);
			if (previous) {
				queryClient.setQueryData(
					utilityTablesKey,
					previous.map(u => updates.find(update => update.id === u.id) ?? u),
				);
			}
			return previous;
		},
		onError: (_err, _updates, previous) => {
			showErrorToast('Failed to update utilities');
			if (previous) queryClient.setQueryData(utilityTablesKey, previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['decisionTree'] });
			queryClient.invalidateQueries({ queryKey: utilityTablesKey });
			queryClient.invalidateQueries({ queryKey: ['solution'] });
		},
	});
};
