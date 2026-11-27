import { describe, expect, it } from 'vitest';
import { appendedElements, readChangeWrites, writtenAnchors } from './change-writes';

describe('what a written change became reads validated by who validated it [criterion:114be880]', () => {
	it('is the element it changed, and nothing for a removal', () => {
		expect(writtenAnchors({ kind: 'changed', anchor: 'rule:f:a:r' }, [])).toEqual(['rule:f:a:r']);
		expect(writtenAnchors({ kind: 'removed', anchor: 'action:f:a' }, [{ featureId: 'f', element: { kind: 'action', id: 'x' } }])).toEqual([]);
	});

	it('is what a new one added: actions of a batch, features, roles, journeys and terms appended under an id', () => {
		const write = { section: 'users' as const, edits: [{ op: 'append', collection: 'roles', value: { id: 'buyer', name: 'Buyer' } }, { op: 'set', path: 'permissions', value: [] }] };
		const created = [...appendedElements(write).map((element) => ({ featureId: null, element })), { featureId: 'f', element: { kind: 'action', id: 'a1' } }, { featureId: 'f', element: { kind: 'state_definition', id: 's1' } }];
		expect(writtenAnchors({ kind: 'new', anchor: null }, created)).toEqual(['role:buyer', 'action:f:a1']);
	});
});

describe('the writes a change carries are read whole or refused [criterion:0b2dafb0]', () => {
	it('reads behaviour batches and section edits, in order', () => {
		const writes = [{ featureId: ' f ', operations: [{ kind: 'add_action' }] }, { section: 'glossary', edits: [{ op: 'set', path: 'terms', value: [] }] }];
		expect(readChangeWrites('c1', writes)).toEqual({ ok: true, writes: [{ featureId: 'f', operations: [{ kind: 'add_action' }] }, writes[1]] });
	});

	it('refuses a write that is neither', () => {
		expect(readChangeWrites('c1', [{ path: 'x' }])).toEqual({ ok: false, reason: 'The change c1 has a write 1 that is neither { featureId, operations } nor { section, edits }.' });
		expect(readChangeWrites('c1', [{ section: 'glossary', edits: [] }])).toEqual({ ok: false, reason: 'The change c1 has a write 1 on glossary without edits.' });
	});
});
