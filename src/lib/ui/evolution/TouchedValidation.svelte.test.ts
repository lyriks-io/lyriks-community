import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { TouchedReading } from '$domain/evolution';
import type { DossierCounts } from '$lib/server/evolution-view.server';
import ImpactReading from './ImpactReading.svelte';
import TouchedValidation from './TouchedValidation.svelte';
import { lineOffers, chooseForAllOffers } from './touched-validation';
import { TouchedValidationState } from './touched-validation.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), invalidateAll: vi.fn(async () => {}), goto: vi.fn() }));

/**
 * The block Not validated in Knowledge as the Simulation shows it (EVO-003):
 * what each line offers to whom, what the block says when Knowledge cannot be
 * read, and the way into the build counting what still waits for a choice.
 */

const line = (id: string, over: Partial<TouchedReading['lines'][number]> = {}): TouchedReading['lines'][number] => ({
	id,
	title: `Element ${id}`,
	place: 'Shop › Cart',
	relation: 'amended',
	waitsOn: [{ id: 'leo@company.test', name: 'Leo' }],
	waitsOnMe: false,
	choice: 'none',
	...over
});

function readState(reading: TouchedReading): TouchedValidationState {
	const state = new TouchedValidationState('p', 'r');
	state.reading = reading;
	return state;
}

const reading = (lines: TouchedReading['lines']): TouchedReading => ({ readable: true, specValidated: false, lines, awaitingChoice: lines.filter((l) => l.choice === 'none').length, validated: [] });
const editor = { canChoose: true, frozen: false };

describe('what a line offers', () => {
	it('offers Validate now only to whom the element waits on [criterion:ac-leaf-5ca7229b-7761-4e8d-83ce-7b37e33703c3]', () => {
		expect(lineOffers(line('a', { waitsOnMe: true }), editor).validateNow).toBe(true);
		expect(lineOffers(line('b', { waitsOnMe: false }), editor).validateNow).toBe(false);
		const html = render(TouchedValidation, { props: { projectId: 'p', touched: readState(reading([line('action:f:a', { waitsOnMe: true }), line('action:f:b')])), ability: editor } }).body;
		expect(html.match(/>Validate now</g)).toHaveLength(1);
		expect(html).toContain('Waits on Leo');
	});

	it('offers Validate at the landing to whoever may write the request, and its taking back until the freeze [criterion:ac-leaf-3baeaf02-f697-46e6-b9da-111549c79ec1]', () => {
		expect(lineOffers(line('a'), editor).atLanding).toBe(true);
		expect(lineOffers(line('a'), { canChoose: false, frozen: false }).atLanding).toBe(false);
		expect(lineOffers(line('a', { choice: 'at_landing' }), editor)).toEqual({ validateNow: false, atLanding: false, takeBack: true });
		expect(lineOffers(line('a', { choice: 'at_landing' }), { canChoose: false, frozen: true }).takeBack).toBe(false);
		expect(chooseForAllOffers([line('a'), line('b', { choice: 'at_landing' })], editor)).toEqual({ atLanding: true, validateNow: false });
	});

	it('names each element, opens it on the Specification 360°, and says where it sits', () => {
		const html = render(TouchedValidation, { props: { projectId: 'p', touched: readState(reading([line('action:feat-cart:a1', { relation: 'used' })])), ability: editor } }).body;
		expect(html).toContain('1 element this change touches is not validated in Knowledge.');
		expect(html).toContain('href="/projects/p/spec/features/feat-cart#kbt-action_feat-cart_a1"');
		expect(html).toContain('Shop › Cart · Built on · Waits on Leo');
	});
});

describe('when Knowledge cannot be read', () => {
	it('the block says so and lists nothing [criterion:ac-leaf-2111a3f1-877e-4492-817c-53eea4e50554]', () => {
		const html = render(TouchedValidation, { props: { projectId: 'p', touched: readState({ readable: false, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }), ability: editor } }).body;
		expect(html).toContain('Knowledge could not be read: the project team is unavailable. The rest of the Simulation reads as usual.');
		expect(html).not.toContain('Validate now');
	});
});

describe('the way into the build', () => {
	const dossier = {
		id: 'r',
		key: 'EVO-003',
		title: 'Simulation',
		stage: 'coherence',
		leaves: [],
		gate: { ok: true, next: 'implementation', reason: null, detail: null },
		specVersion: 0,
		status: 'open',
		docking: { points: [] },
		crossEvolutions: [],
		coherence: { findings: [], health: null }
	} as unknown as DossierCounts;
	const ready = { status: 'ready', findings: [], total: 0 } as never;

	it('says how many touched elements still wait for a validation choice, without holding it [criterion:ac-leaf-63051f74-7abe-429d-98f1-20712c410457]', () => {
		const knowledge = readState(reading([line('action:f:a'), line('action:f:b'), line('action:f:c', { choice: 'at_landing' })]));
		const html = render(ImpactReading, {
			props: { projectId: 'p', dossier, impacts: { add: ready, change: ready, remove: ready }, proposes: { byLeaf: {}, main: 'change' }, canEdit: true, onFixNow: () => {}, onStart: () => {}, onNext: () => {}, knowledge }
		}).body;
		expect(html).toContain('2 elements this change touches still wait for a validation choice: the freeze sets them to Validate at the landing.');
		// The way on stays open: nothing is held, the freeze offered (EVO-011).
		expect(html).toContain('Freeze version 1 →');
	});
});
