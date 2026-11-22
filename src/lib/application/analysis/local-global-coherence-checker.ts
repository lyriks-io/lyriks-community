import {
	computeReadiness,
	LOCAL_CHECK_IDS,
	MATURITY_DIMENSION_KEY,
	type CoherenceAnalysis,
	type Dimension,
	type Gap,
	type GapKind,
	type GapSeverity
} from '$domain/coherence';
import { computeIdentityCoherence, type FoundationIdentityDraft } from '$domain/foundation';
import { computeDefinitionCoherence, type FoundationDefinitionDraft } from '$domain/foundation';
import {
	computeOperationsCoherence,
	type FoundationOperationsDraft
} from '$domain/foundation';
import {
	computeUsersCoherence,
	permissionCoverage,
	usersCountsLine,
	type ProjectUsersDraft
} from '$domain/users';
import { computeFeaturesCoherence, leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import {
	analyzeCoverage,
	computeExperienceCoherence,
	type CoverageGap,
	type ProjectExperienceDraft
} from '$domain/experience';
import { derivedCapabilityIds } from '../specification/derived-capability-ids';
import { matrixGuardGaps } from './matrix-guard-gaps';
import { featureSurfaceCapabilities, featuresReachedByGrants, type LeafSnapshot } from '../projection/surface-capabilities';
import {
	computeRulesCoherence,
	ISSUE_KINDS,
	openCriticalContradictions,
	SETTLED_STATUSES,
	type IssueKind,
	type IssueSeverity,
	type ProjectRulesDraft
} from '$domain/rules';
import { computeDataCoherence, type ProjectDataDraft } from '$domain/data';
import { architectureStage, computeArchitectureCoherence, type ProjectArchitectureDraft } from '$domain/architecture';
import { computeGlossaryCoherence, type ProjectGlossaryDraft } from '$domain/glossary';
import type {
	BehaviorRepositoryPort,
	FeatureMaturityScorerPort,
	GlobalCoherenceCheckerPort
} from '../ports';
import { mapLimit } from '$lib/shared/map-limit';
import { NBSP, quoteName, specLanguage, type SpecLanguage } from '$domain/language';
import { countOf } from '$domain/coherence/section-tone';
import { isBlockingIssue, issueGapId } from '$domain/coherence/issue-gap';
import {
	behaviorFeatureProse,
	featuresDraftProse,
	proseDrift,
	proseDriftLine,
	type ProseDrift
} from '$domain/language';
import { PROSE_LANGUAGE_CHECK_ID } from '$domain/coherence';

/**
 * Bound the per-feature kernel reads that back the maturity dimension. Without
 * this, a project with many leaves fans out one `loadFeature` per leaf at once;
 * multiplied across every project on the dashboard it thrashes the appliance box.
 */
const MATURITY_LEAF_CONCURRENCY = 6;
import type {
	LoadArchitectureDraftUseCase,
	LoadDataDraftUseCase,
	LoadExperienceDraftUseCase,
	LoadFeaturesDraftUseCase,
	LoadFoundationDraftUseCase,
	LoadGlossaryDraftUseCase,
	LoadRulesDraftUseCase,
	LoadUsersDraftUseCase
} from '../use-cases';

/**
 * The LOCAL global-coherence checker: aggregates every earlier step's own
 * local-coherence into per-dimension scores, rolls them into one readiness
 * score, and detects the gaps that block a clean generation with deterministic
 * heuristics. Implements `GlobalCoherenceCheckerPort` — the future Rust DPO
 * `GrpcGlobalCoherenceChecker` implements the same port and swaps in here.
 */
export class LocalGlobalCoherenceChecker implements GlobalCoherenceCheckerPort {
	constructor(
		private readonly loadFoundation: Pick<LoadFoundationDraftUseCase, 'loadIdentity' | 'loadDefinition' | 'loadOperations'>,
		private readonly loadUsers: Pick<LoadUsersDraftUseCase, 'execute'>,
		private readonly loadFeatures: Pick<LoadFeaturesDraftUseCase, 'execute'>,
		private readonly loadExperience: Pick<LoadExperienceDraftUseCase, 'execute'>,
		private readonly loadRules: Pick<LoadRulesDraftUseCase, 'execute'>,
		private readonly loadData: Pick<LoadDataDraftUseCase, 'execute'>,
		private readonly loadArchitecture: Pick<LoadArchitectureDraftUseCase, 'execute'>,
		private readonly loadGlossary: Pick<LoadGlossaryDraftUseCase, 'execute'>,
		private readonly behavior: Pick<BehaviorRepositoryPort, 'loadFeature'>,
		private readonly maturityScorer: Pick<FeatureMaturityScorerPort, 'score'>
	) {}

	async analyze(projectId: string): Promise<CoherenceAnalysis> {
		const [identity, definition, operations, users, features, experience, rules, data, architecture, glossary] =
			await Promise.all([
				this.loadFoundation.loadIdentity(projectId),
				this.loadFoundation.loadDefinition(projectId),
				this.loadFoundation.loadOperations(projectId),
				this.loadUsers.execute(projectId),
				this.loadFeatures.execute(projectId),
				this.loadExperience.execute(projectId),
				this.loadRules.execute(projectId),
				this.loadData.execute(projectId),
				this.loadArchitecture.execute(projectId),
				this.loadGlossary.execute(projectId)
			]);

		// ── Leaf kernel snapshots — read ONCE ──
		// They back two readings: behavioral maturity (below) and the surface rows
		// of the permission matrix. Loading them here keeps both on a single bounded
		// fan-out; a second pass would double the per-project IO on the dashboard.
		const leaves = leafFeatures(features);
		const leafSnapshots: LeafSnapshot[] =
			leaves.length > 0
				? await mapLimit(leaves, MATURITY_LEAF_CONCURRENCY, async (leaf) => ({
						id: leaf.id,
						name: leaf.name,
						snapshot: await this.behavior.loadFeature(projectId, leaf.id)
					}))
				: [];
		const kernelSurfaceIds = featureSurfaceCapabilities(leafSnapshots).map((c) => c.id);
		// A feature reached through a granted page or surface is granted (criterion 02a56f3c).
		const grantReach = featuresReachedByGrants(leaves, experience, leafSnapshots);

		// Every text below reads in the spec's language (its declared primary
		// locale; English when none is declared or it has no template).
		const lang = specLanguage(operations.i18n.primaryLocale).generated;

		// Experience plan-coverage (journeys, steps and the screen inventory, never a
		// drawn layout): read ONCE, its readiness feeds the coverage dimensions and its
		// findings the gap list, so the Control Center is the single home of the reading.
		const planCoverage = analyzeCoverage(experience, {
			roles: users.roles.map((r) => ({ id: r.id, name: r.name })),
			entityNames: data.entities.map((e) => e.name)
		});

		const dimensions = buildDimensions(
			identity,
			definition,
			operations,
			users,
			features,
			experience,
			rules,
			data,
			architecture,
			glossary,
			kernelSurfaceIds,
			grantReach,
			planCoverage.readinessScore,
			lang
		);
		const gaps = detectGaps(
			users,
			features,
			experience,
			rules,
			data,
			architecture,
			glossary,
			kernelSurfaceIds,
			grantReach,
			leafSnapshots,
			lang
		);

		// The access matrix read against the guards of the behaviour (criterion
		// 26262450 of feat-access-matrix), over the snapshots already read above.
		gaps.push(...matrixGuardGaps(users, leafSnapshots, lang));

		// Experience plan-coverage findings fold into the SAME gap list, so coherence is
		// computed identically everywhere (portfolio, coherence page, sidebar, Control
		// Center) from one source. None of them is blocking.
		for (const g of planCoverage.gaps) {
			const plan = planCoverageCheck(g.id, lang);
			const subject = quotedSubject(g.title);
			gaps.push({
				id: `exp-${g.id}`,
				checkId: plan.checkId,
				kind: plan.kind,
				kindLabel: plan.kindLabel,
				provenance: 'detected',
				...(subject ? { subject } : {}),
				severity: COVERAGE_SEVERITY[g.severity],
				title: g.title,
				detail: g.detail,
				// The plan-coverage detail is already the instruction.
				action: g.detail,
				sourceStep: 'experience',
				blocking: g.severity === 'blocking'
			});
		}

		// ── Behavioral maturity — the buildability signal ──
		// Score each leaf's authored Unspaghettit shell; an empty shell scores ~0.
		const featureMaturity: Record<string, number> = {};
		const scores = leafSnapshots.map((leaf) => this.maturityScorer.score(leaf.snapshot));
		for (const [index, leaf] of leaves.entries()) featureMaturity[leaf.id] = scores[index] ?? 0;
		const maturityScore =
			scores.length > 0
				? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
				: 0;
		const maturedCount = scores.filter((score) => score > 0).length;
		const fr = lang === 'fr';
		dimensions.push({
			key: MATURITY_DIMENSION_KEY,
			label: fr ? 'Maturité du comportement' : 'Behavior maturity',
			sourceStep: 'features',
			score: maturityScore,
			summary:
				leaves.length > 0
					? fr
						? `${maturedCount}/${leaves.length} fonctionnalité(s) au comportement rédigé · moyenne ${maturityScore}${NBSP}%`
						: `${maturedCount}/${leaves.length} feature(s) with authored behavior · avg ${maturityScore}%`
					: fr
						? `Aucune fonctionnalité feuille n'existe, donc la maturité du comportement est de 0${NBSP}%`
						: 'No leaf feature exists, so behavior maturity is 0%'
		});
		if (leaves.length === 0) {
			gaps.push({
				id: 'gap-features-missing-leaf',
				checkId: 'features.has-leaf',
				kind: 'missing',
				kindLabel: fr ? 'Aucune fonctionnalité' : 'No feature',
				provenance: 'detected',
				severity: 'high',
				title: fr
					? `Rien à construire pour l'instant${NBSP}: le produit n'a aucune fonctionnalité`
					: 'Nothing to build yet: the product has no feature',
				detail: fr
					? "Rien ne peut être simulé, accordé ni construit tant que le produit n'a pas au moins une fonctionnalité."
					: 'Nothing can be simulated, granted or built until the product has at least one feature.',
				action: fr
					? 'Créez au moins une fonctionnalité feuille, puis rédigez ses surfaces, actions, états et scénarios.'
					: 'Create at least one leaf feature, then author its surfaces, actions, states and scenarios.',
				sourceStep: 'features',
				blocking: true
			});
		} else if (maturityScore < 50) {
			gaps.push({
				id: 'gap-features-immature',
				checkId: 'features.maturity',
				kind: 'missing',
				kindLabel: fr ? 'Comportement non rédigé' : 'Behavior not authored',
				provenance: 'detected',
				severity: 'high',
				title: fr
					? leaves.length - maturedCount > 0
						? `${countOf(lang, leaves.length - maturedCount, 'fonctionnalité', 'fonctionnalités')} sur ${leaves.length} ${leaves.length - maturedCount <= 1 ? "n'a" : "n'ont"} encore aucun comportement`
						: `Le comportement n'est rédigé qu'à ${maturityScore}${NBSP}% sur ${countOf(lang, leaves.length, 'fonctionnalité', 'fonctionnalités')}`
					: leaves.length - maturedCount > 0
						? `${leaves.length - maturedCount} of ${count(leaves.length, 'feature')} still have no behavior`
						: `Behavior is only ${maturityScore}% authored across ${count(leaves.length, 'feature')}`,
				detail: fr
					? `Sous la moitié de maturité, la plupart des fonctionnalités ne sont encore que des noms${NBSP}: aucune surface, action, état ni scénario à partir desquels construire.`
					: 'Below half maturity, most features are still names: no surfaces, actions, states or scenarios to build from.',
				action: fr
					? 'Complétez les surfaces, actions, états et scénarios manquants dans chaque fonctionnalité feuille.'
					: 'Complete the missing surfaces, actions, states and scenarios inside each leaf feature.',
				sourceStep: 'features',
				blocking: false
			});
		}

		// Prose in another language than the declared one (80ad0a4c): one card
		// listing each piece and where it lives. Read only when the project
		// declares its language; it refuses nothing and rewrites nothing.
		const checksRun = [...LOCAL_CHECK_IDS];
		if (operations.i18n.primaryLocale.trim()) {
			checksRun.push(PROSE_LANGUAGE_CHECK_ID);
			const drifts = proseDrift(operations.i18n.primaryLocale, [
				...featuresDraftProse(features),
				...leafSnapshots.flatMap((leaf) =>
					behaviorFeatureProse(
						(leaf.snapshot?.feature as Record<string, unknown> | undefined) ?? null,
						leaf.id,
						leaf.name
					)
				)
			]);
			if (drifts.length > 0) gaps.push(proseDriftGap(drifts, operations.i18n.primaryLocale, lang));
		}

		// The freshest save across every section — ISO timestamps sort chronologically.
		const lastActivityAt =
			[identity, definition, operations, users, features, experience, rules, data, architecture, glossary]
				.map((d) => d.lastSavedAt)
				.filter((t): t is string => typeof t === 'string' && t.length > 0)
				.sort()
				.pop() ?? null;

		const readinessScore = computeReadiness(dimensions);
		return {
			dimensions,
			gaps,
			readinessScore,
			lastActivityAt,
			featureMaturity,
			checksRun
		};
	}
}

/** "1 feature" / "3 features": counts the way a reader says them. */
function count(n: number, singular: string, plural = `${singular}s`): string {
	return `${n} ${n === 1 ? singular : plural}`;
}

/** The English text, or the French one when the spec is written in French. */
function say(lang: SpecLanguage, en: string, fr: string): string {
	return lang === 'fr' ? fr : en;
}

/** Plural agreement in French: singular up to one. */
function frPlural(n: number, singular: string, plural: string): string {
	return n <= 1 ? singular : plural;
}

/** Experience plan-coverage severity → coherence gap severity. */
const COVERAGE_SEVERITY: Record<CoverageGap['severity'], GapSeverity> = {
	blocking: 'high',
	warning: 'medium',
	info: 'low'
};

/** Step-06 issue severity → coherence gap severity. */
const ISSUE_GAP_SEVERITY: Record<IssueSeverity, GapSeverity> = {
	critical: 'high',
	major: 'medium',
	minor: 'low'
};

/** The coarse incoherence group each declared issue kind lands in (explicit, no keyword inference). */
const ISSUE_GAP_KIND: Record<IssueKind, GapKind> = {
	contradiction: 'misalignment',
	ambiguity: 'misalignment',
	missing_rule: 'missing',
	unhandled_edge: 'missing',
	overlap: 'duplicate',
	dead_rule: 'orphan',
	unreachable_state: 'orphan'
};

/**
 * What to do about a declared issue, derived from its kind so the card always
 * carries a verb even when the author only wrote the question.
 */
const ISSUE_ACTION: Record<SpecLanguage, Record<IssueKind, string>> = {
	en: {
		contradiction: 'Keep one rule and retire or rewrite the other.',
		ambiguity: 'Define the term, then pin the rule to that definition.',
		missing_rule: 'Decide the rule and add it to the inventory.',
		unhandled_edge: 'Write the edge-case scenario that covers it.',
		overlap: 'Merge the two rules into one.',
		dead_rule: 'Remove the rule, or make its condition reachable.',
		unreachable_state: 'Add the transition that reaches the state, or remove the state.'
	},
	fr: {
		contradiction: "Gardez une règle et retirez ou réécrivez l'autre.",
		ambiguity: 'Définissez le terme, puis rattachez la règle à cette définition.',
		missing_rule: "Tranchez la règle et ajoutez-la à l'inventaire.",
		unhandled_edge: 'Rédigez le scénario de cas limite qui le couvre.',
		overlap: 'Fusionnez les deux règles en une seule.',
		dead_rule: 'Supprimez la règle, ou rendez sa condition atteignable.',
		unreachable_state: "Ajoutez la transition qui atteint l'état, ou supprimez l'état."
	}
};

/** The declared issue kinds in French; the English labels come from the rules catalogue. */
const ISSUE_KIND_LABEL_FR: Record<IssueKind, string> = {
	contradiction: 'Contradiction',
	missing_rule: 'Règle manquante',
	ambiguity: 'Ambiguïté',
	overlap: 'Chevauchement',
	dead_rule: 'Règle morte',
	unreachable_state: 'État inatteignable',
	unhandled_edge: 'Cas limite non traité'
};

/** The plan-coverage detector behind an `exp-*` gap id, with its reader-facing class. */
function planCoverageCheck(
	coverageGapId: string,
	lang: SpecLanguage = 'en'
): {
	checkId: string;
	kind: GapKind;
	kindLabel: string;
} {
	const l = (en: string, fr: string) => say(lang, en, fr);
	if (coverageGapId.startsWith('screen-unvisited-'))
		return {
			checkId: 'experience.plan.screen-unvisited',
			kind: 'orphan',
			kindLabel: l('Screen no step visits', 'Écran sans étape')
		};
	if (coverageGapId.startsWith('journey-unlinked-'))
		return {
			checkId: 'experience.plan.journey-unlinked',
			kind: 'step-without-action',
			kindLabel: l('Journey without a screen', 'Parcours sans écran')
		};
	if (coverageGapId.startsWith('step-unlinked-'))
		return { checkId: 'experience.plan.step-unlinked', kind: 'dangling', kindLabel: l('Step without a screen', 'Étape sans écran') };
	if (coverageGapId.startsWith('step-shallow-'))
		return {
			checkId: 'experience.plan.step-shallow',
			kind: 'step-without-action',
			kindLabel: l('Step that says nothing', 'Étape muette')
		};
	if (coverageGapId.startsWith('core-uncovered-'))
		return { checkId: 'experience.plan.core-uncovered', kind: 'orphan', kindLabel: l('Core without a journey', 'Domaine sans parcours') };
	if (coverageGapId.startsWith('role-unused-'))
		return { checkId: 'experience.plan.role-unused', kind: 'orphan', kindLabel: l('Role without a journey', 'Rôle sans parcours') };
	if (coverageGapId.startsWith('entity-unused-'))
		return { checkId: 'experience.plan.entity-unused', kind: 'orphan', kindLabel: l('Unused entity', 'Entité inutilisée') };
	return { checkId: 'experience.plan.journey-unlinked', kind: 'missing', kindLabel: l('Plan coverage', 'Couverture du plan') };
}

/** The first quoted name in a detector title ("Checkout" is empty, « Checkout » est vide), the element the gap is about. */
function quotedSubject(title: string): string | undefined {
	const m = /"([^"]+)"/.exec(title) ?? /«\s*([^»]+?)\s*»/.exec(title);
	return m?.[1]?.trim() || undefined;
}

