/**
 * The crow's foot marks a relation line carries at both ends (criterion
 * 584cb5f6), the notation of relational diagrams: the mark touching a table
 * tells the most (a bar for one, a crow's foot for many), the mark beyond it
 * the least (a ring for zero, a bar for one). The reading is the Mermaid one
 * of the data model (mermaid.ts), so every diagram of the product says the same.
 */
import type { EntityField } from '$domain/data';
import type { Port } from './erd-route';

/** One end of a relation: the least and the most rows it joins there. */
export interface RelationEnd {
	min: 0 | 1;
	many: boolean;
}

/**
 * Both ends of the relation a field draws, from its own table to the one it
 * points at. A foreign key: zero or many at its table, one (or zero or one when
 * optional) at the target. A list: one at its table, zero or many (one or many
 * when required) at the target.
 */
export function relationEnds(f: Pick<EntityField, 'isList' | 'isRequired'>): { from: RelationEnd; to: RelationEnd } {
	if (f.isList) return { from: { min: 1, many: false }, to: { min: f.isRequired ? 1 : 0, many: true } };
	return { from: { min: 0, many: true }, to: { min: f.isRequired ? 1 : 0, many: false } };
}

/** The half height of a bar and of a crow's foot: large enough to read at the zoom the map opens at (criterion 584cb5f6). */
const HALF = 8;
/** Where each mark sits, measured from the card's edge along the line; the furthest stays inside the line's straight end run. */
const FOOT = 15;
const MAX_BAR = 8;
const MIN_BAR_AFTER_BAR = 14;
const MIN_BAR_AFTER_FOOT = 19;
const RING_AFTER_BAR = 19;
const RING_AFTER_FOOT = 24;
export const RING_R = 4.5;

/** The strokes of one end's marks as path commands, and where its ring is when it has one. */
export function endMarks(port: Port, end: RelationEnd): { d: string; ring: { x: number; y: number } | null } {
	const at = (dist: number) => port.x + port.out * dist;
	const bar = (dist: number) => `M ${at(dist)} ${port.y - HALF} L ${at(dist)} ${port.y + HALF}`;
	const parts: string[] = [];
	if (end.many) parts.push(`M ${at(FOOT)} ${port.y} L ${port.x} ${port.y - HALF} M ${at(FOOT)} ${port.y} L ${port.x} ${port.y + HALF}`);
	else parts.push(bar(MAX_BAR));
	if (end.min === 1) parts.push(bar(end.many ? MIN_BAR_AFTER_FOOT : MIN_BAR_AFTER_BAR));
	const ring = end.min === 0 ? { x: at(end.many ? RING_AFTER_FOOT : RING_AFTER_BAR), y: port.y } : null;
	return { d: parts.join(' '), ring };
}
