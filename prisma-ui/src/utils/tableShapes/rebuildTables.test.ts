import { describe, expect, it } from 'vitest';
import type { DiscreteProbability, DiscreteUtility } from '../../validators';
import { rebuildTables, type TableShapeProject } from './rebuildTables';

type Tables = {
	discrete_probabilities: DiscreteProbability[];
	discrete_utilities: DiscreteUtility[];
};

type Fixture = {
	description: string;
	input: TableShapeProject;
	expected: Tables;
};

// Shared with the API's TableShapeParityTests; expected tables are recorded from the API.
// Restriction tables are only rebuilt by the API, so their expectations are checked there.
const fixtures = import.meta.glob<Fixture>('../../../../test-fixtures/table-shape/*.json', {
	eager: true,
	import: 'default',
});

const sortIds = (ids: string[]) => [...ids].sort();
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const canonicalize = (tables: Tables) => ({
	discrete_probabilities: tables.discrete_probabilities
		.map(probability => ({
			id: probability.id,
			outcome_id: probability.outcome_id,
			uncertainty_id: probability.uncertainty_id,
			project_id: probability.project_id,
			probability: probability.probability,
			parent_outcome_ids: sortIds(probability.parent_outcome_ids),
			parent_option_ids: sortIds(probability.parent_option_ids),
		}))
		.sort(byId),
	discrete_utilities: tables.discrete_utilities
		.map(utility => ({
			id: utility.id,
			value_metric_id: utility.value_metric_id,
			utility_id: utility.utility_id,
			utility_value: utility.utility_value,
			parent_outcome_ids: sortIds(utility.parent_outcome_ids),
			parent_option_ids: sortIds(utility.parent_option_ids),
			project_id: utility.project_id,
		}))
		.sort(byId),
});

describe('Table shape parity', () => {
	const cases = Object.entries(fixtures).map(([path, fixture]) => ({
		name: path.split('/').pop()!.replace('.json', ''),
		fixture,
	}));

	it('loads the shared fixtures', () => {
		expect(cases.length).toBeGreaterThan(0);
	});

	it.each(cases)('$name', ({ fixture }) => {
		expect(canonicalize(rebuildTables(fixture.input))).toEqual({
			discrete_probabilities: fixture.expected.discrete_probabilities,
			discrete_utilities: fixture.expected.discrete_utilities,
		});
	});
});
