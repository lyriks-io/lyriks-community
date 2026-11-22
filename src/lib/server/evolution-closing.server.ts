import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { validationBaselineId } from '$domain/retrospec';
import {
	citedTexts,
	closingChanges,
	closingMessage,
	landedFeatureOf,
	landingCheck,
	requestKeyOf,
	requestPagePath,
	requirementCompliance,
	ticketKeyIn,
	versionStepAt,
	withDraftNames,
	type ClosingChange,
	type EvolutionRequest,
	knowledgeReadingOf,
	type KnowledgeReading,
	type LandedFeature,
	type LandingCheck,
	type RequirementCompliance,
	type TicketPost,
	type VersionStep
} from '$domain/evolution';
import type { EvolutionView } from './evolution-view.server';
import { sectionDraftHolds } from './evolution-section-drafts.server';

/**
 * What the Final report shows once a request is closed (the design's closing
 * block): the message for the ticket it came from, and what the change did to
 * the Specification 360°, from which version to which.
 */
export interface ClosingReading {
	readonly key: string;
	readonly message: string;
	readonly changes: readonly ClosingChange[];
	readonly compliance: RequirementCompliance;
	/** Null when the specification was never validated, or the close captured no baseline. */
	readonly version: VersionStep | null;
	/** The ticket the request came from, when what it cites names one, or the one the AI posted on. */
	readonly ticketKey: string | null;
	/** What the person's AI reported it did on the ticket. */
	readonly ticketPost: TicketPost | null;
	readonly specHref: string;
	/** Whether everything the request carried is in the official specification, read again now. */
	readonly landed: LandingCheck | null;
	/** What the landing validated in Knowledge and what stays to review (EVO-002); null before a landing recorded it. */
	readonly knowledge: KnowledgeReading | null;
}

/** The validation baseline and every baseline of the project, or none when they cannot be read. */
async function versionOf(services: AppServices, projectId: string, request: EvolutionRequest): Promise<VersionStep | null> {
	if (!request.closingBaselineId) return null;
	const [baselines, retrospec] = await Promise.all([
		services.loadBaselinesDraft.execute(projectId).catch(() => null),
		loadRetrospecDocument(services.sectionDocuments, projectId).catch(() => null)
	]);
	if (!baselines || !retrospec) return null;
	return versionStepAt(baselines.baselines, validationBaselineId(retrospec.doc), request.closingBaselineId);
}

export async function closingReadingOf(services: AppServices, view: EvolutionView, request: EvolutionRequest, origin: string): Promise<ClosingReading | null> {
	if (request.status !== 'closed') return null;
	const featureName = (id: string) => view.features.features.find((f) => f.id === id)?.name ?? null;
	const say = withDraftNames(request, { nameOf: (id) => featureName(id) ?? id }).say;
	const changes = closingChanges(request, {
		featureName,
		entityName: (id) => view.data.entities.find((e) => e.id === id)?.name ?? null,
		fieldName: (id) => view.data.fields.find((f) => f.id === id)?.name ?? null
	}).map((c) => ({ ...c, label: say(c.label) }));
	const key = requestKeyOf(view.draft.requests, request.id) ?? 'EVO';
	const compliance = requirementCompliance(request);
	const version = await versionOf(services, view.projectId, request);
	return {
		key,
		message: closingMessage({ key, title: request.title, compliance, version, changes, reportUrl: `${origin}${requestPagePath(view.projectId, request.id)}` }),
		changes,
		compliance,
		version,
		ticketKey: request.ticketPost?.ticketKey ?? ticketKeyIn(citedTexts(request, view.sources)),
		ticketPost: request.ticketPost ?? null,
		specHref: `/projects/${encodeURIComponent(view.projectId)}/spec`,
		landed: await landedCheckOf(services, view, request).catch(() => null),
		knowledge: knowledgeReadingOf(view.projectId, request.knowledgeLanding)
	};
}

/**
 * The landing checked again on the specification as it stands
 * (ac-evo-verd-landed-check): the behaviour of each touched feature from the
 * engine, the tree, the Data section, each page laid with its change again, and
 * the rules the whole product keeps.
 */
async function landedCheckOf(services: AppServices, view: EvolutionView, request: EvolutionRequest): Promise<LandingCheck | null> {
	if (!request.drafts.some((d) => d.materialisedAt) && !request.dataDrafts.some((d) => d.materialisedAt)) return null;
	const projectId = view.projectId;
	const leaves = view.features.features;
	const featureIdOf = (leafId: string) => leaves.find((l) => l.id === leafId)?.unspaghettitFeatureId ?? leafId;
	const touched = [...new Set(request.drafts.filter((d) => d.materialisedAt).map((d) => d.materialisedAs ?? d.baseLeafId).filter((id): id is string => !!id))];
	const features = new Map<string, LandedFeature | null>(
		await Promise.all(
			touched.map(async (leafId) => {
				const snapshot = await services.behaviorPort.readFeature(projectId, featureIdOf(leafId)).catch(() => null);
				return [leafId, snapshot ? landedFeatureOf(snapshot.feature) : null] as const;
			})
		)
	);
	const holding = new Map(
		await Promise.all(
			(request.sectionDrafts ?? []).filter((s) => s.materialisedAt).map(async (s) => [s.id, await sectionDraftHolds(services, projectId, s).catch(() => false)] as const)
		)
	);
	const behavior = await services.readProjectBehavior.execute(projectId).catch(() => null);
	return landingCheck(request, {
		feature: (leafId) => features.get(leafId) ?? null,
		leaf: (leafId) => {
			const leaf = leaves.find((l) => l.id === leafId);
			if (!leaf) return null;
			return { name: leaf.name, criteria: (view.features.leafMeta?.[leafId]?.acceptanceCriteria ?? []).map((c) => ({ id: c.id, text: c.text })) };
		},
		entity: (entityId) => {
			const entity = view.data.entities.find((e) => e.id === entityId);
			return entity ? { name: entity.name, fields: view.data.fields.filter((f) => f.entityId === entityId).map((f) => ({ id: f.id, name: f.name })) } : null;
		},
		sectionHolds: (id) => holding.get(id) ?? false,
		invariants: (behavior?.projectInvariants ?? []).map((i) => ({ id: String(i.id), name: String(i.name ?? '') }))
	});
}
