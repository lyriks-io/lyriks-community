import type { PillTab } from '$ui/design-system';
import type { BoardView } from './deep-link';

/** The Tech & Data tabs, drawn by the page in its sticky header. The Data map
 * replaces the Infra map, Data model and Data inventory tabs: their old links
 * land on it (see `toBoardView`). */
export const BOARD_TABS: readonly (PillTab & { id: BoardView })[] = [
	{ id: 'map', label: 'Data map', desc: 'Tables, machines & visibility' },
	{ id: 'stack', label: 'Stack', desc: 'Technologies by repository and layer' },
	{ id: 'requirements', label: 'Requirements', desc: 'Runtime, security, compliance & constraints' }
	// The Knowledge graph explorer is hidden for now: the tab and its loader stay
	// in place (still reachable via ?tab=graph), just no longer surfaced here.
	// The graph itself keeps serving search, impact and coherence.
	// { id: 'graph', label: 'Knowledge graph', desc: 'Every context, one graph' }
];
