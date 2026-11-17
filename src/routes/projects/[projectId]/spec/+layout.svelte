<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import PageFrame from '$ui/shell/PageFrame.svelte';
	import DiscussionsList from '$ui/spec360/DiscussionsList.svelte';
	import ValidationCard from '$ui/spec360/ValidationCard.svelte';
	import DriftBanner from '$ui/spec360/drift/DriftBanner.svelte';
	import CelebrationDialog from '$ui/spec360/CelebrationDialog.svelte';
	import FinalizeDialog from '$ui/spec360/FinalizeDialog.svelte';
	import { SpecDiscussions, provideDiscussions } from '$ui/spec360/discussions.svelte';
	import { SpecValidation, provideValidation } from '$ui/spec360/validation.svelte';
	import { SpecEdits, provideEdits } from '$ui/spec360/edits.svelte';
	import { SpecSourcesView, provideSources } from '$ui/spec360/sources.svelte';
	import { SpecNewsView, provideSpecNews } from '$ui/spec360/spec-news.svelte';
	import { EditMode, provideEditMode } from '$ui/spec360/edit-mode.svelte';
	import { forgetEditMode, keepEditMode, keptEditMode } from '$ui/spec360/edit-mode-memory.client';
	import { RuleVerdictsStore, setRuleVerdicts } from '$ui/rules/rule-verdicts.svelte';
	import EditModeBar from '$ui/spec360/EditModeBar.svelte';
	import KnowledgeBar from '$ui/spec360/KnowledgeBar.svelte';
	import { sidePlace } from '$ui/shell/side-nav';
	import { providePageBanner } from '$ui/spec360/page/page-banner';
	import { PageScopeSlot, providePageScope } from '$ui/spec360/page-scope.svelte';
	import { provideKnowledgeHead } from '$ui/spec360/knowledge-head';
	import SectionWaiting from '$ui/shell/SectionWaiting.svelte';
	import { sectionWait } from '$ui/shell/section-wait';
	import type { LayoutData } from './$types';

	/**
	 * The Specification 360°: the spec as a knowledge base, from the big
	 * picture to the details, one page at a time, every block discussed, edited
	 * in place and validated by the people it waits on while it is a DRAFT; once
	 * VALIDATED, the reference the code is followed against. This layout holds
	 * the validation progress (or, once validated, the code changed outside
	 * Lyriks), the Edit mode the pages share and the page across the room
	 * right of the navigation, under the three rows that stay at its top: the
	 * product's name with DRAFT and Edit, the tab bar of its chapters and the
	 * band of its standing, where the page on screen reads its validation
	 * (criteria 8e942b12, f480783f; Notices, an entry of the navigation of its
	 * own, carries none), with no foot bar under it (spec: criterion e9d07fcd).
	 * Each page carries its own head, which scrolls with it.
	 */
	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const discussions = provideDiscussions(
		untrack(() => new SpecDiscussions(data.projectId, data.me, data.roster, data.discussions))
	);
	$effect(() => discussions.hydrate(data.discussions));

	const validation = provideValidation(
		new SpecValidation(() => ({
			projectId: data.projectId,
			me: data.person,
			canWrite: data.canWrite,
			teamAvailable: data.validation.teamAvailable,
			doc: data.validation.doc,
			elements: data.validation.elements,
			team: data.validation.team,
			baselines: data.validation.baselines
		}))
	);
	provideEdits(untrack(() => new SpecEdits(data.projectId, () => data.canWrite)));
	provideSources(untrack(() => new SpecSourcesView(data.projectId, () => data.sources)));
	// What the solver says about the rules, kept while the reader moves between features; only Enterprise has one (criterion be4c97ee).
	if (untrack(() => data.proofs)) setRuleVerdicts(untrack(() => new RuleVerdictsStore(data.projectId)));
	// The reader's New and Changed badges, gone from a feature once they open it (criteria 2a6bff42, b0950115).
	provideSpecNews(untrack(() => new SpecNewsView(data.projectId, () => ({ news: data.news, seen: data.seen }))));
	const status = $derived(validation.board.summary.state);
	// The pages read clean until Edit is turned on; only who may edit the draft is offered it (criterion 42cb9176).
	const mode = provideEditMode(
		new EditMode(() => validation.draft && data.canWrite, {
			kept: () => keptEditMode(data.projectId),
			keep: (leftAt) => keepEditMode(data.projectId, leftAt),
			forget: () => forgetEditMode(data.projectId)
		})
	);
	// Back from elsewhere in Lyriks within five minutes, the mode is on as it was left (criterion 76d3a766).
	onMount(() => {
		mode.resume(Date.now());
		return () => mode.leave(Date.now());
	});
	// Under each page's head: what waits on the team, and the discussions asked for.
	providePageBanner(() => banner);
	// What the page on screen is validated on, read in the band at the top of Knowledge (criterion f480783f).
	providePageScope(new PageScopeSlot());

	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	const entry = $derived(sidePlace(page.url.pathname).entry);
	const knowledge = $derived(entry === 'knowledge');
	// Knowledge and Notices open before the product has its specification, and then say why they are empty (criterion 6213ef4c).
	const wait = $derived(knowledge || entry === 'noticed' ? sectionWait(knowledge ? 'knowledge' : 'notices', data.chrome.tabs, data.projectId) : null);
	// Under the rows at the top of Knowledge a page's head scrolls with it (criterion 14a1164c).
	provideKnowledgeHead(() => knowledge);

	// The list of every discussion opens from the Home's "open discussions" link
	// (`?discussions`) and goes with it: opening a thread or a page leaves it.
	const listOpen = $derived(page.url.searchParams.has('discussions'));

	// A link to one thread (Read on the bar of Ask my AI, a notification, the list) opens its panel and lands on the
	// message it names, marked (criterion 0bdc1d4f). Keyed on the link alone: a later post must not pull the reader back to it.
	$effect(() => {
		const threadId = page.url.searchParams.get('discussion');
		const messageId = page.url.searchParams.get('message');
		if (!threadId) return;
		untrack(() => discussions.revealThread(threadId, messageId));
	});

	// Every element validated, still a DRAFT: the team is asked to validate it definitively,
	// until it does or puts the question off for this visit.
	let finalizeLater = $state(false);
	const askFinalize = $derived(
		status === 'draft' && validation.board.complete && validation.source.canWrite && !validation.celebrating && !validation.finalizing && !finalizeLater
	);

