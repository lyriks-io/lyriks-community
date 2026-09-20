import { analyzeElaboration } from '$domain/elaboration/analyze';
import { fingerprint } from '$domain/scope';
import type { ProjectElaborationPorts } from '../ports/project-elaboration';

/** On-demand planning over the current draft; no model or UI state is persisted. */
export class ReadProjectElaborationUseCase {
	constructor(private readonly ports: ProjectElaborationPorts) {}

	async execute(projectId: string, includeChecks = false) {
		const unavailable: string[] = [];
		const read = async <T>(name: string, operation: () => Promise<T>): Promise<T | null> => {
			try { return await operation(); }
			catch { unavailable.push(name); return null; }
		};
		const before = await read('model-revision', () => this.ports.modelRevision.fingerprint(projectId));
		const [foundation, scope, users, features, completion, behavior] = await Promise.all([
			read('foundation', () => this.ports.foundation.execute(projectId)),
			read('scope', () => this.ports.scope.execute(projectId)),
			read('users', () => this.ports.users.execute(projectId)),
			read('features', () => this.ports.features.execute(projectId)),
			includeChecks ? read('completion', () => this.ports.completion.execute(projectId)) : Promise.resolve(null),
			read('behavior', () => this.ports.behavior.execute(projectId))
		]);
		// The domain is handed counts, not the model reading: it may not import the
		// application layer, and a count is all the acceptance question needs.
		const acceptanceCriteriaByFeature = behavior
			? Object.fromEntries(behavior.features.map((f) => [f.featureId, f.acceptanceCriteria.length]))
			: null;
		const [after, latestScope] = await Promise.all([
			read('model-revision', () => this.ports.modelRevision.fingerprint(projectId)),
			read('scope', () => this.ports.scope.execute(projectId))
		]);
		const scopeFingerprint = scope ? fingerprint(scope) : null;
		const stable = unavailable.length === 0 && before !== null && before === after && scopeFingerprint !== null && latestScope !== null && scopeFingerprint === fingerprint(latestScope);
		const report = analyzeElaboration({ foundation, scope, users, features, completion, acceptanceCriteriaByFeature, unavailable: [...new Set(unavailable)].sort() });
		return {
			projectId,
			...report,
			snapshot: { stable, key: stable ? `${after}:${scopeFingerprint}` : null, unavailable: [...new Set(unavailable)].sort() },
			checks: includeChecks ? completion ? 'read' : 'unavailable' : 'not-requested',
			readOnly: true,
			...(stable ? {} : { warning: 'The project changed during this read or its revision could not be established. Read again before relying on the plan.' })
		};
	}
}
