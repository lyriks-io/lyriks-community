import { describe, expect, it } from 'vitest';
import { isKeptIssue, keptLine, noteWithKeep, noteWithoutKeep } from './finding-decision';

describe('a rejected issue is told apart by the line its keep wrote, which Undo takes away [criterion:e0f69b3c]', () => {
	it('writes who kept it and when, under what the note already said', () => {
		expect(keptLine('Ana Lopez', '2026-11-01T09:00:00.000Z')).toBe('Kept as it is by Ana Lopez on 2026-11-01.');
		expect(keptLine('  ', '2026-11-01')).toBe('Kept as it is by a project editor on 2026-11-01.');
		expect(noteWithKeep('Checked with the PO.', 'Ana', '2026-11-01')).toBe('Checked with the PO.\nKept as it is by Ana on 2026-11-01.');
	});

	it('reads as rejected only when resolved by a keep', () => {
		expect(isKeptIssue({ status: 'resolved', resolutionNote: 'Kept as it is by Ana on 2026-11-01.' })).toBe(true);
		expect(isKeptIssue({ status: 'resolved', resolutionNote: 'Fixed by EVO-001 (merge abc123).' })).toBe(false);
		expect(isKeptIssue({ status: 'open', resolutionNote: 'Kept as it is by Ana on 2026-11-01.' })).toBe(false);
	});

	it('takes back the last keep only, the rest of the note as it was', () => {
		expect(noteWithoutKeep('Checked with the PO.\nKept as it is by Ana on 2026-11-01.')).toBe('Checked with the PO.');
		expect(noteWithoutKeep('Kept as it is by Ana on 2026-10-30.\nKept as it is by Bo on 2026-11-01.')).toBe('Kept as it is by Ana on 2026-10-30.');
		expect(noteWithoutKeep('Nothing kept here.')).toBe('Nothing kept here.');
	});
});
