import {
	actionPhrase,
	featureProperNames,
	featureStatements
} from '$lib/unspa-schema/requirement-sentences';
import {
	NBSP,
	numberText,
	quoteName,
	truthText,
	type SpecLanguage
} from '$domain/language';
import type { SpecGap, SpecProof, SpecProofFinding, SpecProofStep, SpecProofStuckState } from '../ports';

/**
 * A flaw the solver proved, written for a person: the requirement it is about
 * as an EARS sentence, and the proof as a scenario (Given, When each step with
 * its inputs, Then what no longer holds). Blocking when the model breaks a
 * statement from the start or can never satisfy one; a warning otherwise,
 * since a dead end may be a final state and a dead rule a leftover.
 */
export interface ProvenFinding {
	/** Stable across reads of the same model: kind plus what it is about. */
	readonly key: string;
	readonly kind: string;
	readonly tone: 'blocking' | 'warning';
	/** A word or two for the chip: Broken, Impossible, Dead end... */
	readonly label: string;
	/** The requirement at stake, as an EARS sentence. */
	readonly requirement: string;
	readonly given: string;
	readonly when: readonly string[];
	readonly then: string;
	/** What to do about it, in one line. */
	readonly fix: string;
	/** The action it hangs off, when there is one (to deep-link or group). */
	readonly actionId?: string;
	/** The rule or statement it is about, when there is one (to place it on its row). */
	readonly ruleId?: string;
	readonly invariantId?: string;
}

const BLOCKING = new Set(['reachable-violation', 'impossible-invariant', 'impossible-goal']);

const LABELS: Record<SpecLanguage, Record<string, string>> = {
	en: {
		'reachable-violation': 'Broken',
		'impossible-invariant': 'Impossible',
		'impossible-goal': 'Impossible',
		'reachable-deadlock': 'Dead end',
		'unreachable-action': 'Not reached',
		'unmet-goal': 'Not reached',
		'always-blocked': 'Always refused',
		'dead-rule': 'Dead rule',
		'shadowed-rule': 'Hidden rule'
	},
	fr: {
		'reachable-violation': 'Enfreint',
		'impossible-invariant': 'Impossible',
		'impossible-goal': 'Impossible',
		'reachable-deadlock': 'Impasse',
		'unreachable-action': 'Non atteinte',
		'unmet-goal': 'Non atteint',
		'always-blocked': 'Toujours refusée',
		'dead-rule': 'Règle morte',
		'shadowed-rule': 'Règle masquée'
	}
};

const FIXES: Record<SpecLanguage, Record<string, string>> = {
	en: {
		'reachable-violation':
			'Refuse the last step in that case, or stop an earlier step from letting it through.',
		'impossible-invariant': 'Fix the statement: as written, no state satisfies it.',
		'impossible-goal': 'Fix the goal, or the statement that rules it out.',
		'reachable-deadlock': 'If this state is meant to be final, say so; otherwise let an action leave it.',
		'unreachable-action': 'Let an earlier action open its way, loosen its guard, or remove it.',
		'unmet-goal': 'Give the model the actions that lead there, or fix the goal.',
		'always-blocked': 'Loosen its guards: they refuse every case.',
		'dead-rule': 'Remove the rule, or fix its condition: nothing can make it apply.',
		'shadowed-rule': 'Remove the rule, or move it before the guard that hides it.'
	},
	fr: {
		'reachable-violation':
			"Refusez la dernière étape dans ce cas, ou empêchez une étape antérieure de la laisser passer.",
		'impossible-invariant': "Corrigez l'énoncé\u00a0: tel qu'il est écrit, aucun état ne le satisfait.",
		'impossible-goal': "Corrigez l'objectif, ou l'énoncé qui l'exclut.",
		'reachable-deadlock': "Si cet état doit être final, dites-le\u00a0; sinon, laissez une action en sortir.",
		'unreachable-action': "Laissez une action antérieure lui ouvrir la voie, assouplissez sa garde, ou supprimez-la.",
		'unmet-goal': "Donnez au modèle les actions qui y mènent, ou corrigez l'objectif.",
		'always-blocked': 'Assouplissez ses gardes\u00a0: elles refusent tous les cas.',
		'dead-rule': "Supprimez la règle, ou corrigez sa condition\u00a0: rien ne peut la faire s'appliquer.",
		'shadowed-rule': 'Supprimez la règle, ou placez-la avant la garde qui la masque.'
	}
};

