import { RETROSPEC_SECTION } from '$domain/retrospec';
import { fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { callerAllowedDomains, callerReach } from '$lib/server/domain-scope.server';
import { callerRoleInProjectWorkspace, projectWorkspaceId } from '$lib/server/caller-workspace.server';
import { folderChange, folderCreation, folderForProject } from '$application/portfolio/folder-policy';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { ownNewProject } from '$lib/server/new-project-ownership.server';
import { refusedCreation } from '$lib/server/project-creation-refusal.server';
import { readHome } from '$lib/server/home.server';
import { ASK_YOUR_ADMINISTRATOR, foundWorkspace, mayFoundWorkspace } from '$lib/server/workspace-founding.server';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { NOTIFICATIONS_DEPENDENCY } from '$ui/shell/notifications-client';
import type { Actions, PageServerLoad } from './$types';

/** Audit actor from the request locals: the user email, else dev/anonymous. */
function actorOf(locals: App.Locals): string {
	return locals.session?.email ?? (locals.authRequired ? 'anonymous' : 'dev');
}

/**
 * Home (feat-home): what needs the reader, then the journal of every project
 * they can open. A decision on a code change, a read mark, a change of any
 * project read again what they moved.
 */
export const load: PageServerLoad = async (event) => {
	const home = await readHome(event);
	event.depends(NOTIFICATIONS_DEPENDENCY);
	for (const id of home.projectIds) {
		event.depends(projectSyncKey(id));
		event.depends(sectionSyncKey(id, RETROSPEC_SECTION));
		event.depends(sectionSyncKey(id, 'evolution'));
	}
	return { ...home, mayFoundWorkspace: mayFoundWorkspace(event) };
};

/** A refusal as the Home forms word it: a sentence. */
const sentence = (reason: string) => (reason.endsWith('.') ? reason : `${reason}.`);

/**
 * The folder checks of the Home forms that change a folder, the same as the
 * projects panel's (rules a924fdc0, 61faf699): a folder out of reach reads as
 * absent and a viewer of its workspace changes nothing. A folder that is gone
 * keeps the forms' own answers, after the scope check they always made.
 */
async function homeFolderRefusal(event: Parameters<Actions[string]>[0], id: string) {
	const existing = (await event.locals.services.listDomains.execute()).find((domain) => domain.id === id);
	if (!existing) {
		return (await callerAllowedDomains(event)) === null ? null : fail(404, { scope: 'domain', message: 'Domain not found.' });
	}
	const verdict = folderChange(await callerReach(event), existing);
	return verdict.ok ? null : fail(verdict.status, { scope: 'domain', message: sentence(verdict.reason) });
}

export const actions: Actions = {
	/**
	 * Found a workspace from Home (the caller becomes its owner) and pin it as the
	 * active team. For an administrator of the installation, or for anyone where
	 * the operator allowed self-provisioning; everyone else is invited by an
	 * administrator, as the deployment guide promises.
	 */
	createWorkspace: async ({ request, cookies, locals }) => {
		if (!locals.authRequired) return { created: 'workspace' };
		if (!mayFoundWorkspace({ locals })) {
			locals.services.audit.record({ action: 'workspace.create', actor: actorOf(locals), outcome: 'failure', detail: 'not allowed to provision' });
			return fail(403, { scope: 'workspace', message: ASK_YOUR_ADMINISTRATOR });
		}
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { scope: 'workspace', message: 'Give your workspace a name.' });

		const founding = await foundWorkspace(locals.services, name);
		if (founding === null) {
			locals.services.audit.record({ action: 'workspace.create', actor: actorOf(locals), outcome: 'failure' });
			return fail(502, { scope: 'workspace', message: 'Could not create your workspace. Please try again.' });
		}
		if ('refused' in founding) {
			// The team server's own reason: an administrator of the installation it refuses reads why (rule 02adbadd).
			locals.services.audit.record({ action: 'workspace.create', actor: actorOf(locals), outcome: 'failure', detail: founding.refused });
			return fail(403, { scope: 'workspace', message: founding.refused });
		}
		cookies.set('lyriks_active_ws', founding.created.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 365
		});
		locals.services.audit.record({ action: 'workspace.create', actor: actorOf(locals), outcome: 'success' });
		return { created: 'workspace' };
	},

	// Same boundary as POST /api/domains: a writer who sees every folder of the
	// workspace the switcher shows adds one to it (rules 509fa7a1, b0e92772).
	createDomain: async (event) => {
		const verdict = folderCreation(await callerReach(event));
		if (!verdict.ok) return fail(verdict.status, { scope: 'domain', message: sentence(verdict.reason) });
		const data = await event.request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { scope: 'domain', message: 'Give the domain a name.' });
		const description = String(data.get('description') ?? '');
		const icon = String(data.get('icon') ?? '');
		await event.locals.services.createDomain.execute(name, description, icon, verdict.workspaceId ?? null);
		return { created: 'domain' };
	},

	updateDomain: async (event) => {
		const data = await event.request.formData();
		const id = String(data.get('id') ?? '');
		// Same boundary as PATCH /api/domains/[id]: a folder out of reach reads as absent,
		// and a viewer of its workspace changes nothing (rule a924fdc0).
		const refusal = await homeFolderRefusal(event, id);
		if (refusal) return refusal;
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '');
		const icon = String(data.get('icon') ?? '');
		const res = await event.locals.services.updateDomain.execute(id, name, description, icon);
		if (!res.updated) return fail(400, { scope: 'domain', message: res.reason });
		return { updated: 'domain' };
	},

	removeDomain: async (event) => {
		const data = await event.request.formData();
		const id = String(data.get('id') ?? '');
		const refusal = await homeFolderRefusal(event, id);
		if (refusal) return refusal;
		const res = await event.locals.services.removeDomain.execute(id);
		if (!res.removed) return fail(400, { scope: 'domain', message: res.reason });
		return { removed: 'domain' };
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
			// Same checks as PATCH /api/projects/[id], read in the project's own workspace.
			const target = (await event.locals.services.listDomains.execute()).find((domain) => domain.id === domainId);
			const filing = folderForProject(await callerReach(event), await projectWorkspaceId(event.locals.services, projectId), target);
			if (filing === 'missing') return fail(400, { scope: 'project', message: 'The destination domain does not exist.' });
			if (filing === 'outside') return fail(403, { scope: 'project', message: 'The target domain is outside your portfolio scope.' });
		}
		const res = await event.locals.services.updateProject.execute({
			projectId,
			name,
			description,
			domainId
		});
		if (!res.updated) return fail(400, { scope: 'project', message: res.reason });
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
		const services = event.locals.services;
		// The folder is made in the project's own workspace, by a member who sees every folder there.
		const workspaceId = await projectWorkspaceId(services, projectId);
		if ((await callerAllowedDomains(event, workspaceId)) !== null) {
			return fail(403, { scope: 'domain', message: 'Only members with full portfolio access can create domains.' });
		}
		const domain = await services.createDomain.execute(domainName, '', 'lucide:building-2', workspaceId);
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
	 * Duplicate a project from the menu of its row in the Projects panel (criterion 54b86d96).
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

		const services = event.locals.services;
		const bundle = await services.exportProject.execute(projectId);
		if (!bundle) return fail(404, { scope: 'project', message: 'Project not found.' });

		// No domain is passed on purpose: the bundle carries the source's own, and
		// the import matches it by name, so the copy lands beside its original.
		// The copy is registered in the workspace the switcher shows: its folders are the ones it may land in.
		const workspaceId = (await callerReach(event))?.activeId ?? null;
		const copy = await refusedCreation(() =>
			services.importProject.execute({
				bytes: bundle.bytes,
				mode: 'copy',
				name: `${bundle.projectName} (copy)`,
				workspaceId
			})
		);
		if ('refused' in copy) {
			return fail(403, { scope: 'project', message: copy.refused.reason, detail: copy.refused.detail, plan: copy.refused.plan });
		}
		const result = copy.created;
		if (!result.ok) {
			services.audit.record({ action: 'project.duplicate', actor: actorOf(locals), target: projectId, outcome: 'failure', detail: result.error });
			return fail(400, { scope: 'project', message: result.error });
		}

		// Same ownership invariant as creating or importing one: auth-on, the copy
		// must be owned from the moment it exists or per-project scope hides it
		// from the person who just made it.
		await ownNewProject(services, locals, result.projectId, 'project.duplicate');
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

		const services = event.locals.services;
		const res = await services.deleteProject.executeConfirmed({
			projectId: id,
			confirmName,
			requesterEmail: locals.session?.email ?? null,
			requesterWorkspaceRole: locals.authRequired ? await callerRoleInProjectWorkspace(services, id) : null,
			enforceOwner: locals.authRequired
		});
		if (!res.deleted) {
			services.audit.record({ action: 'project.delete', actor: actorOf(locals), target: id, outcome: 'failure', detail: res.reason });
			const message = {
				not_found: 'Project not found.',
				name_mismatch: 'The name you typed does not match the project name.',
				not_owner: 'Only a project owner or a workspace owner or admin can delete this project.'
			}[res.reason];
			const status = res.reason === 'not_owner' ? 403 : res.reason === 'not_found' ? 404 : 400;
			return fail(status, { scope: 'project', message });
		}
		services.audit.record({ action: 'project.delete', actor: actorOf(locals), target: id, outcome: 'success' });
		return { removed: 'project' };
	}
};
