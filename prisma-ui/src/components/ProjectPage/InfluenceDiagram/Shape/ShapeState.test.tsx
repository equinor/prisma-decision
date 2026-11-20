import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { apiClient } from '../../../../api';
import {
	createDiagramFixture,
	diagramTransport,
	installDiagramDom,
	renderInfluenceDiagram,
} from '../__test__/diagramTestUtils';

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

const originalAdapter = apiClient.defaults.adapter;
let queryClient: QueryClient;
let fixture: ReturnType<typeof createDiagramFixture>;
let restoreDom: () => void;

beforeEach(() => {
	restoreDom = installDiagramDom();
	localStorage.clear();
	localStorage.setItem('influenceDiagramView', JSON.stringify('shape'));
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	fixture = createDiagramFixture();
	apiClient.interceptors.request.clear();
	apiClient.defaults.adapter = diagramTransport(fixture);
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	apiClient.defaults.adapter = originalAdapter;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	restoreDom();
});

test('a Forced decision selects and clears an Option using the shared Scenario EV', async () => {
	const user = userEvent.setup();
	renderInfluenceDiagram(queryClient, fixture.project);
	const decision = await screen.findByTestId(`rf__node-${fixture.issues[0].node.id}`);
	const trigger = within(decision).getByRole('button', { name: 'Forced decision: Drill well' });
	expect(trigger).toHaveTextContent('1 state');
	await user.click(trigger);
	const popover = screen.getByRole('dialog', { name: 'Forced decision: Drill well' });
	expect(popover.closest('[popover]')).toHaveAttribute('popover', 'manual');
	const states = within(popover).getByRole('list');
	await user.click(within(states).getByText('Existing option'));
	expect(trigger).toHaveTextContent('Existing option');
	expect(trigger).toHaveAttribute('aria-expanded', 'true');
	expect(states).toBeVisible();
	await user.unhover(trigger);
	expect(trigger).toBeVisible();
	await waitFor(() => {
		expect(screen.getByText('20.00')).toBeInTheDocument();
		expect(fixture.requests).toContainEqual(
			expect.objectContaining({
				method: 'post',
				url: expect.stringContaining('/with_evidence'),
				data: [
					{
						evidence_id: fixture.project.id,
						state_ids: [fixture.issues[0].decision.options[0].id],
						expected_utility: 0,
					},
				],
			}),
		);
	});
	const selected = within(states).getByRole('listitem');
	expect(selected).toHaveClass('outline-2');
	await user.click(selected);
	expect(states).toBeVisible();
	expect(trigger).toHaveTextContent('1 state');
	expect(await screen.findByText('Select states')).toBeInTheDocument();
});

