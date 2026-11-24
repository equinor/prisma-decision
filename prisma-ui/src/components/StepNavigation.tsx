import { Button, Icon } from '@equinor/eds-core-react/next';
import { chevron_left, chevron_right } from '@equinor/eds-icons';
import { Link, useLocation } from 'react-router';
import { getStepNavigation } from '../utils/getStepNavigation';

export const StepNavigation = ({ projectId }: { projectId: string }) => {
	const { pathname } = useLocation();
	const { previous, next } = getStepNavigation(pathname, projectId);

	if (!previous && !next) return null;

	return (
		<>
			<div className='bg-background-medium m-0! h-8 w-0.5' />
			<nav aria-label='Project steps' className='flex items-center gap-0.5'>
				{previous && (
					<Button variant='ghost' tone='neutral' asChild>
						<Link to={previous.to} aria-label={`Previous step: ${previous.label}`}>
							<Icon data={chevron_left} />
							{previous.label}
						</Link>
					</Button>
				)}
				{next && (
					<Button variant='ghost' tone='neutral' asChild>
						<Link to={next.to} aria-label={`Next step: ${next.label}`}>
							{next.label}
							<Icon data={chevron_right} />
						</Link>
					</Button>
				)}
			</nav>
		</>
	);
};
