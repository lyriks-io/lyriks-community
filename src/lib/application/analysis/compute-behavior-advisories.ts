import { mapLimit } from '$lib/shared/map-limit';
import type { BehaviorAdvisory, BehaviorRepositoryPort, UnspaghettitAdvisorPort } from '../ports';
import { isAuxFeatureId } from '../projection/aux-feature-ids';
import { SpecVersionMemo, specVersionOf } from '../specification/spec-version-memo';
import { proofSentence, provenFindings, provenKindMeaning, splitGaps } from './proven-findings';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/**
 * Engine calls per pass (EnginePassSize, provisional). A feature whose spec has
 * not moved since its last verdict is served from memory and costs nothing, so
 * the cap only bounds the features that actually need the engine; the rest wait
 * for the next pass, which the cached advisor chains at once while this one
 * left some (ac-leaf-ac-score-engine-reaches-all), and the note says how many.
 */
const MAX_ENGINE_CALLS = 40;

/**
 * Verifications in flight at once. `verify` with model checking is the most
 * expensive call the engine takes, and the engine is one thread: a call's
 * budget runs from the moment it is SENT, so a call queued behind others spends
 * its budget waiting. With two leaves at once (verify and spec gaps each) the
 * last of four calls timed out on a large project, the engine was dropped and
 * respawned, and the pass began again: a loop that kept the machine busy. One
 * leaf at a time, its two calls one after the other, gives each its own budget.
 */
const ENGINE_WIDTH = 1;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Why the solver did not start, in French: the engine gives its reasons in English only. */
const FRENCH_REASONS: Readonly<Record<string, string>> = {
	'z3-solver is missing': "le solveur Z3 n'est pas installé"
};

/** The words of the cards this use case writes itself, in the language the project declares. */
const CARD_WORDS = {
	en: {
		capped: (skipped: number) => ({
			title: `${skipped} feature${skipped === 1 ? ' has' : 's have'} not been checked yet`,
			detail: `The behavior engine checks ${MAX_ENGINE_CALLS} features per pass and goes on with the rest at once, pass after pass.`
		}),
		cappedKind: 'Not checked yet',
		cappedMeaning: `The behavior engine checks ${MAX_ENGINE_CALLS} features per pass and goes on with the rest at once: nothing is said yet about the ones still waiting.`,
		notProven: 'Not proven',
		notProvenMeaning: 'The solver could not run on this feature, so nothing about it is proven: its other points come from the exploration alone.',
		failsKind: 'Fails its own checks',
		failsMeaning: 'A feature that fails what it says of itself: one of its scenarios fails, or one of its statements breaks, when the behavior engine plays it.',
		specGapKind: 'Spec gap',
		specGapMeaning: 'Something the behavior engine needs to check a feature is missing from its description, such as a state, a rule or an effect it names without defining.',
		unprovenTitle: (name: string) => `${name} could not be proven`,
		unprovenDetail: (reason: string | undefined) =>
			`${reason ?? 'The solver did not start'}: nothing about this feature is proven.`,
		violations: (n: number) => `${n} invariant violation(s)`,
		failing: (n: number) => `${n} scenario(s) failing`,
		gaps: (n: number) => `${n} critical spec gap(s)`,
		contradicts: (name: string) => `${name} contradicts its own invariants or scenarios`,
		gapsToClose: (name: string, n: number) =>
			`${name} has ${n} critical spec gap${n === 1 ? '' : 's'} to close`
	},
	fr: {
		capped: (skipped: number) => ({
			title: `${skipped} ${plural(skipped, "fonctionnalité n'a", "fonctionnalités n'ont")} pas encore été ${plural(skipped, 'vérifiée', 'vérifiées')}`,
			detail: `Le moteur de comportement vérifie ${MAX_ENGINE_CALLS} fonctionnalités par passage et enchaîne aussitôt sur les autres, passage après passage.`
		}),
		cappedKind: 'Pas encore vérifié',
		cappedMeaning: `Le moteur de comportement vérifie ${MAX_ENGINE_CALLS} fonctionnalités par passage et enchaîne aussitôt sur les autres${NBSP}: rien n'est encore dit de celles qui attendent.`,
		notProven: 'Non prouvé',
		notProvenMeaning: `Le solveur n'a pas pu s'exécuter sur cette fonctionnalité, donc rien n'y est prouvé${NBSP}: ses autres points viennent de l'exploration seule.`,
		failsKind: 'Échoue à ses propres vérifications',
		failsMeaning: `Une fonctionnalité qui échoue à ce qu'elle dit d'elle-même${NBSP}: un de ses scénarios échoue, ou un de ses énoncés est enfreint, quand le moteur de comportement la joue.`,
		specGapKind: 'Lacune de spécification',
		specGapMeaning: "Il manque à la description d'une fonctionnalité de quoi la vérifier, comme un état, une règle ou un effet qu'elle nomme sans le définir.",
		unprovenTitle: (name: string) =>
			`La fonctionnalité ${quoteName('fr', name)} n'a pas pu être prouvée`,
		unprovenDetail: (reason: string | undefined) =>
			`${reason ? `Le solveur n'a pas démarré (${FRENCH_REASONS[reason] ?? "le moteur n'en donne la raison qu'en anglais"})` : "Le solveur n'a pas démarré"}${NBSP}: rien n'est prouvé sur cette fonctionnalité.`,
		violations: (n: number) =>
			`${n} ${plural(n, 'énoncé enfreint', 'énoncés enfreints')}`,
		failing: (n: number) => `${n} ${plural(n, 'scénario en échec', 'scénarios en échec')}`,
		gaps: (n: number) => `${n} ${plural(n, 'lacune critique', 'lacunes critiques')} de la spécification`,
		contradicts: (name: string) =>
			`La fonctionnalité ${quoteName('fr', name)} contredit ses propres énoncés ou scénarios`,
		gapsToClose: (name: string, n: number) =>
			`La fonctionnalité ${quoteName('fr', name)} a ${n} ${plural(n, 'lacune critique', 'lacunes critiques')} à combler`
	}
} as const;

