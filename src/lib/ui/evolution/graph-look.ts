import type { LocalNode, LocalNodeKind, LocalNodeStatus } from '$domain/evolution';

/** The colour law of the request's graph, shared by its tree and its network (ac-evo-graph-status). */
export const LOOK: Record<LocalNodeStatus, { box: string; text: string; word: string; dashed?: boolean }> = {
	existing: { box: 'fill-surface-sunken stroke-ink-300', text: 'fill-ink-700', word: 'Already there' },
	added: { box: 'fill-info-50 stroke-info-500', text: 'fill-info-700', word: 'Added by the request' },
	changed: { box: 'fill-warning-50 stroke-warning-500', text: 'fill-warning-700', word: 'Changed by the request' },
	removed: { box: 'fill-danger-50 stroke-danger-500', text: 'fill-danger-700', word: 'Removed by the request' },
	reached: { box: 'fill-surface stroke-ink-300', text: 'fill-ink-500', word: 'Reached by the impact', dashed: true }
};

export const KIND_LABEL: Record<LocalNodeKind, string> = {
	core: 'Core',
	feature: 'Feature',
	surface: 'Screen',
	state: 'State',
	invariant: 'Always true',
	action: 'Action',
	rule: 'Rule',
	transition: 'Transition',
	event: 'Event',
	table: 'Table',
	field: 'Field'
};

// A surface is not always a screen and an action is not always a click: a
// backend-only change reads as one (ac-evo-graph-backend).
const SURFACE_LABEL: Record<string, string> = {
	screen: 'Screen',
	dialog: 'Dialog',
	dialog_area: 'Dialog',
	workflow: 'Process',
	terminal: 'Terminal',
	canvas: 'Canvas',
	board: 'Board'
};
const ACTOR_LABEL: Record<string, string> = { system: 'System action', schedule: 'Scheduled action', event: 'On event' };
export const kindLabel = (node: LocalNode): string => {
	if (node.kind === 'surface') return node.variant ? (SURFACE_LABEL[node.variant] ?? node.variant.replaceAll('_', ' ')) : 'Surface';
	if (node.kind === 'action' && node.variant) return ACTOR_LABEL[node.variant] ?? KIND_LABEL.action;
	return KIND_LABEL[node.kind];
};
