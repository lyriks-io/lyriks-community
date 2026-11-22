<script lang="ts">
	import { mintUuid } from '$ui/shell/mint-id';
	import { goto } from '$app/navigation';
	import { capabilityById } from '$ui/shell/capabilities';
	import { toastNotifier } from '$ui/composition/client-container';
	import BoardReading from './BoardReading.svelte';
	import ConcurrentReport from './ConcurrentReport.svelte';
	import NewEvolution from './NewEvolution.svelte';
	import { page } from '$app/state';
	import RequestReading from './RequestReading.svelte';
	import { applyEvolution } from './reading-api';
	import { OptimisticActs } from './optimistic-acts.svelte';
	import type { EvolutionTabData } from '$lib/server/evolution-tab.server';
	import { hasProductToChange } from '$domain/evolution';

	/**
	 * The Evolution page: the board of change requests, and one request's reading
	 * when the URL names it (`/evolution[?request=<id>]`). There is one reading of
	 * a request, and every act on it goes through the same guarded operations the
	 * MCP uses.
	 */
	interface Props {
		projectId: string;
		data: EvolutionTabData;
		canEdit: boolean;
	}
	let { projectId, data, canEdit }: Props = $props();

	const isAdmin = $derived(data.actor.role === 'admin' || data.actor.role === 'owner');

	/** The page's own URL, the board; a request is named by `?request=`. */
	const base = $derived(`/projects/${projectId}/evolution`);
	const openRequest = (id: string) => goto(`${base}?request=${encodeURIComponent(id)}`);
	const backToBoard = () => goto(base);

	/**
	 * A request deleted from its page: the board shows at once without it while
	 * the deletion saves (ac-evo-form-edit-optimistic); one the server refuses
	 * opens the request again, its reason said.
	 */
	const deleted = new OptimisticActs<true>();
	const cards = $derived(data.cards.filter((c) => !deleted.of(c.id)));
	async function deleteRequest(id: string): Promise<boolean> {
		void goto(base);
		const ok = await deleted.run(id, true, () => applyEvolution(projectId, [{ op: 'delete_request', requestId: id }], { what: 'the deletion of the request' }), () => data.cards);
		if (!ok) void openRequest(id);
		return ok;
	}

	/** An evolution changes a product its specification describes: none starts while it holds no feature (criterion 40bef6da). */
	const hasProduct = $derived(hasProductToChange(data.leaves.length));
	/** "New evolution" opens its own page in place of the list (the design's New evolution). */
	// `?new` opens it directly (the first steps link here), once there is a product to change.
	let creating = $state(page.url.searchParams.has('new'));
	const productName = $derived((page.data as { projectName?: string }).projectName ?? 'this');
	/**
	 * From scratch: the request opens on its first question, its editor open
	 * (`start`). Not optimistic: its page is the server's reading of it (its key,
	 * its steps), which exists only once the server wrote it.
	 */
	async function create(title: string): Promise<boolean> {
		const id = mintUuid();
		const ok = await applyEvolution(projectId, [{ op: 'open_request', id, title, origin: 'internal_idea', leafIds: [] }], { what: 'the new evolution' });
		if (ok) {
			creating = false;
			await goto(`${base}?request=${encodeURIComponent(id)}&start=1`);
		}
		return ok;
	}

	/** A suggestion becomes an evolution: the server words it from its deferred line (criterion 03b7eacf). */
	async function startSuggestion(lineId: string) {
		const id = mintUuid();
		if (await applyEvolution(projectId, [{ op: 'open_request', id, deferredLineId: lineId, leafIds: [] }], { what: 'the new evolution' })) await goto(`${base}?request=${encodeURIComponent(id)}`);
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

{#if data.concurrent}
	<ConcurrentReport report={data.concurrent} {projectId} {canEdit} onBack={backToBoard} />
{:else if data.reading}
	<RequestReading
		{projectId}
		dossier={data.reading.dossier}
		proposals={data.reading.proposals}
		proposalFates={data.reading.proposalFates}
		impacts={data.reading.impacts}
		proposes={data.reading.proposes}
		report={data.reading.report}
		history={data.reading.history}
		fieldVersions={data.reading.fieldVersions}
		decisionLog={data.reading.decisionLog}
		closing={data.reading.closing}
		leaves={data.leaves}
		members={data.members}
		actorId={data.actor.id}
		{canEdit}
		{isAdmin}
		onBack={backToBoard}
		onDelete={() => deleteRequest(data.reading!.dossier.id)}
		onFixNow={fixNow}
	/>
{:else if creating && hasProduct}
	<NewEvolution
		{projectId}
		{productName}
		known={data.cards.map((c) => c.id)}
		onCreate={create}
		onOpen={(id) => {
			creating = false;
			void openRequest(id);
		}}
		onCancel={() => (creating = false)}
	/>
{:else}
	<BoardReading
		{cards}
		suggestions={data.suggestions}
		{canEdit}
		{productName}
		actorId={data.actor.id}
		members={data.members}
		{hasProduct}
		specHref="/projects/{projectId}/spec"
		retroHref="/projects/{projectId}/retrospec"
		onOpen={openRequest}
		onConcurrent={(ids) => goto(`${base}?concurrent=${ids.map(encodeURIComponent).join(',')}`)}
		onNew={() => (creating = true)}
		onOpenLine={(href) => goto(href)}
		onStart={startSuggestion}
	/>
{/if}

