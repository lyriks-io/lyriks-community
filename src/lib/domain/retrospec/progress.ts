import type { RetrospecMode } from './document';

/**
 * How far the AI got in a run, read from the specification itself, never from
 * a clock: each phase of the retro-spec playbook's order of work writes its
 * own sections, and a section whose revision moved since the run started has
 * been written by this run. The last phase is the final check the playbook ends
 * on (the completion audit), which only the audit ledger can tell.
 */

export interface RetrospecPhaseDef {
	readonly key: string;
	/** The label in repo mode. */
	readonly label: string;
	/** The label when the run reads documentation, when it differs. */
	readonly docsLabel?: string;
	/** The public sections the phase writes; empty for the final check. */
	readonly sections: readonly string[];
	/**
	 * What a phase the AI comes back to several times is made of, each read on
	 * its own: one section, or the behaviour the features received (actions and
	 * the rules every action carries). The phase is as far as its parts.
	 */
	readonly parts?: readonly RetrospecPartDef[];
}

export interface RetrospecPartDef {
	readonly key: string;
	readonly label: string;
	/** The section the part writes; absent for the features' behaviour. */
	readonly section?: string;
}

/** In the order the lyriks-retrospec playbook works (its "Order of work"). */
export const RETROSPEC_PHASES: readonly RetrospecPhaseDef[] = [
	{
		key: 'sources',
		label: 'Reading the code',
		docsLabel: 'Reading your documentation',
		sections: ['documents', 'scope'],
		parts: [
			{ key: 'documents', label: 'Sources', section: 'documents' },
			{ key: 'scope', label: 'Capabilities', section: 'scope' }
		]
	},
	{
		key: 'product',
		label: 'Product and users',
		sections: ['foundation', 'users'],
		parts: [
			{ key: 'foundation', label: 'Product', section: 'foundation' },
			{ key: 'users', label: 'Users and roles', section: 'users' }
		]
	},
	{
		key: 'features',
		label: 'Features, actions and rules',
		sections: ['features'],
		parts: [
			{ key: 'features', label: 'Features', section: 'features' },
			{ key: 'actions', label: 'Actions' },
			{ key: 'rules', label: 'Rules' }
		]
	},
	{ key: 'data', label: 'Data model', sections: ['data'] },
	{ key: 'experience', label: 'Experience and design', sections: ['experience'] },
	{
		key: 'rules',
		label: 'Business rules',
		sections: ['rules', 'glossary'],
		parts: [
			{ key: 'edge-cases', label: 'Edge cases', section: 'rules' },
			{ key: 'glossary', label: 'Glossary', section: 'glossary' }
		]
	},
	{ key: 'tech', label: 'Tech stack', sections: ['architecture'] },
	{ key: 'check', label: 'Final check', sections: [] }
];

/** Every section a run writes, the ones its baseline records. */
export const RETROSPEC_SECTIONS: readonly string[] = RETROSPEC_PHASES.flatMap((p) => p.sections);

/**
 * The revision of a public section, summed over the keys it is stored under: a
 * section saved in slices (`foundation.identity`, `foundation.operations`) moves
 * when any slice does. Revisions only grow, so a sum compares like one.
 */
export function sectionRevision(revisions: Readonly<Record<string, number>>, section: string): number {
	let total = 0;
	for (const [key, value] of Object.entries(revisions)) {
		if (key === section || key.startsWith(`${section}.`)) total += value;
	}
	return total;
}

/** The revision of every section a run writes, as a baseline records them. */
export function retrospecBaseline(revisions: Readonly<Record<string, number>>): Record<string, number> {
	return Object.fromEntries(RETROSPEC_SECTIONS.map((s) => [s, sectionRevision(revisions, s)]));
}

/** The sections this run wrote: their revision moved past the baseline. */
export function writtenSections(
	revisions: Readonly<Record<string, number>>,
	baseline: Readonly<Record<string, number>>
): Set<string> {
	return new Set(RETROSPEC_SECTIONS.filter((s) => sectionRevision(revisions, s) > (baseline[s] ?? 0)));
}

/**
 * done: complete, a green check means nothing is left to write; current: the
 * AI is on it now; started: partly written, the AI moved on and will come back;
 * pending: not reached yet.
 */