/** What each kind of finding means, for the reader who meets its label without its card (criterion 4996a6b4). */
const MEANINGS: Record<SpecLanguage, Record<string, string>> = {
	en: {
		'reachable-violation':
			'A statement of the specification that a path breaks: the behavior engine found steps after which something the spec says must always hold no longer does.',
		'impossible-invariant':
			'As written, nothing can satisfy it: no state holds the statement, or no path reaches the goal. The specification contradicts itself there.',
		'impossible-goal':
			'As written, nothing can satisfy it: no state holds the statement, or no path reaches the goal. The specification contradicts itself there.',
		'reachable-deadlock':
			'A state a person can reach and then do nothing more: after it, no action of the feature is allowed. Either it is meant to be final and the spec should say so, or an action that leaves it is missing.',
		'unreachable-action':
			'An action no path the engine explored could run. Not reaching it within the bound proves no fault, so it costs nothing until it is checked.',
		'unmet-goal':
			'A goal no path the engine explored reached. Not reaching it within the bound proves no fault, so it costs nothing until it is checked.',
		'always-blocked':
			'An action its guards refused in every case the engine tried. It costs nothing until it is checked, but as written a person may never get to do it.',
		'dead-rule': 'A rule whose condition nothing can make true: it never applies, so it is a leftover or a condition written wrong.',
		'shadowed-rule': 'A rule an earlier guard always decides before it: it can never be the one that applies.'
	},
	fr: {
		'reachable-violation':
			"Un énoncé de la spécification qu'un chemin enfreint : le moteur de comportement a trouvé des étapes après lesquelles ce que la spec dit toujours vrai ne l'est plus.",
		'impossible-invariant':
			"Tel qu'il est écrit, rien ne peut le satisfaire : aucun état ne respecte l'énoncé, ou aucun chemin n'atteint l'objectif. La spécification s'y contredit.",
		'impossible-goal':
			"Tel qu'il est écrit, rien ne peut le satisfaire : aucun état ne respecte l'énoncé, ou aucun chemin n'atteint l'objectif. La spécification s'y contredit.",
		'reachable-deadlock':
			"Un état qu'une personne peut atteindre sans plus rien pouvoir faire ensuite : aucune action de la fonctionnalité n'y est permise. Soit il est final et la spec doit le dire, soit il manque une action pour en sortir.",
		'unreachable-action':
			"Une action qu'aucun chemin exploré par le moteur n'a pu exécuter. Ne pas l'atteindre dans la limite ne prouve aucun défaut : elle ne coûte rien tant qu'elle n'est pas vérifiée.",
		'unmet-goal':
			"Un objectif qu'aucun chemin exploré par le moteur n'a atteint. Ne pas l'atteindre dans la limite ne prouve aucun défaut : il ne coûte rien tant qu'il n'est pas vérifié.",
		'always-blocked':
			"Une action que ses gardes ont refusée dans tous les cas essayés par le moteur. Elle ne coûte rien tant qu'elle n'est pas vérifiée, mais telle qu'elle est écrite personne ne pourra peut-être jamais l'effectuer.",
		'dead-rule': "Une règle dont rien ne peut rendre la condition vraie : elle ne s'applique jamais, c'est un reste ou une condition mal écrite.",
		'shadowed-rule': "Une règle qu'une garde antérieure tranche toujours avant elle : elle ne peut jamais être celle qui s'applique."
	}
};

/** What a kind of finding means, in the spec's language; empty for a kind the product does not show. */
export const provenKindMeaning = (kind: string, lang: SpecLanguage = 'en'): string => MEANINGS[lang][kind] ?? '';

/** A name the model carries, quoted verbatim: straight quotes in English, guillemets in French. */
const quoted = (name: string | undefined, lang: SpecLanguage = 'en'): string =>
	lang === 'fr' ? quoteName('fr', name ?? '') : `"${name ?? ''}"`;

/** French keeps an unbreakable space before a colon and a semicolon. */
const COLON = `${NBSP}:`;
const SEMICOLON = `${NBSP}; `;

const value = (v: unknown, lang: SpecLanguage): string => {
	if (lang === 'fr') {
		if (typeof v === 'boolean') return truthText('fr', v);
		if (typeof v === 'number') return numberText('fr', v);
		if (v === null || v === undefined) return 'aucune valeur';
	}
	return typeof v === 'string'
		? quoted(v, lang)
		: typeof v === 'object' && v !== null
			? JSON.stringify(v)
			: String(v);
};

