import type { AppServices } from '$composition/container.server';
import { readBehavior } from './behavior-read.server';
import { readLandedChanges } from './landed-changes.server';
import { projectDiscussions, projectRetrospecActivity } from './project-activity.server';
import { loadRetrospecFigures } from './retrospec-page.server';
import { readSpecElements } from './spec-elements.server';
import { readOverview } from './spec360-overview.server';
import { readGlossary, readSpecFrame } from './spec360-read.server';
import { readSpecSources } from './spec360-sources.server';
import { readSpecValidationSources } from './spec-validation.server';

/**
 * Reads ahead, once the server has started, what the first pages of the
 * projects worked on last will ask for.
 *
 * Every deploy is a restart, and after a restart the first person paid for
 * everything at once: every reading is computed for the first time on a cold
 * process (on lab the first Overview, Reverse and bar together took some fifteen
 * seconds, and the stalls they caused let the database pool and the access check
 * time out). The same reads are taken here, one at a time with a breath between
 * them, before anyone asks; a page that comes in the meantime shares the reading
 * in progress instead of starting its own. Nothing is written and no answer
 * changes: only when the work is done.
 */

/** Provisional constant warmUpProjects: how many of the projects written last are read ahead. */
export const WARM_UP_PROJECTS = 3;
/** Provisional constant warmUpDelayMs: how long after the start the reads begin, past the readiness probes. */
export const WARM_UP_DELAY_MS = 2_000;

type Step = (services: AppServices, projectId: string) => Promise<unknown>;

/** The readings a project's first pages ask for, the costliest first. */
const STEPS: readonly (readonly [string, Step])[] = [
	['behaviour', readBehavior],
	// The analysis every project page's layout reads (project:coherence): the health
	// and coverage below serve a kept snapshot and never compute it (6 s on lab).
	['coherence', (services, projectId) => services.loadCoherenceDraft.execute(projectId)],
	['elements', readSpecElements],
	['frame', readSpecFrame],
	['overview', readOverview],
	['validation', readSpecValidationSources],
	['sources', readSpecSources],
	['landed', readLandedChanges],
	['glossary', readGlossary],
	['reverse', loadRetrospecFigures],
	['health', (services, projectId) => services.projectHealthView.get(projectId)],
	['coverage', (services, projectId) => services.implementationCoverage.get(projectId)]
];

/**
 * What the app bar reads of every project, whoever reads it: on its first read
 * after a start, the bar folded the behaviour of every project with a
 * retrospecification. The readings that depend on the reader (their marks, the
 * people a mention names) are left to the bar.
 */
const BAR_STEPS: readonly (readonly [string, Step])[] = [
	['bar:reverse', projectRetrospecActivity],
	['bar:discussions', projectDiscussions]
];

/** A reading of the project written last logged by name once it took this long. */
const SLOW_STEP_MS = 100;

/** Lets the requests waiting on the thread through between two readings. */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

export async function warmUp(
	services: AppServices,
	options: { readonly projects?: number; readonly log?: (line: string) => void } = {}
): Promise<{ readonly projects: readonly string[]; readonly failed: number; readonly ms: number }> {
	const started = performance.now();
	const projectIds = (await services.sectionDocuments.recentlyWritten?.(options.projects ?? WARM_UP_PROJECTS).catch(() => [])) ?? [];
	let failed = 0;
	/** The readings of the projects read ahead that took long, as a cold page would wait on them: lab's own benchmark. */
	const slow: string[] = [];
	const run = async (steps: readonly (readonly [string, Step])[], projectId: string, timed: boolean) => {
		for (const [name, step] of steps) {
			await breathe();
			const at = performance.now();
			// A reading that fails here fails the same way for the page that asks for it: nothing to report twice.
			await step(services, projectId).catch(() => {
				failed += 1;
			});
			const ms = Math.round(performance.now() - at);
			if (timed && ms >= SLOW_STEP_MS) slow.push(`${name} ${ms}ms`);
		}
	};
	for (const [i, projectId] of projectIds.entries()) await run(STEPS, projectId, i === 0);
	const everyProject = await services.listProjects.execute().catch(() => []);
	for (const project of everyProject) await run(BAR_STEPS, project.id, false);
	const ms = Math.round(performance.now() - started);
	if (projectIds.length > 0 || everyProject.length > 0) {
		options.log?.(
			`[warm-up] read ahead ${projectIds.join(', ') || 'no project'} and the bar of ${everyProject.length} projects in ${ms}ms${failed > 0 ? ` (${failed} readings failed)` : ''}${slow.length > 0 ? `; ${projectIds[0]} cold: ${slow.join(', ')}` : ''}`
		);
	}
	return { projects: projectIds, failed, ms };
}

/** LYRIKS_WARM_UP=0 turns the read-ahead off. */
export function warmUpEnabled(raw: string | undefined): boolean {
	return (raw ?? '').trim() !== '0';
}