/** How many drifting pieces the card lists by name before it counts the rest. */
const PROSE_DRIFT_SHOWN = 12;

/**
 * The Control Center card for prose written in another language than the
 * spec's (80ad0a4c): every piece with where it lives and the language it reads
 * in. Never blocking: nothing is refused, nothing rewritten.
 */
export function proseDriftGap(drifts: readonly ProseDrift[], declaredLocale: string, lang: SpecLanguage): Gap {
	const fr = lang === 'fr';
	const reading = specLanguage(declaredLocale);
	const declaredName = fr
		? ({ en: 'anglais', fr: 'français' } as Record<string, string>)[reading.language] ?? reading.language
		: ({ en: 'English', fr: 'French' } as Record<string, string>)[reading.language] ?? reading.language;
	const shown = drifts.slice(0, PROSE_DRIFT_SHOWN).map((d) => `• ${proseDriftLine(lang, d)}`);
	const more = drifts.length - shown.length;
	const n = drifts.length;
	const features = [...new Set(drifts.map((d) => d.featureName || d.featureId).filter(Boolean))];
	return {
		id: 'gap-language-prose-drift',
		checkId: PROSE_LANGUAGE_CHECK_ID,
		kind: 'misalignment',
		kindLabel: fr ? 'Prose dans une autre langue' : 'Prose in another language',
		provenance: 'detected',
		...(features.length > 0 ? { subject: features.join(', ') } : {}),
		severity: n > 3 ? 'medium' : 'low',
		title: fr
			? `${n} ${frPlural(n, 'texte du modèle se lit', 'textes du modèle se lisent')} dans une autre langue que celle de la spec (${declaredName})`
			: `${count(n, 'text in the model reads', 'texts in the model read')} in another language than the spec's (${declaredName})`,
		detail:
			(fr
				? `La spec est écrite en ${declaredName}${NBSP}; ${frPlural(n, "ce texte ne l'est pas", 'ces textes ne le sont pas')}${NBSP}:\n`
				: `The spec is written in ${declaredName}; ${n === 1 ? 'this text is' : 'these texts are'} not:\n`) +
			shown.join('\n') +
			(more > 0 ? (fr ? `\n… et ${more} autres.` : `\n… and ${more} more.`) : ''),
		action: fr
			? `Réécrivez chaque texte listé en ${declaredName}. Les noms que porte le code ne sont jamais concernés.`
			: `Rewrite each text listed in ${declaredName}. The names the code carries are never concerned.`,
		sourceStep: 'features',
		blocking: false
	};
}

