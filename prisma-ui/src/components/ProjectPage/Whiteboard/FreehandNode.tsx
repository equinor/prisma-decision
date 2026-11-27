import { NodeProps, NodeResizer, useReactFlow } from '@xyflow/react';
import { useUpdateWhiteboardNodes } from '../../../hooks/api/useUpdateWhiteboardNodes';
import { ReactFlowWhiteboardNode } from '../../../types';
import { scaleFreehandPath } from './freehandPath';
import {
	whiteboardNodeStrokeColor,
	whiteboardNodeResizerHandleStyle,
	whiteboardNodeResizerLineStyle,
} from './selectionStyles';
import { MEDIUM_STROKE_WIDTH } from './config';

export const FreehandNode = ({ data, selected }: NodeProps<ReactFlowWhiteboardNode>) => {
	const { getNodes } = useReactFlow<ReactFlowWhiteboardNode>();
	const { mutate: updateWhiteboardNodes } = useUpdateWhiteboardNodes();
	const resolvedWidth = Math.max(data.width ?? 1, 1);
	const resolvedHeight = Math.max(data.height ?? 1, 1);
	const strokeOpacity = (data.opacity ?? 100) / 100;
	const strokeColor =
		data.color === undefined || data.color === 'default'
			? whiteboardNodeStrokeColor
			: data.color;
	let lineStyle: string | undefined;
	if (data.stroke_style === 'Dashed') lineStyle = '16 16';
	if (data.stroke_style === 'Dotted') lineStyle = '3 10';
	const strokeWidth = data.stroke_width ?? MEDIUM_STROKE_WIDTH;

	return (
		<>
			<NodeResizer
				isVisible={selected}
				onResizeEnd={() => {
					const nodes = getNodes();
					const node = nodes.find(node => node.id === data.id);
					if (!node) return;

					const nextWidth = Math.max(node.width || 0, 1);
					const nextHeight = Math.max(node.height || 0, 1);
					const currentWidth = Math.max(data.width || 0, 1);
					const currentHeight = Math.max(data.height || 0, 1);

					updateWhiteboardNodes([
						{
							...node.data,
							width: nextWidth,
							height: nextHeight,
							x_position: node.position.x,
							y_position: node.position.y,
							data: scaleFreehandPath(
								data.data,
								nextWidth / currentWidth,
								nextHeight / currentHeight,
							),
						},
					]);
				}}
				handleStyle={whiteboardNodeResizerHandleStyle}
				lineStyle={whiteboardNodeResizerLineStyle}
			/>
			<svg
				className='h-full w-full overflow-visible hover:cursor-pointer'
				viewBox={`0 0 ${resolvedWidth} ${resolvedHeight}`}
				preserveAspectRatio='none'
			>
				<path
					d={data.data}
					fill='transparent'
					stroke='transparent'
					strokeWidth={18}
					vectorEffect='non-scaling-stroke'
					pointerEvents='stroke'
				/>
				<path
					d={data.data}
					stroke={strokeColor}
					fill='none'
					strokeDasharray={lineStyle}
					opacity={strokeOpacity}
					strokeWidth={strokeWidth}
					strokeLinecap='round'
					strokeLinejoin='round'
					vectorEffect='non-scaling-stroke'
					pointerEvents='stroke'
				/>
			</svg>
		</>
	);
};
