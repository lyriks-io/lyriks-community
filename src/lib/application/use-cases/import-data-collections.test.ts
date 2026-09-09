import { describe, expect, it, vi } from 'vitest';
import { emptyBuilder } from '$domain/experience';
import { ImportDataCollectionsUseCase } from './import-data-collections';

describe('ImportDataCollectionsUseCase', () => {
	it('returns collection and field ids for immediate simulator bindings', async () => {
		const experience = {
			projectId: 'project-1',
			builder: emptyBuilder()
		};
		const data = {
			entities: [{ id: 'entity-1', name: 'Message' }],
			fields: [
				{
					id: 'source-field-1',
					entityId: 'entity-1',
					name: 'content',
					type: 'string',
					isId: false
				}
			]
		};
		const saveExperience = { execute: vi.fn() };
		const useCase = new ImportDataCollectionsUseCase(
			{ execute: vi.fn().mockResolvedValue(experience) } as never,
			{ execute: vi.fn().mockResolvedValue(data) } as never,
			saveExperience as never,
			{ execute: vi.fn() } as never
		);

		const result = await useCase.execute('project-1');

		expect(result.imported).toEqual(['Message']);
		expect(result.collectionIds.Message).toBeTruthy();
		expect(result.fieldIds.Message.content).toBeTruthy();
		expect(saveExperience.execute).toHaveBeenCalledOnce();
	});

	it('skips an already-imported entity via provenance, even after an entity rename', async () => {
		const builder = emptyBuilder();
		builder.collections.push({
			id: 'col-1',
			name: 'Message',
			fields: [{ id: 'field-1', name: 'content', kind: 'sentence' }],
			seedCount: 3,
			sourceEntityId: 'entity-1'
		});
		const experience = { projectId: 'project-1', builder };
		const data = {
			entities: [{ id: 'entity-1', name: 'Note' }],
			fields: []
		};
		const saveExperience = { execute: vi.fn() };
		const useCase = new ImportDataCollectionsUseCase(
			{ execute: vi.fn().mockResolvedValue(experience) } as never,
			{ execute: vi.fn().mockResolvedValue(data) } as never,
			saveExperience as never,
			{ execute: vi.fn() } as never
		);

		const result = await useCase.execute('project-1');

		expect(result.imported).toEqual([]);
		expect(result.skipped).toEqual(['Note']);
		// Result maps are keyed by entity name and resolve through provenance.
		expect(result.collectionIds.Note).toBe('col-1');
		expect(result.fieldIds.Note.content).toBe('field-1');
		expect(saveExperience.execute).not.toHaveBeenCalled();
	});

	it('refresh mode re-syncs drifted collections from the model, keeping demo knobs', async () => {
		const builder = emptyBuilder();
		builder.collections.push({
			id: 'col-1',
			name: 'Message',
			fields: [{ id: 'field-1', name: 'content', kind: 'sentence' }],
			seedCount: 42,
			rows: [{ content: 'hello' }],
			sourceEntityId: 'entity-1'
		});
		const experience = { projectId: 'project-1', builder };
		const data = {
			entities: [{ id: 'entity-1', name: 'Note' }],
			fields: [
				{ id: 'source-field-1', entityId: 'entity-1', name: 'content', type: 'string', isId: false },
				{ id: 'source-field-2', entityId: 'entity-1', name: 'author', type: 'string', isId: false }
			]
		};
		const saveExperience = { execute: vi.fn() };
		const useCase = new ImportDataCollectionsUseCase(
			{ execute: vi.fn().mockResolvedValue(experience) } as never,
			{ execute: vi.fn().mockResolvedValue(data) } as never,
			saveExperience as never,
			{ execute: vi.fn() } as never
		);

		const result = await useCase.execute('project-1', undefined, { refresh: true });

		expect(result.imported).toEqual([]);
		expect(result.updated).toEqual(['Note']);
		const col = builder.collections[0];
		expect(col.name).toBe('Note'); // name follows the renamed entity
		expect(col.fields.map((f) => f.name)).toEqual(['content', 'author']);
		expect(col.seedCount).toBe(42); // author demo knobs survive the refresh
		expect(col.rows).toEqual([{ content: 'hello' }]);
		expect(saveExperience.execute).toHaveBeenCalledOnce();
	});
});
