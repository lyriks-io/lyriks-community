import { error } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { summaryRefusal } from '$domain/foundation';

/**
 * Refuses, before anything is written, a save that changes the product summary
 * past its limit (criterion 72251131): the Edit mode of the Overview, the
 * Brief, and an AI writing the foundation through the MCP all go through it.
 */
export async function assertSummaryFits(services: AppServices, projectId: string, next: string): Promise<void> {
	const before = (await services.loadFoundationDraft.loadIdentity(projectId).catch(() => null))?.brief ?? '';
	const refusal = summaryRefusal(next, before);
	if (refusal) error(400, refusal);
}