/** One step as a person reads it: the action, then its inputs. */
export const stepText = (step: SpecProofStep, lang: SpecLanguage = 'en'): string => {
	const inputs = Object.entries(step.parameters)
		.filter(([name]) => name !== '$channel')
		// French reads « ok » à vrai, never "ok true".
		.map(([name, v]) =>
			lang === 'fr' ? `${quoted(name, lang)} à ${value(v, lang)}` : `${name} ${value(v, lang)}`
		);
	const action =
		lang === 'fr'
			? step.featureName
				? `${quoted(step.featureName, lang)} › ${quoted(step.actionName, lang)}`
				: quoted(step.actionName, lang)
			: step.featureName
				? `${step.featureName} › ${step.actionName}`
				: step.actionName;
	return inputs.length > 0 ? `${action} (${inputs.join(', ')})` : action;
};

/**
 * The solver's findings, readable, blocking ones first. A finding the product
 * does not show (a redundant rule, a lead) is left out. `feature` is the raw
 * snapshot the EARS sentences are written from; without it the statement's
 * name stands in. `lang` is the language the project declares.
 */
export function provenFindings(
	feature: unknown,
	proof: SpecProof | null,
	lang: SpecLanguage = 'en'
): ProvenFinding[] {
	if (!proof || proof.solver !== 'ran') return [];
	const statements = feature ? featureStatements(feature, lang) : {};
	const properNames = feature ? featureProperNames(feature) : new Set<string>();
	const bound = proof.paths?.maxSteps ?? proof.actions?.maxSteps ?? 6;
	const out: ProvenFinding[] = [];
	for (const finding of proof.findings ?? []) {
		const row = readable(finding, statements, properNames, bound, lang);
		if (row) out.push(row);
	}
	return [...out.filter((f) => f.tone === 'blocking'), ...out.filter((f) => f.tone === 'warning')];
}

/** What a finding says, per kind, once the statements are written. */
interface FindingWords {
	readonly allow: (name: string | undefined) => string;
	readonly invariant: (name: string | undefined) => string;
	readonly goal: (name: string | undefined) => string;
	/** The rule when its sentence is not at hand; French never shows the engine's English detail. */
	readonly rule: (subject: string, detail: string) => string;
	readonly start: string;
	readonly anyStateAndInput: string;
	readonly anyKeptState: string;
	readonly anyState: string;
	readonly anySequence: (bound: number) => string;
	readonly anyInput: (subject: string) => string;
	readonly broken: (name: string | undefined) => string;
	readonly neverHolds: (name: string | undefined) => string;
	readonly goalNeverMet: (name: string | undefined) => string;
	readonly keepAnAction: (after: string | null) => string;
	readonly noActionLeft: string;
	readonly stillRefused: (name: string | undefined) => string;
	readonly guardsRefuse: string;
	readonly ruleNeverApplies: string;
	readonly ruleShadowed: string;
}

