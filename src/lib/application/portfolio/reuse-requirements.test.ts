import { describe, expect, it } from 'vitest';
import { ExportRequirementUseCase, ImportRequirementUseCase, LoadReuseLibraryUseCase, RemoveReuseTemplateUseCase } from './reuse-requirements';

function residue() {
	const rows = new Map<string, unknown>();
	return {
		rows,
		port: {
			load: async (key: string) => rows.get(key) ?? null,
			save: async (key: string, _section: string, draft: unknown) => void rows.set(key, draft)
		} as never
	};
}

const features = () => ({
	cores: [],
	families: [],
	features: [{ id: 'f1', name: 'Invoices', description: 'Send them', coreId: 'c', parentFamilyId: null }],
	leafMeta: {}
});
const loadFeatures = { execute: async () => features() } as never;
const loadFoundation = { loadIdentity: async () => ({ productName: 'Billing' }) } as never;
const clock = { nowIso: () => '2026-11-17T00:00:00.000Z' };

describe('each workspace keeps its own reuse library (issue 267)', () => {
	it('a template lifted in one workspace is not read, imported or removed from another [scenario:6ad1889f]', async () => {
		const store = residue();
		const lifted = await new ExportRequirementUseCase(store.port, loadFeatures, loadFoundation, clock).execute('p-a', 'f1', 'ws-a');
		const templateId = lifted.templates[0].id;

		expect((await new LoadReuseLibraryUseCase(store.port).execute('ws-b')).templates).toEqual([]);
		await expect(
			new ImportRequirementUseCase(store.port, loadFeatures, { execute: async () => {} } as never).execute('p-b', templateId, 'ws-b')
		).rejects.toThrow('template not found');
		await new RemoveReuseTemplateUseCase(store.port).execute(templateId, 'ws-b');
		expect((await new LoadReuseLibraryUseCase(store.port).execute('ws-a')).templates.map((t) => t.id)).toEqual([templateId]);
	});

	it('an installation without workspaces keeps its one library', async () => {
		const store = residue();
		await new ExportRequirementUseCase(store.port, loadFeatures, loadFoundation, clock).execute('p', 'f1');
		expect([...store.rows.keys()]).toEqual(['__workspace__']);
	});
});
