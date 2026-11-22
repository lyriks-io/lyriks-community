import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, createEmptyIdentityDraft, createEmptyOperationsDraft } from '$domain/foundation';
import { parseFoundationDraft } from './parse-foundation-draft';

describe('parseFoundationDraft', () => {
	it('pins every nested context to the trusted project id', () => {
		const draft = parseFoundationDraft(
			{
				projectId: 'hostile-root',
				identity: { projectId: 'hostile-identity', productName: 'Morpion' },
				definition: {
					projectId: 'hostile-definition',
					businessObjective: { mainProblem: 'Play remotely' }
				},
				operations: {
					projectId: 'hostile-operations',
					i18n: { primaryLocale: 'fr' }
				}
			},
			'project-1'
		);

		expect(draft.projectId).toBe('project-1');
		expect(draft.identity).toMatchObject({ projectId: 'project-1', productName: 'Morpion' });
		expect(draft.definition).toMatchObject({
			projectId: 'project-1',
			businessObjective: { mainProblem: 'Play remotely' }
		});
		expect(draft.operations).toMatchObject({
			projectId: 'project-1',
			i18n: { primaryLocale: 'fr' }
		});
	});

	it('reads a missing or malformed document as an empty Foundation for the project', () => {
		const empty = {
			projectId: 'project-1',
			identity: createEmptyIdentityDraft('project-1'),
			definition: createEmptyDefinitionDraft('project-1'),
			operations: createEmptyOperationsDraft('project-1')
		};
		expect(parseFoundationDraft(null, 'project-1')).toEqual(empty);
		expect(parseFoundationDraft(undefined, 'project-1')).toEqual(empty);
		expect(parseFoundationDraft('identity', 'project-1')).toEqual(empty);
	});
});
