import { describe, expect, it } from 'vitest';
import { rehomeSnapshot } from './rehome-snapshot';
import { emptyRowSnapshot, type ProjectSnapshot } from './snapshot';

const snapshot = (projectId: string): ProjectSnapshot => ({
	projectId,
	name: 'Northwind',
	description: '',
	rows: {
		...emptyRowSnapshot(),
		legacyDocuments: { project_drafts: { productName: 'Northwind', brief: `about ${projectId}` } }
	},
	kernel: {
		project: {
			id: projectId,
			name: 'Northwind',
			featureIds: ['feat-iam-mfa', `${projectId}__data_model`, `${projectId}__experience`]
		},
		features: [
			{ id: 'feat-iam-mfa', feature: { id: 'feat-iam-mfa', name: 'MFA' } },
			{ id: `${projectId}__data_model`, feature: { id: `${projectId}__data_model`, name: 'Data' } },
			{ id: `${projectId}__experience`, feature: { id: `${projectId}__experience`, name: 'Exp' } }
		]
	},
	domain: null
});

describe('rehomeSnapshot', () => {
	it('rehomes the project id and the aux feature ids derived from it', () => {
		const out = rehomeSnapshot(snapshot('northwind-647bed'), { projectId: 'northwind-b13c3c' });

		expect(out.projectId).toBe('northwind-b13c3c');
		expect(out.kernel.project?.id).toBe('northwind-b13c3c');
		expect(out.kernel.project?.featureIds).toEqual([
			'feat-iam-mfa',
			'northwind-b13c3c__data_model',
			'northwind-b13c3c__experience'
		]);
		expect(out.kernel.features.map((f) => f.id)).toEqual([
			'feat-iam-mfa',
			'northwind-b13c3c__data_model',
			'northwind-b13c3c__experience'
		]);
		expect(out.kernel.features.map((f) => f.feature.id)).toEqual(
			out.kernel.features.map((f) => f.id)
		);
	});

	it('only replaces whole ids, never a substring inside prose', () => {
		const out = rehomeSnapshot(snapshot('northwind-647bed'), { projectId: 'northwind-b13c3c' });
		const identity = out.rows.legacyDocuments['project_drafts'] as { brief: string };
		expect(identity.brief).toBe('about northwind-647bed');
	});

	it('is the identity when the id does not change', () => {
		const input = snapshot('northwind-647bed');
		expect(rehomeSnapshot(input, { projectId: 'northwind-647bed' })).toEqual(input);
	});
});
