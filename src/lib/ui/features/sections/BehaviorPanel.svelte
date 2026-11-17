<script lang="ts">
	/**
	 * The behavior editor's dedicated view of the Features page, framed on this
	 * project. No tab leads here: it opens from an Edit on a rule or an action in
	 * the tree (or a `?tab=behavior&editor=<route>` link from another page), and
	 * the back arrow in the page heading returns to the tree. The behavior figures it used to show
	 * beside the editor now open from the stats icons of the tree.
	 */
	import { untrack } from 'svelte';
	import BehaviorEditorFrame from './BehaviorEditorFrame.svelte';

	interface Props {
		dashboardProjectId: string | null;
		/** Set at mount by an Edit from the feature tree: the editor opens on this
		    route (null path = the project itself). */
		editorRequest?: { path: string | null } | null;
		/** Whether the caller may open the installation-wide editor. */
		canEdit?: boolean;
	}
	let { dashboardProjectId, canEdit = true, editorRequest = null }: Props = $props();

	// Read once at mount: the request describes how this view was OPENED; later
	// changes must not yank an already-loaded editor around.
	const editorPath = untrack(() => editorRequest?.path ?? null);
</script>

<div class="space-y-3">
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
</div>
