import type { ProjectFoundationDraft } from '$domain/foundation';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { ProjectScopeDraft, ProjectCompletionReport } from '$domain/scope';
import type { ProjectUsersDraft } from '$domain/users';
import type { BehaviorOverview } from '../specification/summarize-behavior';
import type { FeatureCoverageReaderPort } from './feature-coverage-reader';

interface Reader<T> { execute(projectId: string): Promise<T> }

/** Read-only inputs; no authoring, approval or persistence capability is exposed. */
export interface ProjectElaborationPorts {
	foundation: Reader<ProjectFoundationDraft>;
	scope: Reader<ProjectScopeDraft>;
	users: Reader<ProjectUsersDraft>;
	features: Reader<ProjectFeaturesDraft>;
	completion: Reader<ProjectCompletionReport>;
	/** The model's own reading, which is where a feature's acceptance criteria live
	    whoever wrote them: the panel's, projected, and an AI client's, authored. */
	behavior: Reader<BehaviorOverview>;
	/** What the code holds of each feature: whether it is built is read here, never written by hand. */
	coverage: FeatureCoverageReaderPort;
	modelRevision: { fingerprint(projectId: string): Promise<string> };
}
