import type { Domain } from '$domain/portfolio';
import type { PortfolioRepositoryPort, ProjectMeta } from '$application/ports';
import { pgQuery } from './pg-database.server';

interface DomainRow {
	id: string;
	name: string;
	description: string;
	icon: string;
	created_at: string;
	position: number | null;
	workspace_id: string | null;
}
interface MetaRow {
	domain_id: string | null;
	shipped_at: string | null;
}

/** Domains registry + per-project org metadata (domain, shipping) on Postgres. */
export class PgPortfolioRepository implements PortfolioRepositoryPort {
	async listDomains(): Promise<Domain[]> {
		const { rows } = await pgQuery<DomainRow>(
			'SELECT id, name, description, icon, created_at, position, workspace_id FROM domains ORDER BY created_at ASC'
		);
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			description: r.description,
			icon: r.icon || 'lucide:building-2',
			createdAt: r.created_at,
			position: r.position ?? null,
			workspaceId: r.workspace_id ?? null
		}));
	}

	/** A folder keeps the workspace it was created in: an update never moves it to another one. */
	async saveDomain(domain: Domain): Promise<void> {
		await pgQuery(
			`INSERT INTO domains (id, name, description, icon, created_at, workspace_id)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (id) DO UPDATE SET
			   name = EXCLUDED.name,
			   description = EXCLUDED.description,
			   icon = EXCLUDED.icon`,
			[domain.id, domain.name, domain.description, domain.icon, domain.createdAt, domain.workspaceId ?? null]
		);
	}

	/** One statement, so the folders never read half reordered; `position` is left out of saveDomain on purpose. */
	async setDomainOrder(ids: readonly string[]): Promise<void> {
		await pgQuery(
			`UPDATE domains SET position = o.pos - 1
			 FROM unnest($1::text[]) WITH ORDINALITY AS o(id, pos)
			 WHERE domains.id = o.id`,
			[[...ids]]
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

	async removeMeta(projectId: string): Promise<void> {
		await pgQuery('DELETE FROM project_meta WHERE project_id = $1', [projectId]);
	}
}
