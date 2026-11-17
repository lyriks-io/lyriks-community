import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { SpecLanguage } from '$domain/language';
import type { SpecProof } from '../ports';
import { proofScope, proofSentence, provenFindings, type ProvenFinding } from './proven-findings';

/**
 * What the solver says about each rule the Rules tab lists, read from one
 * feature's proof. Pure: the feature's model and its proof in, one verdict per
 * rule, statement and action out. A verdict is only what the proof settled:
 * "no flaw found" needs a solver that ran and left nothing open, a bounded
 * search reads "holds for N steps" and never "proved", and a rule with no
 * condition has nothing to check, so it gets no verdict at all.
 */

export type RuleVerdictKind =
	| 'dead'
	| 'hidden'
	| 'redundant'
	| 'no-flaw'
	| 'not-settled'
	| 'broken'
	| 'impossible'
	| 'holds-within-bound'
	| 'unsettled'
	| 'not-read'
	| 'always-refused'
	| 'never-runs'
	// The oracle's verdicts on a project statement.
	| 'proved'
	| 'contradicted'
	| 'out-of-reach'
	| 'never-exercised';

export type RuleVerdictTone = 'danger' | 'warning' | 'success' | 'neutral';

export interface RuleVerdict {
	readonly kind: RuleVerdictKind;
	readonly label: string;
	readonly tone: RuleVerdictTone;
	/** Whether the solver found something wrong with it: counted and filtered on. */
	readonly flaw: boolean;
	/** Why, in a sentence: the proof as Given/When/Then for a finding. */
	readonly detail?: string;
	/** What to do about it, for a flaw. */
	readonly fix?: string;
}

export interface FeatureRuleVerdicts {
	readonly featureId: string;
	readonly solver: 'ran' | 'unavailable';
	/** How far the proof went, in one line; `open` when it left something unproven. */
	readonly scope: { readonly text: string; readonly open: boolean } | null;
	/** By rule or statement node id. */
	readonly rules: Readonly<Record<string, RuleVerdict>>;
	/** By action id: the verdict an action's heading carries, only when it has one. */
	readonly actions: Readonly<Record<string, RuleVerdict>>;
	/** Rules, statements and actions the solver found a flaw in. */
	readonly flaws: number;
}

type Node = Record<string, unknown>;
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const node = (v: unknown): Node => (v ?? {}) as Node;

const WORDS = {
	en: {
		dead: 'Dead rule',
		hidden: 'Hidden rule',
		redundant: 'Repeats a validation',
		redundantDetail: 'The validation of its inputs already refuses every value it needs, so it never fires.',
		noFlaw: 'No flaw found',
		noFlawDetail: 'The solver checked it can fire and that no earlier guard hides it.',
		notSettled: 'Not settled',
		notSettledDetail: 'The solver did not settle whether it can fire or whether an earlier guard hides it.',
		broken: 'Broken',
		impossible: 'Impossible',
		holds: (n: number) => `Holds for ${n} steps`,
		holdsDetail: (n: number) =>
			`No path of up to ${n} steps from the start breaks it. Beyond that, nothing is proven.`,
		unsettled: 'Unsettled',
		unsettledDetail: 'The solver could not settle whether a path breaks it.',
		notRead: 'Not read by the solver',
		notSearched: 'The path search did not cover it.',
		rulesOpen: (n: number) =>
			`The solver did not settle ${n} rule${n === 1 ? '' : 's'} in its time: ${n === 1 ? 'it reads' : 'they read'} Not settled, never sound.`,
		alwaysRefused: 'Always refused',
		neverRuns: 'Never runs'
	},
	fr: {
		dead: 'Règle morte',
		hidden: 'Règle masquée',
		redundant: 'Répète une validation',
		redundantDetail:
			"La validation de ses entrées refuse déjà chaque valeur dont elle a besoin : elle ne s'applique jamais.",
		noFlaw: 'Aucun défaut trouvé',
		noFlawDetail: "Le solveur a vérifié qu'elle peut s'appliquer et qu'aucune garde antérieure ne la masque.",
		notSettled: 'Non tranché',
		notSettledDetail: "Le solveur n'a pas tranché si elle peut s'appliquer ni si une garde antérieure la masque.",
		broken: 'Enfreint',
		impossible: 'Impossible',
		holds: (n: number) => `Tenu sur ${n} étapes`,
		holdsDetail: (n: number) =>
			`Aucun chemin de ${n} étapes au plus depuis le départ ne l'enfreint. Au-delà, rien n'est prouvé.`,
		unsettled: 'Non tranché',
		unsettledDetail: "Le solveur n'a pas pu trancher si un chemin l'enfreint.",
		notRead: 'Non lu par le solveur',
		notSearched: "La recherche de chemins ne l'a pas couvert.",
		rulesOpen: (n: number) =>
			`Le solveur n'a pas tranché ${n} règle${n === 1 ? '' : 's'} dans son temps\u00a0: ${n === 1 ? 'elle se lit' : 'elles se lisent'} Non tranché, jamais saine${n === 1 ? '' : 's'}.`,
		alwaysRefused: 'Toujours refusée',
		neverRuns: 'Jamais exécutée'
	}
} as const;

