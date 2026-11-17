import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import NextSteps from './NextSteps.svelte';
import type { NextSteps as NextStepsReading } from './next-steps';

/** A step of the close handed to the AI shows where it stands [criterion:ac-leaf-ac-evo-verd-steps-ai-working]. */

const live = vi.hoisted(() => ({ state: null as string | null, saying: null as string | null }));
vi.mock('./live-session.svelte', () => ({
	useLiveSession: () => ({
		isOpen: true,
		get saying() {
			return live.saying;
		},
		closeClick: (step: string) => (live.state && step === 'branch' ? { id: 'c1', kind: 'close', fieldKey: `request.close.${step}`, state: live.state } : null),
		sendClose: async () => true
	})
}));

const next: NextStepsReading = {
	live: true,
	commands: null,
	steps: [{ id: 'live', title: 'Merged into main', text: 'Merged.', state: 'done' }],
	after: [
		{ id: 'branch', title: 'Delete evo/EVO-1', text: 'It is merged.', command: 'git branch -d evo/EVO-1', href: null, handOff: { step: 'branch', brief: 'git branch -d evo/EVO-1' } },
		{ id: 'spec', title: 'Open the specification', text: 'It now holds the change.', command: null, href: '/spec' }
	]
};
const html = (state: string | null, saying: string | null = null) => {
	live.state = state;
	live.saying = saying;
	return render(NextSteps, { props: { next, canAct: false, onAct: () => {}, mayHandOff: true } }).body;
};

describe('the AI at work on a step of the close [criterion:ac-leaf-ac-evo-verd-steps-ai-working]', () => {
	it('offers the step to the AI while nobody has it', () => {
		const page = html(null);
		expect(page).toContain('aria-label="Send to my AI"');
		expect(page).not.toContain('Lyriks is on it');
		expect(page).not.toContain('Lyriks has it');
	});

	it('reads that the AI has it until it takes it', () => {
		const page = html('waiting');
		expect(page).toContain('Lyriks has it');
		expect(page).toContain('animate-lk-pulse');
		expect(page).not.toContain('aria-label="Send to my AI"');
	});

	it('shows the AI on it, animated, with the last thing it said, on that step only', () => {
		const page = html('taken', 'Checking with git that the branch is merged into main');
		expect(page).toContain('Lyriks is on it');
		expect(page.match(/animate-lk-spin/g)?.length).toBe(2); // the step's mark and its badge
		expect(page).toContain('Checking with git that the branch is merged into main');
	});

	it('gives the step back once the AI answered', () => {
		expect(html('answered', 'Deleted.')).toContain('aria-label="Send to my AI"');
	});
});
