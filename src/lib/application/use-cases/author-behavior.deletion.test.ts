import { it, expect, vi } from 'vitest';
import { AuthorBehaviorUseCase } from './author-behavior';

it('routes API/MCP state removal through the same deletion use case instead of the raw writer', async () => {
	const applyBehaviorBatch = vi.fn();
	const execute = vi.fn().mockResolvedValue({ ok: false, code: 'GLUING_CONDITION', message: 'Still referenced.', formalChecked: true });
	const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch }, { execute });
	const result = await uc.execute({ projectId: 'p', featureId: 'f', operations: [{ kind: 'remove_state_definition', surfaceId: 's', stateDefinitionId: 'd' }] });
	 expect(result.batch).toMatchObject({ ok: false, errors: ['Still referenced.'] });
	 expect(execute).toHaveBeenCalledWith({ projectId: 'p', featureId: 'f', surfaceId: 's', stateDefinitionId: 'd', dryRun: undefined });
	 expect(applyBehaviorBatch).not.toHaveBeenCalled();
});

it('does not hide a deletion inside a mixed batch or mint a bypass token', async () => {
	const applyBehaviorBatch = vi.fn(); const execute = vi.fn();
	const result = await new AuthorBehaviorUseCase({ applyBehaviorBatch }, { execute }).execute({ projectId: 'p', featureId: 'f', dryRun: true,
		operations: [{ kind: 'add_surface' }, { kind: 'remove_state_definition', surfaceId: 's', stateDefinitionId: 'd' }] });
	expect(result.batch).toMatchObject({ ok: false, commitToken: null });
	expect(applyBehaviorBatch).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
