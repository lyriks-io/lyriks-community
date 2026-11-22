import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { requireBehaviorFeatureAccess } from './behavior-feature-access.server';
import { requestEvent, servicesWith } from './request-event.fixture';

/**
 * A behavior feature is addressed by a global id: before anything reads or
 * writes it through a project, the caller must reach the project AND the
 * feature must belong to that project.
 */

function caller(decision: AccessDecision = { ok: true }, featureIds: string[] = ['feat-billing']) {
	const draftReads: string[] = [];
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => decision },
		enterpriseHooks: null,
		loadFeaturesDraft: {
			execute: async (projectId) => {
				draftReads.push(projectId);
				const draft = createEmptyFeaturesDraft(projectId);
				draft.features = featureIds.map((id) => ({ id, name: id, coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: id }));
				return draft;
			}
		}
	});
	return { event: requestEvent({ authRequired: true, services, cookies: { lyriks_session: 'jwt' } }), draftReads };
}

async function outcome(event: ReturnType<typeof caller>['event'], projectId: string, featureId: string) {
	return requireBehaviorFeatureAccess(event, projectId, featureId, 'write').then(
		() => 'allowed' as const,
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, message: failure.body.message } : Promise.reject(failure))
	);
}

describe('reaching a behavior feature through a project', () => {
	it('allows a feature the project declares', async () => {
		expect(await outcome(caller().event, 'p-shop', 'feat-billing')).toBe('allowed');
	});

	it('answers 404 for a feature the project does not declare, such as another project one', async () => {
		expect(await outcome(caller().event, 'p-shop', 'feat-payroll')).toEqual({ status: 404, message: 'Feature not found in project' });
	});

	it('allows the project own Experience and Data Model features without reading its feature list', async () => {
		const { event, draftReads } = caller();
		expect(await outcome(event, 'p-shop', 'p-shop__experience')).toBe('allowed');
		expect(await outcome(event, 'p-shop', 'p-shop__data_model')).toBe('allowed');
		expect(draftReads).toEqual([]);
	});

	it('refuses the Experience feature of another project', async () => {
		expect(await outcome(caller().event, 'p-shop', 'p-hr__experience')).toMatchObject({ status: 404 });
	});

	it('refuses a caller the project refuses, before looking at the feature', async () => {
		const { event, draftReads } = caller({ ok: false, reason: 'forbidden' });
		expect(await outcome(event, 'p-shop', 'feat-billing')).toMatchObject({ status: 403 });
		expect(draftReads).toEqual([]);
	});
});