function buildDimensions(
	identity: FoundationIdentityDraft,
	definition: FoundationDefinitionDraft,
	operations: FoundationOperationsDraft,
	users: ProjectUsersDraft,
	features: ProjectFeaturesDraft,
	experience: ProjectExperienceDraft,
	rules: ProjectRulesDraft,
	data: ProjectDataDraft,
	architecture: ProjectArchitectureDraft,
	glossary: ProjectGlossaryDraft,
	kernelSurfaceIds: readonly string[],
	grantReach: Readonly<Record<string, readonly string[]>>,
	planCoverageScore: number,
	lang: SpecLanguage = 'en'
): Dimension[] {
	const fr = lang === 'fr';
	const leaves = leafFeatures(features).length;
	const foundation = Math.round(
		(computeIdentityCoherence(identity).score +
			computeDefinitionCoherence(definition).score +
			computeOperationsCoherence(operations, identity.sourceMode !== 'greenfield').score) /
			3
	);
	const openCritical = openCriticalContradictions(rules).length;
	const placedEntities = data.entities.filter((e) => e.databaseId).length;
	const referencedTech = architecture.techChoices.filter((t) => t.referenceDocId).length;
	const glossaryTerms = glossary.terms.filter((t) => t.term.trim());
	const approvedTerms = glossaryTerms.filter((t) => t.status === 'approved').length;

	return [
		{
			key: 'foundation',
			label: fr ? 'Fondation' : 'Foundation',
			sourceStep: 'foundation',
			score: foundation,
			summary: fr
				? `${definition.businessObjective.successCriteria.length} critère(s) de succès · ${operations.testFixtures.length} jeu(x) de test`
				: `${definition.businessObjective.successCriteria.length} success criterion(a) · ${operations.testFixtures.length} fixture(s)`
		},
		{
			key: 'features',
			label: fr ? 'Fonctionnalités' : 'Features',
			sourceStep: 'features',
			score: computeFeaturesCoherence(features).score,
			summary: fr ? `${leaves} fonctionnalité(s) feuille(s)` : `${leaves} leaf feature(s)`
		},
		{
			key: 'users',
			label: fr ? 'Utilisateurs' : 'Users',
			sourceStep: 'users',
			score: computeUsersCoherence(
				users,
				derivedCapabilityIds(features, experience, kernelSurfaceIds),
				lang,
				grantReach
			).score,
			// Accesses, never stored lines (criterion 8554bd0d).
			summary: usersCountsLine(users, lang)
		},
		{
			key: 'experience',
			label: fr ? 'Expérience' : 'Experience',
			sourceStep: 'experience',
			score: computeExperienceCoherence(experience).score,
			summary: fr
				? `${experience.journeys.length} parcours · ${experience.steps.length} étape(s)`
				: `${experience.journeys.length} journey(s) · ${experience.steps.length} step(s)`
		},
		{
			// Plan-coverage readiness (every journey on a screen, every step on a screen
			// and described, every screen visited). Lives in the Control Center's
			// coverage panel and merges into the Experience row there.
			key: 'experience-plan',
			label: fr ? 'Couverture du plan' : 'Plan coverage',
			sourceStep: 'experience',
			score: planCoverageScore,
			summary: fr
				? `${experience.screens.length} écran(s) · plan couvert à ${planCoverageScore}${NBSP}%`
				: `${experience.screens.length} screen(s) · plan ${planCoverageScore}% covered`
		},
		{
			key: 'rules',
			label: fr ? 'Règles' : 'Rules',
			sourceStep: 'rules',
			score: computeRulesCoherence(rules).score,
			summary: fr
				? `${rules.issues.length} problème(s) · ${openCritical} bloquant(s)`
				: `${rules.issues.length} issue(s) · ${openCritical} blocking`
		},
		{
			key: 'data',
			label: fr ? 'Données' : 'Data',
			sourceStep: 'data',
			score: computeDataCoherence(data).score,
			summary: fr
				? `${data.entities.length} entité(s) · ${placedEntities} placée(s)`
				: `${data.entities.length} entit(ies) · ${placedEntities} placed`
		},
		{
			key: 'architecture',
			label: 'Architecture',
			sourceStep: 'architecture',
			score: computeArchitectureCoherence(architecture).score,
			summary: fr
				? `${architecture.techChoices.length} technologie(s) · ${referencedTech} référencée(s) · ${architecture.constraints.length} contrainte(s)`
				: `${architecture.techChoices.length} tech · ${referencedTech} referenced · ${architecture.constraints.length} constraint(s)`
		},
		{
			// The governed vocabulary is product content like any other section — its
			// local score reports here so an ungoverned language shows in the Control
			// Center instead of only on the Glossary page (honest 0 when empty).
			key: 'glossary',
			label: fr ? 'Glossaire' : 'Glossary',
			sourceStep: 'glossary',
			score: computeGlossaryCoherence(glossary).score,
			summary: fr
				? `${glossaryTerms.length} terme(s) · ${approvedTerms} approuvé(s)`
				: `${glossaryTerms.length} term(s) · ${approvedTerms} approved`
		}
	];
}

