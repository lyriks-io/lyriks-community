import type { GeneratedArtifact, CoherenceAnalysis } from '$domain/coherence';
import type { FoundationIdentityDraft } from '$domain/foundation';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import type { ProjectUsersDraft } from '$domain/users';
import type { ProjectDocumentsDraft } from '$domain/documents';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import { stepsOfJourney, type ProjectExperienceDraft } from '$domain/experience';
import type { ProjectRulesDraft } from '$domain/rules';
import { fieldsOfEntity, type ProjectDataDraft } from '$domain/data';
import { ARCH_LAYERS, techOfLayer, type ProjectArchitectureDraft } from '$domain/architecture';

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
	now: string
): GeneratedArtifact[] {
	return [
		{ id: newId(), kind: 'functional_doc', title: 'Functional specification', generatedAt: now, content: functionalDoc(env) },
		{ id: newId(), kind: 'technical_doc', title: 'Technical specification', generatedAt: now, content: technicalDoc(env) },
		{ id: newId(), kind: 'requirements_doc', title: 'Product requirements document', generatedAt: now, content: requirementsDoc(env) },
		{ id: newId(), kind: 'coherence_graph', title: 'Coherence graph', generatedAt: now, content: coherenceGraph(env, analysis) }
	];
}

/**
 * A human-readable Product Requirements Document (Markdown) — the "requirements
 * backbone" view. Unlike the functional spec, it leads with each feature as a
 * numbered requirement and folds in the Lyriks-owned leaf metadata (problem,
 * value, acceptance criteria, dependencies, source) authored on the Features
 * page. Deterministic projection over the same envelope — no AI, no new engine.
 */
function requirementsDoc(env: SpecEnvelope): string {
	const { identity, definition, users, features, documents } = env;
	const lines: string[] = [];
	const metaOf = (id: string) => features.leafMeta?.[id] ?? {};
	const nameOf = (id: string) => features.features.find((f) => f.id === id)?.name || id;
	const mvpTier = new Map(features.mvpAssignments.map((m) => [m.featureId, m.tier]));
	const releaseName = new Map(features.releases.map((r) => [r.id, r.name]));
	const releaseOf = new Map(features.roadmapAssignments.map((a) => [a.featureId, a.releaseId]));
	const sourceById = new Map(documents.sources.map((source) => [source.id, source]));

	lines.push(`# Product requirements: ${identity.productName || 'Untitled product'}`);
	if (identity.brief.trim()) lines.push(`\n${identity.brief.trim()}`);

	lines.push(`\n## Goal`);
	if (definition.businessObjective.expectedOutcome.trim()) {
		lines.push(`\n${definition.businessObjective.expectedOutcome.trim()}`);
	}
	if (definition.businessObjective.successCriteria.length > 0) {
		lines.push(`\n**Success criteria**`);
		for (const c of definition.businessObjective.successCriteria) lines.push(`- ${c}`);
	}

	lines.push(`\n## Users`);
	for (const r of users.roles) lines.push(`- **${r.name || 'Role'}**${r.description ? `: ${r.description}` : ''}`);
	if (users.roles.length === 0) lines.push('- (none declared)');

	lines.push(`\n## Requirements`);
	const leaves = leafFeatures(features);
	for (const core of features.cores) {
		const coreLeaves = leaves.filter((l) => l.coreId === core.id);
		if (coreLeaves.length === 0) continue;
		lines.push(`\n### ${core.name || 'Core'}`);
		for (const leaf of coreLeaves) {
			const m = metaOf(leaf.id);
			const code = m.code ? `\`${m.code}\` ` : '';
			lines.push(`\n#### ${code}${leaf.name || 'Feature'}`);
			const tier = mvpTier.get(leaf.id);
			const rel = releaseOf.get(leaf.id);
			const relName = rel ? releaseName.get(rel) : undefined;
			const tags = [
				tier ? `MVP: ${tier}` : '',
				relName ? `Release: ${relName}` : '',
				m.status ? `Status: ${m.status}` : ''
			].filter(Boolean);
			if (tags.length > 0) lines.push(`_${tags.join(' · ')}_`);
			if (leaf.description) lines.push(`\n${leaf.description}`);
			if (m.problem?.trim()) lines.push(`\n**Problem**: ${m.problem.trim()}`);
			if (m.value?.trim()) lines.push(`**Value**: ${m.value.trim()}`);
			if (m.objective?.trim()) lines.push(`**Objective**: ${m.objective.trim()}`);
			const criteria = (m.acceptanceCriteria ?? []).filter((c) => c.text.trim());
			if (criteria.length > 0) {
				lines.push(`\n**Acceptance criteria**`);
				for (const c of criteria) lines.push(`- ${c.text.trim()}`);
			}
			if (m.dependsOn && m.dependsOn.length > 0) {
				lines.push(`\n**Depends on**: ${m.dependsOn.map(nameOf).join(', ')}`);
			}
			const sourceLines = (m.sourceIds ?? []).map((sourceId) => {
				const source = sourceById.get(sourceId);
				if (!source) return `[Missing source: ${sourceId}]`;
				const title = source.title.trim() || source.url.trim() || source.id;
				const location = source.url.trim() && source.url.trim() !== title ? ` (${source.url.trim()})` : '';
				return `${title} (${source.kind})${location}`;
			});
			if (m.sourceLink?.trim()) sourceLines.push(m.sourceLink.trim());
			if (sourceLines.length > 0) {
				lines.push(`\n**Sources**`);
				for (const source of sourceLines) lines.push(`- ${source}`);
			}
		}
	}
	if (leaves.length === 0) lines.push('\n- (no features declared)');

	return lines.join('\n');
}

