import { error } from '@sveltejs/kit';
import { ProjectScopeRefusedError } from '$application/portfolio/project-creation-scope';
import { ProjectFolderRefusedError } from '$application/portfolio/create-project';
import type { ScopeCheck } from '$domain/licensing';

type Refusal = Extract<ScopeCheck, { ok: false }>;

/** Run a creation; a refusal of the installation's edition comes back as its check, anything else is rethrown. */
export async function refusedCreation<T>(create: () => Promise<T>): Promise<{ created: T } | { refused: Refusal }> {
	try {
		return { created: await create() };
	} catch (e) {
		if (e instanceof ProjectScopeRefusedError) return { refused: e.check };
		throw e;
	}
}

/** The 403 an API caller (an AI client, an import) gets for a creation the edition refuses. */
export function creationRefused(refusal: Refusal): never {
	error(403, { message: refusal.reason, detail: refusal.detail });
}

/** Run a creation; a folder the project may not be filed in comes back as its refusal, anything else is rethrown. */
export async function refusedFolder<T>(create: () => Promise<T>): Promise<{ created: T } | { folderRefused: string }> {
	try {
		return { created: await create() };
	} catch (e) {
		if (e instanceof ProjectFolderRefusedError) return { folderRefused: e.message };
		throw e;
	}
}
