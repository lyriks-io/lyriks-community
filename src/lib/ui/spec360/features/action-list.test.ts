import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const PAGE = 'routes/projects/[projectId]/spec/features/[featureId]/+page.svelte';

describe("a feature's actions read as one list [criterion:50809f1c]", () => {
	it('draws the list and no chain of chevrons', () => {
		const page = read(PAGE);
		expect(page).toContain('<ActionList');
		expect(page).toContain('title="Actions"');
		expect(existsSync(join(SRC, 'lib/ui/spec360/JourneyStrip.svelte'))).toBe(false);
		expect(existsSync(join(SRC, 'lib/ui/spec360/features/JourneyRules.svelte'))).toBe(false);
	});

	it('keeps one row per action, with Details and its acts', () => {
		const list = read('lib/ui/spec360/features/ActionList.svelte');
		expect(list).toContain('{#each actions as action, i (action.id)}');
		expect(list).toContain('aria-expanded={open}');
		expect(list).toContain('<SpecControls');
	});

	it('unfolds what only Details says on its row, every action open in the Edit mode, and leaves no page of its own [criterion:d0e0e1a5]', () => {
		const list = read('lib/ui/spec360/features/ActionList.svelte');
		expect(list).toContain('mode.active || unfolded.has(action.id)');
		expect(list).toContain('<ActionDetails');
		const details = read('lib/ui/spec360/features/ActionDetails.svelte');
		expect(list).toContain('field="desc"');
		expect(details).not.toContain('field="desc"');
		expect(details).toContain('Who may do it');
		expect(details).toContain('<ActionDataBlock');
		expect(read('lib/ui/spec360/features/ActionDataBlock.svelte')).toContain('Not in the data model');
		expect(existsSync(join(SRC, 'routes/projects/[projectId]/spec/features/[featureId]/[actionId]/+page.svelte'))).toBe(false);
	});

	it('stands Details in one column down the list: every row shares the columns of the list', () => {
		const list = read('lib/ui/spec360/features/ActionList.svelte');
		expect(list).toContain('grid-cols-[26px_minmax(0,1fr)_auto_auto]');
		expect(list.match(/grid-cols-subgrid/g)?.length).toBe(3);
	});
});

describe("a feature's page keeps every action and its rules reachable [criterion:54bd4e66]", () => {
	it('keeps the rules folded until the reader opens them, whoever approved', () => {
		const page = read(PAGE);
		const list = read('lib/ui/spec360/features/ActionList.svelte');
		expect(list).toContain('<ActionRules {action} {featureId}');
		expect(list).toContain('Show rules');
		expect(list).not.toContain('validation.mine(anchor)');
		expect(list).not.toMatch(/\{#if[^}]*selected/);
		expect(page).not.toContain('firstWaitingStep');
		expect(existsSync(join(SRC, 'lib/application/spec360/journey-selection.ts'))).toBe(false);
	});
});

describe('every rule reads inline under its action, no card and no band [criterion:7d1e80b6]', () => {
	it('reads the sentence with its EARS keywords, and no type label or tinted band', () => {
		const line = read('lib/ui/spec360/features/RuleLine.svelte');
		expect(line).toContain('<EarsText {text} variables=');
		expect(line).not.toContain('bg-blue-tint');
		expect(line).not.toContain('bg-orange-tint');
		expect(existsSync(join(SRC, 'lib/ui/spec360/features/RuleCard.svelte'))).toBe(false);
	});

	it('carries what the solver says, and a flaw in full under its line [criterion:be4c97ee]', () => {
		const line = read('lib/ui/spec360/features/RuleLine.svelte');
		expect(line).toContain('<RuleVerdictMark {verdict} />');
		expect(line).toContain('verdict?.flaw && verdict.detail');
	});
});
