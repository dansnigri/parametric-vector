import type { ToolName } from '../store/store';

export const TOOL_HINTS: Record<ToolName, string> = {
  select: 'Click to select · Shift-click to add · Drag geometry to move it · Drag empty space to box-select',
  line: 'Click to start the line, then click to add segments. Press Enter, Esc or right-click to finish the chain.',
  rect: 'Click to place the first corner, then click to place the opposite corner.',
  circle: 'Click to place the center, then click to set the radius.',
  arc: 'Click the start point, then the end point, then a point the arc passes through.',
  point: 'Click to place a point.',
  dimension: 'Select one or two entities to dimension, then click to place the dimension.',
};
