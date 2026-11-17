import { describe, expect, it } from 'vitest';
import { fillEvolutionPrompt } from './fill-prompt';

describe('a whole request can be handed to my AI to fill [criterion:34d8397e]', () => {
	it('names the project and the request, and leaves the gates to a person', () => {
		const prompt = fillEvolutionPrompt({ key: 'EVO-003', title: 'Temporary photo', id: '96c3963a-24a7' }, 'signal-e6c70b');
		expect(prompt).toContain('EVO-003 "Temporary photo" (project signal-e6c70b, request 96c3963a)');
		expect(prompt).toContain('Stop at each gate');
	});
});
