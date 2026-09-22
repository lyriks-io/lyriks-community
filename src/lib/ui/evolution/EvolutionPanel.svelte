<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import { capabilityById } from '$ui/shell/capabilities';
	import { toastNotifier } from '$ui/composition/client-container';
	import { promptDialog } from '$ui/design-system';
	import { EvolutionStore } from './draft-store.svelte';
	import RequestDossier from './RequestDossier.svelte';
	import BoardReading from './BoardReading.svelte';
	import RequestReading from './RequestReading.svelte';
	import { applyEvolution } from './reading-api';
	import type { EvolutionTabData } from '$lib/server/evolution-tab.server';

	/**
	 * The Evolution tab of the Features capability: the board of change requests,
	 * and one request's reading when the URL names it. Evolution is not a page of
	 * its own (a change is read beside the feature tree it changes), so this panel
	 * is mounted by the Features page and steers through its own query params
	 * (`?tab=evolution[&request=<id>][&view=full]`).
	 */
	interface Props {
		projectId: string;
		data: EvolutionTabData;
		canEdit: boolean;
	}
	let { projectId, data, canEdit }: Props = $props();

	const isAdmin = $derived(data.actor.role === 'admin' || data.actor.role === 'owner');

	/**
	 * The full view keeps the complete dossier on its own store, for the blocks
	 * the reading folds away (the walkthrough, the signatures, the guided fill).
	 * It is mounted only when asked for, so the reading never pays for it.
	 */
	const store = untrack(
		() =>
			new EvolutionStore(
				data.draft,
				data.session,
				toastNotifier,
				data.actor,
				data.revision,
				undefined,
				data.filled,
				data.trlByLeaf,
				data.readings
			)
	);
	$effect(() => {
		store.hydrate(data.draft, data.revision);
	});
	$effect(() => {
		store.readings = data.readings;
		store.trlByLeaf = data.trlByLeaf;
	});
	$effect(() => {
		if (data.fullView && data.reading) store.select(data.reading.dossier.id);
	});

	/** The tab's own URL: the Features page with Evolution active. */
	const base = $derived(`/projects/${projectId}/features?tab=evolution`);
	const openRequest = (id: string) => goto(`${base}&request=${encodeURIComponent(id)}`);
	const backToBoard = () => goto(base);

	async function newRequest() {
		const title = await promptDialog({
			title: 'What is the change?',
			placeholder: 'One line, the way you would say it to a colleague',
			confirmLabel: 'Open the request'
		});
		if (title === null || title.trim() === '') return;
		const id = crypto.randomUUID();
		if (
			await applyEvolution(projectId, [
				{ op: 'open_request', id, title, origin: 'internal_idea', leafIds: [] }
			])
		) {
			await openRequest(id);
		}
	}

	/** A dossier field is edited in the capability that owns it, never here. */
	function openCanonical(section: string) {
		const capability = capabilityById(section);
		const route = capability?.route?.(projectId);
		if (route) void goto(route);
		else toastNotifier.notify('info', `The ${section} section owns this field.`);
	}

	/** Fix now opens the canonical capability at the offending element. */
	function fixNow(target: string) {
		const [capabilityPart] = target.split('/');
		openCanonical(capabilityPart.replace(/^capability:/, ''));
	}
</script>

{#if data.reading && data.fullView && store.selected}
	<RequestDossier
		{store}
		request={store.selected}
		leaves={data.leaves}
		sources={data.sources}
		held={data.held}
		coverage={data.coverage}
		{canEdit}
		onBack={backToBoard}
		onOpenCanonical={openCanonical}
		onFixNow={fixNow}
	/>
{:else if data.reading}
	<RequestReading
		{projectId}
		dossier={data.reading.dossier}
		proposals={data.reading.proposals}
		impacts={data.reading.impacts}
		report={data.reading.report}
		history={data.reading.history}
		leaves={data.leaves}
		members={data.members}
		actorId={data.actor.id}
		{canEdit}
		{isAdmin}
		fullHref={`${base}&request=${encodeURIComponent(data.reading.dossier.id)}&view=full`}
		onBack={backToBoard}
		onFixNow={fixNow}
	/>
{:else}
	<BoardReading cards={data.cards} {canEdit} onOpen={openRequest} onNew={newRequest} />
{/if}

{#if data.fullView}
	<SaveBar saveStatus={store.saveStatus} />
{/if}
