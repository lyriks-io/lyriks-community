import { describe, expect, it } from 'vitest';
import { createEmptyExperienceDraft, createScreen } from '$domain/experience';
import {
	featureSurfaceCapabilities,
	screenCapabilities,
	surfaceCapabilityId
} from './surface-capabilities';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

const snapshot = (surfaces: unknown[]): UnspaFeatureSnapshot =>
	({ feature: { surfaces } }) as unknown as UnspaFeatureSnapshot;

describe('screenCapabilities', () => {
	it('turns every Experience screen into a page row carrying its route and Core', () => {
		const experience = createEmptyExperienceDraft('p1');
		experience.derivedCores = [
			{ id: 'core-1', name: 'Billing', order: 0, tone: 'violet', sourceRefId: 'src-1' }
		];
		experience.screens = [
			createScreen({ id: 'scr-1', name: 'Invoices', category: 'core-1', path: '/invoices' }),
			createScreen({ id: 'scr-2', name: 'Login', category: null })
		];

		const rows = screenCapabilities(experience);

		expect(rows.map((r) => r.id)).toEqual(['screen:scr-1', 'screen:scr-2']);
		expect(rows[0]).toMatchObject({
			label: 'Invoices',
			source: 'surface',
			kind: 'surface',
			surfaceKind: 'page',
			path: '/invoices',
			sourceRefLabel: 'Billing'
		});
		// A screen outside any Core still gets a row — it is still openable.
		expect(rows[1].sourceRefLabel).toBe('Transverse');
		expect(rows[1].path).toBe('/login');
	});

	it('has no rows for a project with no experience draft', () => {
		expect(screenCapabilities(null)).toEqual([]);
	});
});

describe('featureSurfaceCapabilities', () => {
	it('lists the dialogs/panels a feature authored, keyed by feature so ids never collide', () => {
		const rows = featureSurfaceCapabilities([
			{
				id: 'feat-a',
				name: 'Refunds',
				snapshot: snapshot([
					{ id: 'dlg-confirm', name: 'Confirm Refund', type: 'dialog' },
					{ id: 'pnl-detail', name: 'Refund Detail', type: 'panel' }
				])
			},
			{
				// Same surface id under another feature — must stay a distinct row.
				id: 'feat-b',
				name: 'Payouts',
				snapshot: snapshot([{ id: 'dlg-confirm', name: 'Confirm Payout', type: 'dialog' }])
			}
		]);

		expect(rows.map((r) => r.id)).toEqual([
			surfaceCapabilityId('feat-a', 'dlg-confirm'),
			surfaceCapabilityId('feat-a', 'pnl-detail'),
			surfaceCapabilityId('feat-b', 'dlg-confirm')
		]);
		expect(rows[0]).toMatchObject({
			label: 'Confirm Refund',
			surfaceKind: 'dialog',
			sourceRefLabel: 'Refunds'
		});
	});

	it('skips builder-mirrored screens so pages are never listed twice', () => {
		const rows = featureSurfaceCapabilities([
			{
				id: 'feat-a',
				name: 'Refunds',
				snapshot: snapshot([
					{ id: 'srf-screen-scr-1', name: 'Invoices', type: 'screen', presentation: true },
					{ id: 'wf-close', name: 'Close Period', type: 'workflow' }
				])
			}
		]);

		expect(rows.map((r) => r.label)).toEqual(['Close Period']);
	});

	it('tolerates a feature with no authored behavior', () => {
		expect(featureSurfaceCapabilities([{ id: 'feat-a', name: 'Refunds', snapshot: null }])).toEqual(
			[]
		);
	});
});
