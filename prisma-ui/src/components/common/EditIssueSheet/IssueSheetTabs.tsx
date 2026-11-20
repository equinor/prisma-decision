import { Tab, TabList, TabPanel, TabProvider } from '@ariakit/react';
import { Banner, Icon } from '@equinor/eds-core-react/next';
import { info_circle } from '@equinor/eds-icons';
import { Button } from '@equinor/eds-core-react';
import { ReactNode, useId, useState } from 'react';
import { useIssueFormContext } from '../../../hooks/useIssueForm';
import { useSelectedProjectEdges } from '../../../hooks/useSelectedProjectEdges';
import { cn } from '../../../utils/cn';
import { isIssueInInfluenceDiagram } from '../../../utils/isIssueInInfluenceDiagram';
import { Issue } from '../../../validators';
import { PolicyConditionalTable } from '../../ProjectPage/InfluenceDiagram/PolicyTable/PolicyTable';
import { ProbabilityTableContent } from '../../ProjectPage/InfluenceDiagram/ProbabilityTable/ProbabilityTable';
import { UtilityTableContent } from '../../ProjectPage/InfluenceDiagram/UtilityTable/UtilityTable';
import { useDraftIssueTable } from './useDraftIssueTable';

type DraftTable = ReturnType<typeof useDraftIssueTable>;

/**
 * Details and table tabs for the sheet. Probability and Utility tables show the draft Issue's
 * Table shape and collect edits as unsaved values that are saved together with the Issue.
 */
export const IssueSheetTabs = ({
	issue,
	draftIssue,
	draftTable,
	onCellChange,
	onResetCells,
	pending,
	children,
}: {
	issue: Issue;
	draftIssue: Issue;
	draftTable: DraftTable;
	onCellChange: (id: string, value: number) => void;
	onResetCells: (ids: string[]) => void;
	pending: boolean;
	children: ReactNode;
}) => {
	const detailsTabId = useId();
	const tableTabId = useId();
	const [tab, setTab] = useState<string | null>(detailsTabId);
	const {
		formState: { isDirty },
	} = useIssueFormContext();
	const { edges } = useSelectedProjectEdges();
	const tableLabel =
		isIssueInInfluenceDiagram(issue) || isIssueInInfluenceDiagram(draftIssue)
			? tableLabels[draftIssue.type]
			: undefined;
	const utilityDisabled =
		draftIssue.type === 'Utility' &&
		edges.filter(edge => edge.head_issue_id === issue.id || edge.head_id === issue.node.id)
			.length < 2;
	const onDetails = !tableLabel || tab !== tableTabId;
	// Policy tables come from the solver, so they wait for saved changes.
	const policyWaitsForSave = draftIssue.type === 'Decision' && isDirty;
	const disabled = pending || policyWaitsForSave;
	const draftCells =
		draftIssue.type === 'Uncertainty' ? draftTable.probabilities : draftTable.utilities;
	const draftValues = draftCells.map(cell =>
		'probability' in cell ? cell.probability : cell.utility_value,
	);
	return (
		<TabProvider
			selectedId={onDetails ? detailsTabId : tableTabId}
			setSelectedId={value => setTab(value ?? detailsTabId)}
		>
			<TabList
				aria-label='Issue editor tabs'
				className='border-background-medium flex w-fit border-b-2'
			>
				<Tab
					id={detailsTabId}
					className='text-text-secondary aria-selected:text-primary-resting aria-selected:border-primary-resting -mb-0.5 border-b-2 border-transparent px-4 py-3 text-base'
				>
					Details
				</Tab>
				{tableLabel && (
					<Tab
						id={tableTabId}
						disabled={utilityDisabled}
						aria-describedby={utilityDisabled ? `${tableTabId}-reason` : undefined}
						className='text-text-secondary aria-selected:text-primary-resting aria-selected:border-primary-resting -mb-0.5 border-b-2 border-transparent px-4 py-3 text-base aria-disabled:opacity-50'
					>
						{tableLabel}
					</Tab>
				)}
			</TabList>
			{tableLabel && utilityDisabled && (
				<p id={`${tableTabId}-reason`} className='text-text-tertiary text-sm'>
					Connect 2+ parent nodes to enable utility table and solver
				</p>
			)}
			<TabPanel tabId={detailsTabId} hidden={!onDetails}>
				{children}
			</TabPanel>
			{tableLabel && (
				<TabPanel
					tabId={tableTabId}
					hidden={onDetails}
					unmountOnHide
					className='flex min-w-0 flex-col gap-4'
				>
					{policyWaitsForSave && (
						<Banner tone='info' className='rounded-sm border! px-3! py-2!'>
							<Banner.Icon>
								<Icon data={info_circle} />
							</Banner.Icon>
							<Banner.Message>
								The table is disabled until your changes are saved
							</Banner.Message>
						</Banner>
					)}
					<div
						className={cn('overflow-x-auto', disabled && 'opacity-40')}
						inert={disabled}
					>
						{draftIssue.type !== 'Decision' && draftCells.length > 0 && (
							<div className='flex justify-end pt-1 pb-2'>
								<Button
									variant='outlined'
									disabled={draftValues.every(value => value === 0)}
									onClick={() => onResetCells(draftCells.map(cell => cell.id))}
								>
									Reset all
								</Button>
							</div>
						)}
						{draftIssue.type === 'Decision' && <PolicyConditionalTable issue={issue} />}
						{draftIssue.type === 'Uncertainty' && (
							<ProbabilityTableContent
								issue={draftIssue}
								probabilities={draftTable.probabilities}
								onCommit={probability =>
									onCellChange(probability.id, probability.probability)
								}
							/>
						)}
						{draftIssue.type === 'Utility' && (
							<UtilityTableContent
								issue={draftIssue}
								utilities={draftTable.utilities}
								onCommit={utility =>
									onCellChange(utility.id, utility.utility_value)
								}
							/>
						)}
					</div>
				</TabPanel>
			)}
		</TabProvider>
	);
};

const tableLabels: Partial<Record<Issue['type'], string>> = {
	Decision: 'Policy table',
	Uncertainty: 'Probability table',
	Utility: 'Utility table',
};
