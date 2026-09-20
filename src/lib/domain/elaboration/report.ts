import type { ProjectFoundationDraft } from '../foundation';
import type { ProjectFeaturesDraft } from '../features';
import type { ProjectScopeDraft, ProjectCompletionReport } from '../scope';
import type { ProjectUsersDraft } from '../users';

/** Read-only context contracts; authored text never implies human approval. */
export interface ElaborationInput {
	foundation: ProjectFoundationDraft | null;
	scope: ProjectScopeDraft | null;
	users: ProjectUsersDraft | null;
	features: ProjectFeaturesDraft | null;
	completion: ProjectCompletionReport | null;
	/** How many acceptance criteria the MODEL holds per feature, whoever authored
	    them. Null when the model could not be read; a feature missing from the map
	    has no model record yet, and the features draft answers for it. */
	acceptanceCriteriaByFeature: Readonly<Record<string, number>> | null;
	unavailable: readonly string[];
}

export interface ElaborationItem {
	id: string;
	kind: 'question' | 'action';
	priority: 1 | 2 | 3;
	section: string;
	subjectId?: string;
	path: string;
	observation: string;
	prompt: string;
	requiresUserDecision: boolean;
	/** Feature ids that must be resolved before implementing this feature. */
	blockedBy: string[];
	/** Every recommendation is a proposal, not an authored or approved decision. */
	authority: 'proposal';
}

export interface ElaborationReport {
	items: ElaborationItem[];
	counts: { questions: number; actions: number; awaitingDependencies: number };
	completion: Pick<ProjectCompletionReport, 'status' | 'canFinish' | 'auditFresh'> | null;
	limitations: string[];
}

export type AddElaborationItem = (code: string, item: Omit<ElaborationItem, 'id' | 'authority' | 'blockedBy'> & { blockedBy?: string[] }) => void;

export const shortLabel = (value: string): string => value.length > 160 ? value.slice(0, 157) + '...' : value;
