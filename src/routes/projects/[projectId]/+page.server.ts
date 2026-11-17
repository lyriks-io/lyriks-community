import { redirect } from '@sveltejs/kit';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { readProjectTabs } from '$lib/server/project-tabs.server';
import { readRetrospecStatus } from '$lib/server/retrospec-status.server';
import type { PageServerLoad } from './$types';

const TAB_PATH = { retro: 'retrospec', spec: 'spec', evolutions: 'evolution' } as const;

/**
 * A bare project URL opens on its Specification 360° once the project has
 * opened it, else on the one tab it has (the Retrospecification of an existing
 * product, the Evolutions of a new one); a project with nothing written and no
 * way chosen yet asks how to start it (from its code, or from scratch).
 */
export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const services = locals.services;
	const { featureNames } = await parent();
	const [evolution, retroDoc, retro] = await Promise.all([
		services.loadEvolutionDraft.execute(params.projectId).catch(() => null),
		loadRetrospecDocument(services.sectionDocuments, params.projectId).catch(() => null),
		readRetrospecStatus(services, params.projectId).catch(() => null)
	]);
	const evolutions = (evolution?.requests ?? []).filter((r) => r.status !== 'deleted').length;
	const { tabs } = await readProjectTabs(services, params.projectId, retro, evolutions);
	const started = featureNames.length > 0 || evolutions > 0 || (retroDoc?.doc.runs.length ?? 0) > 0 || !tabs.includes('retro');
	if (!started) return {};
	const entry = tabs.includes('spec') ? 'spec' : (tabs[0] ?? 'spec');
	throw redirect(307, `/projects/${params.projectId}/${TAB_PATH[entry]}`);
};
