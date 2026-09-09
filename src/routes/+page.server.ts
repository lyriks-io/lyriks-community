import { getServices } from '$composition/container.server';
import { isSourceModeCode } from '$domain/foundation';
import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { callerWorkspaceScope } from '$lib/server/workspace-scope.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import { seedOwnerCollaborator } from '$lib/server/seed-owner-collaborator.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { ownNewProject } from '$lib/server/new-project-ownership.server';
import { callerCanWrite } from '$lib/server/writer-gate.server';
import type { Actions, PageServerLoad } from './$types';

/** Audit actor from the request locals: the user email, else dev/anonymous. */
function actorOf(locals: App.Locals): string {
	return locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev');
}

/** Home = the portfolio dashboard: domains, their projects, and rollups. Scoped to
    the caller's own workspaces when auth is on (multi-tenant isolation). */
export const load: PageServerLoad = async (event) => {
	const services = getServices();
	const scope = await callerWorkspaceScope(event);
	const allowedDomains = await callerAllowedDomains(event);
	const portfolio = await services.buildPortfolio.execute(
		scope,
		allowedDomains,
		event.locals.session?.email ?? null
	);
	// Bootstrap signal: auth-on with no workspace → the home shows a "Create your
	// workspace" panel instead of the dead-end 409 when they try to create a project.
	const hasWorkspace = scope === null || scope.size > 0;
	// A reader gets the cards without their menu: every entry on it either
	// writes (edit, move, ship, delete) or takes a copy (duplicate, download).
	const canWrite = await callerCanWrite(event);
	return { portfolio, hasWorkspace, canWrite };
};

