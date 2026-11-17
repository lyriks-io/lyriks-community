/**
 * "How to use Lyriks", the five first steps the help menu opens, each ticked
 * from what the reader's installation really holds.
 */
export interface FirstStepsProgress {
	readonly hasProject: boolean;
	/** The current project's retrospecification is validated and published. */
	readonly retroDone: boolean;
	/** This browser has opened the Specification 360° of a project. */
	readonly specVisited: boolean;
	readonly evolutionStarted: boolean;
	/** An evolution of the current project reached its verification. */
	readonly evolutionVerified: boolean;
}

export interface FirstStep {
	readonly n: string;
	readonly t: string;
	readonly d: string;
	readonly done: boolean;
	readonly cta: string;
	/** Null when the step has no page to open (or no project to open it in). */
	readonly href: string | null;
}

export function firstSteps(progress: FirstStepsProgress, projectId: string | null): FirstStep[] {
	const base = projectId ? `/projects/${encodeURIComponent(projectId)}` : null;
	const at = (path: string) => (base ? `${base}/${path}` : null);
	return [
		{ n: '1', t: 'Create your project', d: 'Group your projects in folders from the project menu.', done: progress.hasProject, cta: '', href: null },
		{ n: '2', t: 'Rebuild the specification', d: 'Lyriks reads your code and writes the full specification. You validate it.', done: progress.retroDone, cta: 'Open the Reverse-Specification', href: at('retrospec') },
		{ n: '3', t: 'Explore Knowledge', d: 'Features, users, data and glossary in one place. Comment where something is wrong.', done: progress.specVisited, cta: 'Open Knowledge', href: at('spec') },
		{ n: '4', t: 'Start an evolution', d: 'Describe a change. Lyriks qualifies it step by step: Briefing, Solution, Specification, Simulation.', done: progress.evolutionStarted, cta: 'New change', href: at('evolution?new=1') },
		{ n: '5', t: 'Implement and verify', d: 'Your LLM writes the code. Lyriks checks it against the specification.', done: progress.evolutionVerified, cta: 'See the evolutions', href: at('evolution') }
	];
}

export function firstStepsDone(steps: readonly FirstStep[]): string {
	return `${steps.filter((s) => s.done).length} of ${steps.length} done`;
}
