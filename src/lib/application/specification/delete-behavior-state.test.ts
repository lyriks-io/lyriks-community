import { describe, it, expect, vi } from 'vitest';
import { DeleteBehaviorStateUseCase } from './delete-behavior-state';
import type { BehaviorPort } from '$application/ports';

const input = { projectId: 'p', featureId: 'f', surfaceId: 's', stateDefinitionId: 'quantity' };
const snapshot = { feature: { id: 'f', surfaces: [] } } as unknown as NonNullable<Awaited<ReturnType<BehaviorPort['readFeature']>>>;
function setup() {
	const readFeature = vi.fn().mockResolvedValue(snapshot);
	const applyBehaviorBatch = vi.fn().mockResolvedValue({ ok: true });
	const checkStateDeletion = vi.fn().mockResolvedValue({ coherent: true, scope: 'feature', statePath: 'order.quantity', inconsistencies: [] });
	return { readFeature, applyBehaviorBatch, checkStateDeletion,
		uc: new DeleteBehaviorStateUseCase({ readFeature }, { applyBehaviorBatch }, { checkStateDeletion }) };
}
describe('checked state deletion', () => {
	it('surfaces the actual gluing refusal without writing', async () => {
		const s = setup();
		s.checkStateDeletion.mockResolvedValue({ coherent: false, inconsistencies: [{ code: 'GLUING_CONDITION', message: 'Action Save still depends on order.quantity.' }] });
		expect(await s.uc.execute(input)).toMatchObject({ ok: false, formalChecked: true, code: 'GLUING_CONDITION', message: 'Action Save still depends on order.quantity.' });
		expect(s.applyBehaviorBatch).not.toHaveBeenCalled();
	});
	it('does not write when the formal service is unavailable', async () => {
		const s = setup(); s.checkStateDeletion.mockResolvedValue(null);
		expect(await s.uc.execute(input)).toMatchObject({ ok: false, formalChecked: false });
		expect(s.applyBehaviorBatch).not.toHaveBeenCalled();
	});
	it('rejects a feature changed during the formal call', async () => {
		const s = setup(); s.readFeature.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ feature: { id: 'f', surfaces: [{ id: 'new' }] } });
		expect(await s.uc.execute(input)).toMatchObject({ ok: false, code: 'STALE' });
		expect(s.applyBehaviorBatch).not.toHaveBeenCalled();
	});
	it('submits only the explicit deletion after an accepted verdict', async () => {
		const s = setup();
		expect(await s.uc.execute(input)).toMatchObject({ ok: true, formalChecked: true });
		expect(s.applyBehaviorBatch).toHaveBeenCalledWith('f', [{ kind: 'remove_state_definition', surfaceId: 's', stateDefinitionId: 'quantity' }], undefined);
	});
	it('uses the same writer without a formal call in Community', async () => {
		const s = setup();
		const community = new DeleteBehaviorStateUseCase({ readFeature: s.readFeature }, { applyBehaviorBatch: s.applyBehaviorBatch });
		expect(await community.execute(input)).toMatchObject({ ok: true, formalChecked: false });
		expect(s.checkStateDeletion).not.toHaveBeenCalled();
		expect(s.applyBehaviorBatch).toHaveBeenCalledTimes(1);
	});
});
