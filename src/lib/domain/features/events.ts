export type FeaturesEvent =
	| { type: 'features.field.changed'; field: string }
	| { type: 'features.autosaved'; savedAt: string }
	| { type: 'features.local_coherence.computed'; score: number; issues: string[] }
	| { type: 'features.tab.switched'; tab: string }
	| {
			type: 'features.feature.added';
			featureId: string;
			coreId: string;
			parentFamilyId: string | null;
	  }
	| { type: 'features.feature.removed'; featureId: string }
	| { type: 'features.feature.moved'; featureId: string; fromCoreId: string; toCoreId: string }
	| { type: 'features.mvp.changed'; featureId: string; tier: string | null }
	| { type: 'features.phase.assigned'; featureId: string; phaseId: string }
	| { type: 'features.step.completed'; to: string };
