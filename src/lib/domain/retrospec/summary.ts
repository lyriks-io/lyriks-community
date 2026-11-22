import type { ExtractedElement } from '../documents';
import { uncitedElements } from '../documents';
import type { RetrospecSpec, SpecCounts } from './reading';

/**
 * The summary a person reads once the AI is done, and the lines the analysis
 * shows while it runs: what was rebuilt, how much of it is traced, the note
 * that tells what was taken from the code and what was guessed. Every figure is
 * a count of the specification as it stands. Pure.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const noun = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const share = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);

/** The note line under each phase of the analysis, once the phase has something to show. */
export function phaseNotes(counts: SpecCounts): Record<string, string> {
	const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
	return {
		sources: join(counts.sources > 0 ? plural(counts.sources, 'source') : '', counts.capabilities > 0 ? plural(counts.capabilities, 'capability', 'capabilities') : ''),
		product: counts.roles > 0 ? plural(counts.roles, 'role') : '',
		features: join(counts.features > 0 ? plural(counts.features, 'feature') : '', counts.actions > 0 ? plural(counts.actions, 'action') : ''),
		data: counts.entities > 0 ? plural(counts.entities, 'entity', 'entities') : '',
		experience: join(counts.screens > 0 ? plural(counts.screens, 'screen') : '', counts.journeys > 0 ? plural(counts.journeys, 'journey') : ''),
		rules: join(counts.scenarios > 0 ? plural(counts.scenarios, 'scenario') : '', counts.terms > 0 ? plural(counts.terms, 'term') : ''),
		tech: counts.technologies > 0 ? plural(counts.technologies, 'technology', 'technologies') : '',
		check: ''
	};
}

/** What each part of a phase written in several passes holds so far, by part key. */
export function partNotes(counts: SpecCounts): Record<string, string> {
	return {
		documents: counts.sources > 0 ? plural(counts.sources, 'source') : '',
		scope: counts.capabilities > 0 ? plural(counts.capabilities, 'capability', 'capabilities') : '',
		foundation: '',
		users: counts.roles > 0 ? plural(counts.roles, 'role') : '',
		features: counts.features > 0 ? plural(counts.features, 'feature') : '',
		actions: counts.actions > 0 ? plural(counts.actions, 'action') : '',
		rules: counts.rules > 0 ? plural(counts.rules, 'rule') : '',
		'edge-cases': counts.scenarios > 0 ? plural(counts.scenarios, 'scenario') : '',
		glossary: counts.terms > 0 ? plural(counts.terms, 'term') : ''
	};
}

/** The counters beside the analysis ("Found so far"). */
/** The headline figures of a retrospecification, read the same on its summary and on At a glance. */
export interface RetrospecFigures {
	/** It read documentation only, not code. */
	readonly docs: boolean;
	/** What it read and rebuilt (foundSoFar). */
	readonly found: readonly { readonly n: number; readonly label: string }[];
	/** The share of the spec the code index located in the code, null until it is synced. */
	readonly code: number | null;
	/** The share of what it read that cites its source, null when nothing does. */
	readonly traced: number | null;
}

export function foundSoFar(counts: SpecCounts): { n: number; label: string }[] {
	return [
		{ n: counts.sources, label: 'sources read' },
		{ n: counts.entities, label: 'entities' },
		{ n: counts.features, label: 'features' },
		{ n: counts.actions, label: 'actions' },
		{ n: counts.rules, label: 'rules' },
		{ n: counts.screens, label: 'screens' }
	];
}

/** How much of a zone is complete, when the specification can tell. */
export interface ZoneCoverage {
	readonly pct: number;
	/** What the percentage measures, in a few words. */
	readonly label: string;
}

export interface RebuiltTile {
	readonly n: number;
	readonly label: string;
	readonly coverage: ZoneCoverage | null;
}

/** "What Lyriks rebuilt": one tile per zone, its coverage where the specification measures one. */
export function rebuiltTiles(counts: SpecCounts, permissionCoveragePct: number | null): RebuiltTile[] {
	const cov = (pct: number | null, label: string): ZoneCoverage | null => (pct === null ? null : { pct, label });
	return [
		{ n: counts.cores, label: noun(counts.cores, 'core feature'), coverage: null },
		{ n: counts.features, label: noun(counts.features, 'feature'), coverage: cov(share(counts.featuresWithBehavior, counts.features), 'with actions') },
		{ n: counts.actions, label: noun(counts.actions, 'action'), coverage: null },
		{ n: counts.rules, label: noun(counts.rules, 'rule'), coverage: null },
		{ n: counts.screens, label: noun(counts.screens, 'screen'), coverage: cov(share(counts.stepsOnScreen, counts.steps), 'of steps on a screen') },
		{ n: counts.entities, label: noun(counts.entities, 'entity', 'entities'), coverage: cov(counts.entities > 1 ? share(counts.entities - counts.orphanTables, counts.entities) : null, 'related') },
		{ n: counts.roles, label: noun(counts.roles, 'role'), coverage: cov(permissionCoveragePct, 'of capabilities granted') }
	].filter((t) => t.n > 0);
}

/**
 * The elements a specification read from code extracted, each with the
 * sources it cites: the kinds the completeness audit checks (ac-src-extracted),
 * one list for the audit and the retrospecification's figures alike, a rule
 * Lyriks detected itself being a finding and not an extraction.
 */
