import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosAdapter } from 'axios';
import { Provider } from 'jotai';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { apiClient } from '../../../api';
import { existingIssue, project } from '../../../test/issueFixtures';
import { canDndStartFrom } from '../../../utils/canDndStartFrom';
import { Issue } from '../../../validators';
import { ProjectContext } from '../../ProjectPage/ProjectContext';
import { TableView } from '../../ProjectPage/ProjectIssues/TableView/TableView';
import { IssueCard, IssueCardContent, IssueCardStates } from './IssueCard';

vi.hoisted(() => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});

let savedIssue: Issue;
let requests: Issue[];

const adapter: AxiosAdapter = async config => {
	if (config.method === 'put') {
		const [updated]: Issue[] = JSON.parse(config.data);
		requests.push(updated);
		savedIssue = updated;
	}
	return {
		config,
		status: 200,
		statusText: 'OK',
		headers: {},
		data: [structuredClone(savedIssue)],
	};
};

beforeEach(() => {
	savedIssue = existingIssue();
	requests = [];
	apiClient.interceptors.request.clear();
	apiClient.defaults.adapter = adapter;
});

afterEach(() => toast.dismiss());

const renderBoard = async (expand = true) => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<Provider>
			<QueryClientProvider client={queryClient}>
				<ProjectContext value={project}>
					<TableView />
				</ProjectContext>
				<Toaster />
			</QueryClientProvider>
		</Provider>,
	);
	const user = userEvent.setup();
	await screen.findByRole('button', { name: 'Edit issue name: Existing issue' });
	if (expand) await user.click(screen.getByRole('button', { name: /^\d+ States$/ }));
	return user;
};

const expectControlOnlyDragBlocking = (card: HTMLElement) => {
	expect(card).not.toHaveAttribute('data-no-dnd');
	expect(canDndStartFrom(card)).toBe(true);
	expect(card).toHaveAttribute('data-dragging', 'false');
	const controls = [
		...within(card).queryAllByRole('textbox'),
		...within(card).queryAllByRole('spinbutton'),
	];
	expect(controls.length).toBeGreaterThan(0);
	for (const control of controls) {
		expect(canDndStartFrom(control)).toBe(false);
		expect(control.closest('.nodrag')).not.toBeNull();
	}
};

