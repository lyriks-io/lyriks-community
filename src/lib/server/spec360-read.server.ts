import { createHash } from 'node:crypto';
import type { AppServices } from '$composition/container.server';
import { withCarriedGrants } from '$application/specification/capability-registry';
import { collectProse } from '$application/specification/load-spec-corpus';
import { specOutline, locateInOutline, type SpecOutline } from '$application/spec360/outline';
import { glanceView } from '$application/spec360/glance';
import { coreSummaries, coreView, featureView } from '$application/spec360/features';
import { usedByOf } from '$application/spec360/feature-extras';
import { findingsNamingFeature } from '$application/spec360/feature-findings';
import { productRules } from '$application/spec360/product-rules';
import { tablesByFeature } from '$application/spec360/data-features';
import { actionsData, fieldsTouched, tablesTouched, type ActionData } from '$application/spec360/action-data';
import { sourcedScreens } from '$application/spec360/sourced-screens';
import { roleUses } from '$application/spec360/role-uses';
import { deriveDataVisibility } from '$application/specification/data-visibility';
import { readDataBehaviour } from '$application/specification/data-behaviour';
import { requestKeyOf } from '$domain/evolution';
import { requestPagePath } from '$domain/evolution';
import { usersView } from '$application/spec360/users';
import { experienceView } from '$application/spec360/experience';
import {
	dataFacts,
	environmentsReading,
	healthItems,
	implementationReading,
	languagesReading,
	requirementGroups,
	runtimeReading,
	stackLayers,
	technicalConstraints
} from '$application/spec360/tech';
import { dataConnections, dataPlaces, dataSummary, databaseNotes } from '$application/spec360/data-map';
import { operationsTargets } from '$application/spec360/operations-targets';
import { glossaryEntries, type NamedElement, type ProsePlace } from '$application/spec360/glossary';
import { text } from '$application/spec360/labels';
import { noticedPoints } from '$domain/retrospec';
import { readBehavior } from './behavior-read.server';

/**
 * The reads behind the Specification 360°: one function per sub-page, each
 * loading only the sections that page shows and handing them to the pure view
 * builders of `$application/spec360`. The pages are read-only; every value
 * comes from the spec as it is stored.
 */

/** What every sub-page shares: the product's name and the shape of the feature tree. */
export async function readSpecFrame(services: AppServices, projectId: string) {
	const [identity, features] = await Promise.all([
		services.loadFoundationDraft.loadIdentity(projectId),
		services.loadFeaturesDraft.execute(projectId)
	]);
	return { productName: text(identity.productName) || 'Untitled project', outline: specOutline(features) };
}

/** Actions and rules counted the way the pages list them: the actions of the tree's own features, every kernel rule. */
function countsOf(outline: SpecOutline, actions: Record<string, unknown[]>, rules: number) {
	const featureIds = outline.cores.flatMap((c) => c.features.map((f) => f.id));
	return {
		features: featureIds.length,
		actions: featureIds.reduce((n, id) => n + (actions[id]?.length ?? 0), 0),
		rules
	};
}