const WORDS: Record<SpecLanguage, (properNames: ReadonlySet<string>) => FindingWords> = {
	en: (properNames) => ({
		allow: (name) => `The system shall allow the user to ${actionPhrase(name ?? '', properNames)}.`,
		invariant: (name) => `The system shall always ensure that ${name ?? 'the statement holds'}.`,
		goal: (name) => `The system shall make it possible to reach ${quoted(name)}.`,
		rule: (subject, detail) => `${subject}: ${detail}`,
		start: 'nothing has happened yet',
		anyStateAndInput: 'any state and any input',
		anyKeptState: 'any state that keeps every statement',
		anyState: 'any state',
		anySequence: (bound) => `any sequence of up to ${bound} actions, whatever their inputs`,
		anyInput: (subject) => `${subject} with any input`,
		broken: (name) => `${quoted(name)} no longer holds`,
		neverHolds: (name) => `${quoted(name)} cannot hold: every run breaks it`,
		goalNeverMet: (name) => `${quoted(name)} is never met`,
		keepAnAction: (after) => `After ${after ?? 'the start'}, the system shall still allow at least one action.`,
		noActionLeft: 'no action can run any more, whatever its inputs',
		stillRefused: (name) => `${quoted(name)} is still refused`,
		guardsRefuse: 'its guards refuse it every time',
		ruleNeverApplies: 'this rule never applies',
		ruleShadowed: 'an earlier rule always refuses first, so this one never decides'
	}),
	fr: () => ({
		allow: (name) => `Le système doit permettre à l'utilisateur d'exécuter ${quoted(name, 'fr')}.`,
		invariant: (name) =>
			name
				? `Le système doit toujours garantir l'énoncé ${quoted(name, 'fr')}.`
				: "Le système doit toujours garantir que l'énoncé est respecté.",
		goal: (name) => `Le système doit permettre d'atteindre ${quoted(name, 'fr')}.`,
		rule: (subject) =>
			subject ? `Une règle de ${quoted(subject, 'fr')}.` : 'Une règle de la fonctionnalité.',
		start: "l'état de départ, avant toute action",
		anyStateAndInput: "n'importe quel état et n'importe quelle entrée",
		anyKeptState: "n'importe quel état qui respecte chaque énoncé",
		anyState: "n'importe quel état",
		anySequence: (bound) =>
			`n'importe quelle suite de ${bound} actions au plus, quelles que soient leurs entrées`,
		anyInput: (subject) => `${quoted(subject, 'fr')} avec n'importe quelle entrée`,
		broken: (name) => `l'énoncé ${quoted(name, 'fr')} n'est plus respecté`,
		neverHolds: (name) =>
			`l'énoncé ${quoted(name, 'fr')} ne peut pas être respecté${COLON} chaque exécution l'enfreint`,
		goalNeverMet: (name) => `l'objectif ${quoted(name, 'fr')} n'est jamais atteint`,
		keepAnAction: (after) =>
			after === null
				? 'Dès le départ, le système doit permettre au moins une action.'
				: `Après ${quoted(after, 'fr')}, le système doit encore permettre au moins une action.`,
		noActionLeft: "plus aucune action ne peut s'exécuter, quelles que soient ses entrées",
		stillRefused: (name) => `l'action ${quoted(name, 'fr')} est toujours refusée`,
		guardsRefuse: 'ses gardes la refusent à chaque fois',
		ruleNeverApplies: "cette règle ne s'applique jamais",
		ruleShadowed: 'une règle antérieure refuse toujours en premier, donc celle-ci ne décide jamais'
	})
};

function readable(
	f: SpecProofFinding,
	statements: Record<string, string>,
	properNames: ReadonlySet<string>,
	bound: number,
	lang: SpecLanguage
): ProvenFinding | null {
	const label = LABELS[lang][f.kind];
	if (!label) return null;
	const w = WORDS[lang](properNames);
	const steps = (f.path ?? []).map((step) => stepText(step, lang));
	const common = {
		key: [f.kind, f.ruleId, f.actionId, f.invariantId, f.goalId].filter(Boolean).join(':'),
		kind: f.kind,
		tone: BLOCKING.has(f.kind) ? ('blocking' as const) : ('warning' as const),
		label,
		fix: stuckFix(f.stuck, lang) ?? FIXES[lang][f.kind] ?? '',
		...(f.actionId ? { actionId: f.actionId } : {}),
		...(f.ruleId ? { ruleId: f.ruleId } : {}),
		...(f.invariantId ? { invariantId: f.invariantId } : {})
	};
	const invariant = statements[`invariant:${f.invariantId}`] ?? w.invariant(f.invariantName);
	const goal = statements[`goal:${f.goalId}`] ?? w.goal(f.goalName);
	const subject = f.actionName ?? f.surfaceName ?? '';
	const rule = statements[`rule:${f.ruleId}`] ?? w.rule(subject, f.detail);
	switch (f.kind) {
		case 'reachable-violation':
			return { ...common, requirement: invariant, given: w.start, when: steps, then: w.broken(f.invariantName) };
		case 'impossible-invariant':
			return {
				...common,
				requirement: invariant,
				given: w.anyStateAndInput,
				when: [],
				then: w.neverHolds(f.invariantName)
			};
		case 'impossible-goal':
			return { ...common, requirement: goal, given: w.anyKeptState, when: [], then: w.goalNeverMet(f.goalName) };
		case 'reachable-deadlock':
			return {
				...common,
				requirement: w.keepAnAction(steps.length > 0 ? f.path![f.path!.length - 1]!.actionName : null),
				given: w.start,
				when: steps,
				then: w.noActionLeft
			};
		case 'unreachable-action':
			return {
				...common,
				requirement: w.allow(f.actionName),
				given: w.start,
				when: [w.anySequence(bound)],
				then: w.stillRefused(f.actionName)
			};
		case 'unmet-goal':
			return {
				...common,
				requirement: goal,
				given: w.start,
				when: [w.anySequence(bound)],
				then: w.goalNeverMet(f.goalName)
			};
		case 'always-blocked':
			return {
				...common,
				requirement: w.allow(f.actionName),
				given: w.anyState,
				when: [w.anyInput(f.actionName ?? '')],
				then: w.guardsRefuse
			};
		case 'dead-rule':
			return { ...common, requirement: rule, given: w.anyState, when: [w.anyInput(subject)], then: w.ruleNeverApplies };
		case 'shadowed-rule':
			return { ...common, requirement: rule, given: w.anyState, when: [w.anyInput(subject)], then: w.ruleShadowed };
		default:
			return null;
	}
}

