import { simulate, type SimRequest, type SimResult } from '$domain/experience';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';

/**
 * Headlessly run a prototype: load the experience draft and fold the scripted
 * actions through the pure run-mode engine ({@link simulate}). Read-only — a run
 * is ephemeral by design, so nothing is persisted. This is the "verify" half of
 * the authoring loop the MCP exposes alongside `build_screen`.
 */
export class SimulateExperienceUseCase {
	constructor(private readonly loadExperience: LoadExperienceDraftUseCase) {}

	async execute(projectId: string, req: SimRequest): Promise<SimResult> {
		const draft = await this.loadExperience.execute(projectId);
		return simulate(draft.builder, req);
	}
}
