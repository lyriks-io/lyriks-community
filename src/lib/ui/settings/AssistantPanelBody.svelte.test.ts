import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { assistantView, defaultStoredAssistant } from '$domain/settings';
import AssistantPanelBody from './AssistantPanelBody.svelte';

/**
 * Settings › AI assistant: an administrator gets the connection form; anyone
 * else reads where it stands and who changes it (ac-adm-ai-readonly), and no
 * one ever reads the key (ac-adm-ai-key).
 */
const on = assistantView({ ...defaultStoredAssistant(), enabled: true, provider: 'anthropic', model: 'claude-sonnet-5-5', sealedKey: 'v1:x:y:z', keyHint: '…1234', test: 'works' });

describe('the assistant panel [criterion:ac-leaf-ac-adm-ai-readonly]', () => {
	it('tells someone who is not an administrator where it stands, with no form to change it', () => {
		const { body } = render(AssistantPanelBody, { props: { initial: on, isAdmin: false } });
		expect(body).toContain('On, with Claude, by Anthropic, Sonnet 5.5');
		expect(body).toContain('claude-sonnet-5-5');
		expect(body).toContain('Only an administrator changes this.');
		expect(body).not.toContain('assistant-key');
		const off = render(AssistantPanelBody, { props: { initial: assistantView(defaultStoredAssistant()), isAdmin: false } }).body;
		expect(off).toContain('Off: the AI at work is each person');
	});

	it('gives an administrator the connection, showing only the end of the stored key', () => {
		const { body } = render(AssistantPanelBody, { props: { initial: on, isAdmin: true } });
		expect(body).toContain('id="assistant-key"');
		expect(body).toContain('Stored, ending …1234: leave empty to keep it');
		expect(body).toContain('Built-in assistant on');
		expect(body).not.toContain('v1:x:y:z');
	});

	it('offers the models to pick from, the one in use picked, and another by its name [criterion:ac-leaf-ac-adm-ai-central]', () => {
		const { body } = render(AssistantPanelBody, { props: { initial: on, isAdmin: true } });
		for (const label of ['Sonnet 5.5', 'Haiku 5.5', 'Opus 5.5', 'Fable 5.1', 'Other model']) expect(body).toContain(label);
		expect(body).toMatch(/aria-checked="true"[^>]*>\s*Sonnet 5.5/);
		expect(body).toContain('Recommended: quick, and enough to draw a diagram well.');
		const typed = assistantView({ ...defaultStoredAssistant(), provider: 'anthropic', model: 'claude-sonnet-5', sealedKey: 'v1:x:y:z', keyHint: '…1234' });
		const other = render(AssistantPanelBody, { props: { initial: typed, isAdmin: true } }).body;
		expect(other).toMatch(/aria-checked="true"[^>]*>\s*Other model/);
		expect(other).toContain('value="claude-sonnet-5"');
	});
});
