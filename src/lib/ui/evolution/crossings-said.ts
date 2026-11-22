import { VERIFICATION_CLOSED, versionFrozenToast } from '$domain/evolution';

/**
 * What the request page says of the crossings a computation settles (EVO-011):
 * what holds the freeze at the foot, the freeze offered to a person while
 * nothing froze, and the toast when the request moves on in an act.
 */

interface FootReading {
	readonly stage: string;
	readonly status: string;
	readonly gate: { readonly ok: boolean; readonly reason: string | null };
	readonly freezeHeld?: { readonly reason: string } | null;
}

/**
 * What holds the freeze, said at the foot (criterion c39cfe76): the gate's own
 * reason, or what only the freeze read after the last validation (a drafted
 * behaviour that no longer applies, the engine silent). Null once nothing holds it.
 */
export function freezeHolding(dossier: FootReading): string | null {
	if (dossier.status !== 'open' || dossier.stage !== 'coherence') return null;
	if (!dossier.gate.ok) return dossier.gate.reason;
	return dossier.freezeHeld ? `Nothing was frozen: ${dossier.freezeHeld.reason}` : null;
}

/** The way into the Build while the gate is met and nothing froze yet (criterion 195da3fa). */
export const freezeLabel = (specVersion: number): string => `Freeze version ${specVersion + 1} →`;

interface Standing {
	readonly stage: string;
	readonly specVersion: number;
}

/** What the page says when the request it reads moved on, and the step its toast offers to open. */
export interface StageMove {
	readonly message: string;
	readonly offer: 'development' | null;
}

/**
 * What the page says when the request it reads moved on, as the server said
 * it (criteria b84841c8, 21b6ca55): the toast, and the step it offers. The page
 * never moves the reader on its own (ac-evo-form-validate-next, criterion eca6943c).
 */
export function stageMoveNote(before: Standing, after: Standing): StageMove | null {
	if (before.stage === 'coherence' && after.stage === 'implementation') return { message: versionFrozenToast(after.specVersion), offer: 'development' };
	if (before.stage === 'implementation' && after.stage === 'acceptance') return { message: VERIFICATION_CLOSED, offer: null };
	return null;
}

/** The toast of a move: a link to the step it offers unless the reader already reads it; following it is the reader's act. */
export function stageMoveToast(move: StageMove, readerTab: string, open: (tab: 'development') => void) {
	const offer = move.offer;
	return {
		level: 'success' as const,
		message: move.message,
		...(offer && readerTab !== offer ? { action: { label: 'Open Implementation', run: () => open(offer) } } : {})
	};
}
