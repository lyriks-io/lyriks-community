import { describe, expect, it } from 'vitest';
import { parseStableRecords } from './parse-stable-records';

const keepTitle = (record: Record<string, unknown>, id: string) => ({ id, title: String(record.title ?? '') });

describe('reading a keyed collection without changing who is who', () => {
	it('keeps a record its own id', () => {
		expect(parseStableRecords([{ id: 'issue-7', title: 'Late refund' }], 'issue', keepTitle)).toEqual([{ id: 'issue-7', title: 'Late refund' }]);
	});

	it('gives an id-less record the same id at every read, from its name, title or label, else its place', () => {
		const stored = [{ name: 'Order Total!' }, { title: 'Late refund' }, { label: '  Due date ' }, { note: 'nothing to name it by' }, { id: '   ', title: 'Blank id' }];
		const ids = (input: unknown) => parseStableRecords(input, 'field', (_r, id) => id);
		expect(ids(stored)).toEqual(['field-legacy-order-total', 'field-legacy-late-refund', 'field-legacy-due-date', 'field-legacy-4', 'field-legacy-blank-id']);
		expect(ids(stored)).toEqual(ids(stored));
	});

	it('keeps two id-less records of the same name apart with a numbered id', () => {
		const ids = parseStableRecords([{ name: 'Email' }, { name: 'email' }, { name: 'EMAIL' }], 'field', (_r, id) => id);
		expect(ids).toEqual(['field-legacy-email', 'field-legacy-email-2', 'field-legacy-email-3']);
	});

	it('drops a record repeating an id already read, since a reference cannot tell the two apart', () => {
		const parsed = parseStableRecords([{ id: 'a', title: 'First' }, { id: 'a', title: 'Second' }], 'issue', keepTitle);
		expect(parsed).toEqual([{ id: 'a', title: 'First' }]);
	});

	it('skips what is not a record, and what the record parser refuses without holding its id', () => {
		const parsed = parseStableRecords(
			[null, 'text', ['a'], { id: 'x', title: 'refused' }, { id: 'x', title: 'kept' }],
			'issue',
			(record, id) => (record.title === 'refused' ? null : keepTitle(record, id))
		);
		expect(parsed).toEqual([{ id: 'x', title: 'kept' }]);
	});

	it('reads anything but a list as no record', () => {
		expect(parseStableRecords({ id: 'a' }, 'issue', keepTitle)).toEqual([]);
		expect(parseStableRecords(undefined, 'issue', keepTitle)).toEqual([]);
	});
});
