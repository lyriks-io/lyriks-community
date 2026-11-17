import type { GeneratedArtifact, CoherenceAnalysis } from '$domain/coherence';
import { architectureContext } from './architecture-context';
import type { FoundationIdentityDraft } from '$domain/foundation';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import type { ProjectUsersDraft } from '$domain/users';
import type { ProjectDocumentsDraft } from '$domain/documents';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import { stepsOfJourney, type ProjectExperienceDraft } from '$domain/experience';
import type { ProjectRulesDraft } from '$domain/rules';
import { fieldsOfEntity, type ProjectDataDraft } from '$domain/data';
import type { ProjectArchitectureDraft } from '$domain/architecture';
import { NBSP, type SpecLanguage } from '$domain/language';

export interface SpecEnvelope {
	identity: FoundationIdentityDraft;
	definition: FoundationDefinitionDraft;
	users: ProjectUsersDraft;
	documents: ProjectDocumentsDraft;
	features: ProjectFeaturesDraft;
	experience: ProjectExperienceDraft;
	rules: ProjectRulesDraft;
	data: ProjectDataDraft;
	architecture: ProjectArchitectureDraft;
	/**
	 * The MODEL's acceptance criteria per feature id, whoever authored them. A
	 * document that prints criteria must print the same list the product counts,
	 * or a criterion an AI client wrote would be missing from the requirements.
	 * Absent, or missing a feature, means the model has nothing for it and the
	 * features draft answers instead.
	 */
	acceptanceCriteriaByFeature?: Readonly<Record<string, readonly string[]>>;
}

function newId(): string {
	return crypto.randomUUID();
}

/**
 * Deterministically composes the three artifacts that become the AI Generation
 * Contract from the whole wizard envelope — a functional spec (what/why/who),
 * a technical spec (stack/data/infra/constraints), and a machine-readable
 * coherence graph. No AI here: it's a faithful projection of what the team
 * authored, which is the point — the contract is grounded, not hallucinated.
 */
export function composeArtifacts(
	env: SpecEnvelope,
	analysis: CoherenceAnalysis,
	now: string,
	lang: SpecLanguage = 'en'
): GeneratedArtifact[] {
	const t = SPEC_TEXTS[lang];
	return [
		{ id: newId(), kind: 'functional_doc', title: t.functionalTitle, generatedAt: now, content: functionalDoc(env, t) },
		{ id: newId(), kind: 'technical_doc', title: t.technicalTitle, generatedAt: now, content: technicalDoc(env, t, lang) },
		{ id: newId(), kind: 'requirements_doc', title: t.requirementsTitle, generatedAt: now, content: requirementsDoc(env, t) },
		{ id: newId(), kind: 'coherence_graph', title: t.graphTitle, generatedAt: now, content: coherenceGraph(env, analysis) }
	];
}

/**
 * Every heading and fixed phrase of the documents, in the spec's language.
 * What the team authored is printed as written; enum codes (MVP tier, issue
 * kind, host kind, engine) stay as the model stores them. The English texts
 * are the historical ones, byte for byte.
 */
interface SpecTexts {
	functionalTitle: string;
	technicalTitle: string;
	requirementsTitle: string;
	graphTitle: string;
	untitledProduct: string;
	requirementsHeading(product: string): string;
	functionalHeading(product: string): string;
	technicalHeading: string;
	goal: string;
	successCriteria: string;
	users: string;
	role: string;
	noneDeclared: string;
	requirements: string;
	core: string;
	feature: string;
	/** "Label: value", with the colon the language writes. */
	labelled(label: string, value: string): string;
	/** "**Label**: value" in bold. */
	boldLabelled(label: string, value: string): string;
	mvp: string;
	release: string;
	status: string;
	problem: string;
	value: string;
	objective: string;
	acceptanceCriteria: string;
	dependsOn: string;
	sources: string;
	missingSource(id: string): string;
	noFeatures: string;
	objectives: string;
	features: string;
	noDescription: string;
	journeys: string;
	journey: string;
	noSteps: string;
	rulesAndEdgeCases: string;
	scenario(given: string, when: string, then: string, outcome: string): string;
	dataModel: string;
	entity: string;
	infrastructure: string;
	host: string;
	database: string;
	constraints: string;
	slas: string;
	penalty(penalty: string): string;
}