const valueText = (lang: SpecLanguage, value: unknown): string =>
	typeof value === 'string'
		? quoteName(lang, value)
		: typeof value === 'number'
			? numberText(lang, value)
			: typeof value === 'boolean'
				? truthText(lang, value)
				: lang === 'fr'
					? 'vide'
					: 'empty';

/**
 * What holds a target back, as the fix of its card (criterion 39ea86c2 of
 * feat-behavior-model): each state its guard or its condition reads that
 * nothing moves from its start, and what to add. Null when the engine named
 * none, so the card keeps its general advice.
 */
export function stuckFix(stuck: readonly SpecProofStuckState[] | undefined, lang: SpecLanguage): string | null {
	if (!stuck?.length) return null;
	const fr = lang === 'fr';
	const nothing = stuck.filter((s) => s.changedBy.length === 0);
	const chained = stuck.filter((s) => s.changedBy.length > 0);
	const parts: string[] = [];
	if (nothing.length > 0) {
		const states = nothing.map((s) => `${quoteName(lang, s.path)} (${fr ? 'part de' : 'starts at'} ${valueText(lang, s.startsAt)})`).join(', ');
		parts.push(
			fr
				? `Rien ne change ${states}${NBSP}: ajoutez ce qui ${nothing.length > 1 ? 'les' : 'le'} change (une action d'une personne, du système ou d'un planning, qui fait passer le temps quand c'est le temps qui ${nothing.length > 1 ? 'les' : 'le'} change) ou un persona qui part d'une autre valeur.`
				: `Nothing changes ${states}: add what changes ${nothing.length > 1 ? 'them' : 'it'} (an action of a person, of the system or of a schedule, one that makes time pass when time is what changes ${nothing.length > 1 ? 'them' : 'it'}) or a persona that starts with another value.`
		);
	}
	for (const s of chained) {
		const by = s.changedBy.map((name) => quoteName(lang, name)).join(fr ? ' ou ' : ' or ');
		parts.push(
			fr
				? `${quoteName(lang, s.path)} (part de ${valueText(lang, s.startsAt)}) ne change que par ${by}, ${s.changedBy.length > 1 ? 'elles-mêmes non atteintes' : 'elle-même non atteinte'}${NBSP}: ouvrez d'abord ${s.changedBy.length > 1 ? 'leur' : 'sa'} voie.`
				: `${quoteName(lang, s.path)} (starts at ${valueText(lang, s.startsAt)}) changes only through ${by}, ${s.changedBy.length > 1 ? 'themselves' : 'itself'} not reached: open ${s.changedBy.length > 1 ? 'their' : 'its'} way first.`
		);
	}
	return parts.join(' ');
}

/** The proof as one sentence, for a card that has room for a single detail. */
export const proofSentence = (f: ProvenFinding, lang: SpecLanguage = 'en'): string =>
	lang === 'fr'
		? `Étant donné ${f.given}${f.when.length > 0 ? `, quand ${f.when.join(' → ')}` : ''}, alors ${f.then}.`
		: `Given ${f.given}${f.when.length > 0 ? `, when ${f.when.join(' → ')}` : ''}, then ${f.then}.`;

/**
 * How the gaps of a feature split once the solver's findings stand on their
 * own: the gaps that only repeat a finding in prose are dropped, code not yet
 * mapped and scenarios the solver can write are counted, the rest stay as
 * modeling gaps.
 */
