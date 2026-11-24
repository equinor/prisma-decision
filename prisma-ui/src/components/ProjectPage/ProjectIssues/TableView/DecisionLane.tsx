import { Button, Icon } from '@equinor/eds-core-react/next';
import { add } from '@equinor/eds-icons';
import { Dispatch, SetStateAction } from 'react';
import { cn } from '../../../../utils/cn';
import { DecisionType, Issue } from '../../../../validators';
import { IssueBoardCard } from '../../../common/Cards/IssueBoardCard';
import { IssueDraftCard } from '../../../common/Cards/IssueDraftCard';
import { DroppableIssueContainer } from '../../../common/DroppableIssueContainer';
import { DecisionTierIcon } from './DecisionTierIcon';
import { BoardDraftLocation } from './IssueDraftControl';

const laneDescriptions: Record<DecisionType, string> = {
	Policy: 'Taken as given',
	Focus: 'Focus on in this analysis',
	Tactical: 'Decide later',
};

// Sizes assume every card is 152px tall: a lane fits at least one row
// (152 + 16px padding = 168px) and switches to two rows at 2 × 152 + 8px gap + 16px = 328px.
export const DecisionLane = ({
	decisionType,
	issues = [],
	acceptedColumnIds,
	activeDraft,
	setActiveDraft,
}: {
	decisionType: DecisionType;
	issues: Issue[];
	acceptedColumnIds: readonly string[];
	activeDraft: BoardDraftLocation | null;
	setActiveDraft: Dispatch<SetStateAction<BoardDraftLocation | null>>;
}) => {
	const isDrafting = activeDraft?.columnId === decisionType;
	const draft: BoardDraftLocation = { columnId: decisionType, type: 'Decision', position: 'top' };

	return (
		<section
			aria-label={`${decisionType} issues`}
			className='flex min-h-42 flex-1 basis-0 items-center gap-4'
		>
			<div className='flex w-40 shrink-0 flex-col gap-2 pt-2'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-2'>
						<DecisionTierIcon decisionType={decisionType} />
						<h3 className='font-medium'>{decisionType}</h3>
					</div>
					<span className='bg-background-light w-8 rounded-full text-center text-sm'>
						{issues.length}
					</span>
				</div>
				<p className='text-text-tertiary text-xs'>{laneDescriptions[decisionType]}</p>
				<Button
					variant='ghost'
					size='small'
					type='button'
					className='justify-start!'
					aria-label={`Add decision to ${decisionType}`}
					disabled={activeDraft !== null}
					onClick={() => setActiveDraft(draft)}
				>
					<Icon data={add} />
					Add decision
				</Button>
			</div>
			<div className='@container-[size] flex min-w-0 flex-1 self-stretch'>
				<DroppableIssueContainer
					issueType='Decision'
					id={decisionType}
					acceptedTypes={acceptedColumnIds}
					className={cn(
						'flex flex-1 items-start overflow-auto rounded-sm p-2',
						decisionType === 'Focus'
							? 'bg-(--eds-color-bg-warning-canvas)'
							: 'bg-(--eds-color-bg-neutral-canvas)',
					)}
				>
					{issues.length === 0 && !isDrafting && (
						<p className='text-lg'>
							No {decisionType} decisions. Drag a decision here or use Add decision.
						</p>
					)}
					<div className='inline-grid shrink-0 auto-cols-[300px] grid-flow-col grid-rows-1 items-start gap-2 [@container(min-height:328px)]:grid-rows-2'>
						{isDrafting && (
							<IssueDraftCard
								issueType='Decision'
								decisionType={decisionType}
								position='top'
								onClose={() =>
									setActiveDraft(current =>
										current === activeDraft ? null : current,
									)
								}
							/>
						)}
						{issues.map((issue, index) => (
							<IssueBoardCard
								key={issue.id}
								issue={issue}
								index={index}
								type='Decision'
								group={decisionType}
								acceptedGroups={acceptedColumnIds}
							/>
						))}
					</div>
				</DroppableIssueContainer>
			</div>
		</section>
	);
};
