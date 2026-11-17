import { describe, expect, it } from 'vitest';
import { createEmptyExperienceDraft, createScreen } from '$domain/experience';
import {
	featureSurfaceCapabilities,
	featuresReachedByGrants,
	screenCapabilities,
	surfaceCapabilityId
} from './surface-capabilities';
import { permissionCoverage, createEmptyUsersDraft } from '$domain/users';
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

describe('featuresReachedByGrants [criterion:02a56f3c]', () => {
	const experience = createEmptyExperienceDraft('p1');
	experience.screens = [
		createScreen({ id: 'scr-bill', name: 'Invoices', category: 'core-bill' }),
		createScreen({ id: 'scr-loose', name: 'Login', category: null })
	];
	const features = [
		{ id: 'f-send', coreId: 'core-bill' },
		{ id: 'f-pay', coreId: 'core-bill' },
		{ id: 'f-chat', coreId: 'core-help' }
	];
	const leaves = [{ id: 'f-chat', name: 'Chat', snapshot: snapshot([{ id: 'srf-panel', name: 'Chat panel', type: 'panel' }]) }];

	it('opens the features of its Core from a page, and its feature from a surface', () => {
		expect(featuresReachedByGrants(features, experience, leaves)).toEqual({
			[surfaceCapabilityId('f-chat', 'srf-panel')]: ['f-chat'],
			'screen:scr-bill': ['f-send', 'f-pay']
		});
	});

	it('counts a feature reached through a granted page or surface as granted', () => {
		const users = {
			...createEmptyUsersDraft('p1'),
			roles: [{ id: 'r1', name: 'Clerk', description: '', userCountMin: 1, userCountMax: null, tone: 'admin' as const, sourceIds: [] }],
			permissions: [
				{ roleId: 'r1', capabilityId: 'screen:scr-bill', capabilitySource: 'surface' as const },
				{ roleId: 'r1', capabilityId: surfaceCapabilityId('f-chat', 'srf-panel'), capabilitySource: 'surface' as const }
			]
		};
		const ids = ['f-send', 'f-pay', 'f-chat', 'f-alone'];
		expect(permissionCoverage(users, ids).uncoveredCapabilityIds).toEqual(ids);
		expect(permissionCoverage(users, ids, featuresReachedByGrants([...features, { id: 'f-alone', coreId: 'core-x' }], experience, leaves)).uncoveredCapabilityIds).toEqual([
			'f-alone'
		]);
	});
});
