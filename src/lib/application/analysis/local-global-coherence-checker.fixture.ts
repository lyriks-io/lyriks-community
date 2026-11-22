import { UNSPA_FEATURE_FORMAT, UNSPA_VERSION, type UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { sectionLoaders, type ProjectSections } from '../specification/project-sections.fixture';
import { LocalGlobalCoherenceChecker } from './local-global-coherence-checker';

/**
 * A project held in memory for the local coherence checker: every section
 * defaults to its empty draft, and each feature id may carry a behavior shell.
 * Test support only: the sections it is given are what the loaders answer.
 */
export interface CoherenceProject extends ProjectSections {
	/** The behavior shell of each feature id; a feature left out has none. */
	readonly shells?: Readonly<Record<string, Record<string, unknown>>>;
	/** The maturity the engine's scorer gives a shell; 90 for any shell, 0 without one, by default. */
	readonly score?: (snapshot: UnspaFeatureSnapshot | null) => number;
}

export function localCoherenceChecker(project: CoherenceProject = {}, projectId = 'p'): {
	checker: LocalGlobalCoherenceChecker;
	/** The feature ids whose shell the checker asked for, in order. */
	shellReads: string[];
} {
	const shellReads: string[] = [];
	const s = sectionLoaders(project, projectId);
	const checker = new LocalGlobalCoherenceChecker(
		s.loadFoundation,
		s.loadUsers,
		s.loadFeatures,
		s.loadExperience,
		s.loadRules,
		s.loadData,
		s.loadArchitecture,
		s.loadGlossary,
		{
			loadFeature: async (_projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> => {
				shellReads.push(featureId);
				const feature = project.shells?.[featureId];
				return feature ? { format: UNSPA_FEATURE_FORMAT, version: UNSPA_VERSION, feature } : null;
			}
		},
		{ score: project.score ?? ((snapshot) => (snapshot ? 90 : 0)) }
	);
	return { checker, shellReads };
}