test.each(['Decision', 'Uncertainty'] as const)(
	'a member adds the first %s state with a new identity and zero utility, preserving the issue',
	async type => {
		savedIssue.type = type;
		if (type === 'Decision') savedIssue.decision.options = [];
		else savedIssue.uncertainty.outcomes = [];
		const original = structuredClone(savedIssue);
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard(false);
		expect(screen.queryByRole('button', { name: /^\d+ States$/ })).toBeNull();
		await user.click(screen.getByRole('button', { name: `Add ${stateType}` }));
		const name = screen.getByRole('textbox', { name: 'Name' });
		expect(name).toHaveFocus();
		expect(name).toHaveValue('');
		const utility = screen.getByRole('spinbutton', { name: 'Utility' });
		expect(utility).toHaveValue(0);
		await user.type(name, ' First state ');
		await user.tab();
		expect(utility).toHaveFocus();
		await user.clear(utility);
		await user.keyboard('{Enter}');
		expect(await screen.findByText('First state')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '1 States' })).toBeInTheDocument();
		expect(requests).toHaveLength(1);
		const states =
			type === 'Decision' ? requests[0].decision.options : requests[0].uncertainty.outcomes;
		expect(states).toEqual([
			{
				id: expect.stringMatching(/^[0-9a-f-]{36}$/),
				name: ' First state ',
				utility: 0,
				project_id: original.project_id,
				created_at: expect.any(String),
				...(type === 'Decision'
					? { decision_id: original.decision.id }
					: { uncertainty_id: original.uncertainty.id }),
			},
		]);
		expect(requests[0]).toEqual(
			type === 'Decision'
				? { ...original, decision: { ...original.decision, options: states } }
				: { ...original, uncertainty: { ...original.uncertainty, outcomes: states } },
		);
		await user.click(screen.getByRole('button', { name: 'Issue actions' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		const dialog = screen.getByRole('dialog', { name: 'Edit Issue' });
		expect(
			within(dialog).getByRole('textbox', {
				name: type === 'Decision' ? 'Option 1 name' : 'Outcome 1 name',
			}),
		).toHaveValue(' First state ');
		await user.click(within(dialog).getByRole('button', { name: 'Close' }));
		expect(requests).toHaveLength(1);
	},
);

test('a member edits an existing option from its name and Enter saves the intact issue', async () => {
	const original = structuredClone(savedIssue);
	const user = await renderBoard();
	await user.click(screen.getByText('Existing option'));
	const name = screen.getByRole('textbox', { name: 'Name' });
	expect(name).toHaveFocus();
	expect(screen.getByRole('spinbutton', { name: 'Utility' })).toHaveValue(7);
	await user.clear(name);
	await user.type(name, 'Drill now{Enter}');
	await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
	expect(screen.getByText('Drill now')).toBeInTheDocument();
	expect(requests).toEqual([
		{
			...original,
			decision: {
				...original.decision,
				options: [{ ...original.decision.options[0], name: 'Drill now' }],
			},
		},
	]);
	expect(
		within(screen.getByRole('region', { name: 'Decision issues' })).getByText('7'),
	).toBeInTheDocument();
});

test('idle state actions and row spacing allow dragging while active inputs do not', async () => {
	const user = await renderBoard(false);
	const expand = screen.getByRole('button', { name: /^\d+ States$/ });
	const footer = expand.parentElement!;
	expect(canDndStartFrom(footer)).toBe(true);
	expect(canDndStartFrom(expand)).toBe(true);
	expect(canDndStartFrom(expand.querySelector('svg'))).toBe(true);
	await user.click(expand);
	const name = screen.getByRole('button', { name: 'Edit option name: Existing option' });
	const utility = screen.getByRole('button', { name: 'Edit option utility: Existing option' });
	expect(canDndStartFrom(name.closest('li'))).toBe(true);
	expect(canDndStartFrom(name)).toBe(true);
	expect(canDndStartFrom(utility)).toBe(true);
	expect(canDndStartFrom(screen.getByRole('button', { name: 'Add option' }))).toBe(true);
	const draggable = name.closest<HTMLElement>('[data-dragging]')!;
	await user.click(name);
	expect(canDndStartFrom(footer)).toBe(true);
	expectControlOnlyDragBlocking(draggable);
});

test.each(['Decision', 'Uncertainty'] as const)(
	'%s utility receives clicked focus, can be cleared to zero and saves only after leaving the row',
	async type => {
		savedIssue.type = type;
		const original = structuredClone(savedIssue);
		const user = await renderBoard();
		const column = screen.getByRole('region', { name: `${type} issues` });
		await user.click(within(column).getByText(type === 'Decision' ? '7' : '-2'));
		const utility = screen.getByRole('spinbutton', { name: 'Utility' });
		expect(utility).toHaveFocus();
		await user.clear(utility);
		await user.click(screen.getByRole('textbox', { name: 'Name' }));
		expect(requests).toHaveLength(0);
		expect(utility).toHaveValue(null);
		await user.click(within(column).getByRole('heading', { name: type }));
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
		expect(within(column).getByText('0')).toBeInTheDocument();
		expect(requests).toEqual([
			type === 'Decision'
				? {
						...original,
						decision: {
							...original.decision,
							options: [{ ...original.decision.options[0], utility: 0 }],
						},
					}
				: {
						...original,
						uncertainty: {
							...original.uncertainty,
							outcomes: [{ ...original.uncertainty.outcomes[0], utility: 0 }],
						},
					},
		]);
	},
);

const addSecondState = (type: 'Decision' | 'Uncertainty') => {
	savedIssue.type = type;
	if (type === 'Decision') {
		const first = {
			...savedIssue.decision.options[0],
			created_at: '2026-10-01T00:00:00Z',
		};
		savedIssue.decision.options = [
			{
				...first,
				id: '00000000-0000-4000-8000-000000000011',
				name: 'Later option',
				utility: 3,
				created_at: '2026-10-02T00:00:00Z',
			},
			first,
		];
	} else {
		const first = {
			...savedIssue.uncertainty.outcomes[0],
			created_at: '2026-10-01T00:00:00Z',
		};
		savedIssue.uncertainty.outcomes = [
			{
				...first,
				id: '00000000-0000-4000-8000-000000000012',
				name: 'Later outcome',
				utility: 3,
				created_at: '2026-10-02T00:00:00Z',
			},
			first,
		];
	}
};

test.each(['Decision', 'Uncertainty'] as const)(
	'a member removes a saved %s state without saving its draft or changing remaining identity and order',
	async type => {
		addSecondState(type);
		const original = structuredClone(savedIssue);
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.click(screen.getByText(`Existing ${stateType}`));
		await user.clear(screen.getByRole('textbox', { name: 'Name' }));
		await user.click(screen.getByRole('button', { name: `Remove ${stateType}` }));
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
		expect(screen.queryByText(`Existing ${stateType}`)).toBeNull();
		expect(screen.getByText(`Later ${stateType}`)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '1 States' })).toBeInTheDocument();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(requests).toEqual([
			type === 'Decision'
				? {
						...original,
						decision: { ...original.decision, options: [original.decision.options[0]] },
					}
				: {
						...original,
						uncertainty: {
							...original.uncertainty,
							outcomes: [original.uncertainty.outcomes[0]],
						},
					},
		]);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'a %s state can be removed by keyboard without putting Remove between Name, Utility and the next Name',
	async type => {
		savedIssue.type = type;
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.click(screen.getByText(`Existing ${stateType}`));
		await user.clear(screen.getByRole('textbox', { name: 'Name' }));
		await user.tab({ shift: true });
		expect(screen.getByRole('button', { name: `Remove ${stateType}` })).toHaveFocus();
		await user.keyboard('{Enter}');
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
		expect(screen.queryByRole('button', { name: /^\d+ States$/ })).toBeNull();
		expect(screen.getByRole('button', { name: `Add ${stateType}` })).toBeEnabled();
		expect(requests).toHaveLength(1);
		expect(
			type === 'Decision' ? requests[0].decision.options : requests[0].uncertainty.outcomes,
		).toEqual([]);
	},
);

