import type { Patches } from './dossier-overlay';

/** All changed answers of one displayed page, sent as one request batch. */
export interface PageChanges {
	readonly operations: Record<string, unknown>[];
	readonly patches: Patches;
}

export interface PageEditor {
	pageChanges(): PageChanges;
}

export interface PageDiagramDraft {
	readonly value: string;
	readonly redraw: boolean;
	readonly invalid: boolean;
}

export function mergePageChanges(changes: readonly PageChanges[]): PageChanges {
	return {
		operations: changes.flatMap((change) => change.operations),
		patches: Object.assign({}, ...changes.map((change) => change.patches))
	};
}

export function pageChangeCount(changes: PageChanges): number {
	return changes.operations.reduce((count, operation) => count + (
		operation.op === 'update_need' || operation.op === 'update_request'
			? Object.keys(operation).filter((key) => key !== 'op' && key !== 'requestId').length
			: 1
	), 0);
}