</script>

{#snippet banner()}
	{#if status === 'validated'}
		<DriftBanner projectId={data.projectId} changes={data.validation.changes} />
	{:else}
		{#if data.validation.teamAvailable === false}
			<p role="status" class="mb-7 border-l-4 border-orange bg-orange-tint px-4 py-3 text-sm text-orange-ink">Validation is temporarily unavailable. The project team could not be checked. Try again when it is available.</p>
		{:else}
			<ValidationCard />
		{/if}
	{/if}
	{#if listOpen}
		<div class="mb-7"><DiscussionsList {base} /></div>
	{/if}
{/snippet}

<PageFrame wide>
	{#if wait}
		<SectionWaiting title={knowledge ? 'Knowledge' : 'Health'} {wait} />
	{:else}
		{#if knowledge}
			<KnowledgeBar projectId={data.projectId} productName={data.spec.productName} standing={data.chrome.spec} checks={data.chrome.specChecks} />
		{/if}
		<div class="flex flex-col font-evo text-evo-ink">
			{@render children()}
		</div>
	{/if}
</PageFrame>
<EditModeBar />

{#if askFinalize}
	<FinalizeDialog
		total={validation.board.summary.total}
		busy={validation.finalizing}
		onFinalize={() => void validation.finalize()}
		onLater={() => (finalizeLater = true)}
	/>
{/if}
{#if validation.celebrating}
	<CelebrationDialog
		productName={data.spec.productName}
		total={validation.board.summary.total}
		evolutionsHref="/projects/{encodeURIComponent(data.projectId)}/evolution?new"
		onClose={() => (validation.celebrating = false)}
	/>
{/if}
