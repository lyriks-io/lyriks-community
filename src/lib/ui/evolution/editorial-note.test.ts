import { describe, expect, it } from 'vitest';
import {
	implementationNote,
	noteAuthorLine,
	noteCta,
	noteReadKey,
	proseNote,
	simulationNote,
	specificationNote,
	verificationNote,
	type EditorialNote,
	type ProseSection,
	type SpecificationFacts
} from './editorial-note';

const section = (number: string, aiWritten: number, suggestions: number, over: Partial<ProseSection> = {}): ProseSection => ({
	number,
	title: `Section ${number}`,
	target: `s-${number}`,
	aiWritten,
	suggestions,
	accepted: 0,
	waiting: aiWritten,
	...over
});
const todo = (note: EditorialNote) => note.todo.map((t) => t.text);
const done = (note: EditorialNote) => note.todo.map((t) => t.done);
const spec = (over: Partial<SpecificationFacts> = {}): SpecificationFacts => ({
	byAi: true,
	features: 5,
	actions: 8,
	dataChanges: 2,
	removals: [],
	featureSuggestions: 0,
	journeyByAi: false,
	journey: true,
	waiting: { features: 5, actions: 8, journey: true },
	...over
});
const simulation = { majorDecided: 0, movedOn: false };
const verification = { found: { gaps: 0, additions: 0 }, movedOn: false };

