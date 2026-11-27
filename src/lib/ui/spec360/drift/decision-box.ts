import type { ValidateControl } from '$ui/evolution/BlockControls.svelte';
import { initials } from '$ui/team/team-style';

/**
 * A decision of Mismatch drawn as the boxes of Knowledge (criteria f56c25b5, 67bde8ab, c53c0474, 857f69d4): one
 * decision per change, so one box. Undecided, it is the reader's own YOU box, which decides after its confirmation;
 * decided, it is the green box of who decided, which a project editor's click takes back after its confirmation.
 */
export interface Ask {
	readonly question: string;
	readonly act: string;
}

/** The reader's own box on a change nobody decided: the one way to validate (or accept) it. */
export function ownDecisionBox(run: () => void, confirm: Ask, tip?: string): ValidateControl {
	return {
		look: 'grey',
		title: 'Validate this change',
		validateTip: tip,
		run,
		stamps: [{ id: 'own', initials: 'YOU', title: 'You', ok: false, me: true, name: 'You', confirm }],
		settled: false
	};
}

/**
 * The green box of who decided, YOU when it was the reader. With `takeBack` (a project editor, before the writing),
 * a click asks `confirm` and takes the decision back; without it the box only says who decided.
 */
export function decidedBox(by: string, reader: string | null, takeBack: (() => void) | null, confirm: Ask, done = 'validated'): ValidateControl {
	const mine = by === 'You' || (!!reader && by === reader);
	const who = mine ? 'You' : by;
	return {
		look: 'done',
		title: takeBack ? `${who} ${done} this · click to take it back` : `${who} · ${done}`,
		run: takeBack,
		withdraws: !!takeBack,
		withdrawConfirm: confirm,
		stamps: [{ id: 'decided', initials: mine ? 'YOU' : initials(by), title: `${who} · ${done}`, ok: true, me: !!takeBack, name: who }],
		settled: true
	};
}