/** The finding kind a rule, statement or action verdict stands for. */
const FROM_FINDING: Readonly<Record<string, { kind: RuleVerdictKind; tone: RuleVerdictTone }>> = {
	'dead-rule': { kind: 'dead', tone: 'danger' },
	'shadowed-rule': { kind: 'hidden', tone: 'warning' },
	'reachable-violation': { kind: 'broken', tone: 'danger' },
	'impossible-invariant': { kind: 'impossible', tone: 'danger' },
	'always-blocked': { kind: 'always-refused', tone: 'danger' },
	'unreachable-action': { kind: 'never-runs', tone: 'warning' }
};

const fromFinding = (finding: ProvenFinding, lang: SpecLanguage): RuleVerdict | null => {
	const shape = FROM_FINDING[finding.kind];
	if (!shape) return null;
	return {
		...shape,
		label: finding.label,
		// Never reached within the bound is no proof the action is dead.
		flaw: shape.kind !== 'never-runs',
		detail: proofSentence(finding, lang),
		...(finding.fix ? { fix: finding.fix } : {})
	};
};

/** Every rule with a condition and every statement of the feature, by node id. */
function checkedNodes(feature: Node): { rules: string[]; statements: string[] } {
	const rules: string[] = [];
	const statements: string[] = [];
	const rule = (r: Node) => {
		if (str(r.id) && r.condition !== undefined && r.condition !== null) rules.push(str(r.id));
	};
	const statement = (iv: Node) => {
		if (str(iv.id)) statements.push(str(iv.id));
	};
	for (const surface of arr(feature.surfaces)) {
		for (const action of arr(surface.actions)) {
			arr(action.rules).forEach(rule);
			arr(action.invariants).forEach(statement);
		}
		arr(surface.rules).forEach(rule);
		arr(surface.invariants).forEach(statement);
	}
	arr(feature.featureInvariants).forEach(statement);
	return { rules, statements };
}

/**
 * Which part of the feature a proof answers for: `rules` for the rule checks
 * alone (fast, prove_feature_rules), `statements` for what the path search
 * settles (the statements, and the actions no path reaches), `all` for a full
 * proof. A part never speaks for the rows the other one owns.
 */
export type VerdictPart = 'all' | 'rules' | 'statements';

const STATEMENT_KINDS: ReadonlySet<RuleVerdictKind> = new Set(['broken', 'impossible', 'never-runs']);