const SPEC_TEXTS: Record<SpecLanguage, SpecTexts> = {
	en: {
		functionalTitle: 'Functional specification',
		technicalTitle: 'Technical specification',
		requirementsTitle: 'Product requirements document',
		graphTitle: 'Coherence graph',
		untitledProduct: 'Untitled product',
		requirementsHeading: (product) => `# Product requirements: ${product}`,
		functionalHeading: (product) => `# Functional specification: ${product}`,
		technicalHeading: '# Technical specification',
		goal: 'Goal',
		successCriteria: 'Success criteria',
		users: 'Users',
		role: 'Role',
		noneDeclared: '(none declared)',
		requirements: 'Requirements',
		core: 'Core',
		feature: 'Feature',
		labelled: (label, value) => `${label}: ${value}`,
		boldLabelled: (label, value) => `**${label}**: ${value}`,
		mvp: 'MVP',
		release: 'Release',
		status: 'Status',
		problem: 'Problem',
		value: 'Value',
		objective: 'Objective',
		acceptanceCriteria: 'Acceptance criteria',
		dependsOn: 'Depends on',
		sources: 'Sources',
		missingSource: (id) => `[Missing source: ${id}]`,
		noFeatures: '(no features declared)',
		objectives: 'Objectives',
		features: 'Features',
		noDescription: 'no description',
		journeys: 'User journeys',
		journey: 'Journey',
		noSteps: '(no steps)',
		rulesAndEdgeCases: 'Rules & edge cases',
		scenario: (given, when, then, outcome) => `Given ${given} / When ${when} / Then ${then} → ${outcome}`,
		dataModel: 'Data model',
		entity: 'Entity',
		infrastructure: 'Infrastructure',
		host: 'Host',
		database: 'Database',
		constraints: 'Non-negotiable constraints',
		slas: 'SLAs',
		penalty: (penalty) => ` (penalty ${penalty})`
	},
	fr: {
		functionalTitle: 'Spécification fonctionnelle',
		technicalTitle: 'Spécification technique',
		requirementsTitle: 'Document des exigences produit',
		graphTitle: 'Graphe de cohérence',
		untitledProduct: 'Produit sans titre',
		requirementsHeading: (product) => `# Exigences produit${NBSP}: ${product}`,
		functionalHeading: (product) => `# Spécification fonctionnelle${NBSP}: ${product}`,
		technicalHeading: '# Spécification technique',
		goal: 'Objectif',
		successCriteria: 'Critères de réussite',
		users: 'Utilisateurs',
		role: 'Rôle',
		noneDeclared: '(rien de déclaré)',
		requirements: 'Exigences',
		core: 'Cœur',
		feature: 'Fonctionnalité',
		labelled: (label, value) => `${label}${NBSP}: ${value}`,
		boldLabelled: (label, value) => `**${label}**${NBSP}: ${value}`,
		mvp: 'MVP',
		release: 'Version',
		status: 'Statut',
		problem: 'Problème',
		value: 'Valeur',
		objective: 'Objectif',
		acceptanceCriteria: "Critères d'acceptation",
		dependsOn: 'Dépend de',
		sources: 'Sources',
		missingSource: (id) => `[Source introuvable${NBSP}: ${id}]`,
		noFeatures: '(aucune fonctionnalité déclarée)',
		objectives: 'Objectifs',
		features: 'Fonctionnalités',
		noDescription: 'sans description',
		journeys: 'Parcours utilisateur',
		journey: 'Parcours',
		noSteps: '(aucune étape)',
		rulesAndEdgeCases: 'Règles et cas limites',
		scenario: (given, when, then, outcome) =>
			`Étant donné ${given} / Quand ${when} / Alors ${then} → ${outcome}`,
		dataModel: 'Modèle de données',
		entity: 'Entité',
		infrastructure: 'Infrastructure',
		host: 'Hôte',
		database: 'Base de données',
		constraints: 'Contraintes non négociables',
		slas: 'Engagements de service (SLA)',
		penalty: (penalty) => ` (pénalité${NBSP}: ${penalty})`
	}
};

/**
 * A human-readable Product Requirements Document (Markdown) — the "requirements
 * backbone" view. Unlike the functional spec, it leads with each feature as a
 * numbered requirement and folds in the Lyriks-owned leaf metadata (problem,
 * value, acceptance criteria, dependencies, source) authored on the Features
 * page. Deterministic projection over the same envelope — no AI, no new engine.
 */
