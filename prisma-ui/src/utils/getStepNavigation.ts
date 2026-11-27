const PROJECT_STEPS = [
	{ path: '', label: 'Project information' },
	{ path: 'stakeholder-matrix', label: 'Stakeholder matrix' },
	{ path: 'objectives', label: 'Objectives' },
	{ path: 'issues', label: 'Issues' },
	{ path: 'strategies', label: 'Strategies' },
	{ path: 'whiteboard', label: 'Whiteboard' },
	{ path: 'influence-diagram', label: 'Influence diagram' },
	{ path: 'decision-tree', label: 'Decision tree' },
	{ path: 'compact-tree', label: 'Compact tree' },
	{ path: 'solution-tree', label: 'Solution tree' },
	{ path: 'assessments', label: 'Assessments' },
] as const;

type StepLink = { label: string; to: string };

export const getStepNavigation = (
	pathname: string,
	projectId: string,
): { previous?: StepLink; next?: StepLink } => {
	const basePath = `/project/${projectId}`;
	if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return {};

	const segment = pathname.slice(basePath.length).split('/').filter(Boolean)[0] ?? '';
	const index = PROJECT_STEPS.findIndex(step => step.path === segment);
	if (index === -1) return {};

	const toLink = (step: (typeof PROJECT_STEPS)[number] | undefined) =>
		step && {
			label: step.label,
			to: step.path ? `${basePath}/${step.path}` : basePath,
		};

	return {
		previous: toLink(PROJECT_STEPS[index - 1]),
		next: toLink(PROJECT_STEPS[index + 1]),
	};
};
