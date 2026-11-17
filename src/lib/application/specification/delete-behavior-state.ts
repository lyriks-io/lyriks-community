import type { BehaviorPort, UnspaghettitAdvisorPort } from '$application/ports';
import type { StateDeletionCheckPort } from '$application/ports/state-deletion-check';

/** One UI deletion: inspect current dependencies before allowing the authoring engine to write. */
export class DeleteBehaviorStateUseCase {
	constructor(private readonly behavior: Pick<BehaviorPort, 'readFeature'>,
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'applyBehaviorBatch'>,
		private readonly formal?: StateDeletionCheckPort) {}

	async execute(input: { projectId: string; featureId: string; surfaceId: string; stateDefinitionId: string; dryRun?: boolean }) {
		const reject = (message: string, code: string, checked: boolean) => ({ ok: false, message, code, formalChecked: checked });
		const before = await this.behavior.readFeature(input.projectId, input.featureId);
		if (!before) return reject('The feature could not be read. Nothing was deleted.', 'UNAVAILABLE', false);
		let formalChecked = false;
		if (this.formal) {
			const verdict = await this.formal.checkStateDeletion(input.projectId, before.feature, input.surfaceId, input.stateDefinitionId);
			if (!verdict) return reject('The formal engine could not check this deletion. Nothing was deleted. Try again when it is available.', 'UNAVAILABLE', false);
			formalChecked = true;
			if (!verdict.coherent) {
				const issue = verdict.inconsistencies.find((i) => i.code === 'GLUING_CONDITION') ?? verdict.inconsistencies[0];
				return reject(issue?.message ?? 'The formal engine refused this deletion.', issue?.code ?? 'FORMAL', true);
			}
			// The formal call is asynchronous: do not submit a deletion checked against
			// an older snapshot. The behavior engine also revalidates on its write path.
			const current = await this.behavior.readFeature(input.projectId, input.featureId);
			if (JSON.stringify(current?.feature) !== JSON.stringify(before.feature))
				return reject('The feature changed during the check. Nothing was deleted. Try again.', 'STALE', true);
		}
		const batch = await this.advisor.applyBehaviorBatch(input.featureId, [{ kind: 'remove_state_definition',
			surfaceId: input.surfaceId, stateDefinitionId: input.stateDefinitionId }], input.dryRun ? { dryRun: true } : undefined);
		if (!batch?.ok) return reject(batch?.errors[0] ?? 'The behavior engine did not confirm the deletion. Reload the feature before retrying.', 'BEHAVIOR', formalChecked);
		if (input.dryRun) return { ok: true, message: 'Deletion checked without saving. Submit the deletion again to apply it.', code: 'VALIDATED', formalChecked };
		return { ok: true, message: formalChecked ? 'State deleted. DPO checked this removal within the feature.' : 'State deleted. Behavior validation passed.',
			code: 'DELETED', formalChecked };
	}
}
