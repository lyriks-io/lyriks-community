import { describe, expect, it } from 'vitest';
import {
	ALL_BLOCK_FIELDS,
	canAnswerInGuidedFill,
	canLeaveGuidedFill,
	canOpenGuidedFill,
	canStepBack,
	fieldKey,
	isLeafScoped,
	pendingFields
} from './index';

/**
 * The scenarios the specification declares on "Fill the gaps one question at a
 * time" (feat-evo-guided-fill), transcribed. The UI adds the keyboard and the
 * scroll-back; what is checkable is here.
 */

const LEAF = 'feat-a';
const allFilled = (): Set<string> =>
	new Set(ALL_BLOCK_FIELDS.map((f) => fieldKey(f.path, isLeafScoped(f) ? LEAF : null)));

describe('Fill the gaps', () => {
	// 69222a9c: three fields are pending, the mode opens on the first.
	it('opens for a writer when something is pending', () => {
		expect(canOpenGuidedFill({ canEdit: true, pendingCount: 3 }).ok).toBe(true);
	});

	// f9f1952c: nothing is pending, the mode refuses and names the next stage.
	it('refuses to open when nothing is left to ask, and points at the next stage', () => {
		const refused = canOpenGuidedFill({ canEdit: true, pendingCount: 0 });
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toContain('next stage');
	});

	// be34ad50: a reader without write access cannot open the mode.
	it('refuses a reader without write access', () => {
		expect(canOpenGuidedFill({ canEdit: false, pendingCount: 3 }).ok).toBe(false);
	});

	it('walks only the fields that are empty or open questions, in block order', () => {
		const filled = allFilled();
		filled.delete(fieldKey('02-problem.value', LEAF));
		const open = [fieldKey('05-functional.acceptance', LEAF)];
		const walk = pendingFields(filled, open, [LEAF]);
		expect(walk.map((p) => p.key)).toEqual([
			fieldKey('02-problem.value', LEAF),
			fieldKey('05-functional.acceptance', LEAF)
		]);
		expect(walk[1].openQuestion).toBe(true);
		// A filled field is never shown.
		expect(walk.some((p) => p.key === fieldKey('01-origin.objective', LEAF))).toBe(false);
	});

	it('walks one home per touched feature, and none for a field with no home', () => {
		const walk = pendingFields(new Set(), [], ['feat-a', 'feat-b']);
		const objectives = walk.filter((p) => p.field.path === '01-origin.objective');
		expect(objectives.map((p) => p.leafId)).toEqual(['feat-a', 'feat-b']);
		// No leaf named: the leaf-scoped fields have no home, so only the
		// project-wide ones are asked about.
		const homeless = pendingFields(new Set(), [], []);
		expect(homeless.every((p) => !isLeafScoped(p.field))).toBe(true);
	});

	// daf200a1: an answer is saved and the walk advances (one fewer pending).
	it('has one fewer field pending once an answer is saved', () => {
		const before = pendingFields(new Set(), [], [LEAF]);
		const after = pendingFields(new Set([fieldKey('01-origin.objective', LEAF)]), [], [LEAF]);
		expect(after.length).toBe(before.length - 1);
	});

	// 620737ba: no answer outside the mode.
	it('takes no answer outside the mode', () => {
		expect(canAnswerInGuidedFill(true).ok).toBe(true);
		expect(canAnswerInGuidedFill(false).ok).toBe(false);
	});

	// 32f4a632 and 9c7c6224: the up arrow returns to the previous question, never past the first.
	it('steps back past the first question only', () => {
		expect(canStepBack({ active: true, stepIndex: 2 }).ok).toBe(true);
		expect(canStepBack({ active: true, stepIndex: 0 }).ok).toBe(false);
		expect(canStepBack({ active: false, stepIndex: 2 }).ok).toBe(false);
	});

	// 5a3a4b2a: Escape returns to the document; there is nothing to leave when closed.
	it('leaves only an open mode', () => {
		expect(canLeaveGuidedFill(true).ok).toBe(true);
		expect(canLeaveGuidedFill(false).ok).toBe(false);
	});
});
