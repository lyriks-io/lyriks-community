import { json, error } from '@sveltejs/kit';
import { isSourceModeCode } from '$domain/foundation';
import { getServices } from '$composition/container.server';
import { callerWorkspaceScope } from '$lib/server/workspace-scope.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import {
	currentRequestSession,
	currentRequestToken,
	runWithRequestContext
} from '$lib/server/request-context.server';
import { ownNewProject, resolveOwningWorkspace } from '$lib/server/new-project-ownership.server';
import type { RequestHandler } from './$types';

/** Audit actor from the request locals: the user email, else dev/anonymous. */
function actorOf(locals: App.Locals): string {
	return locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev');
}

/**
 * Project discovery for the Lyriks MCP: the portfolio (domains + their projects)
 * so a caller can find the projectId to target with the section tools. Scoped to
 * the caller's own workspaces when auth is on (multi-tenant isolation).
 */
export const GET: RequestHandler = async (event) => {
	const services = getServices();
	const scope = await callerWorkspaceScope(event);
	const allowedDomains = await callerAllowedDomains(event);
	const portfolio = await services.buildPortfolio.execute(
		scope,
		allowedDomains,
		event.locals.session?.email ?? null
	);
	return json({ portfolio });
};

/**
 * Create a wizard project through the MCP under auth (Fix #4 — the studio blocker):
 * the same ownership flow the home `createProject` action runs, so the caller can
 * mint a project *and* have `set_section` succeed on it immediately (previously
 * `create_project` minted a back UUID with no linked v3 wizard project, and
 * create-on-write is off under the enterprise guard → `set_section` 404'd).
 *
 * Body: `{ name, description?, domainId?, workspaceId?, sourceMode? }`. Returns the
 * v3 `projectId` (the slug the section tools address). `sourceMode` is one of the
 * Foundation source-mode codes (`greenfield` by default, `code_to_spec` for a
 * retro-spec) and lands on the identity draft. A `stage` field is
 * accepted-and-ignored: the delivery stage is derived from the live signals.
 *
 * Ownership: auth-on, a project must be owned by the caller's team on the back from
 * creation, else the fail-closed guard would lock the creator out of their own
 * project. An MCP request carries no active-workspace cookie, so the target team is
 * an explicit `workspaceId` (validated against membership) which we pin into the
 * request context for the duration of the back mirror — the exact validated path the
 * cookie uses. Create + own synchronously and roll back rather than leave an orphan.
 */
export const POST: RequestHandler = async (event) => {
	const { locals } = event;
	const body = (await event.request.json().catch(() => null)) as {
		name?: unknown;
		description?: unknown;
		domainId?: unknown;
		workspaceId?: unknown;
		sourceMode?: unknown;
	} | null;

	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name) error(400, 'name is required');
	const requestedWorkspaceId =
		typeof body?.workspaceId === 'string' && body.workspaceId.length > 0 ? body.workspaceId : null;

	const services = getServices();

	// Auth-on: resolve the owning team up front and validate membership, so we never
	// register a project into a workspace the caller isn't in (unforgeable — the list
	// is token-scoped from the back). Auth-off (standalone appliance): single trusted
	// tenant, no team to pin.
	const owningWorkspaceId = await resolveOwningWorkspace(locals, requestedWorkspaceId);

	const description = typeof body?.description === 'string' ? body.description : '';
	const domainId = typeof body?.domainId === 'string' && body.domainId ? body.domainId : null;
	const sourceMode = body?.sourceMode ?? 'greenfield';
	if (!isSourceModeCode(sourceMode)) error(400, 'sourceMode is not a known source mode');

	// Pin the chosen team into the request context so the back mirror owns the project
	// to it (an MCP call has no active-workspace cookie; hooks left it null). Preserve
	// the caller's token so the mirror still acts AS this user. Auth-off leaves the
	// context untouched (owningWorkspaceId null → dev workspace, unchanged behaviour).
	const createOwned = async (): Promise<string> => {
		const id = await services.createProject.execute({ name, description, domainId, sourceMode });
		await ownNewProject(locals, id, 'project.create');
		return id;
	};

	const id = owningWorkspaceId
		? await runWithRequestContext(
				{
					token: currentRequestToken(),
					workspaceId: owningWorkspaceId,
					// Only the target workspace changes here — the caller stays the same.
					session: currentRequestSession() ?? { isAuthenticated: true }
				},
				createOwned
			)
		: await createOwned();

	services.audit.record({
		action: 'project.create',
		actor: actorOf(locals),
		target: id,
		outcome: 'success'
	});
	return json({ projectId: id, workspaceId: owningWorkspaceId });
};
