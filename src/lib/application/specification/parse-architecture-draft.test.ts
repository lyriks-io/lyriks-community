import { describe, it, expect } from 'vitest';
import { parseArchitectureDraft } from './parse-architecture-draft';
import { withStableArchitectureIds, createEmptyArchitectureDraft } from '$domain/architecture';

describe('architecture id normalization (each_key_duplicate guard)', () => {
	it('parse gives every id-less constraint a distinct id', () => {
		const input = {
			constraints: [{ title: 'EU data only' }, { title: 'Encryption at rest' }]
		};
		const draft = parseArchitectureDraft(input, 'proj');
		const ids = draft.constraints.map((c) => c.id);
		expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
		expect(new Set(ids).size).toBe(2); // no duplicate `undefined` keys
		expect(parseArchitectureDraft(input, 'proj').constraints.map((c) => c.id)).toEqual(ids);
	});

	it('withStableArchitectureIds fixes id-less rows across all keyed collections', () => {
		const dirty = {
			...createEmptyArchitectureDraft('proj'),
			// simulate legacy/derived rows persisted without ids
			constraints: [{ title: 'a' }, { title: 'b' }] as never,
			techChoices: [{ layer: 'frontend', name: 'x' }] as never,
			referenceDocs: [{ title: 'doc' }] as never
		};
		const fixed = withStableArchitectureIds(dirty);
		const allIds = [
			...fixed.constraints.map((c) => c.id),
			...fixed.techChoices.map((t) => t.id),
			...fixed.referenceDocs.map((r) => r.id)
		];
		expect(allIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
		expect(new Set(fixed.constraints.map((c) => c.id)).size).toBe(2);
	});

	it('preserves existing ids', () => {
		const fixed = withStableArchitectureIds({
			...createEmptyArchitectureDraft('proj'),
			constraints: [{ id: 'keep-me', title: 'a', detail: '', category: 'audit' }]
		});
		expect(fixed.constraints[0].id).toBe('keep-me');
	});
});