export const actions: Actions = {
	/**
	 * Bootstrap the caller's first workspace (they become its owner) and pin it as
	 * the active team. Self-service replacement for the "not a member of any team"
	 * dead-end — no admin/SSH round-trip needed to get started.
	 */
	createWorkspace: async ({ request, cookies, locals }) => {
		if (!locals.authRequired) return { created: 'workspace' };
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { scope: 'workspace', message: 'Give your workspace a name.' });

		const created = await getServices().workspaces.createForCaller(name);
		if (!created) {
			getServices().audit.record({ action: 'workspace.create', actor: actorOf(locals), outcome: 'failure' });
			return fail(502, { scope: 'workspace', message: 'Could not create your workspace. Please try again.' });
		}
		cookies.set('lyriks_active_ws', created.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 365
		});
		getServices().audit.record({ action: 'workspace.create', actor: actorOf(locals), outcome: 'success' });
		return { created: 'workspace' };
	},

	// Same boundary as POST /api/domains: creating a board is a full-portfolio right.
	createDomain: async (event) => {
		if ((await callerAllowedDomains(event)) !== null) {
			return fail(403, { scope: 'domain', message: 'Only members with full portfolio access can create domains.' });
		}
		const data = await event.request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { scope: 'domain', message: 'Give the domain a name.' });
		const description = String(data.get('description') ?? '');
		const icon = String(data.get('icon') ?? '');
		await getServices().createDomain.execute(name, description, icon);
		return { created: 'domain' };
	},

	updateDomain: async (event) => {
		const data = await event.request.formData();
		const id = String(data.get('id') ?? '');
		// Same boundary as PATCH /api/domains/[id]: an out-of-scope domain reads as absent.
		const allowedDomains = await callerAllowedDomains(event);
		if (allowedDomains !== null && !allowedDomains.has(id)) {
			return fail(404, { scope: 'domain', message: 'Domain not found.' });
		}
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '');
		const icon = String(data.get('icon') ?? '');
		const res = await getServices().updateDomain.execute(id, name, description, icon);
		if (!res.updated) return fail(400, { scope: 'domain', message: res.reason });
		return { updated: 'domain' };
	},

	removeDomain: async (event) => {
		const data = await event.request.formData();
		const id = String(data.get('id') ?? '');
		const allowedDomains = await callerAllowedDomains(event);
		if (allowedDomains !== null && !allowedDomains.has(id)) {
			return fail(404, { scope: 'domain', message: 'Domain not found.' });
		}
		const res = await getServices().removeDomain.execute(id);
		if (!res.removed) return fail(400, { scope: 'domain', message: res.reason });
		return { removed: 'domain' };
	},

	createProject: async ({ request, locals, cookies }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { scope: 'project', message: 'Give the product a name.' });
		// The starting point chosen in the modal: from scratch (greenfield, the
		// default) or from an existing codebase (code_to_spec). The latter ends on
		// the kickoff page, which hands the user the prompt for their coding agent.
		const sourceMode = String(data.get('sourceMode') ?? '') || 'greenfield';
		if (!isSourceModeCode(sourceMode)) {
			return fail(400, { scope: 'project', message: 'Unknown starting point for the project.' });
		}
		const services = getServices();

		// Auth-on: a project is owned by a team. Enterprise installs provision teams
		// centrally (SSO/admin), so a user with none gets a clear, actionable message
		// rather than a silently-created workspace. Small/pilot installs can opt into
		// self-provisioning with LYRIKS_AUTO_WORKSPACE=1 (mirrors LYRIKS_ALLOW_SIGNUP).
		if (locals.authRequired && services.identity.multiUser) {
			const teams = await services.workspaces.listForCaller();
			if (teams.length === 0) {
				if (env.LYRIKS_AUTO_WORKSPACE !== '1') {
					return fail(409, {
						scope: 'project',
						message:
							'You are not a member of any workspace yet. Ask your administrator to invite you to one.'
					});
				}
				const created = await services.workspaces.createForCaller(`${name} workspace`);
				if (!created) {
					services.audit.record({ action: 'project.create', actor: actorOf(locals), outcome: 'failure', detail: 'workspace provisioning failed' });
					return fail(502, { scope: 'project', message: 'Could not provision your workspace. Please try again.' });
				}
				// Make it the active team (this request resolves it via data[0] since it
				// is now the only one; the cookie pins it for subsequent requests).
				cookies.set('lyriks_active_ws', created.id, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: !dev,
					maxAge: 60 * 60 * 24 * 365
				});
			}
		}

		const id = await services.createProject.execute({
			name,
			description: String(data.get('description') ?? ''),
			domainId: String(data.get('domainId') ?? '') || null,
			sourceMode
		});

		// Auth-on: a project must be owned on the back from creation, otherwise the
		// fail-closed access guard would lock the creator out of their own project.
		// Create + own it synchronously (as the calling user) and roll back rather
		// than leave an inaccessible orphan if the back can't register it.
		if (locals.authRequired && services.identity.multiUser) {
			await services.pushEnvelopeToBack.execute(id);
			const link = await services.backLinks.find(id);
			if (!link) {
				await services.deleteProject.execute(id);
				services.audit.record({ action: 'project.create', actor: actorOf(locals), target: id, outcome: 'failure', detail: 'back registration failed' });
				return fail(502, {
					scope: 'project',
					message: 'Could not register the project on the server. Please try again.'
				});
			}
			// Own the project's team: the creator is its first (owner) collaborator, so
			// per-project scope keeps them able to see and open it (see seedOwnerCollaborator).
			await seedOwnerCollaborator(id, locals.session?.email);
		}

		services.audit.record({ action: 'project.create', actor: actorOf(locals), target: id, outcome: 'success' });
		redirect(303, `/projects/${id}/kickoff`);
	},

	updateProject: async (event) => {
		const data = await event.request.formData();
		const projectId = String(data.get('projectId') ?? '');
		if (!projectId) return fail(400, { scope: 'project', message: 'Missing project id.' });
		// Same gates as PATCH /api/projects/[id]: write access, then the destination
		// domain must exist and sit inside the caller's portfolio scope.
		await requireProjectAccess(event, projectId, 'write');
		const name = String(data.get('name') ?? '');
		const description = String(data.get('description') ?? '');
		const domainId = String(data.get('domainId') ?? '') || null;
		if (domainId) {
			if (!(await getServices().listDomains.execute()).some((domain) => domain.id === domainId)) {
				return fail(400, { scope: 'project', message: 'The destination domain does not exist.' });
			}
			const allowedDomains = await callerAllowedDomains(event);
			if (allowedDomains !== null && !allowedDomains.has(domainId)) {
				return fail(403, { scope: 'project', message: 'The target domain is outside your portfolio scope.' });
			}
		}
		const res = await getServices().updateProject.execute({
			projectId,
			name,
			description,
			domainId
		});
		if (!res.updated) return fail(400, { scope: 'project', message: res.reason });
		return { updated: 'project' };
	},

	// The human shipping call — the ONE delivery fact Lyriks never derives. Kept a
	// form action on the dashboard (a person, in a session) and deliberately absent
	// from the project API, so no assistant can declare a product shipped.
	markProjectShipped: async (event) => {
		const { request, locals } = event;
		const data = await request.formData();
		const projectId = String(data.get('projectId') ?? '');
		if (!projectId) return fail(400, { scope: 'project', message: 'Missing project id.' });
		await requireProjectAccess(event, projectId, 'write');

		const shipped = String(data.get('shipped') ?? '') === 'true';
		const services = getServices();
		const res = await services.markProjectShipped.execute({ projectId, shipped });
		if (!res.updated) return fail(400, { scope: 'project', message: res.reason });
		services.audit.record({
			action: shipped ? 'project.shipped' : 'project.unshipped',
			actor: actorOf(locals),
			target: projectId,
			outcome: 'success'
		});
		return { updated: 'project' };
	},

	// Create a domain and move the project into it in one step (from the card's
	// "Move to domain" flyout). Reuses the existing create-domain + update-project
	// use-cases rather than adding a bespoke one.
	createDomainForProject: async (event) => {
		const data = await event.request.formData();
		const domainName = String(data.get('domainName') ?? '').trim();
		if (!domainName) return fail(400, { scope: 'domain', message: 'Give the domain a name.' });
		const projectId = String(data.get('projectId') ?? '');
		if (!projectId) return fail(400, { scope: 'project', message: 'Missing project id.' });
		// Both halves of the one-step flow keep their own boundary: writing the
		// project, and the full-portfolio right that domain creation requires.
		await requireProjectAccess(event, projectId, 'write');
		if ((await callerAllowedDomains(event)) !== null) {
			return fail(403, { scope: 'domain', message: 'Only members with full portfolio access can create domains.' });
		}
		const services = getServices();
		const domain = await services.createDomain.execute(domainName);
		const res = await services.updateProject.execute({
			projectId,
			name: String(data.get('name') ?? ''),
			description: String(data.get('description') ?? ''),
			domainId: domain.id
		});
		if (!res.updated) return fail(400, { scope: 'project', message: res.reason });
		return { updated: 'project' };
	},

	/**
	 * Duplicate a project from the card menu.
	 *
	 * Deliberately the SAME pair the download/upload path uses, run in process:
	 * `exportProject` reads the whole project at storage level (rows + behavior
	 * kernel + the files inside them) and `importProject` writes it back under a
	 * fresh id. A bespoke copier would be a second answer to "what is a whole
	 * project", and the two would drift the first time a section moves stores.
	 * The zip never leaves the process; it is the serialization, not a download.
	 */
	duplicateProject: async (event) => {
		const { request, locals } = event;
		const data = await request.formData();
		const projectId = String(data.get('projectId') ?? '');
		if (!projectId) return fail(400, { scope: 'project', message: 'Missing project id.' });

		// Duplicating never writes to the source, but the copy is a whole new
		// project (sections, kernel, files): a reader's way of taking everything
		// home, so it is a writer's action, like the export.
		await requireProjectAccess(event, projectId, 'write');

		const services = getServices();
		const bundle = await services.exportProject.execute(projectId);
		if (!bundle) return fail(404, { scope: 'project', message: 'Project not found.' });

		// No domain is passed on purpose: the bundle carries the source's own, and
		// the import matches it by name, so the copy lands beside its original.
		const result = await services.importProject.execute({
			bytes: bundle.bytes,
			mode: 'copy',
			name: `${bundle.projectName} (copy)`
		});
		if (!result.ok) {
			services.audit.record({ action: 'project.duplicate', actor: actorOf(locals), target: projectId, outcome: 'failure', detail: result.error });
			return fail(400, { scope: 'project', message: result.error });
		}

		// Same ownership invariant as creating or importing one: auth-on, the copy
		// must be owned from the moment it exists or per-project scope hides it
		// from the person who just made it.
		await ownNewProject(locals, result.projectId, 'project.duplicate');
		await services.scheduleBackSync(result.projectId);
		// The copy has to READ the same as its original, not just hold the same
		// rows: the behavior advisories and the DPO verdict are per-project caches
		// that fill on first read, and coverage averages the dimensions that exist.
		// Priming here is what makes "duplicate" mean the same state, with nothing
		// for the person who clicked to run afterwards.
		await services.primeProjectAnalysis(result.projectId);
		services.audit.record({
			action: 'project.duplicate',
			actor: actorOf(locals),
			target: result.projectId,
			outcome: 'success',
			detail: `copy of ${projectId}`
		});
		// Both halves can have something to say: packing resolves kernel drift,
		// restoring resolves domains and missing files. Neither is silent.
		return {
			duplicated: result.projectId,
			name: result.name,
			warnings: [...bundle.warnings, ...result.warnings]
		};
	},

	deleteProject: async (event) => {
		const { request, locals } = event;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const confirmName = String(data.get('confirmName') ?? '');
		if (!id) return fail(400, { scope: 'project', message: 'Missing project id.' });

		// Same per-request gate as opening the project: membership + visibility scope.
		await requireProjectAccess(event, id, 'write');

		const services = getServices();
		const res = await services.deleteProject.executeConfirmed({
			projectId: id,
			confirmName,
			requesterEmail: locals.session?.email ?? null,
			enforceOwner: locals.authRequired
		});
		if (!res.deleted) {
			services.audit.record({ action: 'project.delete', actor: actorOf(locals), target: id, outcome: 'failure', detail: res.reason });
			const message = {
				not_found: 'Project not found.',
				name_mismatch: 'The name you typed does not match the project name.',
				not_owner: 'Only the project owner can delete this project.'
			}[res.reason];
			const status = res.reason === 'not_owner' ? 403 : res.reason === 'not_found' ? 404 : 400;
			return fail(status, { scope: 'project', message });
		}
		services.audit.record({ action: 'project.delete', actor: actorOf(locals), target: id, outcome: 'success' });
		return { removed: 'project' };
	}
};
