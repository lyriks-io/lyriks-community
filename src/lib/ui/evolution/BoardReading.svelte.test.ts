import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { BoardCardView } from '$lib/server/evolution-view.server';
import BoardReading from './BoardReading.svelte';

const card = (id: string, status: string, stage = 'specification') => ({ id, key: `EVO-${id}`, title: `Title ${id}`, status, stage, inSession: [] }) as unknown as BoardCardView;
const board = (cards: BoardCardView[]) =>
	render(BoardReading, { props: { cards, canEdit: false, productName: 'P', actorId: 'a', members: [], hasProduct: true, specHref: '/s', retroHref: '/r', onOpen: () => {}, onConcurrent: () => {}, onNew: () => {} } }).body;

describe('evolutions in progress are picked from the list [criterion:b282eb26]', () => {
	it('starts every row in progress with a square, and leaves the closed ones without', () => {
		const html = board([card('1', 'open'), card('2', 'open'), card('3', 'cancelled')]);
		expect(html.match(/role="checkbox"/g)).toHaveLength(2);
		expect(html).toContain('Pick EVO-1 for the concurrent impact');
		expect(html).not.toContain('Pick EVO-3 for the concurrent impact');
	});

	it('shows no square with fewer than two in progress', () => {
		expect(board([card('1', 'open'), card('3', 'cancelled')])).not.toContain('role="checkbox"');
	});
});

describe('a deferred omission reads in the list as a suggestion [criterion:35991202]', () => {
	const suggestion = { lineId: 'l1', title: 'No link to export', statement: 'S', leafId: null, fromRequestId: '1', fromKey: 'EVO-1', href: '/x', startWith: { op: 'open_request', deferredLineId: 'l1' } };
	const shown = (props: Record<string, unknown>) =>
		render(BoardReading, { props: { cards: [card('1', 'open'), card('3', 'cancelled')], suggestions: [suggestion], canEdit: true, productName: 'P', actorId: 'a', members: [], hasProduct: true, specHref: '/s', retroHref: '/r', onOpen: () => {}, onConcurrent: () => {}, onNew: () => {}, ...props } }).body;

	it('tags it Suggested, names where it comes from, and counts it apart', () => {
		const html = shown({});
		expect(html).toContain('No link to export');
		expect(html).toContain('Deferred from EVO-1');
		expect(html).toContain('>Suggested<');
		expect(html).toContain('Suggested · 1');
		expect(html).toContain('All · 3');
	});

	it('sits between the requests in progress and the closed ones', () => {
		const html = shown({});
		expect(html.indexOf('Title 1')).toBeLessThan(html.indexOf('No link to export'));
		expect(html.indexOf('No link to export')).toBeLessThan(html.indexOf('Title 3'));
	});

	it('offers to start it only to who may edit [criterion:03b7eacf]', () => {
		expect(shown({})).toContain('Start this evolution');
		expect(shown({ canEdit: false })).not.toContain('Start this evolution');
	});

	it('shows no filter when nothing is suggested', () => {
		expect(shown({ suggestions: [] })).not.toContain('Suggested ·');
	});
});

describe('a card reads the order and the conflicts of the requests under way (EVO-005)', () => {
	const ordered = (order: { after: string[]; conflicts: string[] }, status = 'open') => ({ ...card('1', status), order }) as unknown as BoardCardView;

	it('reads after EVO-xxx while the request it is set after has not landed [criterion:ac-leaf-f2108b7e-6d38-4999-a018-4f3d4057afdf]', () => {
		const html = board([ordered({ after: ['EVO-2'], conflicts: [] }), card('2', 'open')]);
		expect(html).toContain('After EVO-2');
		expect(board([ordered({ after: [], conflicts: [] }), card('2', 'open')])).not.toContain('After EVO-');
	});

	it('reads the conflict with a request under way on the board [criterion:ac-leaf-44f6ec8a-f78f-4488-8a66-0603a4cb4249]', () => {
		expect(board([ordered({ after: [], conflicts: ['EVO-2'] }), card('2', 'open')])).toContain('Conflict · EVO-2');
		// A request that left the run reads where it stands, nothing more.
		expect(board([ordered({ after: [], conflicts: ['EVO-2'] }, 'closed'), card('2', 'open')])).not.toContain('Conflict · EVO-2');
	});
});
