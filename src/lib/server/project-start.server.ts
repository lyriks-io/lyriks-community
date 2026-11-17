import type { AppServices } from '$composition/container.server';
import { PROJECT_START_KEY, parseProjectStart, startWayOfSourceMode, type ProjectStart, type StartWay } from '$domain/portfolio/project-start';

/**
 * How a project was started, kept in its residue by the "Create your project"
 * dialog. A project started before the dialog existed reads its way off the
 * source mode its identity recorded, when that says enough.
 */
export async function loadStartWay(services: AppServices, projectId: string): Promise<StartWay | null> {
	const stored = parseProjectStart(await services.projectResidue.load(projectId, PROJECT_START_KEY).catch(() => null));
	if (stored) return stored.way;
	const identity = await services.loadFoundationDraft.loadIdentity(projectId).catch(() => null);
	return startWayOfSourceMode(identity?.sourceMode);
}

export async function saveProjectStart(services: AppServices, projectId: string, start: ProjectStart): Promise<void> {
	await services.projectResidue.save(projectId, PROJECT_START_KEY, start);
}
