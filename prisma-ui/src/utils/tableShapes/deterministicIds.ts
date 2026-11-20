import { md5 } from 'js-md5';

export const DEFAULT_VALUE_METRIC_ID = '288e0811-7ab6-5d24-b80c-9fa925b848a6';

const sortIds = (ids: string[]) => ids.map(id => id.toLowerCase()).sort();

const toHex = (bytes: number[]) => bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * Matches the API's `new Guid(MD5.HashData(...))`: .NET stores the first three GUID groups
 * little-endian, so their bytes are reversed when formatted.
 */
const deterministicGuid = (input: string) => {
	const bytes = md5.array(input);
	return [
		toHex(bytes.slice(0, 4).reverse()),
		toHex(bytes.slice(4, 6).reverse()),
		toHex(bytes.slice(6, 8).reverse()),
		toHex(bytes.slice(8, 10)),
		toHex(bytes.slice(10, 16)),
	].join('-');
};

export const getDeterministicProbabilityId = (
	issueId: string,
	outcomeId: string,
	parentOutcomeIds: string[],
	parentOptionIds: string[],
) =>
	deterministicGuid(
		`${issueId.toLowerCase()}|StateId:${outcomeId.toLowerCase()}|` +
			`Outcomes:${sortIds(parentOutcomeIds).join(',')}|Options:${sortIds(parentOptionIds).join(',')}`,
	);

export const getDeterministicUtilityId = (
	issueId: string,
	valueMetricId: string,
	parentOutcomeIds: string[],
	parentOptionIds: string[],
) =>
	deterministicGuid(
		`${issueId.toLowerCase()}|ValueMetricId:${valueMetricId.toLowerCase()}|` +
			`Outcomes:${sortIds(parentOutcomeIds).join(',')}|Options:${sortIds(parentOptionIds).join(',')}`,
	);
