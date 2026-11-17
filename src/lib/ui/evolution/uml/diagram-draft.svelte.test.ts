import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { functionalDiagramProblems, readFunctionalDiagram, writeFunctionalDiagram } from '$domain/evolution';
import { DiagramDraft } from './diagram-draft.svelte';

/**
 * Looking at an earlier version of a diagram shows that version, and the edits
 * not saved yet stay aside, untouched, until the reader is back on the current
 * one (ac-evo-hist-field-versions).
 */
describe('a diagram looked at in an earlier version [criterion:ac-leaf-ac-evo-hist-field-versions]', () => {
	it('shows the earlier version, keeps the edits aside, and brings them back', () => {
		const cleanup = $effect.root(() => {
			const saved = 'actor Baker';
			let looking = $state<string | null>(null);
			const draft = new DiagramDraft({ read: readFunctionalDiagram, write: writeFunctionalDiagram, check: functionalDiagramProblems }, () => saved, () => looking);
			draft.editText('actor Baker\nactor Customer');
			flushSync();
			expect(draft.dirty).toBe(true);

			looking = 'system SMS provider';
			flushSync();
			expect(draft.notation).toBe('system SMS provider');
			expect(draft.diagram.actors.map((a) => a.name)).toEqual(['SMS provider']);
			// Nothing to save while an earlier version is shown.
			expect(draft.dirty).toBe(false);

			looking = null;
			flushSync();
			expect(draft.notation).toBe('actor Baker\nactor Customer');
			expect(draft.dirty).toBe(true);
		});
		cleanup();
	});
});