function detectGaps(
	users: ProjectUsersDraft,
	features: ProjectFeaturesDraft,
	experience: ProjectExperienceDraft,
	rules: ProjectRulesDraft,
	data: ProjectDataDraft,
	architecture: ProjectArchitectureDraft,
	glossary: ProjectGlossaryDraft,
	kernelSurfaceIds: readonly string[],
	grantReach: Readonly<Record<string, readonly string[]>>,
	leafSnapshots: readonly LeafSnapshot[],
	lang: SpecLanguage = 'en'
): Gap[] {
	const fr = lang === 'fr';
	const gaps: Gap[] = [];

	const missingSnapshots = leafSnapshots.filter((leaf) => leaf.snapshot === null);
	if (missingSnapshots.length > 0) {
		const missingNames = missingSnapshots.map((leaf) => leaf.name || leaf.id);
		gaps.push({
			id: 'gap-features-missing-kernel-snapshots',
			checkId: 'features.kernel-record',
			kind: 'dangling',
			kindLabel: fr ? 'Enregistrement de comportement manquant' : 'Behavior record missing',
			provenance: 'detected',
			subject: missingNames.join(', '),
			severity: 'high',
			title: fr
				? `${countOf(lang, missingSnapshots.length, 'fonctionnalité', 'fonctionnalités')} ${frPlural(missingSnapshots.length, "n'a", "n'ont")} aucun enregistrement de comportement à partir duquel construire`
				: `${count(missingSnapshots.length, 'feature')} ${missingSnapshots.length === 1 ? 'has' : 'have'} no behavior record to build from`,
			detail: fr
				? `L'arbre des fonctionnalités nomme ${missingNames.map((n) => quoteName(lang, n)).join(', ')}, mais le magasin de comportement n'en a aucun enregistrement.`
				: `The feature tree names ${missingNames.join(', ')}, but the behavior store has no record for them.`,
			action: fr
				? 'Restaurez ou rédigez à nouveau le comportement de chaque fonctionnalité nommée.'
				: 'Restore or re-author the behavior of each feature named.',
			sourceStep: 'features',
			blocking: true
		});
	}

	// Step-06 issues (contradictions, gaps, ambiguities over the declared rules) —
	// one gap per OPEN issue, so they surface in the Control Center's coherence
	// panel. The Rules & edge cases tab itself only authors rules and edge-case
	// scenarios; this list is the single home of the issues.
	const kindLabel = new Map<IssueKind, string>(
		ISSUE_KINDS.map((k) => [k.code, fr ? ISSUE_KIND_LABEL_FR[k.code] : k.label])
	);
	const featureName = new Map(
		leafFeatures(features).map((f) => [f.id, f.name || (fr ? '<fonctionnalité sans nom>' : '<unnamed feature>')])
	);
	for (const issue of rules.issues) {
		if (SETTLED_STATUSES.includes(issue.status)) continue;
		const gapKind = issue.kind === 'missing_rule' || issue.kind === 'unhandled_edge';
		const subject = issue.relatedFeatureId ? featureName.get(issue.relatedFeatureId) : undefined;
		gaps.push({
			// The hint word in the id is kept for stable ids (acknowledgements and
			// decisions reference it); the group itself is explicit below.
			id: issueGapId(issue.kind, issue.id),
			checkId: 'rules.open-issues',
			kind: ISSUE_GAP_KIND[issue.kind],
			kindLabel: kindLabel.get(issue.kind) ?? 'Issue',
			// A hand-written issue is a decision to settle, not a detector's finding;
			// only the automatic scan's issues are detections.
			provenance: issue.autoDetected ? 'detected' : 'declared',
			// What the product does wrong weighs more than a decision still to take.
			nature: issue.kind === 'unhandled_edge' || issue.kind === 'contradiction' ? 'defect' : 'question',
			...(subject ? { subject } : {}),
			severity: ISSUE_GAP_SEVERITY[issue.severity],
			title:
				issue.title.trim() ||
				(fr
					? `${kindLabel.get(issue.kind) ?? 'Problème'} dans les règles déclarées`
					: `${kindLabel.get(issue.kind) ?? 'Issue'} in the declared rules`),
			detail:
				issue.detail.trim() ||
				(fr
					? `Signalé dans les règles déclarées${NBSP}: corrigez les règles concernées, ou couvrez-le par un scénario de cas limite.`
					: 'Flagged across the declared rules: fix the rules it concerns, or cover it with an edge-case scenario.'),
			// An issue in review has its fix written: the next step is to confirm it
			// or reopen it, not to author more. Project health lists it apart and
			// weighs nothing on it; the coherence reading still counts it unsettled.
			action:
				issue.status === 'in_review'
					? fr
						? 'Vérifiez que le produit fait maintenant ce que dit sa note, puis confirmez la correction ou rouvrez-la.'
						: 'Check that the product now does what its note says, then confirm the fix or reopen it.'
					: ISSUE_ACTION[lang][issue.kind],
			...(issue.status === 'in_review' ? { fixToConfirm: true as const } : {}),
			sourceStep: 'rules',
			// Same gate as before: a critical contradiction blocks the push.
			blocking: isBlockingIssue(issue),
			// Gaps are covered by authoring an edge-case scenario; the rest are fixed
			// on the rule inventory.
			fixAnchor: gapKind ? '&rtab=edge_cases' : '&rtab=inventory',
			featureRef: issue.relatedFeatureId ?? undefined
		});
	}

	// An acceptance criterion always tests a feature. One naming none (written
	// before that rule, or whose feature was deleted) shows nowhere in the feature
	// tree, so it is flagged here rather than silently lost; Fix now opens the tree
	// with it on top, to pick the feature it tests.
	for (const criterion of rules.scenarios) {
		if (criterion.relatedFeatureId && featureName.has(criterion.relatedFeatureId)) continue;
		const name = criterion.title.trim() || criterion.given.trim() || 'An untitled criterion';
		gaps.push({
			id: `gap-rules-criterion-unattached-${criterion.id}`,
			checkId: 'rules.criteria-attached',
			kind: 'orphan',
			kindLabel: 'Criterion testing no feature',
			provenance: 'detected',
			subject: name,
			severity: 'medium',
			title: `"${name}" tests no feature`,
			detail: criterion.relatedFeatureId
				? 'The feature this acceptance criterion tested was deleted, so it reads nowhere in the feature tree.'
				: 'This acceptance criterion names no feature, so it reads nowhere in the feature tree.',
			action: 'Attach it to the feature it tests.',
			sourceStep: 'features',
			blocking: false,
			fixAnchor: `?case=${encodeURIComponent(criterion.id)}`
		});
	}

	// Permission matrix coverage (Step 03) — the same metric the Users score
	// weighs heaviest, so the card and the dimension agree. A feature no profile
	// is granted (no action of it, no surface of it, no page of its Core) is a
	// gap of the specification: the matrix does not say who may use it. It is
	// never read as a feature nobody can reach, since the product enforces its
	// own access checks whatever the matrix says (criterion 02a56f3c).
	// Ungranted system/journey caps and roles with no access at all are
	// secondary clauses. Not the unreachable "every role holds every capability"
	// of cell density.
	const coverage = permissionCoverage(
		users,
		derivedCapabilityIds(features, experience, kernelSurfaceIds),
		grantReach
	);
	const uncoveredFeatures = coverage.uncoveredCapabilityIds.filter((id) => featureName.has(id));
	const uncoveredOther = coverage.uncoveredCapabilityIds.length - uncoveredFeatures.length;
	const orphanRoles = coverage.uncoveredRoleIds.length;
	if (uncoveredFeatures.length > 0 || uncoveredOther > 0 || orphanRoles > 0) {
		const parts: string[] = [];
		if (uncoveredFeatures.length > 0)
			parts.push(
				fr
					? `${countOf(lang, uncoveredFeatures.length, 'fonctionnalité', 'fonctionnalités')} sans profil autorisé`
					: `${uncoveredFeatures.length} feature${uncoveredFeatures.length === 1 ? '' : 's'} no profile is granted`
			);
		if (uncoveredOther > 0)
			parts.push(
				fr
					? `${uncoveredOther} autre${frPlural(uncoveredOther, '', 's')} ${frPlural(uncoveredOther, 'capacité accordée', 'capacités accordées')} à personne`
					: `${uncoveredOther} other capabilit${uncoveredOther === 1 ? 'y' : 'ies'} ungranted`
			);
		if (orphanRoles > 0)
			parts.push(
				fr
					? `${countOf(lang, orphanRoles, 'rôle', 'rôles')} sans aucun accès`
					: `${orphanRoles} role${orphanRoles === 1 ? '' : 's'} with no access`
			);
		const named = uncoveredFeatures.map((id) => featureName.get(id)).join(', ');
		const trail = parts.length > 1 ? ` (${parts.slice(1).join(', ')})` : '';
		const many = uncoveredFeatures.length > 1;
		// Subject first: ONE feature is named in the title, several are counted
		// there and named in the subject; the other clauses trail.
		const title = fr
			? uncoveredFeatures.length === 1
				? `La matrice d'accès ne dit pas qui peut utiliser ${quoteName(lang, named)}${trail}`
				: many
					? `La matrice d'accès ne dit pas qui peut utiliser ${uncoveredFeatures.length} fonctionnalités${trail}`
					: orphanRoles > 0 && uncoveredOther === 0
						? `${countOf(lang, orphanRoles, 'rôle', 'rôles')} ne ${frPlural(orphanRoles, 'peut', 'peuvent')} encore rien faire`
						: `${countOf(lang, uncoveredOther, 'capacité', 'capacités')} ${frPlural(uncoveredOther, "n'est accordée", "ne sont accordées")} à personne${orphanRoles > 0 ? trail : ''}`
			: uncoveredFeatures.length === 1
				? `The access matrix does not say who may use ${named}${trail}`
				: many
					? `The access matrix does not say who may use ${uncoveredFeatures.length} features${trail}`
					: orphanRoles > 0 && uncoveredOther === 0
					? `${count(orphanRoles, 'role')} can do nothing yet`
					: `${count(uncoveredOther, 'capability is', 'capabilities are')} granted to nobody${orphanRoles > 0 ? ` (${parts.slice(1).join(', ')})` : ''}`;
		gaps.push({
			id: 'gap-users-coverage',
			checkId: 'users.feature-reachable',
			kind: 'missing',
			kindLabel: fr
				? uncoveredFeatures.length > 0
					? 'Fonctionnalité sans droit utilisateur'
					: orphanRoles > 0
						? 'Rôle sans accès'
						: 'Capacité non accordée'
				: uncoveredFeatures.length > 0 ? 'Feature with no user right' : orphanRoles > 0 ? 'Role with no access' : 'Ungranted capability',
			provenance: 'detected',
			...(named ? { subject: named } : {}),
			// A gap of the specification, not a defect of the product: it weighs
			// like the other gaps in the description (criterion 1eb37948).
			severity: 'medium',
			title,
			detail: fr
				? uncoveredFeatures.length
					? `Aucun profil de la matrice d'accès ne détient une action de ${uncoveredFeatures.map((id) => quoteName(lang, featureName.get(id) ?? id)).join(', ')}, une de ${frPlural(uncoveredFeatures.length, 'ses', 'leurs')} surfaces ni une page de ${frPlural(uncoveredFeatures.length, 'son', 'leur')} cœur. Le produit applique toujours ses propres contrôles d'accès${NBSP}: la spécification ne dit pas encore qui peut utiliser ${frPlural(uncoveredFeatures.length, 'cette fonctionnalité', 'ces fonctionnalités')}.`
					: 'Chaque capacité devrait être accordée à au moins un rôle, et chaque rôle devrait détenir au moins une capacité.'
				: uncoveredFeatures.length
					? `No profile of the access matrix holds an action of ${named}, one of ${many ? 'their' : 'its'} surfaces or a page of ${many ? 'their' : 'its'} Core. The product still applies its own access checks: the specification does not say who may use ${many ? 'these features' : 'this feature'} yet.`
					: 'Every capability should be granted to at least one role, and every role should hold at least one capability.',
			action: fr
				? uncoveredFeatures.length
					? `Dans la matrice d'accès, accordez ${frPlural(uncoveredFeatures.length, 'cette fonctionnalité', 'chacune de ces fonctionnalités')} aux profils qui s'en servent.`
					: 'Accordez chaque capacité à au moins un rôle, et donnez à chaque rôle au moins une capacité.'
				: uncoveredFeatures.length
					? `Grant ${many ? 'each of them' : 'it'} to the profiles that use ${many ? 'them' : 'it'} in the access matrix.`
					: 'Grant every capability to at least one role, and give every role at least one capability.',
			sourceStep: 'users',
			blocking: false
		});
	}

	// Forgotten tables (Step 07): entities referenced by journeys but not modeled.
	const haveEntities = new Set(data.entities.map((e) => e.name.trim().toLowerCase()));
	const forgotten = data.derivedEntities.filter(
		(d) => !haveEntities.has(d.name.trim().toLowerCase())
	).length;
	if (forgotten > 0) {
		gaps.push({
			id: 'gap-data-forgotten',
			checkId: 'data.tables-modeled',
			kind: 'missing',
			kindLabel: fr ? 'Table sans schéma' : 'Table without a schema',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? `${countOf(lang, forgotten, 'table utilisée', 'tables utilisées')} par les parcours ${frPlural(forgotten, 'demande', 'demandent')} un schéma`
				: `${count(forgotten, 'table')} used by journeys ${forgotten === 1 ? 'needs' : 'need'} a schema`,
			detail: fr
				? 'Un parcours lit ou écrit une table que le modèle de données ne déclare jamais.'
				: 'A journey reads or writes a table the data model never declares.',
			action: fr
				? 'Dérivez les tables manquantes dans Données et flux.'
				: 'Derive the missing tables in Data & flows.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// Glossary governance — a STARTED vocabulary that is not locked down is a
	// language incoherence (a term everyone reads differently), so its two quality
	// issues surface here; an empty glossary only reads as the dimension's 0.
	const glossaryTerms = glossary.terms.filter((t) => t.term.trim());
	const undefinedTerms = glossaryTerms.filter((t) => !t.definition.trim()).length;
	if (undefinedTerms > 0) {
		gaps.push({
			id: 'gap-glossary-undefined-terms',
			checkId: 'glossary.defined',
			kind: 'missing',
			kindLabel: fr ? 'Terme sans définition' : 'Term without a definition',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? `${countOf(lang, undefinedTerms, 'terme gouverné', 'termes gouvernés')} ${frPlural(undefinedTerms, 'demande', 'demandent')} une définition`
				: `${count(undefinedTerms, 'governed term')} ${undefinedTerms === 1 ? 'needs' : 'need'} a definition`,
			detail: fr
				? `Un terme sans définition ne gouverne rien${NBSP}: chacun continue de le lire à sa façon.`
				: 'A term without a definition governs nothing: everyone keeps reading it their own way.',
			action: fr
				? 'Écrivez dans le Glossaire ce que chaque terme signifie de référence.'
				: 'Write what each term canonically means in Glossary.',
			sourceStep: 'glossary',
			blocking: false
		});
	}
	const unapprovedTerms = glossaryTerms.filter((t) => t.status !== 'approved').length;
	if (unapprovedTerms > 0) {
		gaps.push({
			id: 'gap-glossary-unapproved-terms',
			checkId: 'glossary.approved',
			kind: 'missing',
			kindLabel: fr ? 'Terme en brouillon' : 'Term in draft',
			provenance: 'detected',
			severity: 'low',
			title: fr
				? `${countOf(lang, unapprovedTerms, 'terme attend', 'termes attendent')} une approbation`
				: `${count(unapprovedTerms, 'term')} ${unapprovedTerms === 1 ? 'is' : 'are'} waiting for approval`,
			detail: fr
				? `Un terme en brouillon n'est pas encore la langue du produit${NBSP}; il peut encore changer pour tout le monde.`
				: 'A term in draft is not yet the product language; it can still change under everyone.',
			// The Glossary page corrects a term but never approves it (criterion 6cc78061):
			// the advice names what a person can actually do (criterion bd26ee01).
			action: fr
				? `Demandez à votre IA d'approuver les termes arrêtés${NBSP}: la page Glossaire corrige un terme mais ne l'approuve pas.`
				: 'Ask your AI to approve the terms that are settled: the Glossary page corrects a term but does not approve it.',
			sourceStep: 'glossary',
			blocking: false
		});
	}

	// Unreferenced tech (Step 08).
	const unreferenced = architecture.techChoices.filter((t) => !t.referenceDocId).length;
	if (architectureStage(architecture) === 'implementation' && unreferenced > 0) {
		gaps.push({
			id: 'gap-architecture-refs',
			checkId: 'architecture.references',
			kind: 'dangling',
			kindLabel: fr ? 'Choix technique sans référence' : 'Tech choice without a reference',
			provenance: 'detected',
			severity: 'low',
			title: fr
				? `${countOf(lang, unreferenced, 'choix technique demande', 'choix techniques demandent')} une référence officielle`
				: `${count(unreferenced, 'tech choice')} ${unreferenced === 1 ? 'needs' : 'need'} an official reference`,
			detail: fr
				? "Un choix technique sans sa référence officielle laisse les agents deviner la version et l'API."
				: 'A tech choice without its official reference leaves agents to guess the version and the API.',
			action: fr
				? 'Joignez un document de référence à chaque choix technique.'
				: 'Attach a reference doc to each tech choice.',
			sourceStep: 'architecture',
			blocking: false
		});
	}

	// Thin experience (Step 05).
	if (experience.journeys.length === 0 && leafCount(features) > 0) {
		gaps.push({
			id: 'gap-experience-empty',
			checkId: 'experience.has-journey',
			kind: 'missing',
			kindLabel: fr ? 'Aucun parcours' : 'No journey',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? "Aucun parcours ne montre encore comment le produit s'utilise"
				: 'No journey shows how the product is used yet',
			detail: fr
				? "Des fonctionnalités existent, mais rien ne dit comment un utilisateur les parcourt."
				: 'Features exist, but nothing says how a user walks through them.',
			action: fr
				? "Rédigez au moins un parcours dans l'Expérience."
				: 'Author at least one journey in Experience.',
			sourceStep: 'experience',
			blocking: false
		});
	}

	// ORPHAN — roles defined but granted nothing (Users × Permissions).
	if (users.roles.length > 0 && users.permissions.length === 0) {
		gaps.push({
			id: 'gap-users-orphan-roles',
			checkId: 'users.roles-granted',
			kind: 'orphan',
			kindLabel: fr ? 'Rôle sans capacité' : 'Role with no capability',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? `${countOf(lang, users.roles.length, 'rôle', 'rôles')} ne ${frPlural(users.roles.length, 'peut', 'peuvent')} encore rien faire`
				: `${count(users.roles.length, 'role')} can do nothing yet`,
			detail: fr
				? "Un rôle à qui rien n'est accordé ne fait rien dans le produit."
				: 'A role granted nothing does nothing in the product.',
			action: fr
				? "Accordez au moins une capacité par rôle dans la matrice d'accès."
				: 'Grant at least one capability per role in the access matrix.',
			sourceStep: 'users',
			blocking: false
		});
	}

	// DUPLICATE — two entities sharing a normalized name (ambiguous schema).
	const entityNames = data.entities
		.map((e) => e.name.trim().toLowerCase())
		.filter((n) => n.length > 0);
	const duplicateEntities = entityNames.length - new Set(entityNames).size;
	if (duplicateEntities > 0) {
		gaps.push({
			id: 'gap-data-duplicate-entities',
			checkId: 'data.entities-unique',
			kind: 'duplicate',
			kindLabel: fr ? "Nom d'entité en double" : 'Duplicate entity name',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? `${countOf(lang, duplicateEntities, "nom d'entité est utilisé", "noms d'entités sont utilisés")} deux fois`
				: `${count(duplicateEntities, 'entity name is', 'entity names are')} used twice`,
			detail: fr
				? 'Plusieurs entités partagent un même nom, ce qui rend le schéma ambigu.'
				: 'Two or more entities share a name, which makes the schema ambiguous.',
			action: fr
				? 'Fusionnez ou renommez les entités pour que chaque nom soit unique.'
				: 'Merge or rename the entities so each name is unique.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// ORPHAN — entities modeled but not placed on any database (no home).
	const unplaced = data.entities.filter((e) => !e.databaseId).length;
	if (unplaced > 0) {
		gaps.push({
			id: 'gap-data-orphan-entities',
			checkId: 'data.entities-placed',
			kind: 'orphan',
			kindLabel: fr ? 'Entité sans base de données' : 'Entity without a database',
			provenance: 'detected',
			severity: 'low',
			title: fr
				? `${countOf(lang, unplaced, "entité n'a", "entités n'ont")} aucune base de données où résider`
				: `${count(unplaced, 'entity has', 'entities have')} no database to live on`,
			detail: fr
				? "Une entité sans base de données hôte n'a nulle part où résider une fois le produit construit."
				: 'An entity with no host database has nowhere to live once the product is built.',
			action: fr
				? 'Placez chaque entité sur une base de données hôte dans Infrastructure et données.'
				: 'Place each entity on a host database in Infrastructure & Data.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// CROSS-CAPABILITY coherence — the whole product is a web of references that
	// must agree, not just features. These catch breaks BETWEEN capabilities.
	// ─────────────────────────────────────────────────────────────────────────

	const roleIds = new Set(users.roles.map((r) => r.id));

	// DANGLING (Experience → Users): a journey performs as a role that no longer exists.
	const danglingActors = experience.journeys.reduce(
		(n, jrn) => n + jrn.actorRoleIds.filter((id) => !roleIds.has(id)).length,
		0
	);
	if (danglingActors > 0) {
		gaps.push({
			id: 'gap-experience-dangling-role',
			checkId: 'experience.actors-resolve',
			kind: 'dangling',
			kindLabel: fr ? 'Rôle acteur supprimé' : 'Actor role deleted',
			provenance: 'detected',
			severity: 'high',
			title: fr
				? `${countOf(lang, danglingActors, 'parcours est effectué', 'parcours sont effectués')} par un rôle qui n'existe plus`
				: `${count(danglingActors, 'journey is', 'journeys are')} performed by a role that no longer exists`,
			detail: fr
				? "Un parcours est effectué par un rôle qui n'existe plus dans Utilisateurs."
				: 'A journey is performed by a role that no longer exists in Users.',
			action: fr
				? 'Rattachez le parcours à un rôle existant, ou restaurez le rôle.'
				: 'Re-point the journey to an existing role, or restore the role.',
			sourceStep: 'experience',
			blocking: false
		});
	}

	// DANGLING (Permissions → Users): a grant references a role that no longer exists.
	const danglingGrants = users.permissions.filter((g) => !roleIds.has(g.roleId)).length;
	if (danglingGrants > 0) {
		gaps.push({
			id: 'gap-permissions-dangling-role',
			checkId: 'users.grants-resolve',
			kind: 'dangling',
			kindLabel: fr ? 'Droit accordé à un rôle supprimé' : 'Grant to a deleted role',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? `${countOf(lang, danglingGrants, 'droit vise', 'droits visent')} un rôle qui n'existe plus`
				: `${count(danglingGrants, 'grant points', 'grants point')} to a role that no longer exists`,
			detail: fr
				? "La matrice d'accès accorde une capacité à un rôle qui n'existe plus dans Utilisateurs."
				: 'The access matrix grants a capability to a role that no longer exists in Users.',
			action: fr
				? 'Retirez le droit, ou restaurez le rôle dans Utilisateurs.'
				: 'Remove the grant, or restore the role in Users.',
			sourceStep: 'permissions',
			blocking: false
		});
	}

	// MISSING (Experience → Data): a journey consumes a field its entity does not model.
	const entityFieldNames = new Map<string, Set<string>>();
	for (const e of data.entities) entityFieldNames.set(e.name.trim().toLowerCase(), new Set());
	const entityNameById = new Map(data.entities.map((e) => [e.id, e.name.trim().toLowerCase()]));
	for (const f of data.fields) {
		const en = entityNameById.get(f.entityId);
		if (en) entityFieldNames.get(en)?.add(f.name.trim().toLowerCase());
	}
	let orphanFields = 0;
	for (const read of experience.stepDataReads) {
		const fieldSet = entityFieldNames.get(read.entityName.trim().toLowerCase());
		if (!fieldSet) continue; // entity not modeled at all → the forgotten-table check owns this
		for (const fld of read.fields) {
			if (fld.trim() && !fieldSet.has(fld.trim().toLowerCase())) orphanFields++;
		}
	}
	if (orphanFields > 0) {
		gaps.push({
			id: 'gap-data-orphan-fields',
			checkId: 'data.fields-modeled',
			kind: 'missing',
			kindLabel: fr ? 'Champ hors de son schéma' : 'Field outside its schema',
			provenance: 'detected',
			severity: 'medium',
			title: fr
				? `${countOf(lang, orphanFields, 'champ utilisé', 'champs utilisés')} par les parcours ${frPlural(orphanFields, 'manque', 'manquent')} dans ${frPlural(orphanFields, 'son entité', 'leur entité')}`
				: `${count(orphanFields, 'field')} used by journeys ${orphanFields === 1 ? 'is' : 'are'} missing from ${orphanFields === 1 ? 'its' : 'their'} entity`,
			detail: fr
				? 'Une étape de parcours lit ou écrit un champ que son entité ne modélise pas.'
				: 'A journey step reads or writes a field its entity does not model.',
			action: fr
				? "Ajoutez le champ à l'entité, ou corrigez l'étape du parcours."
				: 'Add the field to the entity, or fix the journey step.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// DANGLING (Data internal): a foreign-key relation points to a non-existent entity.
	const entityIds = new Set(data.entities.map((e) => e.id));
	const danglingRelations = data.fields.filter(
		(f) => f.relationTargetEntityId && !entityIds.has(f.relationTargetEntityId)
	).length;
	if (danglingRelations > 0) {
		gaps.push({
			id: 'gap-data-dangling-relations',
			checkId: 'data.relations-resolve',
			kind: 'dangling',
			kindLabel: fr ? 'Relation vers une entité absente' : 'Relation to a missing entity',
			provenance: 'detected',
			severity: 'high',
			title: fr
				? `${countOf(lang, danglingRelations, 'relation vise', 'relations visent')} une entité qui n'existe plus`
				: `${count(danglingRelations, 'relation points', 'relations point')} to an entity that no longer exists`,
			detail: fr
				? 'Un champ de clé étrangère référence une entité renommée ou supprimée.'
				: 'A foreign-key field references an entity that was renamed or deleted.',
			action: fr
				? "Faites pointer la relation vers une entité existante, ou restaurez l'entité."
				: 'Point the relation at an existing entity, or restore the entity.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// ORPHAN (Features → Experience): a Core carries features but no journey exercises it.
	if (experience.journeys.length > 0) {
		const coresWithFeatures = new Set(leafFeatures(features).map((f) => f.coreId));
		const coresWithJourney = new Set(experience.journeys.map((j) => j.coreId));
		const uncoveredCores = [...coresWithFeatures].filter((id) => !coresWithJourney.has(id)).length;
		if (uncoveredCores > 0) {
			gaps.push({
				id: 'gap-features-orphan-core',
				checkId: 'features.core-journey',
				kind: 'orphan',
				kindLabel: fr ? 'Domaine sans parcours' : 'Core without a journey',
				provenance: 'detected',
				severity: 'medium',
				title: fr
					? `${countOf(lang, uncoveredCores, "domaine fonctionnel n'a", "domaines fonctionnels n'ont")} aucun parcours`
					: `${count(uncoveredCores, 'capability area has', 'capability areas have')} no journey`,
				detail: fr
					? "Un domaine fonctionnel porte des fonctionnalités qu'aucun parcours utilisateur ne décrit."
					: 'A capability area carries features that no user journey maps.',
				action: fr
					? 'Rédigez un parcours pour chaque domaine fonctionnel laissé de côté.'
					: 'Author a journey for each capability area left out.',
				sourceStep: 'experience',
				blocking: false
			});
		}
	}

	return gaps;
}

function leafCount(features: ProjectFeaturesDraft): number {
	return leafFeatures(features).length;
}
