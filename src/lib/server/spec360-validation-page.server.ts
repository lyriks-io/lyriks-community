import type { AppServices } from '$composition/container.server';
import {
	currentRun,
	lastPublishedRun,
	sendBackPrompt,
	withoutServerReadings,
	type CodeChange,
	type CodeChangeView,
	type PersonRef,
	type RetrospecDocument,
	type RetrospecRun,
	type SpecElement,
	type TeamMember
} from '$domain/retrospec';
import type { Baseline } from '$domain/baselines';
import { readCodeChanges } from './spec-code-drift.server';
import { readSpecValidationBoard } from './spec-validation.server';

/**
 * What the Specification 360° layout hands its pages about the validation:
 * the runs the board is read from (the current one, and the one that first
 * validated the specification), the elements and the team, so a page applies a
 * click at once with the same rules the server applies; and, once validated,
 * the code changed outside Lyriks with the prompt that sends each back.
 */

export interface SpecValidationPageData {
	readonly teamAvailable: boolean;
	readonly doc: RetrospecDocument;
	readonly revision: number;
	readonly elements: readonly SpecElement[];
	readonly team: readonly TeamMember[];
	/** The baselines a version is read from, without their document (never shown here). */
	readonly baselines: readonly Baseline[];
	readonly changes: readonly CodeChangeView[];
	/** When the code was last synced, null when it never was. */
	readonly lastSyncAt: string | null;
}

/** A run as a page reads it: who validated each element. The code it was read against, and what each element was called, stay on the server. */
function forThePage(run: RetrospecRun): RetrospecRun {
	const read = withoutServerReadings(run);
	const verdicts = Object.fromEntries(Object.entries(run.verdicts).map(([id, verdict]) => [id, { ...verdict, title: '', tab: '' }]));
	return { ...read, verdicts };
}

/** The runs the board reads: the current one, and the first published one (its baseline is v1.0). */
export function trimmed(doc: RetrospecDocument): RetrospecDocument {
	const current = currentRun(doc);
	const first = doc.runs.find((r) => r.publishedAt && r.baselineId) ?? lastPublishedRun(doc);
	const runs = [first, current].filter((r, i, all): r is NonNullable<typeof r> => !!r && all.indexOf(r) === i);
	return { version: 1, runs: runs.map(forThePage), comments: {}, ...(doc.validationRequests ? { validationRequests: doc.validationRequests } : {}), ...(doc.specEdits ? { specEdits: doc.specEdits } : {}) };
}

export async function readSpecValidationPage(services: AppServices, projectId: string, productName: string, viewer: PersonRef): Promise<SpecValidationPageData> {
	const read = await readSpecValidationBoard(services, projectId, viewer);
	const { changes, lastSyncAt } = await readCodeChanges(services, projectId, read.doc).catch(() => ({ changes: [] as CodeChange[], lastSyncAt: null }));
	return {
		teamAvailable: read.teamAvailable,
		doc: trimmed(read.doc),
		revision: read.revision,
		// The server reads an element's name from its own list when an act arrives: only ids travel.
		elements: read.elements.map((e) => ({ ...e, title: '' })),
		team: read.team,
		baselines: read.baselines.map((b) => ({ ...b, content: '' })),
		changes: changes.map((c) => ({ ...c, prompt: sendBackPrompt(c, { name: productName, id: projectId }) })),
		lastSyncAt
	};
}