function requirementsDoc(env: SpecEnvelope, t: SpecTexts): string {
	const { identity, definition, users, features, documents } = env;
	const lines: string[] = [];
	const metaOf = (id: string) => features.leafMeta?.[id] ?? {};
	const nameOf = (id: string) => features.features.find((f) => f.id === id)?.name || id;
	const mvpTier = new Map(features.mvpAssignments.map((m) => [m.featureId, m.tier]));
	const releaseName = new Map(features.releases.map((r) => [r.id, r.name]));
	const releaseOf = new Map(features.roadmapAssignments.map((a) => [a.featureId, a.releaseId]));
	const sourceById = new Map(documents.sources.map((source) => [source.id, source]));

	lines.push(t.requirementsHeading(identity.productName || t.untitledProduct));
	if (identity.brief.trim()) lines.push(`\n${identity.brief.trim()}`);

	lines.push(`\n## ${t.goal}`);
	if (definition.businessObjective.expectedOutcome.trim()) {
		lines.push(`\n${definition.businessObjective.expectedOutcome.trim()}`);
	}
	if (definition.businessObjective.successCriteria.length > 0) {
		lines.push(`\n**${t.successCriteria}**`);
		for (const c of definition.businessObjective.successCriteria) lines.push(`- ${c}`);
	}

	lines.push(`\n## ${t.users}`);
	for (const r of users.roles)
		lines.push(r.description ? `- ${t.boldLabelled(r.name || t.role, r.description)}` : `- **${r.name || t.role}**`);
	if (users.roles.length === 0) lines.push(`- ${t.noneDeclared}`);

	lines.push(`\n## ${t.requirements}`);
	const leaves = leafFeatures(features);
	for (const core of features.cores) {
		const coreLeaves = leaves.filter((l) => l.coreId === core.id);
		if (coreLeaves.length === 0) continue;
		lines.push(`\n### ${core.name || t.core}`);
		for (const leaf of coreLeaves) {
			const m = metaOf(leaf.id);
			const code = m.code ? `\`${m.code}\` ` : '';
			lines.push(`\n#### ${code}${leaf.name || t.feature}`);
			const tier = mvpTier.get(leaf.id);
			const rel = releaseOf.get(leaf.id);
			const relName = rel ? releaseName.get(rel) : undefined;
			const tags = [
				tier ? t.labelled(t.mvp, tier) : '',
				relName ? t.labelled(t.release, relName) : '',
				m.status ? t.labelled(t.status, m.status) : ''
			].filter(Boolean);
			if (tags.length > 0) lines.push(`_${tags.join(' · ')}_`);
			if (leaf.description) lines.push(`\n${leaf.description}`);
			if (m.problem?.trim()) lines.push(`\n${t.boldLabelled(t.problem, m.problem.trim())}`);
			if (m.value?.trim()) lines.push(t.boldLabelled(t.value, m.value.trim()));
			if (m.objective?.trim()) lines.push(t.boldLabelled(t.objective, m.objective.trim()));
			const criteria =
				env.acceptanceCriteriaByFeature?.[leaf.id] ??
				(m.acceptanceCriteria ?? []).map((c) => c.text.trim()).filter(Boolean);
			if (criteria.length > 0) {
				lines.push(`\n**${t.acceptanceCriteria}**`);
				for (const c of criteria) lines.push(`- ${c}`);
			}
			if (m.dependsOn && m.dependsOn.length > 0) {
				lines.push(`\n${t.boldLabelled(t.dependsOn, m.dependsOn.map(nameOf).join(', '))}`);
			}
			const sourceLines = (m.sourceIds ?? []).map((sourceId) => {
				const source = sourceById.get(sourceId);
				if (!source) return t.missingSource(sourceId);
				const title = source.title.trim() || source.url.trim() || source.id;
				const location = source.url.trim() && source.url.trim() !== title ? ` (${source.url.trim()})` : '';
				return `${title} (${source.kind})${location}`;
			});
			if (m.sourceLink?.trim()) sourceLines.push(m.sourceLink.trim());
			if (sourceLines.length > 0) {
				lines.push(`\n**${t.sources}**`);
				for (const source of sourceLines) lines.push(`- ${source}`);
			}
		}
	}
	if (leaves.length === 0) lines.push(`\n- ${t.noFeatures}`);

	return lines.join('\n');
}

