import { beforeEach, describe, expect, it, vi } from 'vitest';

const pgQuery = vi.fn();

vi.mock('./pg-database.server', () => ({ pgQuery }));

const { PgProjectResidueRepository } = await import(
	'./pg-project-residue-repository.server'
);

describe('PgProjectResidueRepository', () => {
	beforeEach(() => pgQuery.mockReset());

	it('loads and parses a section document', async () => {
		pgQuery.mockResolvedValue({ rows: [{ document: '{"activeTab":"rules"}' }] });
		const repository = new PgProjectResidueRepository();

		await expect(repository.load('project-1', 'rules')).resolves.toEqual({
			activeTab: 'rules'
		});
		expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('project_residue'), [
			'project-1',
			'rules'
		]);
	});

	it('returns null when the section has not been stored', async () => {
		pgQuery.mockResolvedValue({ rows: [] });
		const repository = new PgProjectResidueRepository();

		await expect(repository.load('project-1', 'documents')).resolves.toBeNull();
	});

	it('upserts a JSON document by project and section', async () => {
		pgQuery.mockResolvedValue({ rows: [] });
		const repository = new PgProjectResidueRepository();

		await repository.save('project-1', 'documents', { sources: [] });

		expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
			'project-1',
			'documents',
			'{"sources":[]}',
			expect.any(String)
		]);
	});
});