export function splitGaps(gaps: readonly SpecGap[], proof: SpecProof | null) {
	const findings = proof?.findings ?? [];
	const details = findings.map((f) => f.detail).filter(Boolean);
	// A gap is sorted by its stable code; its English text is read only from an
	// engine that sends no code, since a gap written in French never matches it.
	const repeatsFinding = (g: SpecGap) =>
		g.code
			? g.code.startsWith('proof:') &&
				findings.some(
					(f) =>
						f.kind === g.code.slice('proof:'.length) &&
						(!g.subjectId ||
							[f.ruleId, f.actionId, f.invariantId, f.goalId].includes(g.subjectId))
				)
			: details.some((d) => g.reason.startsWith(d));
	const unmapped = gaps.filter((g) =>
		g.code ? g.code === 'not-implemented' : /has no ImplementationStatus entry/.test(g.reason)
	);
	const scenarios = gaps.filter((g) =>
		g.code ? g.code === 'missing-scenario' : g.reason.startsWith('Branch without a scenario')
	);
	const rest = gaps.filter(
		(g) => !repeatsFinding(g) && !unmapped.includes(g) && !scenarios.includes(g)
	);
	return { unmapped: unmapped.length, scenariosToWrite: scenarios.length, modeling: rest };
}

/**
 * The engine's reasons exist in English only: a known one reads in French, any
 * other is said to be given in English, never shown half translated.
 */
const FRENCH_REASONS: Readonly<Record<string, string>> = {
	'z3-solver is missing': "le solveur Z3 n'est pas installé",
	'the solver did not start': "le solveur n'a pas démarré",
	'no native solver is installed': "aucun solveur natif n'est installé"
};
const frenchReason = (reason: string): string =>
	FRENCH_REASONS[reason] ?? "le moteur n'en donne la raison qu'en anglais";

/**
 * How far the proof went, in one line: never a silent pass. What the solver
 * left open (a question unsettled, a statement it cannot read, an interrupted
 * run) is named; a solver that did not start says nothing was proven.
 */
export function proofScope(
	proof: SpecProof | null,
	lang: SpecLanguage = 'en'
): { readonly text: string; readonly open: boolean } | null {
	if (!proof) return null;
	const fr = lang === 'fr';
	if (proof.solver !== 'ran') {
		// The engine's reason may already open with what this line says.
		const why = proof.reason?.replace(/^The solver did not start:\s*/, '');
		const reason = why ? ` (${fr ? frenchReason(why) : why})` : '';
		return {
			text: fr
				? `Le solveur n'a pas démarré${reason}${COLON} rien ici n'est prouvé.`
				: `The solver did not start${reason}: nothing here is proven.`,
			open: true
		};
	}
	const bound = proof.paths?.maxSteps ?? proof.actions?.maxSteps ?? 0;
	const unread = [
		...(proof.paths?.results ?? []).filter((r) => r.outcome === 'unsupported').map((r) => r.invariantName),
		...(proof.goals?.results ?? []).filter((r) => r.outcome === 'unsupported').map((r) => r.goalName)
	];
	const plural = (n: number) => (n === 1 ? '' : 's');
	const open = (
		fr
			? [
					proof.unsettled > 0
						? `${proof.unsettled} question${plural(proof.unsettled)} laissée${plural(proof.unsettled)} en suspens`
						: '',
					unread.length > 0
						? `${unread.map((n) => quoted(n, 'fr')).join(', ')} non lu${plural(unread.length)} par le solveur`
						: '',
					proof.interrupted ? `interrompu (${frenchReason(proof.interrupted)})` : ''
				]
			: [
					proof.unsettled > 0 ? `${proof.unsettled} question${plural(proof.unsettled)} left unsettled` : '',
					unread.length > 0 ? `${unread.map((n) => `"${n}"`).join(', ')} not read by the solver` : '',
					proof.interrupted ? `interrupted (${proof.interrupted})` : ''
				]
	).filter(Boolean);
	const base = fr
		? `Prouvé pour toute entrée, sur tout chemin de ${bound} étapes au plus depuis le départ.`
		: `Proven for every input, on every path of up to ${bound} steps from the start.`;
	return open.length > 0
		? {
				text: fr
					? `${base} Non prouvé${COLON} ${open.join(SEMICOLON)}.`
					: `${base} Not proven: ${open.join('; ')}.`,
				open: true
			}
		: { text: base, open: false };
}