export async function readGlance(services: AppServices, projectId: string) {
	const [foundation, users, features, architecture, data, glossary, behavior, experience, rules, documents, projectHealth] = await Promise.all([
		services.loadFoundationDraft.execute(projectId),
		services.loadUsersDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadArchitectureDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		services.loadGlossaryDraft.execute(projectId),
		readBehavior(services, projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadRulesDraft.execute(projectId),
		services.loadDocumentRegister.execute(projectId),
		services.projectHealthView.get(projectId).catch(() => null)
	]);
	const outline = specOutline(features);
	const glance = glanceView({
		identity: foundation.identity,
		definition: foundation.definition,
		users,
		outline,
		architecture,
		counts: {
			...countsOf(outline, behavior.actions, behavior.kernelRules.total),
			users: users.roles.filter((r) => text(r.name)).length,
			entities: data.entities.length,
			terms: glossary.terms.filter((t) => text(t.term)).length
		}
	});
	// Every point the project health is computed from, then what the retrospecification noticed (criteria 4189e074, 799e1f5b).
	const noticed = noticedPoints(projectHealth?.points ?? [], {
		rules,
		features,
		data,
		experience,
		sources: documents.sources,
		authoredFeatureIds: behavior.overview.features.filter((f) => f.authored).map((f) => f.featureId)
	});
	const health = projectHealth
		? {
				score: projectHealth.headline.score,
				verdict: projectHealth.headline.verdict,
				blocking: projectHealth.headline.blocking,
				total: projectHealth.headline.total,
				codeLinked: projectHealth.codeLinked,
				...(projectHealth.proofPending ? { proofPending: true } : {})
			}
		: null;
	// A project's first reading is still being taken: the page says so rather than 'Nothing waits' (ac-score-shown-at-once).
	const healthReading = !projectHealth && services.projectHealthView.reading(projectId);
	return { ...glance, noticed, health, healthReading };
}

export async function readFeatureList(services: AppServices, projectId: string) {
	const [features, data, behavior] = await Promise.all([
		services.loadFeaturesDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		readBehavior(services, projectId)
	]);
	return {
		productRules: productRules(behavior.kernelRules, data.rules?.generated),
		cores: coreSummaries(specOutline(features), behavior.actions)
	};
}

/** A core feature's page or a feature's page, whichever the id names; null when it names neither. */
export async function readFeaturePage(services: AppServices, projectId: string, id: string) {
	const features = await services.loadFeaturesDraft.execute(projectId);
	const outline = specOutline(features);
	const found = locateInOutline(outline, id);
	if (!found) return null;
	if (found.kind === 'core') {
		const behavior = await readBehavior(services, projectId);
		return { kind: 'core' as const, core: coreView(found.core, behavior.actions) };
	}
	const [behavior, users, derived, evolution, identity, coverage] = await Promise.all([
		readBehavior(services, projectId),
		services.loadUsersDraft.execute(projectId),
		services.refreshDerivedCapabilities.execute(projectId),
		services.loadEvolutionDraft.execute(projectId).catch(() => null),
		services.loadFoundationDraft.loadIdentity(projectId),
		// What proves each action against the code, from the implementation index the last sync reported.
		services.implementationCoverage.get(projectId).catch(() => ({}) as Awaited<ReturnType<AppServices['implementationCoverage']['get']>>)
	]);
	const proofs =
		(coverage as Record<string, { actions?: Record<string, { provenAt?: string; scenarioResults?: Record<string, { passed: boolean; at: string }> }> }>)[id]
			?.actions ?? {};
	const feature = featureView({
		core: found.core,
		featureId: id,
		features,
		actions: behavior.actions,
		rules: behavior.kernelRules,
		users: withCarriedGrants(users, derived),
		...(behavior.disabledFeatures ? { disabledFeatures: behavior.disabledFeatures } : {}),
		...(behavior.scenarios ? { scenarios: behavior.scenarios } : {}),
		provenAt: Object.fromEntries(Object.entries(proofs).map(([actionId, row]) => [actionId, row.provenAt])),
		scenarioResults: Object.fromEntries(Object.entries(proofs).map(([actionId, row]) => [actionId, row.scenarioResults]))
	});
	// The evolution that created the feature, when one did: its added draft became this leaf.
	const requests = evolution?.requests ?? [];
	const creator = requests.find((r) => r.status !== 'deleted' && r.drafts.some((d) => d.kind === 'add' && d.materialisedAs === id));
	const product = text(identity.productName) || 'the product';
	return {
		kind: 'feature' as const,
		feature,
		usedBy: usedByOf(feature.actions),
		origin: creator
			? { key: requestKeyOf(requests, creator.id) ?? 'Evolution', title: text(creator.title), href: requestPagePath(projectId, creator.id), open: creator.status === 'open' }
			: null,
		originLabel: creator ? '' : identity.sourceMode === 'code_to_spec' ? `Reverse-Specification of ${product}` : `Written in Lyriks`
	};
}

/**
 * The points to review of a feature's page (criterion c72a7e79): what the
 * Overview lists as noticed, read the same way, kept to the points naming
 * this feature, so a point opens the same sheet on both pages.
 */
export async function readFeatureFindings(services: AppServices, projectId: string, featureId: string) {
	const [rules, features, data, experience, documents, projectHealth, behavior] = await Promise.all([
		services.loadRulesDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadDocumentRegister.execute(projectId),
		services.projectHealthView.get(projectId).catch(() => null),
		readBehavior(services, projectId)
	]);
	// The same points the Overview lists, so a point opens the same sheet on both pages.
	const gaps = projectHealth?.points ?? [];
	const authoredFeatureIds = behavior.overview.features.filter((f) => f.authored).map((f) => f.featureId);
	const noticed = noticedPoints(gaps, { rules, features, data, experience, sources: documents.sources, authoredFeatureIds });
	const feature = { id: featureId, name: text(features.features.find((f) => f.id === featureId)?.name) };
	return findingsNamingFeature({ noticed, feature, issues: rules.issues, gaps, authored: authoredFeatureIds.includes(featureId) });
}

/** One action of a feature, on its own page (criterion 7d1e80b6); null when the feature does not declare it. */
/** The tables and the fields a feature's actions read or write, beside the tables its own states carry (criterion c72a7e79), and what each action touches (criterion d0e0e1a5). */
export async function readFeatureData(services: AppServices, projectId: string, featureId: string): Promise<{ tables: string[]; fields: string[]; actions: Record<string, ActionData> }> {
	const [snapshot, draft, behavior] = await Promise.all([
		services.behaviorPort.readFeature(projectId, featureId).catch(() => null),
		services.loadDataDraft.execute(projectId),
		services.readProjectBehavior.execute(projectId).catch(() => null)
	]);
	const { links } = readDataBehaviour(projectId, behavior);
	return { tables: tablesTouched(snapshot, draft, links), fields: fieldsTouched(snapshot, draft, links), actions: actionsData(snapshot, draft, links) };
}

/** How many of a feature's screens are traced to a source (criterion c72a7e79); 0 when the engine says nothing. */
export async function readSourcedScreens(services: AppServices, projectId: string, featureId: string): Promise<number> {
	const features = await services.loadFeaturesDraft.execute(projectId);
	const leaf = features.features.find((f) => f.id === featureId);
	if (!leaf) return 0;
	const [snapshot, provenance] = await Promise.all([
		services.behaviorPort.readFeature(projectId, featureId).catch(() => null),
		services.codeAdoption.getProvenance(leaf.unspaghettitFeatureId || leaf.id).catch(() => null)
	]);
	return sourcedScreens(projectId, snapshot, provenance?.ok ? provenance.value : null);
}

export async function readUsersPage(services: AppServices, projectId: string) {
	const [users, derived, features, experience, foundation] = await Promise.all([
		services.loadUsersDraft.execute(projectId),
		services.refreshDerivedCapabilities.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadFoundationDraft.execute(projectId)
	]);
	// Where the rest of the spec uses each user: a used one is not deleted (criterion e356a69c).
	const roleUsesById = Object.fromEntries(users.roles.map((r) => [r.id, roleUses(r.id, { users, features, experience, definition: foundation.definition })]));
	return { ...usersView(withCarriedGrants(users, derived), derived.features), roleUses: roleUsesById };
}

export async function readExperiencePage(services: AppServices, projectId: string) {
	const [draft, revision] = await Promise.all([
		services.loadExperienceDraft.execute(projectId),
		services.draftLock.current(projectId, 'experience')
	]);
	return {
		view: experienceView(draft),
		// The component previews render the builder trees exactly as the
		// Experience page does, so the draft travels whole, read-only.
		draft,
		revision
	};
}

export async function readDataMap(services: AppServices, projectId: string) {
	const [data, definition, experience, features, behavior, placements] = await Promise.all([
		services.loadDataDraft.execute(projectId),
		services.loadFoundationDraft.loadDefinition(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.readProjectBehavior.execute(projectId).catch(() => null),
		services.loadMapPlacements.execute(projectId)
	]);
	// The map is the interactive map of the Infrastructure page, read-only here, with the same
	// cross-check of what the screens show, and the tables each feature's states carry.
	return {
		data,
		facts: dataFacts(definition, data),
		// Where the data lives and how it connects, in words (criterion 0f4c8334).
		summary: dataSummary(data),
		notes: databaseNotes(data),
		places: dataPlaces(data),
		connections: dataConnections(data),
		derivedVisibility: deriveDataVisibility(data, experience),
		tablesByFeature: tablesByFeature(data, readDataBehaviour(projectId, behavior)),
		outline: specOutline(features),
		// Where people put the tables by hand, apart from the spec (criterion 7f5769bb).
		placements
	};
}

export async function readArchitecture(services: AppServices, projectId: string) {
	const architecture = await services.loadArchitectureDraft.execute(projectId);
	return { layers: stackLayers(architecture) };
}

export async function readOperations(services: AppServices, projectId: string) {
	const [data, foundation, coverage] = await Promise.all([
		services.loadDataDraft.execute(projectId),
		services.loadFoundationDraft.execute(projectId),
		services.implementationCoverage.get(projectId).catch(() => ({}))
	]);
	return {
		items: healthItems({
			data,
			definition: foundation.definition,
			operations: foundation.operations,
			coverage: Object.values(coverage)
		}),
		// The same readings drawn (criterion 8a696e52).
		implementation: implementationReading(Object.values(coverage)),
		environments: environmentsReading({ data, identity: foundation.identity }),
		// The targets of Operations as their forms open on (criterion 970aca7c); Ask my AI in the head asks the AI for them (criterion 44aa7b4f).
		targets: operationsTargets(foundation.definition, foundation.operations)
	};
}

export async function readRequirements(services: AppServices, projectId: string) {
	const [foundation, architecture] = await Promise.all([
		services.loadFoundationDraft.execute(projectId),
		services.loadArchitectureDraft.execute(projectId)
	]);
	return {
		groups: requirementGroups(foundation),
		// Where it must run and the languages, drawn (criterion 4af7cac8).
		runtime: runtimeReading(foundation),
		languages: languagesReading(foundation),
		constraints: technicalConstraints(architecture)
	};
}

/** The prose of each place of the spec, the same sources the Glossary page counts against. */
async function prosePlaces(services: AppServices, projectId: string): Promise<{ places: ProsePlace[]; elements: NamedElement[] }> {
	const [foundation, users, features, experience, rules, data, architecture, documents, project] = await Promise.all([
		services.loadFoundationDraft.execute(projectId),
		services.loadUsersDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadRulesDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		services.loadArchitectureDraft.execute(projectId),
		services.loadDocumentRegister.execute(projectId),
		services.behaviorPort.readProject(projectId).catch(() => null)
	]);
	const behavior = await Promise.all(
		(project?.project.featureIds ?? []).map((id) => services.behaviorPort.readFeature(projectId, id).catch(() => null))
	);
	const prose = (...values: unknown[]) => collectProse(values).join('\n');
	const places: ProsePlace[] = [
		{ place: 'Brief and requirements', text: prose(foundation) },
		{ place: 'Features', text: prose(features, rules) },
		{ place: 'Behavior', text: prose(behavior) },
		{ place: 'Users', text: prose(users) },
		{ place: 'Screens', text: prose(experience) },
		{ place: 'Data', text: prose(data) },
		{ place: 'Architecture', text: prose(architecture) },
		{ place: 'Documents', text: prose(documents) }
	];
	const elements: NamedElement[] = [
		...features.features.map((f) => ({ kind: 'Feature', name: f.name })),
		...experience.screens.map((s) => ({ kind: 'Screen', name: s.name })),
		...experience.journeys.map((j) => ({ kind: 'Journey', name: j.name })),
		...data.entities.map((e) => ({ kind: 'Table', name: e.name })),
		...users.roles.map((r) => ({ kind: 'User', name: r.name }))
	].filter((e) => text(e.name));
	return { places, elements };
}

/**
 * The last glossary readings, keyed on everything they are computed from.
 * Counting each term in the whole spec is pure CPU (about a second for 130
 * terms over 7 million characters, several on a busy shared host), and the
 * page asks again on every opening and every live refresh while nothing it
 * counts has moved. A digest of the inputs costs a few milliseconds.
 */
const GLOSSARY_READINGS_HELD = 8;
const glossaryReadings = new Map<string, ReturnType<typeof glossaryEntries>>();

export async function readGlossary(services: AppServices, projectId: string) {
	const [glossary, { places, elements }] = await Promise.all([
		services.loadGlossaryDraft.execute(projectId),
		prosePlaces(services, projectId)
	]);
	const digest = createHash('sha1');
	digest.update(JSON.stringify(glossary.terms));
	for (const p of places) digest.update(`\u0000${p.place}\u0000${p.text}`);
	for (const e of elements) digest.update(`\u0001${e.kind}\u0001${e.name}`);
	const key = `${projectId}\u0000${digest.digest('hex')}`;
	const held = glossaryReadings.get(key);
	if (held) return { entries: held };
	const entries = glossaryEntries(glossary.terms, places, elements);
	glossaryReadings.set(key, entries);
	while (glossaryReadings.size > GLOSSARY_READINGS_HELD) glossaryReadings.delete(glossaryReadings.keys().next().value!);
	return { entries };
}
