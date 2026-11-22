import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument, readSectionRevisions } from '$application/retrospec/retrospec-store';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { FoundationIdentityDraft } from '$domain/foundation';
import type { ProjectScopeDraft } from '$domain/scope';
import {
	RETROSPEC_SECTIONS,
	currentRun,
	nextRunOf,
	rebuiltFromSourceMode,
	retrospecEvents,
	retrospecStatus,
	analysisOf,
	type PersonRef,
	type RetrospecDocument,
	type RetrospecEvent,
	type RetrospecMode,
	type NextRunReading,
	type RetrospecFacts,
	type BuiltFigures,
	type RetrospecStatus
} from '$domain/retrospec';
import { specOutline } from '$application/spec360/outline';
import { text } from '$application/spec360/labels';
import { readBehavior } from './behavior-read.server';
import { aiLastSeenOf } from './retrospec-ai.server';
import { currentPersonId } from './evolution-actor.server';
import { ACTIVE_WORKSPACE_COOKIE, callerNameForProject } from './caller-workspace.server';

/**
 * The retrospecification as the whole app reads it, cheaply: the status the
 * app bar, the home page and the Specification 360° show, and the events worth
 * a notification. A status costs the stored runs, the sections' revisions and
 * three section reads, never the specification's behaviour; only the AI's
 * notification that it finished reads the behaviour, to say what it built.
 */

/** The facts a status is read from, gathered from drafts the caller may already hold. */
export function retrospecFactsOf(
	doc: RetrospecDocument,
	revisions: Readonly<Record<string, number>>,
	scope: ProjectScopeDraft,
	identity: FoundationIdentityDraft,
	features: ProjectFeaturesDraft
): RetrospecFacts {
	return {
		doc,
		revisions,
		auditTimes: scope.auditLog.map((e) => e.performedAt),
		rebuiltFrom: rebuiltFromSourceMode(identity.sourceMode),
		hasSpec: features.features.length > 0,
		leafFeatureIds: leafFeatures(features).map((f) => f.id)
	};
}

/** The stored document with its revision, and the revisions of the sections a run writes. */
export async function readRetrospecStore(services: AppServices, projectId: string) {
	const [{ doc, revision }, revisions] = await Promise.all([
		loadRetrospecDocument(services.sectionDocuments, projectId),
		readSectionRevisions(services.sectionDocuments, services.draftLock, projectId, RETROSPEC_SECTIONS)
	]);
	return { doc, revision, revisions };
}

async function statusInputs(services: AppServices, projectId: string) {
	const [store, scope, identity, features] = await Promise.all([
		readRetrospecStore(services, projectId),
		services.loadScopeDraft.execute(projectId),
		services.loadFoundationDraft.loadIdentity(projectId),
		services.loadFeaturesDraft.execute(projectId)
	]);
	return { facts: retrospecFactsOf(store.doc, store.revisions, scope, identity, features), scope, identity, features };
}

/** What the specification holds, counted as the Specification 360° counts it (criterion f04182b8). */
async function builtFigures(services: AppServices, projectId: string, features: ProjectFeaturesDraft): Promise<BuiltFigures> {
	const [users, behavior] = await Promise.all([services.loadUsersDraft.execute(projectId), readBehavior(services, projectId)]);
	const outline = specOutline(features);
	return {
		cores: outline.cores.length,
		features: outline.cores.reduce((n, c) => n + c.features.length, 0),
		rules: behavior.kernelRules.total,
		users: users.roles.filter((r) => text(r.name)).length,
		// The picture of a specification ready to review: its core features first, then the features they hold (criterion f04182b8).
		names: [...outline.cores.map((c) => ({ name: c.name, core: true })), ...outline.cores.flatMap((c) => c.features.map((f) => ({ name: f.name, core: false })))]
	};
}

/**
 * The retrospecification status of a project: `{ status, pct, label,
 * published, publishedAt, review }` (see `retrospecStatus`).
 */
export async function readRetrospecStatus(services: AppServices, projectId: string): Promise<RetrospecStatus> {
	return (await readRetrospecStanding(services, projectId)).status;
}

/** The status with what it was read from: the runs, and what the project is rebuilt from (criteria 029a8736, a0959413). */
export async function readRetrospecStanding(services: AppServices, projectId: string): Promise<{ status: RetrospecStatus; doc: RetrospecDocument; rebuiltFrom: RetrospecMode | null }> {
	const { facts } = await statusInputs(services, projectId);
	return { status: retrospecStatus(facts), doc: facts.doc, rebuiltFrom: facts.rebuiltFrom };
}

/** An analysis ready or stopped, and a specification validated, say what the specification holds: the behaviour is read for them alone. */
const namesFigures = (e: RetrospecEvent) => e.kind === 'analysis_finished' || e.kind === 'analysis_stopped' || e.kind === 'published';

/**
 * What happened on the project's retrospecification worth a notification,
 * newest first. A run under way shows its share on its start, and its LLM
 * gone silent stops it (criteria 3fccc273, fcd8a267): both are read now.
 */
export async function readRetrospecEvents(services: AppServices, projectId: string, limit = 50, now = Date.now()): Promise<RetrospecEvent[]> {
	const { facts, scope, identity, features } = await statusInputs(services, projectId);
	const status = retrospecStatus(facts);
	// The phase Lyriks is on lights its step in the picture of the run's start (criterion 3fccc273).
	const phase = status.status === 'running' ? (analysisOf(facts).progress.phases.find((p) => p.state === 'current')?.key ?? null) : null;
	const underWay = status.status === 'running' ? { pct: status.pct, seenAt: aiLastSeenOf(projectId), now, phase } : undefined;
	const input = { projectId, productName: identity.productName, auditEntries: scope.auditLog, limit, underWay };
	const events = retrospecEvents(facts.doc, input);
	if (!events.some(namesFigures)) return events;
	const figures = await builtFigures(services, projectId, features).catch(() => undefined);
	return figures ? retrospecEvents(facts.doc, { ...input, figures }) : events;
}

/** A run under way: what its notifications say moves with the share it read and the silence of its LLM, not with a revision. */
export const retrospecUnderWay = (doc: RetrospecDocument): boolean => {
	const run = currentRun(doc);
	return !!run && !run.publishedAt && !run.reviewStartedAt && !run.analysisEndedAt;
};

/** The facts a status is read from, for a caller that reads more of the run than its status (EVO-014). */
export async function readRetrospecFacts(services: AppServices, projectId: string): Promise<RetrospecFacts> {
	return (await statusInputs(services, projectId)).facts;
}

/** What the next run reads and starts from, read once for a start and for the launch Mismatch offers (EVO-014). */
export async function readNextRun(services: AppServices, projectId: string): Promise<NextRunReading> {
	return nextRunOf(await readRetrospecFacts(services, projectId));
}

/**
 * The person acting on a project, as an act records them: the session's id,
 * the name the whole app gives them in the workspace that owns the project.
 */
export async function retrospecActor(services: AppServices, projectId: string, cookies: Pick<Cookies, 'get'>): Promise<PersonRef> {
	const id = currentPersonId(services);
	const name = await callerNameForProject(services, projectId, cookies.get(ACTIVE_WORKSPACE_COOKIE)).catch(() => '');
	return { id, name: name.trim() || (id === 'local-operator' ? 'Local operator' : id) };
}
