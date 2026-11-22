import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/todomatic/ask'), data: {} } }));

const { projectSessionPrompt } = await import('./session-prompt');
const { ProjectAiSession } = await import('$ui/ai-session/project-ai-session.svelte');

/** The prompt Ask my AI copies to open a session sends the AI to no playbook the installation lacks (EVO-008 v2). */
describe('the prompt that opens a session on a Community installation', () => {
	it('says itself what to do with a question of Ask my AI, naming no playbook Community does not install [criterion:ac-leaf-b2b013a6-9451-488a-bb6c-bd2bf2a495d6]', () => {
		const prompt = projectSessionPrompt('todomatic', 'TodoMatic', { waiting: 'message in Ask my AI', edition: 'community' });
		expect(prompt).not.toContain('lyriks-evolution');
		expect(prompt).not.toMatch(/skill|playbook/i);
		expect(prompt).toContain('A question I ask in Ask my AI comes as a click of kind chat');
		expect(prompt).toContain('apply_evolution_batch [{ op: "answer_click", clickId, text }]');
		expect(prompt).toContain('start_evolution_session given the project alone');
	});

	it('is what the box of Ask my AI copies on that installation [criterion:ac-leaf-b2b013a6-9451-488a-bb6c-bd2bf2a495d6]', () => {
		const session = new ProjectAiSession(() => 'todomatic', () => 'TodoMatic', () => true, () => 'community');
		expect(session.prompt('message in Ask my AI')).toBe(projectSessionPrompt('todomatic', 'TodoMatic', { waiting: 'message in Ask my AI', edition: 'community' }));
		expect(session.prompt()).not.toContain('lyriks-evolution');
	});

	it('keeps sending the AI to the playbook of Evolutions where it is installed', () => {
		for (const edition of ['enterprise', null]) expect(projectSessionPrompt('todomatic', 'TodoMatic', { edition })).toContain('On a request, follow the lyriks-evolution skill');
		expect(new ProjectAiSession(() => 'todomatic', () => 'TodoMatic', () => true).prompt()).toContain('lyriks-evolution');
	});
});
