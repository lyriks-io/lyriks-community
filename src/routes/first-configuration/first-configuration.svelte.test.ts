import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { defaultInstallConfiguration } from '$domain/settings/install-configuration';
import Page from './+page.svelte';

const data = (edition: string, onlineHelp: boolean) =>
	({ edition, onlineHelp, configuration: defaultInstallConfiguration(), destinations: [], assistantEnabled: false }) as never;

describe('the first configuration states the Community scope [criterion:ac-leaf-b2081c4f-9b15-4c56-981a-0a8d25e13c42]', () => {
	it('says a Community installation holds one user and one project, without Evolutions or solver, and links the plans', () => {
		const html = render(Page, { props: { data: data('community', true) } }).body;
		expect(html).toContain('This Community installation holds one user and one project, without Evolutions or solver.');
		expect(html).toContain('href="https://lyriks.io/pricing"');
	});

	it('writes the plans address as text when no link may leave the installation', () => {
		const html = render(Page, { props: { data: data('community', false) } }).body;
		expect(html).toContain('lyriks.io/pricing');
		expect(html).not.toContain('href="https://lyriks.io/pricing"');
	});

	it('says nothing of it on a paid edition', () => {
		const html = render(Page, { props: { data: data('enterprise', true) } }).body;
		expect(html).not.toContain('data-community-scope');
	});
});
