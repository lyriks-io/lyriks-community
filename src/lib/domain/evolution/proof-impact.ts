import {
	NBSP,
	numberText,
	quoteName,
	truthText,
	type SpecLanguage
} from '$domain/language';

/**
 * What a draft does to the proofs of its feature: the solver proves the feature
 * as it stands and as the draft would leave it, and only the difference is kept.
 * Computed, never judged: nothing here decides whether the change is good.
 */
export interface ProofOutcomeChange {
	readonly id: string;
	readonly name: string;
	/** Absent when the element exists on one side only. */
	readonly before?: string;
	readonly after?: string;
}

export interface ProofFindingChange {
	readonly kind: string;
	readonly severity: string;
	/** What the finding is about: a statement, a goal, an action. */
	readonly on: string;
	readonly detail: string;
	/** For a path from the start: each action taken, in order, with the values it got. */
	readonly path?: readonly ProofPathStep[];
}

export interface ProofPathStep {
	readonly actionName: string;
	readonly featureName?: string;
	readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ProofScenarioChange {
	readonly actionName: string;
	readonly scenarioName: string;
	readonly before?: 'pass' | 'fail';
	readonly after?: 'pass' | 'fail';
	readonly reason?: string;
}

/** What a change does to the proofs of one feature: the difference only. */
export interface ProofChanges {
	readonly proven: { readonly before: boolean; readonly after: boolean; readonly reason?: string };
	readonly statements: readonly ProofOutcomeChange[];
	readonly actions: readonly ProofOutcomeChange[];
	readonly goals: readonly ProofOutcomeChange[];
	readonly deadlocks?: { readonly before?: string; readonly after?: string; readonly path?: readonly string[] };
	readonly findingsAppeared: readonly ProofFindingChange[];
	readonly findingsResolved: readonly ProofFindingChange[];
	readonly scenarios: readonly ProofScenarioChange[];
	readonly unchanged: boolean;
}

/** Another feature of the project whose proofs the change moves. */
export interface DependentProofImpact extends ProofChanges {
	readonly featureId: string;
	readonly featureName: string;
}

/**
 * A feature the solver proved for the change: the changed one, or one that
 * declares a state an action the change adds, removes or alters writes. A
 * feature outside the scope cannot move, since a proof only crosses the
 * actions writing its own states.
 */
export interface ProofScopeEntry {
	readonly featureId: string;
	readonly featureName: string;
	readonly reason: 'changed' | 'declares-a-written-state';
	readonly states?: readonly string[];
}

export interface DraftProofImpact extends ProofChanges {
	readonly draftId: string;
	readonly draftName: string;
	readonly ranAt: string;
	/** Set when the draft could not be compared (no behaviour model, engine down or refusing). */
	readonly unavailable?: string;
	/** Every feature proved; absent on a comparison made before the scope was computed. */
	readonly scope?: readonly ProofScopeEntry[];
	/** The other features of the scope whose proofs or scenarios move. `unchanged` covers them too. */
	readonly dependents?: readonly DependentProofImpact[];
}

/** A name the model carries, quoted verbatim: straight quotes in English, guillemets in French. */
const q = (name: string, lang: SpecLanguage): string =>
	lang === 'fr' ? quoteName('fr', name) : `"${name}"`;

/** French keeps an unbreakable space before a colon. */
const COLON = `${NBSP}:`;

const plainValue = (v: unknown, lang: SpecLanguage): string => {
	if (lang === 'fr') {
		if (typeof v === 'string') return q(v, lang);
		if (typeof v === 'boolean') return truthText('fr', v);
		if (typeof v === 'number') return numberText('fr', v);
		if (v === null || v === undefined) return 'aucune valeur';
		return JSON.stringify(v);
	}
	return typeof v === 'string'
		? q(v, lang)
		: typeof v === 'boolean'
			? v
				? 'yes'
				: 'no'
			: typeof v === 'object' && v !== null
				? JSON.stringify(v)
				: String(v);
};

/** The values a step gets, in French: « name » à value, the last one joined by "et". */
function frenchValues(parameters: Readonly<Record<string, unknown>>): string {
	const values = Object.entries(parameters)
		.filter(([name]) => name !== '$channel')
		.map(([name, v]) => `${q(name, 'fr')} à ${plainValue(v, 'fr')}`);
	return values.length <= 1
		? (values[0] ?? '')
		: `${values.slice(0, -1).join(', ')} et ${values.at(-1)}`;
}

/**
 * Reasons the engine and the platform give in English, as French says them.
 * An unknown one is not shown: it only exists in English.
 */
const FRENCH_REASONS: Readonly<Record<string, string>> = {
	'the behavior engine is unreachable': 'le moteur de comportement est injoignable',
	'z3-solver is missing': "le solveur Z3 n'est pas installé",
	'the solver did not start': "le solveur n'a pas démarré"
};

/** Why a draft could not be compared, in French. */
const frenchUnavailable = (reason: string): string =>
	FRENCH_REASONS[reason] ??
	"le moteur n'a pas pu comparer le brouillon (sa raison n'existe qu'en anglais)";

/** Why a side could not be proven, in French, from "before/after the change: <reason>, so nothing was proven". */
function frenchUnproven(reason: string | undefined): string {
	const side = /^(before|after) the change: (.*?)(?:, so nothing was proven)?$/.exec(reason ?? '');
	if (!side) return "le solveur n'a pas pu prouver l'un des deux côtés";
	const when = side[1] === 'before' ? 'avant' : 'après';
	const why = FRENCH_REASONS[side[2] ?? ''];
	return why
		? `${when} le changement, ${why}, donc rien n'a été prouvé`
		: `${when} le changement, le solveur n'a rien prouvé (sa raison n'existe qu'en anglais)`;
}

/**
 * A path the solver found, written for someone who has never seen the model:
 * each action a person takes, in order, with the values used. The channel a
 * call arrives through is left out: it is plumbing, not something a person does.
 */
export function exampleSteps(path: readonly ProofPathStep[], lang: SpecLanguage = 'en'): string[] {
	return path.map((step) => {
		if (lang === 'fr') {
			const where = step.featureName ? ` (dans ${q(step.featureName, lang)})` : '';
			const values = frenchValues(step.parameters);
			return `Quelqu'un exécute ${q(step.actionName, lang)}${where}${values ? `, avec ${values}` : ''}`;
		}
		const values = Object.entries(step.parameters)
			.filter(([name]) => name !== '$channel')
			.map(([name, v]) => `${name} ${plainValue(v, lang)}`);
		const where = step.featureName ? ` (in ${step.featureName})` : '';
		return `Someone does "${step.actionName}"${where}${values.length ? `, with ${values.join(', ')}` : ''}`;
	});
}

const broken = (c: ProofOutcomeChange) => c.after === 'violated' && c.before !== 'violated';
// Repaired only when the check after the change settled it: an open question is no repair.
const repaired = (c: ProofOutcomeChange) => c.before === 'violated' && c.after === 'none-within-bound';
const open = (outcome?: string) => outcome === 'unsettled' || outcome === 'unsupported';
const quote = (names: readonly string[], lang: SpecLanguage = 'en') =>
	lang === 'fr'
		? names.length <= 2
			? names.map((n) => q(n, lang)).join(' et ')
			: `${q(names[0]!, lang)} et ${names.length - 1} autre${names.length - 1 === 1 ? '' : 's'}`
		: names.length <= 2
			? names.map((n) => `"${n}"`).join(' and ')
			: `"${names[0]}" and ${names.length - 1} more`;

const plural = (n: number) => (n === 1 ? '' : 's');

/**
 * The one line a person reads without the spec open: nothing changes, or what
 * breaks first, then what it repairs. A side the solver could not prove is said
 * so, never read as "nothing changes". `lang` is the language the project declares.
 */
/** What moves in one feature, as the parts of a headline. */
function headlineParts(impact: ProofChanges, lang: SpecLanguage): string[] {
	const fr = lang === 'fr';
	const breaks = impact.statements.filter(broken).map((c) => c.name);
	const stops = impact.scenarios.filter((s) => s.before === 'pass' && s.after === 'fail').map((s) => s.scenarioName);
	const repairs = impact.statements.filter(repaired).map((c) => c.name);
	const deadEnd = impact.deadlocks?.after === 'found' && impact.deadlocks.before === 'none-within-bound';
	const added = impact.findingsAppeared.length;
	const removed = impact.findingsResolved.length;
	return (
		fr
			? [
					breaks.length > 0 ? `enfreint ${quote(breaks, lang)}` : '',
					stops.length > 0 ? `fait échouer le scénario ${quote(stops, lang)}` : '',
					deadEnd ? 'crée une impasse' : '',
					added > 0 && breaks.length === 0 ? `ajoute ${added} défaut${plural(added)}` : '',
					repairs.length > 0 ? `répare ${quote(repairs, lang)}` : '',
					removed > 0 && repairs.length === 0 ? `supprime ${removed} défaut${plural(removed)}` : ''
				]
			: [
					breaks.length > 0 ? `breaks ${quote(breaks)}` : '',
					stops.length > 0 ? `stops scenario ${quote(stops)}` : '',
					deadEnd ? 'creates a dead end' : '',
					added > 0 && breaks.length === 0 ? `adds ${added} flaw${plural(added)}` : '',
					repairs.length > 0 ? `repairs ${quote(repairs)}` : '',
					removed > 0 && repairs.length === 0 ? `removes ${removed} flaw${plural(removed)}` : ''
				]
	).filter(Boolean);
}

/**
 * The one line a person reads without the spec open: nothing changes, or what
 * breaks first, then what it repairs, in the changed feature and then in each
 * other feature the change reaches. A side the solver could not prove is said
 * so, never read as "nothing changes". `lang` is the language the project declares.
 */
export function proofImpactHeadline(impact: DraftProofImpact, lang: SpecLanguage = 'en'): string {
	const fr = lang === 'fr';
	if (impact.unavailable)
		return fr
			? `Non comparé${COLON} ${frenchUnavailable(impact.unavailable)}.`
			: `Not compared: ${impact.unavailable}.`;
	if (!impact.proven.before || !impact.proven.after) {
		return fr
			? `Non prouvé${COLON} ${frenchUnproven(impact.proven.reason)}.`
			: `Not proven: ${impact.proven.reason ?? 'the solver could not prove one side'}.`;
	}
	if (impact.unchanged) return fr ? 'Rien de ce que prouve le solveur ne change.' : 'Nothing the solver proves changes.';
	const parts = [
		...headlineParts(impact, lang),
		...(impact.dependents ?? []).flatMap((d) =>
			headlineParts(d, lang).map((part) => (fr ? `${part} dans ${q(d.featureName, lang)}` : `${part} in "${d.featureName}"`))
		)
	];
	if (parts.length === 0) {
		return fr
			? 'Ce que prouve le solveur bouge, sans rien enfreindre ni rien réparer.'
			: 'What the solver proves moves, without breaking or repairing anything.';
	}
	const line = parts.join(', ');
	return fr ? `Le changement ${line}.` : `The change ${line}.`;
}

/**
 * The other features the solver proved for the change, and why each one was:
 * it declares a state the change writes. Null when the change reaches none.
 */
export function proofImpactScope(impact: DraftProofImpact, lang: SpecLanguage = 'en'): string | null {
	const reached = (impact.scope ?? []).filter((entry) => entry.reason === 'declares-a-written-state');
	if (reached.length === 0) return null;
	const fr = lang === 'fr';
	const named = reached.map((entry) => {
		const states = (entry.states ?? []).join(', ');
		return `${q(entry.featureName, lang)}${states ? ` (${states})` : ''}`;
	});
	return fr
		? `Également prouvée${reached.length > 1 ? 's' : ''}, car le changement écrit ce qu'elle${reached.length > 1 ? 's' : ''} déclare${reached.length > 1 ? 'nt' : ''}${COLON} ${named.join(', ')}.`
		: `Also proved, since the change writes what ${reached.length > 1 ? 'they declare' : 'it declares'}: ${named.join(', ')}.`;
}

/** One consequence of a change, in plain words; `example` is how it happens, step by step. */
export interface ProofImpactLine {
	/** `open`: the check could not be settled on one side, so nothing is claimed either way. */
	readonly tone: 'worse' | 'better' | 'open';
	readonly text: string;
	readonly example?: readonly string[];
}

const FLAW_WORDS: Readonly<Record<SpecLanguage, Readonly<Record<string, string>>>> = {
	en: {
		'dead-rule': 'a rule that can never apply any more',
		'shadowed-rule': 'a rule hidden by an earlier one',
		'always-blocked': 'an action refused every time',
		'impossible-invariant': 'a guarantee nothing can satisfy',
		'impossible-goal': 'a goal nothing can reach',
		'reachable-deadlock': 'a dead end',
		'unreachable-action': 'an action that can never happen',
		'unmet-goal': 'a goal that can never be reached'
	},
	fr: {
		'dead-rule': "une règle qui ne peut plus jamais s'appliquer",
		'shadowed-rule': 'une règle masquée par une règle antérieure',
		'always-blocked': 'une action refusée à chaque fois',
		'impossible-invariant': 'une garantie que rien ne peut satisfaire',
		'impossible-goal': 'un objectif que rien ne peut atteindre',
		'reachable-deadlock': 'une impasse',
		'unreachable-action': 'une action qui ne peut jamais avoir lieu',
		'unmet-goal': 'un objectif qui ne peut jamais être atteint'
	}
};

/**
 * A French flaw that appears, the adjective agreeing with its noun: "une
 * règle ..." reads "Nouvelle règle ...", "un objectif ..." reads "Nouvel
 * objectif ...".
 */
function frenchNew(words: string): string {
	const feminine = words.startsWith('une ');
	const noun = words.replace(/^une? /, '');
	const adjective = feminine ? 'Nouvelle' : /^[aeiouhéèê]/i.test(noun) ? 'Nouvel' : 'Nouveau';
	return `${adjective} ${noun}`;
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Why a scenario moved, without the engine's status words. */
function scenarioReason(c: ProofScenarioChange, lang: SpecLanguage): string {
	const reason = c.reason ?? '';
	const fr = lang === 'fr';
	if (/status was success but expected blocked/.test(reason)) {
		return fr ? 'il passe désormais là où il devrait être refusé' : 'it now goes through where it should be refused';
	}
	if (/status was blocked but expected success/.test(reason)) {
		return fr ? 'il est désormais refusé là où il devrait passer' : 'it is now refused where it should go through';
	}
	if (c.after === 'fail') return fr ? 'il ne se termine plus comme il le devrait' : 'it no longer ends the way it should';
	return fr ? 'il se termine désormais comme il le devrait' : 'it now ends the way it should';
}

const reached = (outcome?: string) => outcome === 'reached';
const closed = (outcome?: string) => outcome === 'none-within-bound';

/** Every sentence of the lines, per language; names arrive unquoted. */
const LINE_WORDS = {
	en: {
		breakableUnsettled: (n: string) => `"${n}" can be broken (whether it could before the change was not settled).`,
		breakable: (n: string) => `"${n}" can now be broken.`,
		stillBreakableOpen: (n: string) => `"${n}": whether it can still be broken could not be settled after the change.`,
		repaired: (n: string, withPath: boolean) =>
			`"${n}" can no longer be broken.${withPath ? ' Before the change, it broke like this:' : ''}`,
		scenarioFails: (s: string, a: string, why: string) => `The example "${s}" (${a}) no longer holds: ${why}.`,
		scenarioHolds: (s: string, a: string) => `The example "${s}" (${a}) holds again.`,
		actionClosed: (n: string) => `"${n}" can no longer happen.`,
		actionOpened: (n: string) => `"${n}" can now happen.`,
		goalClosed: (n: string) => `The goal "${n}" can no longer be reached.`,
		goalOpened: (n: string) => `The goal "${n}" can now be reached.`,
		deadUnchecked: (after: boolean) =>
			`Dead ends could not be checked ${after ? 'after' : 'before'} the change, so nothing is said about them.`,
		deadAppears: 'A dead end appears: after this, nothing more can be done.',
		deadStep: (n: string) => `Someone does "${n}"`,
		deadGone: 'The dead end is gone: something can always be done next.',
		flawNew: (words: string, on: string) => `New: ${words} (${on}).`,
		flawGone: (words: string, on: string) => `Gone: ${words} (${on}).`,
		inFeature: (feature: string, text: string) => `In "${feature}": ${text}`,
		dependentUnproven: (feature: string) =>
			`"${feature}" could not be proven on both sides, so nothing is said about it.`
	},
	fr: {
		breakableUnsettled: (n: string) =>
			`L'énoncé ${q(n, 'fr')} peut être enfreint (on n'a pas pu établir s'il pouvait l'être avant le changement).`,
		breakable: (n: string) => `L'énoncé ${q(n, 'fr')} peut désormais être enfreint.`,
		stillBreakableOpen: (n: string) =>
			`L'énoncé ${q(n, 'fr')}${COLON} on n'a pas pu établir, après le changement, s'il peut encore être enfreint.`,
		repaired: (n: string, withPath: boolean) =>
			`L'énoncé ${q(n, 'fr')} ne peut plus être enfreint.${withPath ? ` Avant le changement, il était enfreint ainsi${COLON}` : ''}`,
		scenarioFails: (s: string, a: string, why: string) =>
			`L'exemple ${q(s, 'fr')} (${q(a, 'fr')}) ne tient plus${COLON} ${why}.`,
		scenarioHolds: (s: string, a: string) =>
			`L'exemple ${q(s, 'fr')} (${q(a, 'fr')}) tient de nouveau.`,
		actionClosed: (n: string) => `L'action ${q(n, 'fr')} ne peut plus avoir lieu.`,
		actionOpened: (n: string) => `L'action ${q(n, 'fr')} peut désormais avoir lieu.`,
		goalClosed: (n: string) => `L'objectif ${q(n, 'fr')} ne peut plus être atteint.`,
		goalOpened: (n: string) => `L'objectif ${q(n, 'fr')} peut désormais être atteint.`,
		deadUnchecked: (after: boolean) =>
			`Les impasses n'ont pas pu être vérifiées ${after ? 'après' : 'avant'} le changement${COLON} rien n'est donc affirmé à leur sujet.`,
		deadAppears: `Une impasse apparaît${COLON} après cela, plus rien ne peut être fait.`,
		deadStep: (n: string) => `Quelqu'un exécute ${q(n, 'fr')}`,
		deadGone: `L'impasse a disparu${COLON} il reste toujours quelque chose à faire ensuite.`,
		flawNew: (words: string, on: string) => `${frenchNew(words)} (${q(on, 'fr')}).`,
		flawGone: (words: string, on: string) => `${capitalised(words)} a disparu (${q(on, 'fr')}).`,
		inFeature: (feature: string, text: string) => `Dans ${q(feature, 'fr')}${COLON} ${text}`,
		dependentUnproven: (feature: string) =>
			`${q(feature, 'fr')} n'a pas pu être prouvée des deux côtés${COLON} rien n'est donc affirmé à son sujet.`
	}
} as const;

/** The flaws said once each in words: broken statements, dead ends, unreachable actions and goals have their own lines. */
const SAID_IN_WORDS = (kind: string) =>
	kind in FLAW_WORDS.en &&
	kind !== 'reachable-violation' &&
	kind !== 'reachable-deadlock' &&
	kind !== 'unreachable-action' &&
	kind !== 'unmet-goal';

/**
 * Every consequence of a draft on the proofs, worse first, each in one plain
 * sentence a person reads without the spec open. What the solver could not
 * settle is left to the headline, never read as a consequence.
 */
export function proofImpactLines(impact: DraftProofImpact, lang: SpecLanguage = 'en'): ProofImpactLine[] {
	if (impact.unavailable || !impact.proven.before || !impact.proven.after) return [];
	const w = LINE_WORDS[lang];
	const own = linesOf(impact, lang);
	const elsewhere = (impact.dependents ?? []).flatMap((d): ProofImpactLine[] =>
		!d.proven.before || !d.proven.after
			? [{ tone: 'open', text: w.dependentUnproven(d.featureName) }]
			: linesOf(d, lang).map((line) => ({ ...line, text: w.inFeature(d.featureName, line.text) }))
	);
	const tone = (t: ProofImpactLine['tone']) => [...own, ...elsewhere].filter((line) => line.tone === t);
	return [...tone('worse'), ...tone('better'), ...tone('open')];
}

function linesOf(impact: ProofChanges, lang: SpecLanguage): ProofImpactLine[] {
	const w = LINE_WORDS[lang];
	const pathOf = (findings: readonly ProofFindingChange[], on: string) =>
		findings.find((f) => f.kind === 'reachable-violation' && f.on === on)?.path;
	const worse: ProofImpactLine[] = [];
	const better: ProofImpactLine[] = [];
	const unknown: ProofImpactLine[] = [];
	for (const c of impact.statements) {
		if (broken(c)) {
			const path = pathOf(impact.findingsAppeared, c.name);
			worse.push({
				tone: 'worse',
				text: open(c.before) ? w.breakableUnsettled(c.name) : w.breakable(c.name),
				...(path?.length ? { example: exampleSteps(path, lang) } : {})
			});
		} else if (c.before === 'violated' && open(c.after)) {
			unknown.push({ tone: 'open', text: w.stillBreakableOpen(c.name) });
		} else if (repaired(c)) {
			const path = pathOf(impact.findingsResolved, c.name);
			better.push({
				tone: 'better',
				text: w.repaired(c.name, Boolean(path?.length)),
				...(path?.length ? { example: exampleSteps(path, lang) } : {})
			});
		}
	}
	for (const s of impact.scenarios) {
		if (s.before === 'pass' && s.after === 'fail') {
			worse.push({ tone: 'worse', text: w.scenarioFails(s.scenarioName, s.actionName, scenarioReason(s, lang)) });
		} else if (s.before === 'fail' && s.after === 'pass') {
			better.push({ tone: 'better', text: w.scenarioHolds(s.scenarioName, s.actionName) });
		}
	}
	for (const a of impact.actions) {
		if (reached(a.before) && closed(a.after)) worse.push({ tone: 'worse', text: w.actionClosed(a.name) });
		else if (closed(a.before) && reached(a.after)) better.push({ tone: 'better', text: w.actionOpened(a.name) });
	}
	for (const g of impact.goals) {
		if (reached(g.before) && closed(g.after)) worse.push({ tone: 'worse', text: w.goalClosed(g.name) });
		else if (closed(g.before) && reached(g.after)) better.push({ tone: 'better', text: w.goalOpened(g.name) });
	}
	const dead = impact.deadlocks;
	if (dead && (open(dead.before) || open(dead.after)) && dead.before !== dead.after) {
		unknown.push({ tone: 'open', text: w.deadUnchecked(open(dead.after)) });
	} else if (dead?.after === 'found' && dead.before === 'none-within-bound') {
		worse.push({
			tone: 'worse',
			text: w.deadAppears,
			...(dead.path?.length ? { example: dead.path.map(w.deadStep) } : {})
		});
	} else if (dead?.before === 'found' && dead.after === 'none-within-bound') {
		better.push({ tone: 'better', text: w.deadGone });
	}
	// Other flaws: said once each, in words, the broken statements being above.
	for (const f of impact.findingsAppeared) {
		if (SAID_IN_WORDS(f.kind)) worse.push({ tone: 'worse', text: w.flawNew(FLAW_WORDS[lang][f.kind]!, f.on) });
	}
	for (const f of impact.findingsResolved) {
		if (SAID_IN_WORDS(f.kind)) better.push({ tone: 'better', text: w.flawGone(FLAW_WORDS[lang][f.kind]!, f.on) });
	}
	return [...worse, ...better, ...unknown];
}