describe('each step opens on a note of what the AI or Lyriks produced there [criterion:ac-leaf-ac-evo-form-step-note]', () => {
	it('shows nothing on a step nobody but people wrote', () => {
		expect(proseNote('briefing', [section('1.1', 0, 0), section('1.2', 0, 0)])).toBeNull();
		expect(specificationNote(spec({ byAi: false, features: 3, actions: 2, dataChanges: 1 }))).toBeNull();
		expect(implementationNote({ key: 'EVO-1', finished: false, requirements: 4, files: 2, additions: [], verified: false })).toBeNull();
	});

	it('sums up the Briefing the AI pre-filled, its suggestions apart', () => {
		const note = proseNote('briefing', [section('1.1', 1, 0), section('1.2', 2, 1), section('1.3', 1, 0)])!;
		expect(noteAuthorLine(note)).toBe('NOTE FROM LYRIKS × YOUR AI');
		expect(note.title).toBe('Briefing pre-filled by Lyriks.');
		expect(note.taken.map((t) => t.ref)).toEqual(['1.1', '1.2', '1.3']);
		expect(note.suggested).toEqual([{ ref: '1.2', text: '1 suggestion waiting', target: 's-1.2' }]);
		expect(todo(note)).toEqual(['Read 1.1 to 1.3.', 'Accept or reject each suggestion.', 'Validate each section.']);
		expect(done(note)).toEqual([false, false, false]);
		expect(noteCta(note)).toBe('I’ve read it, let’s review');
	});

	it('says only the suggestions when the AI wrote nothing that stands', () => {
		const note = proseNote('solution', [section('2.1', 0, 2), section('2.2', 0, 0)])!;
		expect(note.title).toBe('Suggestions added to the Solution.');
		expect(note.taken).toEqual([]);
		expect(todo(note)).toEqual(['Accept or reject each suggestion.', 'Validate the section.']);
	});

	it('reads the Specification the AI wrote, its own choices to double-check', () => {
		const note = specificationNote(spec({ removals: ['Manual entry'], journeyByAi: true }))!;
		expect(note.taken.map((t) => `${t.ref} ${t.text}`)).toEqual(['3.1 5 features', '3.2 Actions and rules', '3.4 Datamap']);
		expect(note.suggested.map((t) => `${t.ref} ${t.text}`)).toEqual(['3.1 Removal of Manual entry', '3.3 Journey']);
		expect(todo(note)).toEqual(['Validate each feature.', 'Validate each action.', 'Validate the journey.']);
	});

	it('counts what the Simulation found and asks for decisions', () => {
		const numbers: Record<string, string> = { major: '4.1', minor: '4.2', cross: '4.3' };
		const note = simulationNote({ key: 'EVO-042', major: 2, minor: 3, compatible: 9, conflicts: 2, overlaps: 1, notChecked: 1, ...simulation, numberOf: (s) => numbers[s] ?? null });
		expect(noteAuthorLine(note)).toBe('NOTE FROM LYRIKS');
		expect(note.title).toBe('EVO-042 simulated against your product.');
		expect(note.taken.map((t) => `${t.ref} ${t.text}`)).toEqual(['4.1 2 major impacts', '4.2 3 minor impacts', '4.3 2 conflicts, 1 overlap, 1 not checked']);
		expect(note.suggested.map((t) => t.text)).toEqual(['Workarounds', 'What to do']);
		expect(todo(note)).toEqual(['Decide each major impact.', 'Review each minor impact.', 'Settle each conflict.']);
		expect(noteCta(note)).toBe('I’ve read it, let’s decide');
	});

	it('never calls an overlap a conflict', () => {
		const note = simulationNote({ key: 'EVO-19', major: 0, minor: 0, compatible: 2, conflicts: 0, overlaps: 3, notChecked: 3, ...simulation, numberOf: (s) => (s === 'cross' ? '4.2' : null) });
		expect(note.taken.map((t) => `${t.ref} ${t.text}`)).toEqual(['4.2 3 overlaps, 3 not checked']);
		expect(todo(note)).toEqual(['Settle each overlap.']);
	});

	it('says a Simulation with nothing to decide as compatible', () => {
		const note = simulationNote({ key: 'EVO-7', major: 0, minor: 0, compatible: 4, conflicts: 0, overlaps: 0, notChecked: 0, ...simulation, numberOf: (s) => (s === 'compatible' ? '4.1' : null) });
		expect(note.taken).toEqual([{ ref: '4.1', text: '4 compatible items', target: 'compatibles' }]);
		expect(note.suggested).toEqual([]);
		expect(todo(note)).toEqual(['Read the summary.', 'Go to Implementation.']);
		expect(noteCta(note)).toBe('I’ve read it, let’s review');
	});

	it('asks for a review, not a decision, of a Verification that holds nothing to decide', () => {
		const note = verificationNote({ sections: [{ key: 'compliant', title: 'Compliant items', number: '6.1', count: 5 }], corrections: 0, guideNumber: '6.2', ...verification });
		expect(note.lede).toBe('Everything matches the spec.');
		expect(todo(note)).toEqual(['Read the summary.']);
		expect(noteCta(note)).toBe('I’ve read it, let’s review');
	});

	it('names what the code added beyond the spec once every requirement is read', () => {
		const note = implementationNote({ key: 'EVO-3', finished: true, requirements: 12, files: 7, additions: [{ label: 'A1', title: 'Public /exchange-rates route', decided: false }], verified: false })!;
		expect(note.taken).toEqual([{ ref: '5', text: '12 requirements, 7 files', target: 'dev-verification' }]);
		expect(note.suggested).toEqual([{ ref: 'A1', text: 'Public /exchange-rates route', target: 'verification' }]);
		expect(todo(note)).toEqual(['Open the Verification.', 'Keep or remove the 1 addition.']);
	});

	it('reads the Verification by its sections, the fixes and the instruction suggested', () => {
		const note = verificationNote({
			sections: [
				{ key: 'compliant', title: 'Compliant items', number: '6.1', count: 8 },
				{ key: 'gap', title: 'Implementation gaps', number: '6.2', count: 1 },
				{ key: 'omission', title: 'Omissions', number: '', count: 0 },
				{ key: 'addition', title: 'Unplanned additions', number: '6.3', count: 2 },
				{ key: 'regression', title: 'Regressions', number: '', count: 0 }
			],
			corrections: 1,
			guideNumber: '6.4',
			found: { gaps: 1, additions: 2 },
			movedOn: false
		});
		expect(note.taken.map((t) => `${t.ref} ${t.text}`)).toEqual(['6.1 8 compliant items', '6.2 1 implementation gap']);
		expect(note.suggested.map((t) => `${t.ref} ${t.text}`)).toEqual(['6.2 Fixes', '6.3 Keep or remove additions', '6.4 LLM instruction']);
		expect(todo(note)).toEqual(['Review each gap.', 'Decide each addition.', 'Send the fixes to your AI.']);
	});

	it('checks a step once nothing it asks still waits, and keeps it in its place', () => {
		// The Briefing: suggestions decided, sections validated; reading and correcting close with the validation.
		const accepted = proseNote('briefing', [section('1.1', 1, 0, { waiting: 0 }), section('1.2', 2, 0, { accepted: 1, waiting: 0 })])!;
		expect(todo(accepted)).toEqual(['Read 1.1 and 1.2.', 'Accept or reject each suggestion.', 'Validate each section.']);
		expect(done(accepted)).toEqual([true, true, true]);
		const halfway = proseNote('solution', [section('2.1', 2, 0, { waiting: 0 }), section('2.2', 1, 0, { waiting: 1 })])!;
		expect(todo(halfway)).toEqual(['Read 2.1 and 2.2.', 'Correct what is wrong.', 'Validate each section.']);
		expect(done(halfway)).toEqual([false, false, false]);
		// The Specification: each group checked on its own.
		expect(done(specificationNote(spec({ waiting: { features: 0, actions: 3, journey: false } }))!)).toEqual([true, false, true]);
		// The Simulation: the decisions as they are taken, what is only read once the request crossed.
		const numbers: Record<string, string> = { major: '4.1', minor: '4.2', cross: '4.3' };
		const facts = { key: 'EVO-042', major: 2, minor: 3, compatible: 9, conflicts: 1, overlaps: 0, notChecked: 0, numberOf: (s: string) => numbers[s] ?? null };
		expect(done(simulationNote({ ...facts, majorDecided: 2, movedOn: false }))).toEqual([true, false, false]);
		expect(done(simulationNote({ ...facts, majorDecided: 2, movedOn: true }))).toEqual([true, true, true]);
		// The Implementation: the Verification opened and crossed, the additions decided.
		const built = implementationNote({ key: 'EVO-001', finished: true, requirements: 61, files: 6, additions: [{ label: 'A1', title: 'Route', decided: true }], verified: true })!;
		expect(done(built)).toEqual([true, true]);
		// The Verification: every gap and addition settled, nothing left to send; the steps stay.
		const settled = verificationNote({
			sections: [{ key: 'compliant', title: 'Compliant items', number: '6.1', count: 11 }],
			corrections: 0,
			guideNumber: '6.2',
			found: { gaps: 1, additions: 2 },
			movedOn: false
		});
		expect(todo(settled)).toEqual(['Review each gap.', 'Decide each addition.', 'Send the fixes to your AI.']);
		expect(done(settled)).toEqual([true, true, true]);
		expect(done(verificationNote({ sections: [{ key: 'compliant', title: 'Compliant items', number: '6.1', count: 5 }], corrections: 0, guideNumber: '6.2', found: { gaps: 0, additions: 0 }, movedOn: true }))).toEqual([true]);
	});

	it('keeps a deferred omission in the count but asks nothing more about it [criterion:975debf9]', () => {
		const note = verificationNote({
			sections: [
				{ key: 'compliant', title: 'Compliant items', number: '6.1', count: 4, open: 0 },
				{ key: 'omission', title: 'Omissions', number: '6.2', count: 1, open: 0 }
			],
			corrections: 0,
			guideNumber: '6.3',
			found: { gaps: 1, additions: 0 },
			movedOn: false
		});
		expect(note.taken.map((t) => t.text)).toContain('1 omission');
		expect(note.lede).toBe('Nothing left to decide.');
		expect(done(note)).toEqual([true, true]);
	});
});

describe('a note folded once read opens again when what it sums up changes [criterion:ac-leaf-ac-evo-form-step-note-read]', () => {
	it('opens a folded note again once a line or a count moves', () => {
		const before = proseNote('briefing', [section('1.2', 1, 1)])!;
		const after = proseNote('briefing', [section('1.2', 1, 2)])!;
		expect(noteReadKey('r1', 'briefing', before)).toBe(noteReadKey('r1', 'briefing', proseNote('briefing', [section('1.2', 1, 1)])!));
		expect(noteReadKey('r1', 'briefing', before)).not.toBe(noteReadKey('r1', 'briefing', after));
	});
});
