import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FieldVersionList from './FieldVersionList.svelte';

/** A field's versions read one line each, and an old value never reads as the current one (ac-evo-hist-field-versions). */
const versions = [
	{ id: 'v3', value: 'Pas de commande à moins de 48 heures. Pas plus de six gâteaux par jour.', by: 'ana', source: 'typed', at: '2026-10-20T17:40:00.000Z', validatedBy: ['ana'] },
	{ id: 'v2', value: 'Pas de commande à moins de 24 heures.', by: 'ben', source: 'assistant', at: '2026-10-19T09:00:00.000Z', validatedBy: [] },
	{ id: 'v1', value: 'Rien.', by: 'ben', source: 'typed', at: '2026-10-18T09:00:00.000Z', validatedBy: [] }
];
const nameOf = (id: string) => ({ ana: 'Ana Martin', ben: 'Ben Roux' })[id] ?? id;

describe('the versions of a field [criterion:ac-leaf-ac-evo-hist-field-versions]', () => {
	it('lists one line per version, numbered from the first, with its date and who wrote it, its content closed', () => {
		const { body } = render(FieldVersionList, { props: { versions, nameOf } });
		for (const n of ['Version 3', 'Version 2', 'Version 1']) expect(body).toContain(n);
		expect(body).toContain('Ana Martin');
		expect(body).toContain('Ben Roux');
		expect(body).toContain('current');
		expect(body).not.toContain('Pas de commande');
	});

	it('opens an earlier version under a banner saying it is not the answer as it stands', () => {
		const { body } = render(FieldVersionList, { props: { versions, nameOf, opened: 'v2' } });
		expect(body).toContain('Pas de commande à moins de 24 heures.');
		expect(body).toContain('Earlier version');
		expect(body).toContain('2 of 3: not the answer as it stands, which is version 3.');
		expect(body).toContain('drawn by the built-in assistant');
	});

	it('opens the current version without that banner, its statements as a list, with who validated it', () => {
		const { body } = render(FieldVersionList, { props: { versions, nameOf, opened: 'v3' } });
		expect(body).not.toContain('Earlier version');
		expect(body).toContain('<li class="flex gap-2">');
		expect(body).toContain('validated by Ana Martin');
	});

	it('on a diagram, shows an earlier version as its drawing in place, for the reader alone, never its notation unfolded here', () => {
		const shown: (string | null)[] = [];
		const drawn = { shown: 'v2', onshow: (id: string | null) => shown.push(id) };
		const { body } = render(FieldVersionList, { props: { versions, nameOf, drawn } });
		expect(body).toContain('Drawn above in place of the current one, for you alone');
		expect(body).not.toContain('Pas de commande à moins de 24 heures.');
		expect(body).toContain('aria-pressed="true"');
		const current = render(FieldVersionList, { props: { versions, nameOf, drawn: { shown: null, onshow: () => {} } } }).body;
		expect(current).toContain('Drawn above, as it stands');
	});
});