export type PhaseState = 'done' | 'current' | 'started' | 'pending';

export interface PartProgress {
	readonly key: string;
	readonly label: string;
	readonly share: number;
	readonly state: Exclude<PhaseState, 'current'>;
}

export interface PhaseProgress {
	readonly key: string;
	readonly label: string;
	/** 0 to 1: the share of the phase's sections this run wrote. */
	readonly share: number;
	readonly state: PhaseState;
	/** The parts of a phase written in several passes, empty for the others. */
	readonly parts: readonly PartProgress[];
}

const partState = (share: number): PartProgress['state'] => (share >= 1 ? 'done' : share > 0 ? 'started' : 'pending');

export interface RunProgressInput {
	readonly revisions: Readonly<Record<string, number>>;
	readonly baseline: Readonly<Record<string, number>>;
	/** The final check ran since the run started. */
	readonly checked: boolean;
	readonly mode: RetrospecMode;
	/** The section the AI wrote last, when the page saw it: its phase reads as the one in progress. */
	readonly lastWritten?: string | null;
	/**
	 * The leaf features and how many of them received their behaviour during
	 * the run: the features phase is half the tree, half what the features do.
	 */
	readonly behavior?: { readonly authored: number; readonly leaves: number };
}

export interface RunProgress {
	readonly phases: readonly PhaseProgress[];
	/** 0 to 100, from the phases alone. */
	readonly pct: number;
	/** Anything written since the run started. */
	readonly started: boolean;
}

const sectionOf = (key: string) => key.split('.')[0];

export function runProgress(input: RunProgressInput): RunProgress {
	const written = writtenSections(input.revisions, input.baseline);
	const behaviorShare = input.behavior && input.behavior.leaves > 0 ? Math.min(1, input.behavior.authored / input.behavior.leaves) : null;
	// A part is its section written, or the share of leaves whose behaviour is written (none known: the tree alone says).
	const partShare = (part: RetrospecPartDef): number | null =>
		part.section ? (written.has(part.section) ? 1 : 0) : behaviorShare;
	const partsOf = RETROSPEC_PHASES.map((p) =>
		(p.parts ?? []).flatMap((part) => {
			const share = partShare(part);
			return share === null ? [] : [{ key: part.key, label: part.label, share, state: partState(share) }];
		})
	);
	const shares = RETROSPEC_PHASES.map((p, i) => {
		if (p.sections.length === 0) return input.checked ? 1 : 0;
		const parts = partsOf[i];
		if (parts.length > 0) return parts.reduce((sum, part) => sum + part.share, 0) / parts.length;
		return p.sections.filter((s) => written.has(s)).length / p.sections.length;
	});
	const last = input.lastWritten ? sectionOf(input.lastWritten) : null;
	const lastPhase = last ? RETROSPEC_PHASES.findIndex((p) => p.sections.includes(last)) : -1;
	// One phase reads in progress: the one the AI wrote last, else the first one
	// it started without finishing, else the first one it has not reached.
	let current = -1;
	if (!input.checked) {
		if (lastPhase >= 0 && shares[lastPhase] < 1) current = lastPhase;
		if (current < 0) current = shares.findIndex((s) => s > 0 && s < 1);
		if (current < 0) current = shares.findIndex((s) => s < 1);
	}
	const phases = RETROSPEC_PHASES.map((p, i): PhaseProgress => ({
		key: p.key,
		label: input.mode === 'docs' && p.docsLabel ? p.docsLabel : p.label,
		share: shares[i],
		state: shares[i] >= 1 ? 'done' : i === current ? 'current' : shares[i] > 0 ? 'started' : 'pending',
		parts: partsOf[i]
	}));
	const pct = input.checked ? 100 : Math.round((100 * shares.reduce((a, b) => a + b, 0)) / shares.length);
	return { phases, pct, started: written.size > 0 || input.checked };
}

/** The final check ran during the run: an audit or a completion entry dated at or after its start. */
export function checkedSince(auditTimes: readonly string[], since: string | null): boolean {
	if (since === null) return auditTimes.length > 0;
	return auditTimes.some((at) => at >= since);
}
