<script lang="ts">
	import { anchorOf } from '$domain/discussions';
	import type { NoticedPoint } from '$application/spec360/noticed';
	import { DrawerSection, SideDrawer } from '$ui/design-system';
	import FindingDecision from '../FindingDecision.svelte';
	import TopicThreads from '../TopicThreads.svelte';
	import { BTN, KICK, LINK, QUIET } from '../page/look';
	import { useDiscussions } from '../discussions.svelte';
	import type { FindingDecisions } from './finding-decisions.svelte';

	/**
	 * A point Lyriks noticed, opened from its title (criterion 14be32d5): what
	 * it is, where it applies, where it comes from and what can be done, then
	 * the decision its row carries (criterion e0f69b3c), the way to its feature
	 * and Close. An issue keeps its discussion here: Discuss it or ask your AI
	 * opens its thread, where Ask your AI hands it to the reader's AI.
	 */
	interface Props {
		point: NoticedPoint | null;
		decisions: FindingDecisions;
		writable: boolean;
		/** Several points are picked: the point's own decisions wait, as on its row (criterion e241c011). */
		composing?: boolean;
		/** A feature's page. */
		featureHref: (featureId: string) => string;
		onClose: () => void;
	}
	let { point: asked, decisions, writable, composing = false, featureHref, onClose }: Props = $props();
	const discussions = useDiscussions();
	// The point stays drawn while the drawer slides out, so it never empties under the reader's eyes.
	let held = $state<NoticedPoint | null>(null);
	$effect.pre(() => {
		if (asked) held = asked;
	});
	const point = $derived(asked ?? held);

	// The sheet's own sections, but the one that says where to find it again: the reader is there.
	const SKIPPED = new Set(['IN SHORT', 'WHERE YOU FIND IT AGAIN']);
	const sheet = $derived(point?.finding.sheet ?? null);
	const short = $derived(sheet?.sections.find((s) => s.heading === 'IN SHORT')?.text ?? point?.finding.hint ?? '');
	const sections = $derived(sheet?.sections.filter((s) => !SKIPPED.has(s.heading)) ?? []);
	const issueId = $derived(point?.finding.decision?.issueId ?? null);
	const anchor = $derived(issueId ? anchorOf('finding', issueId) : null);
	const discussed = $derived(!!anchor && discussions.threads(anchor).length > 0);
	let talking = $state(false);
	const standing = $derived(point ? decisions.stateOf(point) : 'pending');
	const decides = $derived(!!point && (standing !== 'pending' || (writable && (point.canReject || point.canEvolve))));

	$effect(() => {
		// Each point opens on its own discussion state.
		void point?.finding.id;
		talking = false;
	});
</script>

<SideDrawer open={!!asked} {onClose} alert kicker={sheet?.kicker} title={sheet?.title ?? ''} label="Point Lyriks noticed">
	{#if point && sheet}
		{#if short}<p class="m-0 mt-1 leading-[1.65]">{short}</p>{/if}
		{#each sections as s (s.heading)}
			<DrawerSection title={s.heading}>
				{#if s.text}<div>{s.text}</div>{/if}
				{#each s.list ?? [] as item, i (i)}
					<div><span class="text-evo-muted">{item.k}</span> · {item.v}</div>
				{/each}
			</DrawerSection>
		{/each}
		{#if decides}
			<div class="mt-6 mb-2 {KICK}">Decision</div>
			<div class="flex flex-wrap items-center gap-1.5">
				<FindingDecision {point} {decisions} {writable} {composing} main />
			</div>
		{/if}
		{#if anchor && standing === 'pending'}
			<div class="mt-5 flex flex-col gap-2">
				{#if !discussed}
					<button type="button" class="{LINK} self-start px-0" aria-expanded={talking} onclick={() => (talking = !talking)}>Discuss it or ask your AI</button>
				{/if}
				{#if talking || discussed}
					<div class="animate-lk-in-fast"><TopicThreads {anchor} title={sheet.title} /></div>
				{/if}
			</div>
		{/if}
	{/if}
	{#snippet foot()}
		{#if point?.finding.featureId}
			<a class={BTN} href={featureHref(point.finding.featureId)} onclick={onClose}>Open the feature →</a>
		{/if}
		<button type="button" class={QUIET} onclick={onClose}>Close</button>
	{/snippet}
</SideDrawer>
