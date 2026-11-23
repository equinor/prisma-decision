import { expect, test } from 'vitest';
import { createFreehandGeometry, FreehandInputPoint, scaleFreehandPath } from './freehandPath';

const strokes: FreehandInputPoint[][] = [
	[
		[0, 0],
		[60, 0],
		[120, 0],
	],
	[
		[0, 0],
		[30, 40],
		[60, -20],
		[90, 40],
		[120, 0],
	],
];

test.each(strokes.map(points => ({ points })))(
	'stores one open stroke instead of a closed outline',
	({ points }) => {
		const geometry = createFreehandGeometry(points);
		const lastPoint = points[points.length - 1];

		expect(geometry.path.match(/M/g)).toHaveLength(1);
		expect(geometry.path).not.toMatch(/Z/i);
		expect(
			geometry.path.endsWith(
				`L${(lastPoint[0] - geometry.position.x).toFixed(2)},${(lastPoint[1] - geometry.position.y).toFixed(2)}`,
			),
		).toBe(true);
		expect(geometry.width).toBeGreaterThan(0);
		expect(geometry.height).toBeGreaterThan(0);
	},
);

test('represents a single click as a zero-length round-capped stroke', () => {
	expect(createFreehandGeometry([[10, 20]])).toEqual({
		position: { x: 10, y: 20 },
		width: 1,
		height: 1,
		path: 'M0.00,0.00 L0.00,0.00',
	});
});

test('resizes an open stroke without adding a return edge', () => {
	const path = 'M0.00,5.00 Q10.00,10.00 20.00,5.00 L30.00,0.00';
	expect(scaleFreehandPath(path, 2, 3)).toBe('M0.00,15.00 Q20.00,30.00 40.00,15.00 L60.00,0.00');
});
