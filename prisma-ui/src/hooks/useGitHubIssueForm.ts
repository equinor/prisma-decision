import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { gitHubIssueSchema, type GitHubIssue, type GitHubIssueTypes } from '../validators';
import { useCreateGitHubIssue, type FeedbackContext } from './api/useCreateGitHubIssue';

export type FeedbackAction = 'send' | 'sendAndAddAnother';

export const useGitHubIssueForm = (context: FeedbackContext) => {
	const submitting = useRef(false);
	const mutation = useCreateGitHubIssue(context);
	const [createdIssue, setCreatedIssue] = useState<GitHubIssue>();
	const [lastSentIssue, setLastSentIssue] = useState<GitHubIssue>();
	const [pendingAction, setPendingAction] = useState<FeedbackAction>();
	const formMethods = useForm<GitHubIssue>({
		defaultValues: getDefaultValues(),
		resolver: zodResolver(gitHubIssueSchema),
	});
	const selectedTypes = useWatch({ control: formMethods.control, name: 'type' });

	const submit = (action: FeedbackAction) =>
		formMethods.handleSubmit(values => {
			if (submitting.current) return;
			submitting.current = true;
			setPendingAction(action);
			mutation.mutate(values, {
				onSuccess: issue => {
					if (action === 'sendAndAddAnother') {
						// The React Compiler memoizes register(), so the field never
						// re-registers after a reset. Keep refs/values and write the
						// values directly instead of relying on RHF's mount set.
						formMethods.reset(undefined, { keepFieldsRef: true, keepValues: true });
						const defaults = getDefaultValues();
						formMethods.setValue('feedback', defaults.feedback);
						formMethods.setValue('type', defaults.type);
						setLastSentIssue({ ...values, ...issue });
					} else {
						setCreatedIssue({ ...values, ...issue });
					}
				},
				onSettled: () => {
					submitting.current = false;
					setPendingAction(undefined);
				},
			});
		});

	return {
		...formMethods,
		handleSubmit: submit('send'),
		handleSubmitAndAddAnother: submit('sendAndAddAnother'),
		isPending: mutation.isPending,
		pendingAction,
		isError: mutation.isError,
		createdIssue,
		lastSentIssue,
		dismissSuccess: () => setLastSentIssue(undefined),
		selectedTypes,
		toggleType: (type: GitHubIssueTypes) => {
			if (selectedTypes === type) {
				formMethods.resetField('type');
			} else {
				formMethods.setValue('type', type);
			}
		},
	};
};

const getDefaultValues = (): GitHubIssue => ({ type: 'Bug', feedback: '' });
