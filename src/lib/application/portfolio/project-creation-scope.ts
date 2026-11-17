import { isCommunity, projectCreation, type ScopeCheck } from '$domain/licensing';
import type { ProjectCatalogPort } from '$application/ports';

/**
 * Whether this installation may hold one more project (EVO-001): every way a
 * project is born (the page, an AI client, an import, a copy) asks it, through
 * the two use-cases that create one.
 */
export class CheckProjectCreationUseCase {
	constructor(
		private readonly edition: () => string | undefined,
		private readonly catalog: Pick<ProjectCatalogPort, 'list'>
	) {}

	async execute(): Promise<ScopeCheck> {
		const edition = this.edition();
		// Only Community counts; every other edition creates without a read.
		if (!isCommunity(edition)) return { ok: true };
		return projectCreation(edition, (await this.catalog.list()).length);
	}
}

/** A creation the installation's edition refuses, carrying the sentence to show and the plan that opens it. */
export class ProjectScopeRefusedError extends Error {
	constructor(readonly check: Extract<ScopeCheck, { ok: false }>) {
		super(check.reason);
		this.name = 'ProjectScopeRefusedError';
	}
}

/** Throws the refusal when the installation may not hold one more project. */
export async function assertProjectCreation(scope: Pick<CheckProjectCreationUseCase, 'execute'> | undefined): Promise<void> {
	const check = await scope?.execute();
	if (check && !check.ok) throw new ProjectScopeRefusedError(check);
}