/**
 * Compute the behavior advisories for a project by running the Unspaghettit
 * verification surface over its features and distilling the failures into a flat
 * message list. HEAVY (spawns / drives the unspa engine per feature) — meant to
 * run in the background behind a cache, never on the request path (see
 * `CachedBehaviorAdvisor`).
 *
 * Scoped to the project's own unspa `featureIds` (from the behavior project
 * snapshot) so it never verifies a sibling project's features in the shared
 * workspace. A feature whose spec has not changed since its last verdict is
 * served from memory: after one full pass, a refresh only verifies what moved.
 */
/** Bumped when a card gains what it weighs: a card remembered in an older format is computed again. */
const CARD_FORMAT = 5;

/** What the explorer did not reach within its bound: absence of evidence, never proof of a fault. */
const NOT_REACHED: ReadonlySet<string> = new Set(['unreachable-action', 'unmet-goal', 'always-blocked']);

export class ComputeBehaviorAdvisoriesUseCase {
	readonly #memo = new SpecVersionMemo<BehaviorAdvisory[]>();

	constructor(
		private readonly advisor: UnspaghettitAdvisorPort,
		private readonly behavior: BehaviorRepositoryPort,
		/** The spec's language, read from its declaration alone: the cards are written in it. */
		private readonly specLanguage?: { generated(projectId: string): Promise<SpecLanguage> },
		/** The project invariants Lyriks generated from the data model (their ids): breaking one says the spec disagrees with its own data model. */
		private readonly dataModelRules?: { ids(projectId: string): Promise<ReadonlySet<string>> }
	) {}

	/** The language the cards of a project are written in, read from its declaration alone. */
	async language(projectId: string): Promise<SpecLanguage> {
		return (await this.specLanguage?.generated(projectId).catch(() => undefined)) ?? 'en';
	}

	async execute(projectId: string): Promise<BehaviorAdvisory[]> {
		if (!this.advisor.available) return [];
		const project = await this.behavior.loadProject(projectId);
		// The aux "__experience"/"__data_model" features are derived projections —
		// spec-gapping them yields advisories nobody can act on from the board.
		const ids = (project?.project.featureIds ?? []).filter((fid) => !isAuxFeatureId(fid));
		if (ids.length === 0) return [];
		const lang = await this.language(projectId);
		// The rules generated from the data model change what a broken rule weighs:
		// they are read once per pass, and a card is remembered per set of them.
		const generated = (await this.dataModelRules?.ids(projectId).catch(() => null)) ?? new Set<string>();
		const memoKey = (fid: string) => `${projectId}/${fid}/${lang}/${CARD_FORMAT}/${[...generated].sort().join(',')}`;

		// Cheap local reads first: what is remembered for its current spec version
		// is served as is, and only what moved (or was never checked) goes to the
		// engine. Before this, the first 40 ids were verified on every pass and the
		// rest never, whatever their state: "limited to 40 of 55" was permanent.
		const remembered: BehaviorAdvisory[] = [];
		const pending: { fid: string; version: string | null }[] = [];
		for (const fid of ids) {
			const snapshot = await this.behavior.loadFeature(projectId, fid).catch(() => null);
			const version = specVersionOf(snapshot);
			// A card is remembered per language too: declaring one rewrites every card.
			const known = version ? this.#memo.get(memoKey(fid), version) : undefined;
			if (known !== undefined) remembered.push(...known);
			else pending.push({ fid, version: version || null });
		}
		const scoped = pending.slice(0, MAX_ENGINE_CALLS);
		const verified = await mapLimit(scoped, ENGINE_WIDTH, async ({ fid, version }) => {
			const advisories = await this.assess(projectId, fid, lang, generated);
			if (version) this.#memo.set(memoKey(fid), version, advisories);
			return advisories;
		});
		const out = [...remembered, ...verified.flat()];

		const skipped = pending.length - scoped.length;
		if (skipped > 0) {
			const words = CARD_WORDS[lang];
			out.push({ severity: 'low', code: 'capped', kindLabel: words.cappedKind, kindMeaning: words.cappedMeaning, unchecked: skipped, ...words.capped(skipped) });
		}
		return out;
	}

