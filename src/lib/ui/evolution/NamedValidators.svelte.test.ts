import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import NamedValidators from './NamedValidators.svelte';

const members = [
	{ id: 'ana@team.test', name: 'Ana', role: 'admin', jobs: ['Product'], jobIds: ['product'] },
	{ id: 'bo@team.test', name: 'Bo', role: 'designer', jobs: ['Tech'], jobIds: ['tech'] },
	{ id: 'vi@team.test', name: 'Vi', role: 'viewer' }
];
const props = (over: Record<string, unknown> = {}) => ({
	step: 'need' as const,
	expected: [],
	given: [],
	members,
	actorId: 'bo@team.test',
	canName: true,
	onname: async () => true,
	...over
});

/** Who is expected to validate an answer or a step, on its card (ac-evo-form-name-validators). */
describe('the card names who validates it [criterion:ac-leaf-ac-evo-form-name-validators]', () => {
	it('offers to name who validates while nobody is named', () => {
		const { body } = render(NamedValidators, { props: props() });
		expect(body).toContain('Name who validates');
		expect(body).not.toContain('Expected:');
	});

	it('reads the people named with their job, and changing them once someone is', () => {
		const { body } = render(NamedValidators, { props: props({ expected: ['ana@team.test'], given: ['ana@team.test'] }) });
		expect(body).toContain('Expected:');
		expect(body).toContain('Ana');
		expect(body).toContain('(Product)');
		expect(body).toContain('Change who validates');
	});

	it('says who left the workspace, and offers nothing to a reader who may not name', () => {
		const { body } = render(NamedValidators, { props: props({ gone: ['dee@team.test'], canName: false }) });
		expect(body).toContain('dee@team.test left the workspace');
		expect(body).not.toContain('Name who validates');
	});
});

/** A person named who has not validated yet reads it on the card (ac-evo-req-waiting-on-you). */
describe('the person awaited reads Waiting on you [criterion:ac-leaf-ac-evo-req-waiting-on-you]', () => {
	it('shows it to the person named until they validate, and to nobody else', () => {
		expect(render(NamedValidators, { props: props({ expected: ['bo@team.test'] }) }).body).toContain('Waiting on you');
		expect(render(NamedValidators, { props: props({ expected: ['bo@team.test'], given: ['BO@team.test'] }) }).body).not.toContain('Waiting on you');
		expect(render(NamedValidators, { props: props({ expected: ['ana@team.test'] }) }).body).not.toContain('Waiting on you');
	});
});
