import { describe, expect, it, vi } from 'vitest';
import { createEmptyIdentityDraft, createEmptyDefinitionDraft, createEmptyOperationsDraft } from '$domain/foundation';
import { createEmptyScopeDraft } from '$domain/scope';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyUsersDraft } from '$domain/users';
import { EMPTY_BEHAVIOR_TOTALS } from '$application/summarize-behavior';
import { ReadProjectElaborationUseCase } from './read-project-elaboration';

function setup() {
	const scope = createEmptyScopeDraft('p');
	const ports = {
		foundation: { execute: vi.fn().mockResolvedValue({ projectId: 'p', identity: createEmptyIdentityDraft('p'), definition: createEmptyDefinitionDraft('p'), operations: createEmptyOperationsDraft('p') }) },
		scope: { execute: vi.fn().mockResolvedValue(scope) },
		users: { execute: vi.fn().mockResolvedValue(createEmptyUsersDraft('p')) },
		features: { execute: vi.fn().mockResolvedValue(createEmptyFeaturesDraft('p')) },
		completion: { execute: vi.fn().mockResolvedValue({ status: 'blocked', canFinish: false, auditFresh: false, issues: [] }) },
		behavior: { execute: vi.fn().mockResolvedValue({ hasProject: false, features: [], shared: [], totals: EMPTY_BEHAVIOR_TOTALS, attention: { unauthored: 0, overCap: 0 } }) },
		modelRevision: { fingerprint: vi.fn().mockResolvedValue('version') }
	};
	return { ports, scope, useCase: new ReadProjectElaborationUseCase(ports) };
}

describe('read project elaboration', () => {
	it('keeps heavy checks opt-in and returns a stable read-only snapshot', async () => {
		const { ports, useCase } = setup();
		const result = await useCase.execute('p');
		expect(result).toMatchObject({ projectId: 'p', readOnly: true, checks: 'not-requested', completion: null, snapshot: { stable: true, unavailable: [] } });
		expect(result.snapshot.key).toContain('version:');
		expect(ports.completion.execute).not.toHaveBeenCalled();
	});
	it('preserves the actual completion verdict when requested', async () => {
		const { useCase } = setup();
		expect(await useCase.execute('p', true)).toMatchObject({ checks: 'read', completion: { status: 'blocked', canFinish: false } });
	});
	it('does not present an unavailable section as empty or a coherent snapshot', async () => {
		const { ports, useCase } = setup();
		ports.foundation.execute.mockRejectedValue(new Error('internal details must not leak'));
		const result = await useCase.execute('p');
		expect(result.snapshot).toMatchObject({ stable: false, key: null, unavailable: ['foundation'] });
		expect(result.items.some(i => i.id.startsWith('brief-missing'))).toBe(false);
		expect(JSON.stringify(result)).not.toContain('internal details');
	});
	it('detects model edits during the read', async () => {
		const { ports, useCase } = setup();
		ports.modelRevision.fingerprint.mockResolvedValueOnce('before').mockResolvedValueOnce('after');
		expect((await useCase.execute('p')).snapshot).toMatchObject({ stable: false, key: null });
	});
	it('detects scope and audit edits even when model revisions do not change', async () => {
		const { ports, scope, useCase } = setup();
		ports.scope.execute.mockResolvedValueOnce(scope).mockResolvedValueOnce({ ...scope, completionStatus: 'completed' });
		expect((await useCase.execute('p')).snapshot.stable).toBe(false);
	});
	it('does not treat failed completion checks as a successful audit', async () => {
		const { ports, useCase } = setup();
		ports.completion.execute.mockRejectedValue(new Error('offline'));
		expect(await useCase.execute('p', true)).toMatchObject({ checks: 'unavailable', completion: null, snapshot: { stable: false, unavailable: ['completion'] } });
	});
});