function functionalDoc(env: SpecEnvelope, t: SpecTexts): string {
	const { identity, definition, features, experience, rules } = env;
	const lines: string[] = [];
	lines.push(t.functionalHeading(identity.productName || t.untitledProduct));
	if (identity.brief.trim()) lines.push(`\n${identity.brief.trim()}`);

	lines.push(`\n## ${t.objectives}`);
	if (definition.businessObjective.expectedOutcome.trim()) {
		lines.push(`- ${definition.businessObjective.expectedOutcome.trim()}`);
	}
	for (const c of definition.businessObjective.successCriteria) lines.push(`- ${c}`);
	if (
		definition.businessObjective.expectedOutcome.trim().length === 0 &&
		definition.businessObjective.successCriteria.length === 0
	) {
		lines.push(`- ${t.noneDeclared}`);
	}

	lines.push(`\n## ${t.features}`);
	for (const core of features.cores) {
		lines.push(`\n### ${core.name || t.core}`);
		for (const leaf of leafFeatures(features).filter((l) => l.coreId === core.id)) {
			lines.push(`- ${t.boldLabelled(leaf.name || t.feature, leaf.description || t.noDescription)}`);
		}
	}

	lines.push(`\n## ${t.journeys}`);
	for (const j of experience.journeys) {
		const steps = stepsOfJourney(experience, j.id).map((s) => s.name).filter(Boolean);
		lines.push(`- ${t.boldLabelled(j.name || t.journey, steps.join(' → ') || t.noSteps)}`);
	}
	if (experience.journeys.length === 0) lines.push(`- ${t.noneDeclared}`);

	lines.push(`\n## ${t.rulesAndEdgeCases}`);
	for (const i of rules.issues) lines.push(`- [${i.kind}/${i.severity}] ${i.title} (${i.status})`);
	for (const s of rules.scenarios)
		lines.push(`- ${t.scenario(s.given || '…', s.whenText || '…', s.then || '…', s.expectedOutcome)}`);
	if (rules.issues.length === 0 && rules.scenarios.length === 0) lines.push(`- ${t.noneDeclared}`);

	return lines.join('\n');
}

function technicalDoc(env: SpecEnvelope, t: SpecTexts, lang: SpecLanguage): string {
	const { definition, data, architecture } = env;
	const lines: string[] = [];
	lines.push(t.technicalHeading);

	lines.push('\n' + architectureContext(architecture, env.documents, lang));

	lines.push(`\n## ${t.dataModel}`);
	for (const e of data.entities) {
		const fields = fieldsOfEntity(data, e.id)
			.map((f) => `${f.name}:${f.type}`)
			.join(', ');
		lines.push(`- **${e.name || t.entity}** { ${fields} }`);
	}
	if (data.entities.length === 0) lines.push(`- ${t.noneDeclared}`);

	lines.push(`\n## ${t.infrastructure}`);
	for (const h of data.hosts) lines.push(`- ${t.labelled(t.host, `${h.name} (${h.kind})`)}`);
	for (const db of data.databases) lines.push(`- ${t.labelled(t.database, `${db.name} (${db.engine})`)}`);

	lines.push(`\n## ${t.constraints}`);
	for (const c of architecture.constraints) lines.push(`- ${t.boldLabelled(c.title, `${c.detail} [${c.category}]`)}`);

	lines.push(`\n## ${t.slas}`);
	for (const s of definition.business.slas)
		lines.push(`- ${t.labelled(s.metric, s.commitment)}${s.penalty ? t.penalty(s.penalty) : ''}`);
	if (definition.business.slas.length === 0) lines.push(`- ${t.noneDeclared}`);

	return lines.join('\n');
}

function coherenceGraph(env: SpecEnvelope, analysis: CoherenceAnalysis): string {
	const graph = {
		readinessScore: analysis.readinessScore,
		dimensions: analysis.dimensions.map((d) => ({ key: d.key, score: d.score })),
		counts: {
			features: leafFeatures(env.features).length,
			journeys: env.experience.journeys.length,
			entities: env.data.entities.length,
			tech: env.architecture.techChoices.length,
			constraints: env.architecture.constraints.length,
			rules: env.rules.issues.length
		},
		openGaps: analysis.gaps.map((g) => ({ id: g.id, severity: g.severity, blocking: g.blocking }))
	};
	return JSON.stringify(graph, null, 2);
}
