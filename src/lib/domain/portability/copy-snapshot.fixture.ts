import { emptyRowSnapshot, type ProjectSnapshot } from './snapshot';

/** Includes identity-shaped prose and a source id that also names a child action. */
export function copySnapshotFixture(): ProjectSnapshot {
	const projectId = 'original-123456';
	const leaf = 'feat-sign-in';
	const sourceId = 'action-submit';
	return {
		projectId, name: 'Example', description: 'An example product', domain: null,
		rows: {
			...emptyRowSnapshot(),
			legacyDocuments: { project_drafts: { projectId, productName: 'Example', brief: 'An example product' } },
			sectionDocuments: {
				documents: { schemaVersion: 1, revision: 2, document: { sources: [{ id: 'catalog-source', stored: { id: sourceId, hash: 'unchanged-hash' } }] } },
				scope: { schemaVersion: 1, revision: 1, document: { capabilities: [{ featureIds: [leaf] }] } }
			},
			residue: {
				features: { leafMeta: { [leaf]: { sourceIds: [sourceId] } } },
				users: { permissions: { [`action:${leaf}:action-submit`]: 'allowed' }, assignments: { [`${leaf}::action-submit`]: 'owner' } },
				'cache:project-health': { featureRef: leaf },
				'cache:score-history': [{ score: 42 }]
			}
		},
		kernel: {
			project: { id: projectId, name: 'Example', featureIds: [leaf, `${projectId}__experience`] },
			features: [
				{ id: leaf, feature: { id: leaf, name: 'Sign in', description: leaf, surfaces: [{ id: 'surface-login', name: 'Sign-in page', description: 'Enter your credentials', actions: [{ id: sourceId, name: 'Submit', rules: [], effects: [], scenarios: [{ id: 'scenario-submit', name: 'Submit', parameterOverrides: [{ parameterId: 'input', value: leaf }] }] }] }], stateVariables: [{ id: 'input', type: 'string', defaultValue: leaf }], dependsOn: [`${projectId}__experience`] } },
				{ id: `${projectId}__experience`, feature: { id: `${projectId}__experience`, name: 'Experience', surfaces: [] } }
			],
			artifacts: [
				{ kind: 'source', id: sourceId, document: { format: 'unspaghettit-source', version: 1, source: { id: sourceId, projectId, kind: 'code', name: leaf, content: `const project = '${projectId}';\r\n// café 🎼\r\n`, contentHash: 'unchanged-hash', byteLength: 74, supersedes: 'source-previous' } } },
				{ kind: 'source', id: 'source-previous', document: { format: 'unspaghettit-source', version: 1, source: { id: 'source-previous', projectId, kind: 'text', name: 'Earlier source', content: 'data:text/plain;base64,' + 'YQ=='.repeat(600), contentHash: 'previous-hash' } } },
				{ kind: 'provenance', id: leaf, document: { format: 'unspaghettit-provenance', version: 2, provenance: { featureId: leaf, sourceIds: [sourceId], spans: [{ id: 'span-submit', elementId: sourceId, elementType: 'action', sourceId, startOffset: 2, endOffset: 10, startLine: 1, endLine: 2, snippet: projectId }], candidates: [{ id: 'candidate', span: { sourceId, snippet: leaf }, decision: 'accepted' }], finalized: true } } },
				{ kind: 'implementation', id: leaf, document: { format: 'unspaghettit-implementation-status', version: 3, status: { featureId: leaf, revision: 2, actions: [{ actionId: sourceId, sourceId, path: leaf, code: projectId, capturedFields: { featureId: leaf } }], criteria: [{ criterionId: 'criterion', lastResult: { status: 'passed', message: leaf } }] } } }
			]
		}
	};
}
