import type { Domain } from '$domain/portfolio';
import type { PortfolioRepositoryPort, ProjectMeta } from '$application/ports';
import { pgQuery } from './pg-database.server';

interface DomainRow {
	id: string;
	name: string;
	description: string;
	icon: string;
	created_at: string;
}
interface MetaRow {
	domain_id: string | null;
	shipped_at: string | null;
}

/** Domains registry + per-project org metadata (domain, shipping) on Postgres. */
export class PgPortfolioRepository implements PortfolioRepositoryPort {
	async listDomains(): Promise<Domain[]> {
		const { rows } = await pgQuery<DomainRow>(
			'SELECT id, name, description, icon, created_at FROM domains ORDER BY created_at ASC'
		);
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			description: r.description,
			icon: r.icon || 'lucide:building-2',
			createdAt: r.created_at
		}));
	}

	async saveDomain(domain: Domain): Promise<void> {
		await pgQuery(
			`INSERT INTO domains (id, name, description, icon, created_at)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (id) DO UPDATE SET
			   name = EXCLUDED.name,
			   description = EXCLUDED.description,
			   icon = EXCLUDED.icon`,
			[domain.id, domain.name, domain.description, domain.icon, domain.createdAt]
		);
	}

	async removeDomain(id: string): Promise<void> {
		await pgQuery('DELETE FROM domains WHERE id = $1', [id]);
	}

	async countProjectsInDomain(id: string): Promise<number> {
		const { rows } = await pgQuery<{ n: string }>(
			'SELECT COUNT(*) AS n FROM project_meta WHERE domain_id = $1',
			[id]
		);
		return Number(rows[0]?.n ?? 0);
	}

	async getMeta(projectId: string): Promise<ProjectMeta | null> {
		const { rows } = await pgQuery<MetaRow>(
			'SELECT domain_id, shipped_at FROM project_meta WHERE project_id = $1',
			[projectId]
		);
		if (rows.length === 0) return null;
		return { domainId: rows[0].domain_id, shippedAt: rows[0].shipped_at };
	}

	/** Org placement only: `shipped_at` is deliberately absent from the update
	 *  list, so moving a project between domains can never rewrite its shipping. */
	async setMeta(projectId: string, meta: Pick<ProjectMeta, 'domainId'>): Promise<void> {
		await pgQuery(
			`INSERT INTO project_meta (project_id, domain_id, updated_at)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (project_id) DO UPDATE SET
			   domain_id = EXCLUDED.domain_id,
			   updated_at = EXCLUDED.updated_at`,
			[projectId, meta.domainId, new Date().toISOString()]
		);
	}

	async setShipped(projectId: string, shippedAt: string | null): Promise<void> {
		await pgQuery(
			`INSERT INTO project_meta (project_id, domain_id, shipped_at, updated_at)
			 VALUES ($1, NULL, $2, $3)
			 ON CONFLICT (project_id) DO UPDATE SET
			   shipped_at = EXCLUDED.shipped_at,
			   updated_at = EXCLUDED.updated_at`,
			[projectId, shippedAt, new Date().toISOString()]
		);
	}

	async removeMeta(projectId: string): Promise<void> {
		await pgQuery('DELETE FROM project_meta WHERE project_id = $1', [projectId]);
	}
}