test('Hard evidence and Forced decisions share their States and Scenario EV with Card view', async () => {
	const user = userEvent.setup();
	renderInfluenceDiagram(queryClient, fixture.project);
	const decision = await screen.findByTestId(`rf__node-${fixture.issues[0].node.id}`);
	const uncertainty = screen.getByTestId(`rf__node-${fixture.issues[1].node.id}`);
	const utility = screen.getByTestId(`rf__node-${fixture.issues[2].node.id}`);
	expect(
		within(utility).queryByRole('button', { name: /Forced decision|Hard evidence/ }),
	).toBeNull();
	await user.click(within(decision).getByRole('button', { name: 'Forced decision: Drill well' }));
	await user.click(
		within(screen.getByRole('dialog', { name: 'Forced decision: Drill well' })).getByRole(
			'listitem',
		),
	);
	await user.click(within(uncertainty).getByRole('button', { name: 'Hard evidence: Oil price' }));
	await user.click(
		within(screen.getByRole('dialog', { name: 'Hard evidence: Oil price' })).getByRole(
			'listitem',
		),
	);
	await waitFor(() =>
		expect(fixture.requests).toContainEqual(
			expect.objectContaining({
				method: 'post',
				url: expect.stringContaining('/with_evidence'),
				data: [
					{
						evidence_id: fixture.project.id,
						state_ids: [
							fixture.issues[0].decision.options[0].id,
							fixture.issues[1].uncertainty.outcomes[0].id,
						],
						expected_utility: 0,
					},
				],
			}),
		),
	);
	expect(screen.getByText('Scenario EV')).toBeVisible();
	expect(screen.getByText('20.00')).toBeVisible();
	await user.click(screen.getByRole('radio', { name: 'Card view' }));
	await user.click(await screen.findByRole('button', { name: 'Expand All' }));
	expect(await screen.findByText('Existing option')).toBeVisible();
	expect(screen.getByText('Existing outcome')).toBeVisible();
	expect(screen.getByText('20.00')).toBeVisible();
	fireEvent.click(screen.getByText('Existing outcome'));
	await user.click(screen.getByRole('radio', { name: 'Shape view' }));
	expect(
		await screen.findByRole('button', { name: 'Forced decision: Drill well' }),
	).toHaveTextContent('Existing option');
	expect(screen.getByRole('button', { name: 'Hard evidence: Oil price' })).toHaveTextContent(
		'1 state',
	);
	expect(screen.getByText('20.00')).toBeVisible();
	const shapeDecision = screen.getByTestId(`rf__node-${fixture.issues[0].node.id}`);
	await user.click(
		within(shapeDecision).getByRole('button', { name: 'Forced decision: Drill well' }),
	);
	await user.click(
		within(screen.getByRole('dialog', { name: 'Forced decision: Drill well' })).getByRole(
			'listitem',
		),
	);
	expect(await screen.findByText('Select states')).toBeVisible();
	await user.click(screen.getByRole('radio', { name: 'Card view' }));
	expect(screen.getByText('Select states')).toBeVisible();
});

test('State popovers support keyboard opening, Escape, outside dismissal, and do not expand Cards', async () => {
	const user = userEvent.setup();
	renderInfluenceDiagram(queryClient, fixture.project);
	const decision = await screen.findByTestId(`rf__node-${fixture.issues[0].node.id}`);
	const uncertainty = screen.getByTestId(`rf__node-${fixture.issues[1].node.id}`);
	const trigger = within(decision).getByRole('button', { name: 'Forced decision: Drill well' });
	await user.hover(decision);
	trigger.focus();
	await user.keyboard('{Enter}');
	const states = within(
		screen.getByRole('dialog', { name: 'Forced decision: Drill well' }),
	).getByRole('list');
	expect(states).toBeVisible();
	await user.keyboard('{Escape}');
	expect(screen.queryByRole('dialog')).toBeNull();
	await waitFor(() => expect(trigger).toHaveFocus());
	await user.keyboard(' ');
	await user.click(
		within(screen.getByRole('dialog', { name: 'Forced decision: Drill well' })).getByRole(
			'listitem',
		),
	);
	expect(trigger).toHaveTextContent('Existing option');

	await user.click(within(decision).getByRole('button', { name: 'Issue actions' }));
	expect(await screen.findByRole('menu', { name: 'Issue actions: Drill well' })).toBeVisible();
	expect(screen.queryByRole('dialog')).toBeNull();
	await user.click(within(uncertainty).getByRole('button', { name: 'Hard evidence: Oil price' }));
	expect(screen.getByRole('dialog', { name: 'Hard evidence: Oil price' })).toBeVisible();
	expect(screen.queryByRole('dialog', { name: 'Forced decision: Drill well' })).toBeNull();
	expect(screen.queryByRole('menu')).toBeNull();
	await user.click(screen.getByRole('radio', { name: 'Selection mode' }));
	expect(screen.queryByRole('dialog')).toBeNull();
	expect(trigger).toHaveTextContent('Existing option');
	await user.click(screen.getByRole('radio', { name: 'Card view' }));
	expect(screen.queryByRole('list')).toBeNull();
	await user.click(screen.getByRole('radio', { name: 'Shape view' }));
	expect(screen.queryByRole('dialog')).toBeNull();
	expect(screen.queryByRole('list')).toBeNull();
	expect(
		await screen.findByRole('button', { name: 'Forced decision: Drill well' }),
	).toHaveTextContent('Existing option');
});
