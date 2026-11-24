import { describe, expect, test } from 'vitest';
import { getStepNavigation } from './getStepNavigation';

describe('getStepNavigation', () => {
	test('first step has only a next link', () => {
		expect(getStepNavigation('/project/p1', 'p1')).toEqual({
			previous: undefined,
			next: { label: 'Stakeholder matrix', to: '/project/p1/stakeholder-matrix' },
		});
	});

	test('last step has only a previous link', () => {
		expect(getStepNavigation('/project/p1/assessments', 'p1')).toEqual({
			previous: { label: 'Solution tree', to: '/project/p1/solution-tree' },
			next: undefined,
		});
	});

	test('whiteboard sheet routes resolve to the whiteboard step', () => {
		expect(getStepNavigation('/project/p1/whiteboard/sheet-9', 'p1')).toEqual({
			previous: { label: 'Strategies', to: '/project/p1/strategies' },
			next: { label: 'Influence diagram', to: '/project/p1/influence-diagram' },
		});
	});

	test('links back to project information without a trailing slash', () => {
		expect(getStepNavigation('/project/p1/stakeholder-matrix/', 'p1').previous).toEqual({
			label: 'Project information',
			to: '/project/p1',
		});
	});

	test('unknown pages show no navigation', () => {
		expect(getStepNavigation('/project/p1/unknown', 'p1')).toEqual({});
		expect(getStepNavigation('/', 'p1')).toEqual({});
	});
});
