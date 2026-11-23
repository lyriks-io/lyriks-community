import { describe, expect, it } from 'vitest';
import { requirementChanges, type AnswerVersion } from './requirement-changes';

const v = (value: string, by: string, byKind: AnswerVersion['byKind'], validatedBy: string[] = []): AnswerVersion => ({ value, by, byKind, validatedBy });

describe('the requirements mark what changed since their last validation [criterion:6936f86a]', () => {
	it('an answer never validated reads every line added, each with who brought it', () => {
		const versions = [v('A first line.\nThe AI added this.', 'ai@team.test', 'ai_client'), v('A first line.', 'ana@team.test', 'person')];
		const changes = requirementChanges('A first line.\nThe AI added this.', versions);
		expect(changes.lines).toEqual([
			{ text: 'A first line.', added: { by: 'ana@team.test', byKind: 'person' } },
			{ text: 'The AI added this.', added: { by: 'ai@team.test', byKind: 'ai_client' } }
		]);
		expect(changes.removed).toEqual([]);
	});

	it('after a validation, only what changed since reads marked, and a dropped line reads removed', () => {
		const versions = [v('Kept.\nNew from the AI.', 'ai@team.test', 'ai_client'), v('Kept.\nDropped.', 'ana@team.test', 'person', ['ana@team.test'])];
		const changes = requirementChanges('Kept.\nNew from the AI.', versions);
		expect(changes.lines).toEqual([
			{ text: 'Kept.', added: false },
			{ text: 'New from the AI.', added: { by: 'ai@team.test', byKind: 'ai_client' } }
		]);
		expect(changes.removed).toEqual(['Dropped.']);
	});

	it('once the current version is validated, nothing reads marked', () => {
		const versions = [v('Kept.\nNew from the AI.', 'ai@team.test', 'ai_client', ['ana@team.test']), v('Kept.', 'ana@team.test', 'person', ['ana@team.test'])];
		const changes = requirementChanges('Kept.\nNew from the AI.', versions);
		expect(changes.lines.every((l) => l.added === false)).toBe(true);
		expect(changes.removed).toEqual([]);
	});

	it('a later rewrite of other lines keeps the author of the line it did not touch', () => {
		const versions = [
			v('Base.\nFrom the AI.\nFrom Ana.', 'ana@team.test', 'person'),
			v('Base.\nFrom the AI.', 'ai@team.test', 'ai_client'),
			v('Base.', 'ana@team.test', 'person', ['ana@team.test'])
		];
		const changes = requirementChanges('Base.\nFrom the AI.\nFrom Ana.', versions);
		expect(changes.lines.map((l) => (l.added ? l.added.byKind : 'held'))).toEqual(['held', 'ai_client', 'person']);
	});

	it('a line no version holds, written outside the versions, reads added with no author', () => {
		expect(requirementChanges('Typed elsewhere.', []).lines).toEqual([{ text: 'Typed elsewhere.', added: null }]);
	});
});
