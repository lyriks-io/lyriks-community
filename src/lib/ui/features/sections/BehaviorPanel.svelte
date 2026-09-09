<script lang="ts">
	/**
	 * The Behavior tab: the folded read-only overview and the behavior editor
	 * itself, split by the section's second-level nav.
	 *
	 * The editor used to be a tab of Data & Architecture, which put the two halves
	 * of the same subject on two different screens. It belongs next to the
	 * overview that reflects it: read the model here, edit it one entry away.
	 */
	import { untrack } from 'svelte';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import BehaviorOverview from './BehaviorOverview.svelte';
	import BehaviorEditorFrame from './BehaviorEditorFrame.svelte';
	import type { BehaviorOverview as BehaviorOverviewModel } from '$application/summarize-behavior';
	import type { FeatureAdvice, FeatureImplementationCoverage } from '$application/use-cases';

	/** Which half of the Behavior tab is open. */
	type BehaviorTab = 'overview' | 'editor';

	interface Props {
		overview: BehaviorOverviewModel;
		dashboardProjectId: string | null;
		/** Engine maturity advice, forwarded to the overview. */
		advice?: FeatureAdvice[];
		releases?: { id: string; name: string; version: string; order: number }[];
		assignments?: { featureId: string; releaseId: string }[];
		manualTrl?: ReadonlyMap<string, number>;
		/** Per-leaf code-implementation coverage, forwarded to the overview. */
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
		/** Set at mount by an "open in behavior editor" action from ANOTHER tab
		    (e.g. Rules & edge cases): the panel then opens straight on the
		    embedded editor at this route (null path = the project itself). */
		editorRequest?: { path: string | null } | null;
		/** Whether the caller may open the installation-wide editor. */
		canEdit?: boolean;
	}
	let {
		overview,
		dashboardProjectId,
		canEdit = true,
		advice = [],
		releases = [],
		assignments = [],
		manualTrl = new Map(),
		implementation = new Map(),
		editorRequest = null
	}: Props = $props();

	// Deliberately read once at mount: the request describes how this panel was
	// OPENED; later changes must not yank an already-mounted panel around.
	const initialEditorRequest = untrack(() => editorRequest);

	// The overview reads instantly and is what a `?node=` deep-link anchors into,
	// so it opens first (the editor is one click away), unless another tab's
	// editor action just asked for the editor itself.
	let active = $state<BehaviorTab>(initialEditorRequest ? 'editor' : 'overview');

	// The editor route an "Open behavior editor" action asked for
	// (a feature deep link); null = the project itself.
	let editorPath = $state<string | null>(initialEditorRequest?.path ?? null);
	const openEditor = (path: string | null = null) => {
		editorPath = path;
		active = 'editor';
	};

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Behavior',
			items: [
				{
					id: 'overview',
					label: 'Overview',
					hint: 'What is modelled so far',
					icon: 'layers',
					count: overview.features.length
				},
				{
					id: 'editor',
					label: 'Behavior editor',
					hint: 'Author surfaces & actions',
					icon: 'cpu'
				}
			]
		}
	]);
</script>

<!-- Picking the editor from the nav (rather than a feature row) opens it on the
     project itself, not on whichever feature a row button last deep-linked. -->
<SectionNav
	groups={navGroups}
	{active}
	onSelect={(id) => {
		editorPath = null;
		active = id as BehaviorTab;
	}}
>
	{#if active === 'editor'}
		{#if canEdit}
			<BehaviorEditorFrame {dashboardProjectId} requestedPath={editorPath} />
		{:else}
			<div class="rounded-card border border-line bg-surface p-6">
				<p class="text-sm text-ink-700">
					The shared behavior editor requires an installation administrator. You can continue
					working with your authorized projects in Lyriks.
				</p>
			</div>
		{/if}
	{:else}
		<BehaviorOverview
			{overview}
			{dashboardProjectId}
			{advice}
			{releases}
			{assignments}
			{manualTrl}
			{implementation}
			onOpenEditor={openEditor}
		/>
	{/if}
</SectionNav>
