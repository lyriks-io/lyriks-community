import { cloneData } from './clone-data.server';
import { subscribeSectionChanges } from './sync-bus.server';

/**
 * One read of a project's section for every caller that asks while it runs.
 *
 * A page of the Specification 360° reads the same sections from its project
 * layout, its own layout, its page and the use cases under them: the features
 * draft, rebuilt from the kernel feature by feature, was read about ten times
 * for one Overview. Callers that ask while a read of that project is running
 * now wait on it; each gets its own copy, so none can change what another
 * reads. A write to the project ends the sharing at once: a read asked after
 * it starts afresh. No result outlives its read, so nothing can be stale.
 */

interface ProjectLoader {
	execute(projectId: string, ...rest: never[]): Promise<unknown>;
}

export function coalesceLoads<L extends ProjectLoader>(loader: L): L {
	const running = new Map<string, Promise<unknown>>();
	subscribeSectionChanges(({ projectId }) => running.delete(projectId));
	const load = loader.execute.bind(loader) as (projectId: string, ...rest: unknown[]) => Promise<unknown>;
	loader.execute = ((projectId: string, ...rest: unknown[]) => {
		// A read with options of its own is its own read.
		if (rest.length > 0) return load(projectId, ...rest);
		let run = running.get(projectId);
		if (!run) {
			const started = load(projectId).finally(() => {
				if (running.get(projectId) === started) running.delete(projectId);
			});
			running.set(projectId, started);
			run = started;
		}
		return run.then((draft) => cloneData(draft));
	}) as L['execute'];
	return loader;
}