test.each([
	['Decision', 'Remove'],
	['Decision', 'Escape'],
	['Uncertainty', 'Remove'],
	['Uncertainty', 'Escape'],
] as const)(
	'cancelling an unsaved first %s state with %s discards only the local row',
	async (type, cancel) => {
		savedIssue.type = type;
		if (type === 'Decision') savedIssue.decision.options = [];
		else savedIssue.uncertainty.outcomes = [];
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard(false);
		await user.click(screen.getByRole('button', { name: `Add ${stateType}` }));
		if (cancel === 'Escape') await user.keyboard('{Escape}');
		else await user.click(screen.getByRole('button', { name: `Remove ${stateType}` }));
		expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
		expect(screen.queryByRole('listitem')).toBeNull();
		expect(screen.queryByRole('button', { name: /^\d+ States$/ })).toBeNull();
		expect(screen.getByRole('button', { name: `Add ${stateType}` })).toBeEnabled();
		expect(requests).toHaveLength(0);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'removing the last %s state leaves Add without a States toggle and full Edit sees the saved empty list',
	async type => {
		savedIssue.type = type;
		const original = structuredClone(savedIssue);
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.click(screen.getByText(`Existing ${stateType}`));
		await user.click(screen.getByRole('button', { name: `Remove ${stateType}` }));
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
		expect(screen.queryByRole('listitem')).toBeNull();
		expect(screen.queryByRole('button', { name: /^\d+ States$/ })).toBeNull();
		expect(screen.getByRole('button', { name: `Add ${stateType}` })).toBeEnabled();
		expect(requests).toEqual([
			type === 'Decision'
				? { ...original, decision: { ...original.decision, options: [] } }
				: { ...original, uncertainty: { ...original.uncertainty, outcomes: [] } },
		]);
		await user.click(screen.getByRole('button', { name: 'Issue actions' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		const dialog = screen.getByRole('dialog', { name: 'Edit Issue' });
		expect(
			within(dialog).queryByRole('textbox', {
				name: type === 'Decision' ? 'Option 1 name' : 'Outcome 1 name',
			}),
		).toBeNull();
		expect(within(dialog).getByRole('textbox', { name: 'Issue name' })).toHaveValue(
			original.name,
		);
		await user.click(within(dialog).getByRole('button', { name: 'Close' }));
		await user.click(screen.getByRole('button', { name: `Add ${stateType}` }));
		expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
		await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Replacement{Enter}');
		expect(await screen.findByText('Replacement')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '1 States' })).toBeInTheDocument();
		const states =
			type === 'Decision' ? requests[1].decision.options : requests[1].uncertainty.outcomes;
		expect(states[0].id).not.toBe(
			type === 'Decision'
				? original.decision.options[0].id
				: original.uncertainty.outcomes[0].id,
		);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'Tab twice moves from one %s Name to the next Name while retaining both saved rows',
	async type => {
		addSecondState(type);
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.click(screen.getByText(`Existing ${stateType}`));
		await user.clear(screen.getByRole('textbox', { name: 'Name' }));
		await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Saved first');
		await user.tab();
		expect(screen.getByRole('spinbutton', { name: 'Utility' })).toHaveFocus();
		expect(requests).toHaveLength(0);
		await user.tab();
		await waitFor(() =>
			expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(`Later ${stateType}`),
		);
		expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
		expect(requests).toHaveLength(1);
		await user.clear(screen.getByRole('spinbutton', { name: 'Utility' }));
		await user.type(screen.getByRole('spinbutton', { name: 'Utility' }), '12{Enter}');
		expect(await screen.findByText('12')).toBeInTheDocument();
		expect(screen.getAllByRole('listitem').map(row => row.textContent)).toEqual([
			`Saved first${type === 'Decision' ? 7 : -2}`,
			`Later ${stateType}12`,
		]);
		expect(requests).toHaveLength(2);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'%s row fields have no disabled ARIA ancestor after Name → Utility Tab and only controls block dragging',
	async type => {
		savedIssue.type = type;
		const user = await renderBoard();
		const draggable = screen
			.getByRole('button', { name: 'Edit issue name: Existing issue' })
			.closest<HTMLElement>('[data-dragging]')!;
		expect(draggable).not.toHaveAttribute('data-no-dnd');
		await user.click(
			screen.getByText(type === 'Decision' ? 'Existing option' : 'Existing outcome'),
		);
		const name = screen.getByRole('textbox', { name: 'Name' });
		await user.tab();
		const utility = screen.getByRole('spinbutton', { name: 'Utility' });
		expect(utility).toHaveFocus();
		expect(utility).toBeEnabled();
		expect(utility.closest('[aria-disabled="true"]')).toBeNull();
		expect(requests).toHaveLength(0);
		expectControlOnlyDragBlocking(draggable);
		await user.click(name);
		await user.clear(name);
		await user.keyboard('{Enter}');
		expect(await screen.findByText(/name is required/)).toBeInTheDocument();
		expect(name.closest('[aria-disabled="true"]')).toBeNull();
		expectControlOnlyDragBlocking(draggable);
		await user.keyboard('{Escape}');
		expect(draggable).not.toHaveAttribute('data-no-dnd');
		await user.click(
			screen.getByText(type === 'Decision' ? 'Existing option' : 'Existing outcome'),
		);
		await user.type(screen.getByRole('textbox', { name: 'Name' }), ' changed{Enter}');
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
		expect(draggable).not.toHaveAttribute('data-no-dnd');
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'%s rows expose accessible name and utility editing affordances on hover',
	async type => {
		savedIssue.type = type;
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.hover(screen.getByRole('listitem'));
		const editName = screen.getByRole('button', {
			name: `Edit ${stateType} name: Existing ${stateType}`,
		});
		const editUtility = screen.getByRole('button', {
			name: `Edit ${stateType} utility: Existing ${stateType}`,
		});
		expect(editName).toBeEnabled();
		await user.click(editUtility);
		expect(screen.getByRole('spinbutton', { name: 'Utility' })).toHaveFocus();
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'%s classification controls remain available during a pending state save',
	async type => {
		savedIssue.type = type;
		let finish!: () => void;
		apiClient.defaults.adapter = async config => {
			const response = await adapter(config);
			if (config.method === 'put') {
				await new Promise<void>(resolve => {
					finish = resolve;
				});
			}
			return response;
		};
		const user = await renderBoard();
		const column = within(screen.getByRole('region', { name: `${type} issues` }));
		await user.click(
			column.getByText(type === 'Decision' ? 'Existing option' : 'Existing outcome'),
		);
		await user.type(column.getByRole('textbox', { name: 'Name' }), ' updated{Enter}');
		await waitFor(() => expect(requests).toHaveLength(1));
		const controls = [
			column.getByRole('button', { name: `Issue type: ${type}` }),
			column.getByRole('button', { name: /^Boundary:/ }),
			column.getByRole('button', {
				name: type === 'Decision' ? /^Decision type:/ : 'Key uncertainty',
			}),
		];
		for (const control of controls) expect(control).toBeEnabled();
		await user.click(controls[0]);
		expect(screen.getByRole('menu', { name: 'ISSUE TYPE' })).toBeInTheDocument();
		await user.keyboard('{Escape}');
		expect(requests).toHaveLength(1);
		await act(async () => finish());
		await waitFor(() => {
			for (const control of controls) expect(control).toBeEnabled();
		});
		expect(requests).toHaveLength(1);
	},
);

test('Unassigned Board cards do not display stored states or state controls', async () => {
	savedIssue.type = 'Unassigned';
	await renderBoard(false);
	expect(screen.queryByText('Existing option')).toBeNull();
	expect(screen.queryByText('Existing outcome')).toBeNull();
	expect(screen.queryByRole('button', { name: /States$/ })).toBeNull();
	expect(screen.queryByRole('button', { name: /^Add (option|outcome)$/ })).toBeNull();
	expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
	expect(screen.queryByRole('button', { name: 'Edit option name: Existing option' })).toBeNull();
	expect(requests).toHaveLength(0);
	expect(savedIssue.decision.options).toHaveLength(1);
	expect(savedIssue.uncertainty.outcomes).toHaveLength(1);
});

test.each(['Decision', 'Uncertainty'] as const)(
	'a delayed %s refresh cannot undo the first row when the next row is saved',
	async type => {
		addSecondState(type);
		let delayRefresh = false;
		const refreshes: (() => void)[] = [];
		apiClient.defaults.adapter = async config => {
			const response = await adapter(config);
			if (config.method === 'put') delayRefresh = true;
			if (config.method === 'get' && delayRefresh) {
				await new Promise<void>(resolve => refreshes.push(resolve));
			}
			return response;
		};
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.click(screen.getByText(`Existing ${stateType}`));
		await user.clear(screen.getByRole('textbox', { name: 'Name' }));
		await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Saved first');
		await user.click(screen.getByText(`Later ${stateType}`));
		await waitFor(() =>
			expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(`Later ${stateType}`),
		);
		await user.clear(screen.getByRole('spinbutton', { name: 'Utility' }));
		await user.type(screen.getByRole('spinbutton', { name: 'Utility' }), '12{Enter}');
		await waitFor(() => expect(requests).toHaveLength(2));
		await act(async () => refreshes.forEach(finish => finish()));
		expect(await screen.findByText('Saved first')).toBeInTheDocument();
		expect(screen.getByText('12')).toBeInTheDocument();
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'%s Board cards retain full Edit access without changing saved states',
	async type => {
		savedIssue.type = type;
		const user = await renderBoard();
		await user.click(screen.getByRole('button', { name: 'Issue actions' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		const dialog = screen.getByRole('dialog', { name: 'Edit Issue' });
		expect(within(dialog).getByRole('textbox', { name: 'Issue name' })).toHaveValue(
			savedIssue.name,
		);
		expect(
			within(dialog).getByRole('textbox', {
				name: type === 'Decision' ? 'Option 1 name' : 'Outcome 1 name',
			}),
		).toHaveValue(type === 'Decision' ? 'Existing option' : 'Existing outcome');
		await user.click(within(dialog).getByRole('button', { name: 'Close' }));
		expect(requests).toHaveLength(0);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'non-Board %s cards retain their existing state selection instead of inline editing',
	async type => {
		savedIssue.type = type;
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		const SharedCard = () => {
			const [selected, setSelected] = useState<string>();
			return (
				<>
					<IssueCard issue={savedIssue} onClickState={state => setSelected(state.name)}>
						<IssueCardContent />
						<IssueCardStates expandedProp />
					</IssueCard>
					<output aria-label='Selected state'>{selected}</output>
				</>
			);
		};
		render(
			<Provider>
				<QueryClientProvider client={queryClient}>
					<ProjectContext value={project}>
						<SharedCard />
					</ProjectContext>
				</QueryClientProvider>
			</Provider>,
		);
		const stateName = type === 'Decision' ? 'Existing option' : 'Existing outcome';
		await userEvent.setup().click(screen.getByText(stateName));
		expect(screen.getByRole('status', { name: 'Selected state' })).toHaveTextContent(stateName);
		expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Add (option|outcome)$/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Remove (option|outcome)$/ })).toBeNull();
		expect(requests).toHaveLength(0);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'Tab cannot silently abandon an invalid %s row',
	async type => {
		addSecondState(type);
		const stateType = type === 'Decision' ? 'option' : 'outcome';
		const user = await renderBoard();
		await user.click(screen.getByText(`Existing ${stateType}`));
		await user.clear(screen.getByRole('textbox', { name: 'Name' }));
		await user.tab();
		await user.tab();
		expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
		expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
		expect(await screen.findByText(/name is required/)).toBeInTheDocument();
		expect(screen.getByText(`Later ${stateType}`)).toBeInTheDocument();
		expect(requests).toHaveLength(0);
	},
);

test.each(['Decision', 'Uncertainty'] as const)(
	'Escape discards an invalid %s row draft and never sends a save',
	async type => {
		savedIssue.type = type;
		const user = await renderBoard();
		const stateName = type === 'Decision' ? 'Existing option' : 'Existing outcome';
		await user.click(screen.getByText(stateName));
		await user.clear(screen.getByRole('textbox', { name: 'Name' }));
		await user.type(screen.getByRole('spinbutton', { name: 'Utility' }), '9');
		await user.keyboard('{Enter}');
		expect(await screen.findByText(/name is required/)).toBeInTheDocument();
		await user.keyboard('{Escape}');
		expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
		expect(screen.queryByText(/name is required/)).toBeNull();
		expect(screen.getByText(stateName)).toBeInTheDocument();
		await user.click(screen.getByText(stateName));
		expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(stateName);
		expect(screen.getByRole('spinbutton', { name: 'Utility' })).toHaveValue(
			type === 'Decision' ? 7 : -2,
		);
		expect(requests).toHaveLength(0);
	},
);
