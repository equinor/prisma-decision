import { CircularProgress } from '@equinor/eds-core-react';
import { Banner, Button, Chip, Dialog, Icon, Link, TextArea } from '@equinor/eds-core-react/next';
import { check_circle_outlined, comment_important, info_circle } from '@equinor/eds-icons';
import { ComponentProps, ReactNode, useId, useState } from 'react';
import { type FeedbackContext } from '../../hooks/api/useCreateGitHubIssue';
import { useGitHubIssueForm, type FeedbackAction } from '../../hooks/useGitHubIssueForm';
import { cn } from '../../utils/cn';
import { GitHubIssue, gitHubIssueTypes } from '../../validators';

export const CreateGitHubIssueDialog = ({ context }: { context: FeedbackContext }) => {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button type='button' variant='secondary' onClick={() => setOpen(true)}>
				<Icon data={comment_important} size='sm' />
				Send feedback
			</Button>
			{open && <FeedbackForm context={context} onClose={() => setOpen(false)} />}
		</>
	);
};

const FeedbackForm = ({ context, onClose }: { context: FeedbackContext; onClose: () => void }) => {
	const formId = useId();
	const {
		register,
		formState: { errors },
		handleSubmit,
		handleSubmitAndAddAnother,
		isPending,
		pendingAction,
		isError,
		createdIssue,
		lastSentIssue,
		dismissSuccess,
		selectedTypes,
		toggleType,
	} = useGitHubIssueForm(context);

	if (createdIssue) {
		return <FeedbackConfirmation issue={createdIssue} onClose={onClose} />;
	}

	return (
		<FeedbackDialog
			title='Send feedback'
			onClose={onClose}
			closable={!isPending}
			className='max-h-[90dvh] overflow-auto'
			actions={
				<>
					<SubmitButton
						action='sendAndAddAnother'
						pendingAction={pendingAction}
						disabled={isPending}
						variant='secondary'
						onClick={handleSubmitAndAddAnother}
					>
						Send and add another
					</SubmitButton>
					<SubmitButton
						action='send'
						pendingAction={pendingAction}
						disabled={isPending}
						type='submit'
						form={formId}
					>
						Send
					</SubmitButton>
				</>
			}
		>
			{lastSentIssue && (
				<Banner tone='success' onDismiss={dismissSuccess}>
					<Banner.Icon>
						<Icon data={check_circle_outlined} />
					</Banner.Icon>
					<Banner.Message>
						Feedback sent as{' '}
						<Link
							href={lastSentIssue.issue_url}
							target='_blank'
							rel='noopener noreferrer'
						>
							#{lastSentIssue.issue_number}
						</Link>
						. Thank you! Add another, or close.
					</Banner.Message>
				</Banner>
			)}
			<p className='text-sm leading-6'>
				Report a bug, suggest an improvement or give general feedback to the Prisma team.
			</p>
			<form id={formId} aria-label='Feedback submission' onSubmit={handleSubmit} noValidate>
				<fieldset disabled={isPending} className='flex min-w-0 flex-col gap-5'>
					<div>
						<p id={`${formId}-type`} className='text-text-secondary mb-2 text-sm'>
							Types
						</p>
						<div
							role='group'
							aria-labelledby={`${formId}-type`}
							className='flex flex-wrap gap-2'
						>
							{gitHubIssueTypes.map(type => {
								const selected = selectedTypes.includes(type);
								return (
									<Chip
										key={type}
										selected={selected}
										tone={selected ? 'success' : 'neutral'}
										variant='outlined'
										aria-pressed={selected}
										onClick={() => toggleType(type)}
									>
										{type}
									</Chip>
								);
							})}
						</div>
					</div>
					<TextArea
						label='Feedback'
						rows={3}
						placeholder='Describe the bug, suggestion or improvement'
						{...register('feedback')}
						invalid={!!errors.feedback}
						helperMessage={errors.feedback?.message}
						className='font-[inherit]!'
					/>
				</fieldset>
			</form>
			<section
				aria-label='Information we collect'
				className='border-background-medium flex flex-col gap-4 rounded-sm border p-3 text-sm'
			>
				<h3 className='text-text-secondary text-sm font-normal'>Information we collect</h3>
				<dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-7 gap-y-3'>
					<ContextRow label='Project' className='wrap-anywhere'>
						{context.project}
					</ContextRow>
					<ContextRow label='URL' className='truncate' title={context.pageUrl}>
						{context.pageUrl}
					</ContextRow>
					<ContextRow label='From' className='wrap-anywhere'>
						{context.from}
					</ContextRow>
				</dl>
				<Banner tone='info'>
					<Banner.Icon>
						<Icon data={info_circle} />
					</Banner.Icon>
					<Banner.Message>
						This creates a public issue on GitHub, including the details above.
						Don&apos;t share anything confidential.
					</Banner.Message>
				</Banner>
			</section>
			{isError && (
				<Banner tone='danger' role='alert'>
					<Banner.Message>
						Unable to send feedback. Your draft has been kept. Please try again.
					</Banner.Message>
				</Banner>
			)}
		</FeedbackDialog>
	);
};

const FeedbackConfirmation = ({ issue, onClose }: { issue: GitHubIssue; onClose: () => void }) => (
	<FeedbackDialog
		title='Thanks for the feedback'
		onClose={onClose}
		actions={
			<Button type='button' onClick={onClose}>
				Close
			</Button>
		}
	>
		<Banner tone='success'>
			<Banner.Icon>
				<Icon data={check_circle_outlined} />
			</Banner.Icon>
			<Banner.Message>Feedback sent. Thank you!</Banner.Message>
		</Banner>
		<p className='text-sm leading-6'>
			Link to your feedback:{' '}
			<Link href={issue.issue_url} target='_blank' rel='noopener noreferrer'>
				{issue.issue_url}
			</Link>
		</p>
	</FeedbackDialog>
);

const FeedbackDialog = ({
	title,
	onClose,
	closable = true,
	className,
	actions,
	children,
}: {
	title: string;
	onClose: () => void;
	closable?: boolean;
	className?: string;
	actions: ReactNode;
	children: ReactNode;
}) => (
	<Dialog
		open
		onOpenChange={value => {
			if (!value && closable) onClose();
		}}
		className={cn('m-auto! w-[min(560px,94vw)]! text-left font-[inherit]!', className)}
	>
		<Dialog.Header className='p-4!'>
			<Dialog.Title className='font-[inherit]! text-lg! font-normal!'>{title}</Dialog.Title>
		</Dialog.Header>
		<Dialog.Content className='gap-5! px-4! py-5!'>{children}</Dialog.Content>
		<Dialog.Actions className='flex-wrap justify-end! px-4! pt-2! pb-4!'>
			{actions}
		</Dialog.Actions>
	</Dialog>
);

const SubmitButton = ({
	action,
	pendingAction,
	children,
	...buttonProps
}: {
	action: FeedbackAction;
	pendingAction: FeedbackAction | undefined;
	children: ReactNode;
} & Omit<ComponentProps<typeof Button>, 'aria-busy' | 'children'>) => {
	const busy = pendingAction === action;
	return (
		<Button {...buttonProps} aria-busy={busy}>
			{busy && <CircularProgress size={16} />}
			{children}
		</Button>
	);
};

const ContextRow = ({
	label,
	className,
	title,
	children,
}: {
	label: string;
	className?: string;
	title?: string;
	children: ReactNode;
}) => (
	<>
		<dt className='text-text-tertiary'>{label}</dt>
		<dd className={className} title={title}>
			{children}
		</dd>
	</>
);
