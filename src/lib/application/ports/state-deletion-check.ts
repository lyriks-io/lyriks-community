export interface StateDeletionVerdict {
	readonly coherent: boolean;
	readonly scope: 'feature';
	readonly statePath: string;
	readonly inconsistencies: readonly { code: string; message: string; nodeIds: readonly string[] }[];
}

/** Pure formal check of an explicit deletion in the supplied current feature. */
export interface StateDeletionCheckPort {
	checkStateDeletion(projectId: string, feature: unknown, surfaceId: string, stateDefinitionId: string): Promise<StateDeletionVerdict | null>;
}