	/**
	 * One feature → one advisory per flaw the solver proved, written as the
	 * requirement it breaks with its proof as a scenario (blocking for a
	 * statement broken from the start or never satisfiable, a warning
	 * otherwise), plus one for what the solver does not cover: failing
	 * scenarios and the critical modeling gaps it did not prove. Code not yet
	 * mapped and scenarios still to write are not coherence problems.
	 */
	private async assess(
		projectId: string,
		featureId: string,
		lang: SpecLanguage = 'en',
		generated: ReadonlySet<string> = new Set()
	): Promise<BehaviorAdvisory[]> {
		// The two engine calls run one after the other (see ENGINE_WIDTH); the local read alongside.
		const modelRead = this.behavior.loadFeature(projectId, featureId).catch(() => null);
		const verdict = await this.advisor.verify(featureId, { modelCheck: true });
		const spec = await (this.advisor.getSpecGapsAndProof
			? this.advisor.getSpecGapsAndProof(featureId, undefined, lang)
			: this.advisor.getSpecGaps(featureId).then((gaps) => ({ gaps, proof: null }))
		).catch(() => ({ gaps: [], proof: null }));
		const model = await modelRead;
		const name = verdict?.features[0]?.featureName || String(model?.feature.name ?? '') || featureId;
		const where = { featureId, featureName: name };
		const proof = spec.proof;
		const words = CARD_WORDS[lang];
		const findings = provenFindings(model?.feature ?? null, proof, lang);
		// A rule the model breaks is one cause wherever it breaks; once one breaks on this feature,
		// its failing scenarios follow from it and are not counted again.
		const failingCount = verdict?.scenariosFailed ?? 0;
		const known = findings.some((f) => f.kind === 'reachable-violation') || (verdict?.features[0]?.brokenStatements?.length ?? 0) > 0;
		// Scenarios that fail on a broken rule meet that rule here too: asked of the engine only when nothing else said so.
		const metInScenarios =
			!known && failingCount > 0
				? ((await this.advisor.runScenarios(featureId).catch(() => null))?.results ?? []).some((r) => !r.pass && /invariant violation/i.test(r.summary))
				: false;
		const breaks = known || metInScenarios;
		const out: BehaviorAdvisory[] = findings.map((finding) => ({
			...where,
			// Breaking a rule generated from the data model says the spec disagrees with itself, not that the
			// product fails: a gap in the description, under a defect of the product.
			severity: finding.tone !== 'blocking' ? 'medium' : finding.invariantId && generated.has(finding.invariantId) ? 'low' : 'high',
			code: 'proven',
			kindLabel: finding.label,
			...(provenKindMeaning(finding.kind, lang) ? { kindMeaning: provenKindMeaning(finding.kind, lang) } : {}),
			blocking: finding.tone === 'blocking',
			title: finding.requirement,
			detail: proofSentence(finding, lang),
			proof: { given: finding.given, when: finding.when, then: finding.then },
			...(finding.fix ? { action: finding.fix } : {}),
			...(finding.kind === 'reachable-violation' ? { cause: `rule:${finding.invariantId ?? finding.requirement}` } : {}),
			// Not reached within the exploration bound proves nothing: listed, never charged.
			...(NOT_REACHED.has(finding.kind) ? { weighs: 'unverified' as const } : {})
		}));
		if (proof && proof.solver !== 'ran') {
			out.push({
				...where,
				severity: 'medium',
				code: 'unproven',
				kindLabel: words.notProven,
				kindMeaning: words.notProvenMeaning,
				title: words.unprovenTitle(name),
				detail: words.unprovenDetail(proof.reason)
			});
		}

		// What the solver does not cover: failing scenarios, broken statements
		// when it did not run, and the critical modeling gaps it did not prove.
		const failing = verdict?.scenariosFailed ?? 0;
		const unprovenBreaks = proof?.solver === 'ran' ? 0 : (verdict?.invariantViolations ?? 0);
		const critical = splitGaps(spec.gaps, proof).modeling.filter((g) => g.severity === 'critical');
		if (failing === 0 && unprovenBreaks === 0 && critical.length === 0) return out;
		const bits = [
			unprovenBreaks > 0 ? words.violations(unprovenBreaks) : '',
			failing > 0 ? words.failing(failing) : '',
			critical.length > 0 ? words.gaps(critical.length) : ''
		].filter(Boolean);
		const hard = failing > 0 || unprovenBreaks > 0;
		out.push({
			...where,
			severity: hard ? 'high' : 'medium',
			...(breaks ? { weighs: 'consequence' as const } : {}),
			code: hard ? 'verify' : 'specgap',
			kindLabel: hard ? words.failsKind : words.specGapKind,
			kindMeaning: hard ? words.failsMeaning : words.specGapMeaning,
			title: hard ? words.contradicts(name) : words.gapsToClose(name, critical.length),
			detail: [bits.join(', '), ...critical.slice(0, 2).map((g) => g.reason)].filter(Boolean).join(' · '),
			gaps: critical.map((g) => ({ entityName: g.entityName, reason: g.reason, suggestedFix: g.suggestedFix }))
		});
		return out;
	}
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
