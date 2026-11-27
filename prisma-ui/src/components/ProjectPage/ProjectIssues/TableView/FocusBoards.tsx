import { Dispatch, SetStateAction } from 'react';
import { decisionTypes, Issue, issueTypes } from '../../../../validators';
import { DecisionLane } from './DecisionLane';
import { IssueColumn } from './IssueColumn';
import { BoardDraftLocation } from './IssueDraftControl';

export type FocusBoardProps = {
	issues: Record<string, Issue[]>;
	activeDraft: BoardDraftLocation | null;
	setActiveDraft: Dispatch<SetStateAction<BoardDraftLocation | null>>;
};

const overviewTypes = issueTypes.filter(type => type !== 'Utility');

export const OverviewBoard = ({ issues, activeDraft, setActiveDraft }: FocusBoardProps) => (
	<div className='flex min-h-full flex-1 items-stretch gap-2'>
		{overviewTypes.map(issueType => (
			<IssueColumn
				key={issueType}
				issues={issues[issueType]}
				issueType={issueType}
				label={issueType}
				acceptedColumnIds={overviewTypes}
				activeDraft={activeDraft}
				setActiveDraft={setActiveDraft}
			/>
		))}
	</div>
);

export const DecisionsBoard = ({ issues, activeDraft, setActiveDraft }: FocusBoardProps) => (
	<div className='flex min-h-full flex-col gap-4'>
		{decisionTypes.map(decisionType => (
			<DecisionLane
				key={decisionType}
				decisionType={decisionType}
				issues={issues[decisionType]}
				acceptedColumnIds={decisionTypes}
				activeDraft={activeDraft}
				setActiveDraft={setActiveDraft}
			/>
		))}
	</div>
);

const uncertaintyColumns = [
	{ label: 'Key', isKey: true, colorClassName: 'bg-green-300/25' },
	{ label: 'Not key', isKey: false, colorClassName: 'bg-gray-300/25' },
] as const;
const uncertaintyColumnIds = uncertaintyColumns.map(column => column.label);

export const UncertaintiesBoard = ({ issues, activeDraft, setActiveDraft }: FocusBoardProps) => (
	<div className='flex min-h-full flex-1 items-stretch gap-2'>
		{uncertaintyColumns.map(column => (
			<IssueColumn
				key={column.label}
				columnId={column.label}
				label={column.label}
				issueType='Uncertainty'
				isKey={column.isKey}
				colorClassName={column.colorClassName}
				issues={issues[column.label]}
				acceptedColumnIds={uncertaintyColumnIds}
				activeDraft={activeDraft}
				setActiveDraft={setActiveDraft}
			/>
		))}
	</div>
);
