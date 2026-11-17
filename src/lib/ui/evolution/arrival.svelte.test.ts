import { describe, expect, it, vi } from 'vitest';
import { Arrival, decidedNote, goneSuggestionNote } from './arrival.svelte';

const nameOf = (id: string) => (id === 'alexis@team.test' ? 'Alexis' : id);

describe('what an address says where it landed', () => {
	it('says beside the answer who accepted the suggestion the link pointed to', () => {
		const text = decidedNote({ kind: 'decided', decision: 'accepted', targetField: '00-need.objectives', leafId: null, by: 'alexis@team.test' }, nameOf);
		expect(text).toBe('The suggestion your link pointed to was accepted by Alexis.');
	});

	it('says a refusal kept the answer as it was', () => {
		const text = decidedNote({ kind: 'decided', decision: 'refused', targetField: '00-need.objectives', leafId: null, by: null }, nameOf);
		expect(text).toContain('was refused');
	});

	it('names what became of a suggestion that left nothing to open, never a bare "decided"', () => {
		expect(goneSuggestionNote('withdrawn')).toContain('taken back');
		expect(goneSuggestionNote('unknown')).toContain('no longer on this request');
	});

	it('shows the note only beside the place it concerns', () => {
		const arrival = new Arrival(() => {});
		arrival.land({ tab: 'briefing', anchor: 'place-field__request__00-need.objectives', text: 'accepted' });
		expect(arrival.noteBeside('place-field__request__00-need.objectives')).toBe('accepted');
		expect(arrival.noteBeside('place-field__request__00-need.measures')).toBeNull();
	});

	it('forgets the note and the address once the person moves on, and only once', () => {
		const forget = vi.fn();
		const arrival = new Arrival(forget);
		arrival.land({ tab: 'briefing', anchor: null, text: 'taken back' });
		arrival.leave();
		arrival.leave();
		expect(arrival.place).toBeNull();
		expect(forget).toHaveBeenCalledTimes(1);
	});
});
