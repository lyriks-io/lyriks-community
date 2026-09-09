import { error, isHttpError, json, type RequestEvent } from '@sveltejs/kit';
import { getServices, type AppServices } from '$composition/container.server';
import { publishSectionChange } from '$lib/server/sync-bus.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { commitRevision, expectedRevision } from '$lib/server/draft-lock.server';
import type { SectionDraftSaveOptions } from '$application/ports';

/**
 * Run a section's kernel-mutating steps, turning an *unexpected* throw into a
 * structured 500 whose message names the underlying cause — instead of
 * SvelteKit's bare `Internal Error`, which gave a downstream caller (the MCP,
 * an SDK client) zero signal and forced diagnosis over SSH (e.g. an `EACCES`
 * writing `data/unspa`).
 *
 * HttpErrors already thrown deliberately upstream (403 from access checks, 400
 * from validation) pass through unchanged — only genuinely unexpected failures
 * are wrapped.
 */
export async function guardSectionWrite<T>(section: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (isHttpError(e)) throw e;
		const detail = e instanceof Error ? e.message : String(e);
		error(500, `kernel_write_failed [${section}]: ${detail}`);
	}
}

/** What a `PUT /api/draft/<section>` route contributes; everything else is protocol. */
export interface SectionSaveSpec<TDraft, TResult extends object> {
	/** Wizard section key — revision scope, sync-bus topic and error label. */
	section: string;
	/** Optional pre-parse gate (e.g. `assertSectionDraftValid`) — throws 400. */
	validate?: (body: unknown) => void;
	/** Bounded-context anti-corruption parser (pure — must not touch IO). */
	parse: (body: unknown, projectId: string) => TDraft;
	/**
	 * Context-specific persistence (draft save, kernel writes, follow-up syncs).
	 * Atomic sections receive the client's revision + origin in `save` and pass
	 * them to the consolidated store; they return null when the revision went
	 * stale. Legacy sections ignore `save` and never return null.
	 */
	persist: (
		draft: TDraft,
		services: AppServices,
		projectId: string,
		save: SectionDraftSaveOptions
	) => Promise<TResult | null>;
	/** Best-effort envelope mirror to Lyriks-back after a successful save (default true). */
	mirror?: boolean;
	/**
	 * Consolidated (`project_section_documents`) section: `persist` runs the
	 * whole optimistic-lock save — revision compare, document write and change
	 * notify in ONE transaction — so the protocol skips its own revision
	 * commit/rollback and publish steps, and `persist`'s result must carry the
	 * new `revision`. A null result answers 409.
	 */
	atomic?: boolean;
}

/**
 * Fire-and-forget envelope mirror after a successful save. Deliberately not
 * awaited — a down back must never fail or slow the user's save.
 * `scheduleBackSync` records the project in the durable outbox and kicks an
 * immediate drain (the happy path pushes as fast as the old direct mirror); a
 * failed push is retried with backoff by the composition-root drain worker.
 * The catch here is a last resort so the promise is never dropped unhandled.
 */
function mirrorToBack(services: AppServices, projectId: string, section: string): void {
	void services
		.scheduleBackSync(projectId)
		.catch((e) =>
			console.warn(
				`[draft] envelope mirror dispatch failed [${section}]:`,
				e instanceof Error ? e.message : e
			)
		);
}

/**
 * The section whose save CREATES the project: Foundation carries the identity
 * draft, and a project exists exactly from the moment that draft is stored. It
 * is therefore the only section that may be written for an id the catalog does
 * not know yet.
 */
const FOUNDING_SECTION = 'foundation';

/** The 409 every stale-revision path answers with (client reloads on it). */
const STALE_REVISION_MESSAGE =
	'This section was changed by someone else. Reload to get the latest version.';

/**
 * The one save protocol behind every section autosave route: read body →
 * access guard → validate → parse → save → mirror → echo `{ …result, revision }`.
 *
 * Two save shapes:
 *  - **atomic** (consolidated sections): `persist` runs the revision compare,
 *    document write and change notify in one store transaction — nothing to
 *    compensate, null means stale (→ 409).
 *  - **legacy** (sections still on dedicated tables / kernel writes): revision
 *    commit BEFORE persist, publish after. Parsing runs BEFORE the revision
 *    bump so an invalid body cannot consume a revision, and a persistence
 *    failure rolls the bump back (compare-and-set, so a legitimate concurrent
 *    bump is never undone) — without this the client's next save would hit a
 *    false 409 (revision moved, document didn't). The change is published only
 *    after the document is durably saved.
 */
export async function saveSectionDraft<TDraft, TResult extends object>(
	event: RequestEvent,
	spec: SectionSaveSpec<TDraft, TResult>
): Promise<Response> {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	const services = getServices();

	// The project must already exist. `requireProjectAccess` returns immediately
	// when auth is off — the standalone appliance and every dev setup — so before
	// this nothing checked the id at all: a typo, or an id an agent invented,
	// wrote a perfectly valid section under a project that was in no catalog. The
	// write answered 200 with a revision, and the work was invisible everywhere,
	// with no error to explain it. Foundation is exempt because it is what BRINGS
	// a project into being (CreateProjectUseCase saves that draft and nothing
	// else); the other sections are created lazily on top of one that exists.
	if (spec.section !== FOUNDING_SECTION && !(await services.projectExists(projectId))) {
		error(
			404,
			`Project "${projectId}" does not exist. Create it first — POST /api/projects, or create_wizard_project through the MCP. Saving a section never brings a project into being.`
		);
	}

	spec.validate?.(body);
	const draft = spec.parse(body, projectId);
	const save: SectionDraftSaveOptions = {
		expectedRevision: expectedRevision(request),
		origin: request.headers.get('x-lyriks-client')
	};

	if (spec.atomic) {
		const result = await guardSectionWrite(spec.section, () =>
			spec.persist(draft, services, projectId, save)
		);
		if (result === null) error(409, STALE_REVISION_MESSAGE);
		if (spec.mirror !== false) mirrorToBack(services, projectId, spec.section);
		return json(result);
	}

	const revision = await commitRevision(projectId, spec.section, request);
	let result: TResult | null;
	try {
		result = await guardSectionWrite(spec.section, () =>
			spec.persist(draft, services, projectId, save)
		);
	} catch (e) {
		await services.draftLock
			.rollback(projectId, spec.section, revision)
			.catch((re) =>
				console.warn(
					`[draft] revision rollback failed [${spec.section}]:`,
					re instanceof Error ? re.message : re
				)
			);
		throw e;
	}
	if (spec.mirror !== false) mirrorToBack(services, projectId, spec.section);
	publishSectionChange({
		projectId,
		section: spec.section,
		origin: save.origin
	});
	return json({ ...result, revision });
}
