import { DecisionType } from '../../../../validators';

const tierPaths: Record<DecisionType, string> = {
	Policy: 'M17.2615 8.55611H8.73851L13 2L17.2615 8.55611Z',
	Focus: 'M21.5893 15.2143H4.41069L8.63903 8.70917H17.3609L21.5893 15.2143Z',
	Tactical: 'M26 22H0L4.31121 15.3674H21.6888L26 22Z',
};

export const DecisionTierIcon = ({ decisionType }: { decisionType: DecisionType }) => (
	<svg
		width='52'
		height='40'
		viewBox='0 2 26 20'
		overflow='visible'
		aria-hidden
		className='text-text-tertiary shrink-0'
	>
		{Object.entries(tierPaths).map(([tier, path]) => (
			<path
				key={tier}
				d={path}
				stroke='currentColor'
				vectorEffect='non-scaling-stroke'
				className={tier === decisionType ? 'fill-primary-resting' : 'fill-none'}
			/>
		))}
	</svg>
);
