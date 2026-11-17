<script lang="ts">
	/**
	 * The Roadmap, as the Evolution page shows it on its Roadmap tab: the
	 * releases phase by phase with the features scheduled in each. It owns its
	 * features store (the schedule is saved in the features section) and its save
	 * indicator, so the Evolution page only hands it the data its tab loaded.
	 */
	import { untrack } from 'svelte';
	import { FeaturesStore } from '../draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import RoadmapDashboard from './RoadmapDashboard.svelte';
	import type { ProjectFeaturesDraft } from '$domain/features';
	import type { FeatureActionIndex } from '$application/specification/index-feature-actions';
	import type { FeatureImplementationCoverage } from '$application/use-cases';
	import type { Collaborator } from '$domain/team';
	import type { Session } from '$application/ports';

	interface Props {
		draft: ProjectFeaturesDraft;
		revision: number;
		session: Session;
		collaborators: Collaborator[];
		featureActions: FeatureActionIndex;
		implementation: Record<string, FeatureImplementationCoverage>;
	}
	let { draft, revision, session, collaborators, featureActions, implementation }: Props = $props();

	const store = untrack(() => new FeaturesStore(draft, session, toastNotifier, revision));
	$effect(() => store.hydrate(draft, revision));

	const coverage = $derived<ReadonlyMap<string, FeatureImplementationCoverage>>(
		new Map(Object.entries(implementation))
	);
</script>

<RoadmapDashboard {store} {collaborators} {featureActions} implementation={coverage} />

<SaveBar saveStatus={store.saveStatus} coherence={store.coherence} />
