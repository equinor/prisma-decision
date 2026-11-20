import { Dialog } from '@ariakit/react';
import { Button } from '@equinor/eds-core-react/next';
import { useId, useState } from 'react';
import { FormProvider, useWatch } from 'react-hook-form';
import { useBulkUpdateDiscreteProbabilities } from '../../../hooks/api/useUpdateDiscreteProbabilities';
import { useBulkUpdateDiscreteUtilities } from '../../../hooks/api/useUpdateDiscreteUtilities';
import { useUpdateIssue } from '../../../hooks/api/useUpdateIssue';
import { useInfluenceDiagramEvidence } from '../../../hooks/useInfluenceDiagramEvidence';
import { useIssueForm } from '../../../hooks/useIssueForm';
import { Issue } from '../../../validators';
import { DeleteIssueDialog } from '../DeleteIssueDialog';
import { DecisionForm } from './DecisionForm';
import { FactForm } from './FactForm';
import { IssueSheetHeader } from './IssueSheetHeader';
import { IssueSheetTabs } from './IssueSheetTabs';
import { UnassignedForm } from './UnassignedForm';
import { UncertaintyForm } from './UncertaintyForm';
import { useDraftIssueTable, DraftTableValues } from './useDraftIssueTable';
import { UtilityForm } from './UtilityForm';

const issueForms = {
	Decision: DecisionForm,
	Uncertainty: UncertaintyForm,
	Fact: FactForm,
	Unassigned: UnassignedForm,
	Utility: UtilityForm,
};

export const EditIssueSheet = ({
	issue,
	onClose,
	open = false,
	dialog = true,
}: EditIssueSheetProps) =>
	open ? (
		<IssueSheet key={issue.id} issue={issue} dialog={dialog} onClose={() => onClose(false)} />
	) : null;

const IssueSheet = ({
	issue,
	onClose,
	dialog,
}: {
	issue: Issue;
	onClose: () => void;
	dialog: boolean;
}) => {
	const formId = useId();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [saving, setSaving] = useState<Issue | null>(null);
	const [tableValues, setTableValues] = useState<DraftTableValues>({});
	const { evidence, clearEvidence } = useInfluenceDiagramEvidence();
	// While saving, the form keeps the issue it was opened with, so a failed save keeps the edits.
	const form = useIssueForm({ issue: saving ?? issue });
	const { mutateAsync: updateIssue } = useUpdateIssue();
	const { mutateAsync: updateProbabilities } = useBulkUpdateDiscreteProbabilities();
	const { mutateAsync: updateUtilities } = useBulkUpdateDiscreteUtilities();
	const {
		control,
		formState: { isDirty: isFormDirty },
	} = form;
	const draftIssue = useWatch({ control }) as Issue;
	const draftTable = useDraftIssueTable(draftIssue, tableValues);
	const isDirty = isFormDirty || draftTable.hasEdits;
	const isPending = saving !== null;
	const type = draftIssue.type;
	const typeLabel = type.toLowerCase();
	const TypeForm = issueForms[type];

	const clearRemovedEvidence = (updated: Issue) => {
		const states =
			updated.type === 'Decision'
				? updated.decision.options
				: updated.type === 'Uncertainty'
					? updated.uncertainty.outcomes
					: [];
		const previousStates =
			issue.type === 'Decision' ? issue.decision.options : issue.uncertainty.outcomes;
		if (
			updated.type !== issue.type ||
			previousStates.some(
				state => evidence.includes(state.id) && !states.some(next => next.id === state.id),
			)
		)
			clearEvidence(updated.id);
	};

	// Saves the Issue first, so the API rebuilds its table, then the edited cells of that table.
	// If saving the cells fails, the saved Issue stays saved and only the cells are retried.
	const save = form.handleSubmit(async updated => {
		setSaving(issue);
		try {
			if (isFormDirty) {
				await updateIssue(updated);
				form.reset(updated);
				clearRemovedEvidence(updated);
			}
			if (draftTable.hasEdits) {
				try {
					if (updated.type === 'Uncertainty')
						await updateProbabilities(draftTable.editedProbabilities);
					else await updateUtilities(draftTable.editedUtilities);
					setTableValues({});
				} catch {
					// The update hook reports the failure and refetches the tables; the values stay unsaved.
				}
			}
		} catch {
			// The update hook reports the failure; the form keeps its unsaved edits.
		} finally {
			setSaving(null);
		}
	});

	return (
		<Dialog
			open
			onClose={onClose}
			modal={dialog}
			portal
			backdrop={dialog ? <div className='bg-black/40' /> : false}
			preventBodyScroll={dialog}
			hideOnInteractOutside={dialog && !deleteOpen}
			hideOnEscape={!deleteOpen}
			aria-label='Edit Issue'
			data-no-dnd
			className='nodrag nopan nowheel bg-background-default text-text-default pointer-events-auto fixed inset-y-0 right-0 z-50 flex h-dvh w-125 max-w-full flex-col shadow-xl outline-none'
		>
			<FormProvider {...form}>
				<div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4'>
					<IssueSheetHeader issue={issue} disabled={isPending} />
					<IssueSheetTabs
						issue={issue}
						draftIssue={draftIssue}
						draftTable={draftTable}
						onCellChange={(id, value) =>
							setTableValues(values => ({ ...values, [id]: value }))
						}
						onResetCells={ids =>
							setTableValues(values => ({
								...values,
								...Object.fromEntries(ids.map(id => [id, 0])),
							}))
						}
						pending={isPending}
					>
						<form
							id={formId}
							onSubmit={event => {
								if (!isDirty || isPending) {
									event.preventDefault();
									return;
								}
								void save(event);
							}}
						>
							<fieldset disabled={isPending} className='flex min-w-0 flex-col gap-4'>
								<TypeForm issue={issue} />
							</fieldset>
						</form>
					</IssueSheetTabs>
				</div>
				<footer className='border-background-medium flex min-h-17.25 shrink-0 flex-wrap items-center justify-end gap-2 border-t p-4'>
					<Button
						variant='ghost'
						tone='danger'
						className='mr-auto'
						disabled={isPending}
						onClick={() => setDeleteOpen(true)}
					>
						Delete {typeLabel}
					</Button>
					<Button variant='ghost' tone='neutral' onClick={onClose}>
						{isDirty ? 'Discard changes' : 'Close'}
					</Button>
					<Button
						type='submit'
						form={formId}
						disabled={!isDirty || isPending}
						aria-busy={isPending}
					>
						Update {typeLabel}
					</Button>
				</footer>
			</FormProvider>
			{deleteOpen && (
				<DeleteIssueDialog issue={issue} open onClose={() => setDeleteOpen(false)} />
			)}
		</Dialog>
	);
};

type EditIssueSheetProps = {
	issue: Issue;
	open?: boolean;
	dialog?: boolean;
	onClose: (value: boolean) => void;
};
