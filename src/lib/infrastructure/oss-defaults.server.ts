import type {
	BackLicenceSyncPort,
	BackSystemProbePort,
	FormalVerdictPort,
	KnowledgeGraphProviderPort,
	ProjectMirrorPort,
	WorkspaceDirectoryPort,
	WorkspaceMemberNamePort,
	WorkspaceSummary
} from '$application/ports';
import { GraphBuilder, type KnowledgeGraph } from '$domain/graph';

/**
 * The open-source defaults for every port the Enterprise overlay may replace:
 * a single operator, no companion service. Each one answers the way the
 * callers already treat "nothing there", so the composition never branches.
 */

export class NoProjectMirror implements ProjectMirrorPort {
	readonly enabled = false;
	async ensureProject(): Promise<string | null> {
		return null;
	}
	async pushEnvelope(): Promise<'failed'> {
		return 'failed';
	}
	async propagateProject(): Promise<void> {}
	async propagateFeature(): Promise<void> {}
	async deleteProject(): Promise<void> {}
}

export class NoLicenceSync implements BackLicenceSyncPort {
	readonly enabled = false;
	async sync(): Promise<boolean> {
		return false;
	}
}

export class NoBackProbe implements BackSystemProbePort {
	async probe(): Promise<null> {
		return null;
	}
}

export class NoFormalVerdict implements FormalVerdictPort {
	async fetchFormalCoherence(): Promise<null> {
		return null;
	}
}

/** `?source=engine` on a build with no formal engine: an honest empty graph. */
export class EmptyKnowledgeGraphProvider implements KnowledgeGraphProviderPort {
	constructor(private readonly nowIso: () => string) {}
	async build(projectId: string): Promise<KnowledgeGraph> {
		return new GraphBuilder().build(projectId, this.nowIso());
	}
}

/** One operator, no organisations to list or to create. */
export class NoWorkspaceDirectory implements WorkspaceDirectoryPort {
	async listForCaller(): Promise<WorkspaceSummary[]> {
		return [];
	}
	async createForCaller(): Promise<WorkspaceSummary | null> {
		return null;
	}
	async renameForCaller(): Promise<WorkspaceSummary | null> {
		return null;
	}
}

export class NoMemberName implements WorkspaceMemberNamePort {
	async nameOf(): Promise<string> {
		return '';
	}
}