function functionalDoc(env: SpecEnvelope): string {
	const { identity, definition, features, experience, rules } = env;
	const lines: string[] = [];
	lines.push(`# Functional specification: ${identity.productName || 'Untitled product'}`);
	if (identity.brief.trim()) lines.push(`\n${identity.brief.trim()}`);

	lines.push(`\n## Objectives`);
	if (definition.businessObjective.expectedOutcome.trim()) {
		lines.push(`- ${definition.businessObjective.expectedOutcome.trim()}`);
	}
	for (const c of definition.businessObjective.successCriteria) lines.push(`- ${c}`);
	if (
		definition.businessObjective.expectedOutcome.trim().length === 0 &&
		definition.businessObjective.successCriteria.length === 0
	) {
		lines.push('- (none declared)');
	}

	lines.push(`\n## Features`);
	for (const core of features.cores) {
		lines.push(`\n### ${core.name || 'Core'}`);
		for (const leaf of leafFeatures(features).filter((l) => l.coreId === core.id)) {
			lines.push(`- **${leaf.name || 'Feature'}**: ${leaf.description || 'no description'}`);
		}
	}

	lines.push(`\n## User journeys`);
	for (const j of experience.journeys) {
		const steps = stepsOfJourney(experience, j.id).map((s) => s.name).filter(Boolean);
		lines.push(`- **${j.name || 'Journey'}**: ${steps.join(' → ') || '(no steps)'}`);
	}
	if (experience.journeys.length === 0) lines.push('- (none declared)');

	lines.push(`\n## Rules & edge cases`);
	for (const i of rules.issues) lines.push(`- [${i.kind}/${i.severity}] ${i.title} (${i.status})`);
	for (const s of rules.scenarios)
		lines.push(`- Given ${s.given || '…'} / When ${s.whenText || '…'} / Then ${s.then || '…'} → ${s.expectedOutcome}`);
	if (rules.issues.length === 0 && rules.scenarios.length === 0) lines.push('- (none declared)');

	return lines.join('\n');
}

function technicalDoc(env: SpecEnvelope): string {
	const { definition, data, architecture } = env;
	const lines: string[] = [];
	lines.push(`# Technical specification`);

	lines.push(`\n## Stack`);
	for (const layer of ARCH_LAYERS) {
		const techs = techOfLayer(architecture, layer.code);
		if (techs.length === 0) continue;
		lines.push(`\n### ${layer.label}`);
		for (const t of techs) {
			const doc = architecture.referenceDocs.find((d) => d.id === t.referenceDocId);
			lines.push(`- **${t.name || 'tech'}**${t.role ? `: ${t.role}` : ''}${doc ? ` · ref: ${doc.url}` : ''}`);
		}
	}

	lines.push(`\n## Data model`);
	for (const e of data.entities) {
		const fields = fieldsOfEntity(data, e.id)
			.map((f) => `${f.name}:${f.type}`)
			.join(', ');
		lines.push(`- **${e.name || 'Entity'}** { ${fields} }`);
	}
	if (data.entities.length === 0) lines.push('- (none declared)');

	lines.push(`\n## Infrastructure`);
	for (const h of data.hosts) lines.push(`- Host: ${h.name} (${h.kind})`);
	for (const db of data.databases) lines.push(`- Database: ${db.name} (${db.engine})`);

	lines.push(`\n## Non-negotiable constraints`);
	for (const c of architecture.constraints) lines.push(`- **${c.title}**: ${c.detail} [${c.category}]`);

	lines.push(`\n## SLAs`);
	for (const s of definition.business.slas) lines.push(`- ${s.metric}: ${s.commitment}${s.penalty ? ` (penalty ${s.penalty})` : ''}`);
	if (definition.business.slas.length === 0) lines.push('- (none declared)');

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
