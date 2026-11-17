import type { GapKind, GapProvenance } from './draft';
import type { SpecLanguage } from '$domain/language';

/**
 * THE catalogue of coherence checks: one declared entry per thing the product
 * verifies, so the Control Center can say "N checks ran, M pass" instead of
 * only listing what failed, and so every gap names the check it came from.
 *
 * A check is a property the spec should hold, phrased so a reader knows what
 * passing means. The emitters in the two checker layers reference these ids
 * (`Gap.checkId`) and report which ids actually RAN (`CoherenceAnalysis.checksRun`):
 * a check that ran and emitted nothing passed; a check that did not run (engine
 * offline, tier not entitled) is neither passed nor failed and is never counted
 * as a pass.
 */
export type CheckLayer = 'coverage' | 'declared' | 'formal' | 'semantic' | 'behavior';

export interface CheckDef {
	/** Stable key; also what a gap carries as `checkId`. */
	id: string;
	/** The property, in the reader's words ("Every feature is granted to a role"). */
	label: string;
	kind: GapKind;
	provenance: GapProvenance;
	/** Capability (registry id / source step) where a failure is fixed. */
	capability: string;
	layer: CheckLayer;
}

const coverage = (id: string, label: string, kind: GapKind, capability: string): CheckDef => ({
	id,
	label,
	kind,
	provenance: 'detected',
	capability,
	layer: 'coverage'
});

export const CHECKS: readonly CheckDef[] = [
	// ── Features ──
	coverage('features.has-leaf', 'At least one leaf feature exists', 'missing', 'features'),
	coverage('features.maturity', 'Features carry authored behavior', 'missing', 'features'),
	coverage('features.kernel-record', 'Every feature keeps its behavior record', 'dangling', 'features'),
	coverage('features.core-journey', 'Every core with features has a journey', 'orphan', 'experience'),
	// ── Users & permissions ──
	coverage('users.feature-reachable', 'Every feature is granted to at least one role', 'missing', 'users'),
	coverage('users.roles-granted', 'Every role holds at least one capability', 'orphan', 'users'),
	coverage('users.grants-resolve', 'Every grant names an existing role', 'dangling', 'permissions'),
	coverage('users.matrix-guards', 'The access matrix agrees with the guards of the behaviour', 'misalignment', 'users'),
	// ── Experience ──
	coverage('experience.has-journey', 'A journey maps the product experience', 'missing', 'experience'),
	coverage('experience.actors-resolve', 'Journey actors are existing roles', 'dangling', 'experience'),
	coverage('experience.plan.journey-unlinked', 'Every journey runs on a screen', 'step-without-action', 'experience'),
	coverage('experience.plan.screen-unvisited', 'Every screen is visited by a journey step', 'orphan', 'experience'),
	coverage('experience.plan.step-unlinked', 'Every step happens on a screen', 'dangling', 'experience'),
	coverage('experience.plan.step-shallow', 'Every step says what it does or reads', 'step-without-action', 'experience'),
	coverage('experience.plan.core-uncovered', 'Every core is walked by a journey', 'orphan', 'experience'),
	coverage('experience.plan.role-unused', 'Every role performs a journey', 'orphan', 'experience'),
	coverage('experience.plan.entity-unused', 'Every entity is read by a journey step', 'orphan', 'experience'),
	// ── Rules ──
	coverage('rules.criteria-attached', 'Every acceptance criterion tests a feature', 'orphan', 'features'),
	{
		id: 'rules.open-issues',
		label: 'No open issue stands in the declared rules',
		kind: 'missing',
		provenance: 'declared',
		capability: 'rules',
		layer: 'declared'
	},
	// ── Data ──
	coverage('data.tables-modeled', 'Every table a journey touches has a schema', 'missing', 'data'),
	coverage('data.fields-modeled', 'Every field a journey reads is in its entity', 'missing', 'data'),
	coverage('data.entities-unique', 'Entity names are unique', 'duplicate', 'data'),
	coverage('data.entities-placed', 'Every entity lives on a database', 'orphan', 'data'),
	coverage('data.relations-resolve', 'Every relation targets an existing entity', 'dangling', 'data'),
	// ── Architecture & glossary ──
	coverage('architecture.references', 'Every tech choice cites an official reference', 'dangling', 'architecture'),
	coverage('glossary.defined', 'Every governed term has a definition', 'missing', 'glossary'),
	coverage('glossary.approved', 'Every governed term is approved', 'missing', 'glossary'),
	// ── Language (80ad0a4c) ── runs only when the project declares its language.
	coverage('language.prose', "The model's prose is written in the spec's language", 'misalignment', 'features'),
	// ── Formal (DPO engine) ──
	{ id: 'formal.type-compat', label: 'Values match the type of the state they write', kind: 'misalignment', provenance: 'proven', capability: 'experience', layer: 'formal' },
	{ id: 'formal.lca-bus', label: 'A state bus stays within its declared type', kind: 'misalignment', provenance: 'proven', capability: 'experience', layer: 'formal' },
	{ id: 'formal.gluing', label: 'A change keeps what other parts depend on', kind: 'dangling', provenance: 'proven', capability: 'experience', layer: 'formal' },
	{ id: 'formal.other', label: 'No other formal violation', kind: 'misalignment', provenance: 'proven', capability: 'experience', layer: 'formal' },
	// ── Semantic review ──
	{ id: 'semantic.review', label: 'The consistency review agrees with the spec', kind: 'misalignment', provenance: 'reviewed', capability: 'coherence', layer: 'semantic' },
	// ── Behavior model-check ──
	{ id: 'behavior.model-check', label: 'The behavior model verifies', kind: 'misalignment', provenance: 'behavior', capability: 'features', layer: 'behavior' }
];

const BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

export function checkById(id: string): CheckDef | undefined {
	return BY_ID.get(id);
}

/** The catalogue labels in French, by check id. Names are never translated. */
const LABELS_FR: Readonly<Record<string, string>> = {
	'features.has-leaf': 'Au moins une fonctionnalité feuille existe',
	'features.maturity': 'Les fonctionnalités portent un comportement rédigé',
	'features.kernel-record': 'Chaque fonctionnalité garde son enregistrement de comportement',
	'features.core-journey': 'Chaque domaine qui porte des fonctionnalités a un parcours',
	'users.feature-reachable': 'Chaque fonctionnalité est accordée à au moins un rôle',
	'users.roles-granted': 'Chaque rôle détient au moins une capacité',
	'users.grants-resolve': 'Chaque droit nomme un rôle existant',
	'users.matrix-guards': "La matrice d'accès s'accorde avec les gardes du comportement",
	'experience.has-journey': "Un parcours décrit l'expérience du produit",
	'experience.actors-resolve': 'Les acteurs des parcours sont des rôles existants',
	'experience.plan.journey-unlinked': 'Chaque parcours se déroule sur un écran',
	'experience.plan.screen-unvisited': 'Chaque écran est visité par une étape de parcours',
	'experience.plan.step-unlinked': 'Chaque étape se déroule sur un écran',
	'experience.plan.step-shallow': 'Chaque étape dit ce qu’elle fait ou lit',
	'experience.plan.core-uncovered': 'Chaque domaine est parcouru par un parcours',
	'experience.plan.role-unused': 'Chaque rôle effectue un parcours',
	'experience.plan.entity-unused': 'Chaque entité est lue par une étape de parcours',
	'rules.criteria-attached': "Chaque critère d'acceptation teste une fonctionnalité",
	'rules.open-issues': 'Aucun problème ouvert ne subsiste dans les règles déclarées',
	'data.tables-modeled': 'Chaque table touchée par un parcours a un schéma',
	'data.fields-modeled': "Chaque champ lu par un parcours figure dans son entité",
	'data.entities-unique': 'Les noms des entités sont uniques',
	'data.entities-placed': 'Chaque entité réside sur une base de données',
	'data.relations-resolve': 'Chaque relation vise une entité existante',
	'architecture.references': 'Chaque choix technique cite une référence officielle',
	'glossary.defined': 'Chaque terme gouverné a une définition',
	'glossary.approved': 'Chaque terme gouverné est approuvé',
	'language.prose': 'La prose du modèle est écrite dans la langue de la spec',
	'formal.type-compat': "Les valeurs respectent le type de l'état qu'elles écrivent",
	'formal.lca-bus': "Un bus d'état reste dans son type déclaré",
	'formal.gluing': "Un changement préserve ce dont d'autres parties dépendent",
	'formal.other': 'Aucune autre violation formelle',
	'semantic.review': 'La revue de cohérence est en accord avec la spec',
	'behavior.model-check': 'Le modèle de comportement se vérifie'
};

/** A check's label in the spec's language. */
export function checkLabel(check: CheckDef, lang: SpecLanguage = 'en'): string {
	return lang === 'fr' ? (LABELS_FR[check.id] ?? check.label) : check.label;
}

/** The prose-language check: it runs only on a project that declares its language. */
export const PROSE_LANGUAGE_CHECK_ID = 'language.prose';

export function checkIdsOfLayer(layer: CheckLayer): string[] {
	return CHECKS.filter((c) => c.layer === layer).map((c) => c.id);
}

/** Every check the local (engine-free) checker runs on each analysis. */
export const LOCAL_CHECK_IDS: readonly string[] = [
	...checkIdsOfLayer('coverage'),
	...checkIdsOfLayer('declared')
].filter((id) => id !== PROSE_LANGUAGE_CHECK_ID);

/** How many checks ran, and how many of them pass. */
export interface CheckTally {
	run: number;
	passing: number;
	failing: number;
}

/**
 * Tally from the ids that ran and the gaps emitted: a check fails when at least
 * one gap names it. Gaps without a check id (legacy or engine-relayed) count
 * against nothing, and never make a check pass.
 */
export function tallyChecks(
	checksRun: readonly string[],
	gaps: readonly { checkId?: string }[]
): CheckTally {
	const run = new Set(checksRun);
	const failing = new Set<string>();
	for (const g of gaps) if (g.checkId && run.has(g.checkId)) failing.add(g.checkId);
	return { run: run.size, passing: run.size - failing.size, failing: failing.size };
}
