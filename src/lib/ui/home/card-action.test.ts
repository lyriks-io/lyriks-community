import { describe, expect, it } from 'vitest';
import { runCardAction } from './card-action';

describe('Relaunch the analysis copies the prompt that resumes the run, then opens the Reverse page [criterion:2012cc93]', () => {
	it('copies first, then opens', async () => {
		const steps: string[] = [];
		await runCardAction(
			{ label: 'Relaunch the analysis', icon: 'relaunch', copies: { text: 'resume the run', said: 'Prompt copied' } },
			() => steps.push('open'),
			async (text, said) => void steps.push(`copy ${text} · ${said}`)
		);
		expect(steps).toEqual(['copy resume the run · Prompt copied', 'open']);
	});
	it('only opens when the action copies nothing', async () => {
		const steps: string[] = [];
		await runCardAction({ label: 'Review on Mismatch', icon: 'go' }, () => steps.push('open'), async () => void steps.push('copy'));
		expect(steps).toEqual(['open']);
	});
});
