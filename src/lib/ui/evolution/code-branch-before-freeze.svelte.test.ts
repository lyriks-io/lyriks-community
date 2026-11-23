import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { DossierReading } from '$lib/server/evolution-view.server';
import CodeBranchCard from './CodeBranchCard.svelte';

const suggested = { branch: 'main', why: 'the default branch of origin', by: "Ana Lima's AI", at: '2026-11-23T08:00:00.000Z' };
// The card before the freeze reads no code yet: only the field, pre-filled or empty.
const dossier = (over: Record<string, unknown>) => ({ code: null, deploymentBranchSuggestion: null, ...over }) as unknown as DossierReading;
const card = (d: DossierReading, canEdit = true) => render(CodeBranchCard, { props: { projectId: 'shop', canEdit, dossier: d } }).body;

describe('before the freeze, the card names the branch the freeze waits for [criterion:5411b88e] [criterion:396e62e3]', () => {
	it('pre-fills the field with the branch the AI read from git, and says so under it', () => {
		const html = card(dossier({ deploymentBranchSuggestion: suggested }));
		expect(html).toContain('value="main"');
		expect(html).toContain("Suggested by Ana Lima's AI from git: the default branch of origin");
		expect(html).toContain('Save');
	});

	it('leaves the field empty with no suggestion, and shows a reader no field', () => {
		expect(card(dossier({}))).not.toContain('Suggested by');
		expect(card(dossier({ deploymentBranchSuggestion: suggested }), false)).toContain('Only who may edit the project names its deployment branch.');
	});
});
