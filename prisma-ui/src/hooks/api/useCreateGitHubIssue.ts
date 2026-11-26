import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api';
import { gitHubIssueSchema, type GitHubIssue } from '../../validators';

export type FeedbackContext = {
	project: string;
	pageUrl: string;
	from: string;
};

// The API echoes labels it actually applied (e.g. adds "duplicate"), so only
// validate the fields the UI consumes rather than reusing the form enum.
const createdIssueSchema = gitHubIssueSchema
	.pick({ issue_number: true, issue_url: true })
	.required();

export type CreatedGitHubIssue = ReturnType<typeof createdIssueSchema.parse>;

export const useCreateGitHubIssue = (context: FeedbackContext) =>
	useMutation({
		mutationFn: async (values: GitHubIssue) => {
			const payload = {
				type: values.type,
				feedback: [
					values.feedback,
					`Project: ${context.project}\nURL: ${context.pageUrl}\nFrom: ${context.from}`,
				].join('\n\n'),
			};
			const response = await apiClient.post<CreatedGitHubIssue>('/github/feedback', payload);
			return createdIssueSchema.parse(response.data);
		},
	});