export function featureRuleVerdicts(
	featureId: string,
	snapshot: UnspaFeatureSnapshot | null,
	proof: SpecProof | null,
	lang: SpecLanguage = 'en',
	part: VerdictPart = 'all'
): FeatureRuleVerdicts {
	const w = WORDS[lang];
	const scope = part === 'rules' && proof?.solver === 'ran' ? null : proofScope(proof, lang);
	if (!proof || proof.solver !== 'ran') {
		return { featureId, solver: 'unavailable', scope, rules: {}, actions: {}, flaws: 0 };
	}
	const feature = node(snapshot?.feature);
	const rules: Record<string, RuleVerdict> = {};
	const actions: Record<string, RuleVerdict> = {};

	const owns = (kind: RuleVerdictKind): boolean =>
		part === 'all' || (part === 'statements') === STATEMENT_KINDS.has(kind);
	for (const finding of provenFindings(snapshot?.feature ?? null, proof, lang)) {
		const verdict = fromFinding(finding, lang);
		if (!verdict || !owns(verdict.kind)) continue;
		if (finding.ruleId) rules[finding.ruleId] ??= verdict;
		else if (finding.invariantId) rules[finding.invariantId] ??= verdict;
		else if (finding.actionId) actions[finding.actionId] ??= verdict;
	}
	// A rule repeating a validation is not a flaw worth a finding card, but the
	// inventory names it: it is why the rule never decides anything.
	for (const finding of proof.findings ?? []) {
		if (part === 'statements' || finding.kind !== 'redundant-rule' || !finding.ruleId) continue;
		rules[finding.ruleId] ??= {
			kind: 'redundant',
			label: w.redundant,
			tone: 'neutral',
			flaw: false,
			detail: w.redundantDetail
		};
	}

	// Only the rules the engine says it settled are sound; an engine too old to
	// say so is trusted only when its whole proof left nothing open.
	const wholeProofSettled = proof.unsettled === 0 && !proof.interrupted;
	const settled = proof.rulesSettled ? new Set(proof.rulesSettled) : null;
	const { rules: ruleIds, statements } = checkedNodes(feature);
	for (const id of part === 'statements' ? [] : ruleIds) {
		rules[id] ??= (settled ? settled.has(id) : wholeProofSettled)
			? { kind: 'no-flaw', label: w.noFlaw, tone: 'success', flaw: false, detail: w.noFlawDetail }
			: { kind: 'not-settled', label: w.notSettled, tone: 'neutral', flaw: false, detail: w.notSettledDetail };
	}

	const paths = new Map((proof.paths?.results ?? []).map((r) => [r.invariantId, r]));
	const bound = proof.paths?.maxSteps ?? 0;
	for (const id of part === 'rules' ? [] : statements) {
		if (rules[id]) continue;
		const path = paths.get(id);
		if (path?.outcome === 'none-within-bound') {
			rules[id] = { kind: 'holds-within-bound', label: w.holds(bound), tone: 'neutral', flaw: false, detail: w.holdsDetail(bound) };
		} else if (path?.outcome === 'unsupported') {
			rules[id] = {
				kind: 'not-read',
				label: w.notRead,
				tone: 'neutral',
				flaw: false,
				...(path.reason && lang === 'en' ? { detail: path.reason } : {})
			};
		} else if (path?.outcome === 'unsettled') {
			rules[id] = { kind: 'unsettled', label: w.unsettled, tone: 'warning', flaw: false, detail: w.unsettledDetail };
		} else {
			// `violated` always comes with its finding; anything else was not searched.
			rules[id] = { kind: 'not-settled', label: w.notSettled, tone: 'neutral', flaw: false, detail: w.notSearched };
		}
	}

	const flaws = [...Object.values(rules), ...Object.values(actions)].filter((v) => v.flaw).length;
	// The rule checks have no path to speak of: their scope is the rules they left open.
	const open = part === 'rules' ? ruleIds.filter((id) => rules[id]?.kind === 'not-settled').length : 0;
	return { featureId, solver: 'ran', scope: open > 0 ? { text: w.rulesOpen(open), open: true } : scope, rules, actions, flaws };
}

/** How much a verdict asks of the reader: what broke first, what holds last. */
const WORRY: Record<RuleVerdictTone, number> = { danger: 0, warning: 1, neutral: 2, success: 3 };

/**
 * Rules in the order a reader should look at them (draft feat-rules-edge-cases
 * of request eeda5853): the most worrying verdict first, the rules with no
 * verdict yet last, the model's own order kept within a verdict. With no
 * verdict at all, the list comes back as it was.
 */
export function sortByVerdict<T>(items: readonly T[], verdictOf: (item: T) => RuleVerdict | undefined): T[] {
	const unknown = Object.keys(WORRY).length;
	return items
		.map((item, index) => {
			const verdict = verdictOf(item);
			return { item, index, rank: verdict ? WORRY[verdict.tone] : unknown };
		})
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map(({ item }) => item);
}