export function extractedElements(spec: Pick<RetrospecSpec, 'features' | 'rules' | 'glossary' | 'users' | 'data'>): ExtractedElement[] {
	return [
		...spec.features.features.map((f) => ({ kind: 'feature' as const, name: f.name, sourceIds: spec.features.leafMeta?.[f.id]?.sourceIds })),
		...spec.rules.issues.filter((issue) => !issue.autoDetected).map((issue) => ({ kind: 'rule' as const, name: issue.title, sourceIds: issue.sourceIds })),
		...spec.rules.scenarios.map((edge) => ({ kind: 'edge_case' as const, name: edge.title, sourceIds: edge.sourceIds })),
		...spec.glossary.terms.map((term) => ({ kind: 'term' as const, name: term.term, sourceIds: term.sourceIds })),
		...spec.users.roles.map((role) => ({ kind: 'role' as const, name: role.name, sourceIds: role.sourceIds })),
		...spec.data.entities.map((table) => ({ kind: 'table' as const, name: table.name, sourceIds: table.sourceIds }))
	];
}

export interface TracedShare {
	readonly cited: number;
	readonly total: number;
	readonly pct: number | null;
}

/** How many extracted elements cite a source the register holds. */
export function tracedShare(spec: Pick<RetrospecSpec, 'features' | 'rules' | 'glossary' | 'users' | 'data' | 'documents'>): TracedShare {
	const elements = extractedElements(spec);
	const uncited = uncitedElements(elements, spec.documents.sources.map((s) => s.id)).length;
	const cited = elements.length - uncited;
	return { cited, total: elements.length, pct: share(cited, elements.length) };
}

/** How much of the specification the code index found in the code, summed over the features. */
export function codeCoverage(rows: readonly { readonly found: number; readonly expected: number }[]): { found: number; expected: number; pct: number | null } {
	const found = rows.reduce((n, r) => n + r.found, 0);
	const expected = rows.reduce((n, r) => n + r.expected, 0);
	return { found, expected, pct: share(found, expected) };
}

/** A line of the note, the tab it opens, and the reference it reads under. */
export interface RetroNoteLine {
	readonly ref: string;
	readonly text: string;
	readonly target: string;
}

/** The note from Lyriks and the person's AI, in the shape of the Evolution's editorial note. */
export interface RetroNote {
	readonly author: 'ai' | 'lyriks';
	readonly title: string;
	readonly takenLabel: string;
	readonly taken: readonly RetroNoteLine[];
	readonly suggestedLabel: string;
	readonly suggested: readonly RetroNoteLine[];
	readonly todo: readonly string[];
}

const line = (ref: string, text: string, target: string, when: boolean): RetroNoteLine[] => (when ? [{ ref, text, target }] : []);

/** The note above the summary: what came from the code, what the AI guessed, what to do now. */
export function summaryNote(counts: SpecCounts, productName: string): RetroNote {
	return {
		author: 'ai',
		title: `We rebuilt the specification of ${productName}.`,
		takenLabel: 'FROM THE CODE',
		taken: [
			...line('FT', `Rebuilt ${plural(counts.features, 'feature')} and ${plural(counts.actions, 'action')}.`, 'features', counts.features > 0),
			...line('DT', `Mapped ${plural(counts.entities, 'entity', 'entities')} and ${plural(counts.relations, 'relation')}.`, 'data', counts.entities > 0),
			...line('TC', 'Described the stack and architecture.', 'tech', counts.technologies > 0)
		],
		suggestedLabel: 'SUGGESTED BY YOUR AI · TO DOUBLE‑CHECK',
		suggested: [
			...line('FD', 'Guessed the purpose and users.', 'foundations', counts.roles > 0),
			...line('RG', `Flagged ${plural(counts.openIssues, 'rule')} it is unsure of.`, 'actions', counts.openIssues > 0),
			...line('EX', `Named ${plural(counts.journeys, 'user journey')}.`, 'experience', counts.journeys > 0)
		],
		todo: ['Start the validation, section by section.']
	};
}

/** What a failed check of the final audit means, in the words of the person who reads the summary. */
const UNCONFIRMED: Readonly<Record<string, string>> = {
	coherence: 'Project health: some rules Lyriks checked do not hold in every feature',
	behavior: 'Some features describe nothing a person can do',
	data: 'Some tables are not related to the rest, or not covered',
	experience: 'Some journeys do not pass the end-to-end check',
	sources: 'Some elements cite no source',
	scope: 'Some capabilities of the product are not resolved',
	mapping: 'Some capabilities map to no feature',
	sections: 'Some parts of the specification were not reviewed',
	audit: 'The final check is out of date'
};

/** A failed check of the final audit in plain words. */
export const unconfirmedReason = (key: string): string => UNCONFIRMED[key] ?? key;

export interface FinalCheckOutcome {
	readonly score: number;
	readonly blocking: number;
	/** What the final check could not confirm, one sentence per failed check. */
	readonly reasons: readonly string[];
	/** The keys of the checks that failed, in the audit's order. */
	readonly failedChecks: readonly string[];
}

/**
 * What the last final check of the run could not confirm, or null when it
 * confirmed everything (or never ran). A summary that shows only what was found
 * would read as complete; this is what tells the person it is not.
 */
export function finalCheckOutcome(
	auditLog: readonly { readonly performedAt: string; readonly score: number; readonly blockingIssues: number; readonly failedChecks: readonly string[] }[],
	since: string | null
): FinalCheckOutcome | null {
	const last = auditLog.find((entry) => since === null || entry.performedAt >= since);
	if (!last || last.blockingIssues === 0) return null;
	const reasons = last.failedChecks.map((key) => UNCONFIRMED[key] ?? key);
	return { score: last.score, blocking: last.blockingIssues, reasons: reasons.length > 0 ? reasons : ['Some checks did not pass'], failedChecks: [...last.failedChecks] };
}
