<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	import type { RetroNote as Note, RetroReading, RetroTab, RetroTabKey } from '$domain/retrospec';
	import { primary48, SECONDARY_48, PRIMARY_44 } from '$ui/evolution/evo-look';
	import ActionAccordion from './ActionAccordion.svelte';
	import FeatureGroups from './FeatureGroups.svelte';
	import ItemCard from './ItemCard.svelte';
	import RetroNote from './RetroNote.svelte';
	import UsersTab from './UsersTab.svelte';
	import { flagChip } from './look';
	import { useReview } from './review.svelte';

	/**
	 * The validation, tab by tab: the note, how far the review is, the items set
	 * aside or shared, the tabs with their counts, the items of the open tab
	 * (the next one to validate reads violet), and the bar that moves on, ending
	 * on the publication of the specification.
	 */
	interface Props {
		reading: RetroReading;
		tab: RetroTab;
		note: Note;
		noteKey: string;
		flagsOpen: boolean;
		published: boolean;
		busy: boolean;
		onTab: (key: RetroTabKey, itemId?: string) => void;
		onFlags: (open: boolean) => void;
		onBackToReport: () => void;
		onPublish: () => void;
	}
	let { reading, tab, note, noteKey, flagsOpen, published, busy, onTab, onFlags, onBackToReport, onPublish }: Props = $props();

	const review = useReview();
	const all = $derived(reading.tabs.flatMap((t) => t.items));
	const views = $derived(new Map(all.map((i) => [i.id, review.view(i.id)])));
	const handled = $derived(all.filter((i) => views.get(i.id)?.handled).length);
	const later = $derived(all.filter((i) => views.get(i.id)?.state === 'later').length);
	const shared = $derived(all.filter((i) => views.get(i.id)?.state === 'shared').length);
	const flagged = $derived(all.filter((i) => ['later', 'shared'].includes(views.get(i.id)?.state ?? '')));
	const tabLabel = (key: string) => reading.tabs.find((t) => t.key === key)?.label ?? key;

	const tabHandled = (t: RetroTab) => t.items.filter((i) => views.get(i.id)?.handled).length;
	const index = $derived(reading.tabs.findIndex((t) => t.key === tab.key));
	const prev = $derived(index > 0 ? reading.tabs[index - 1] : null);
	const next = $derived(index < reading.tabs.length - 1 ? reading.tabs[index + 1] : null);
	const tabDone = $derived(tabHandled(tab) === tab.items.length);
	const nextId = $derived(tab.items.find((i) => !views.get(i.id)?.handled)?.id ?? null);
	const nextLabel = $derived(next ? `Next: ${next.label} →` : published ? 'Published ✓' : 'Finish and publish the spec');
	const goNext = () => (next ? onTab(next.key) : onPublish());

	const TAB_ON = 'bg-evo-gradient font-bold text-white shadow-evo-tab';
	const TAB_OFF = 'bg-transparent font-semibold text-evo-tab-text';
</script>

<div class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-4">
	<RetroNote {note} readKey={noteKey} cta="I’ve read it, let’s validate" onGo={(t) => onTab(t as RetroTabKey)} />

	<div class="flex flex-wrap items-center gap-4 rounded-evo-card border border-evo-line bg-white px-5 py-4">
		<span class="font-bold">{handled} / {all.length} validated</span>
		<Gauge parts={[{ value: handled, tone: 'bg-evo-green-stroke' }]} total={all.length} counts track="bg-evo-grey" class="flex-[1_1_200px]" />
		<span class=" bg-evo-orange-soft px-2.5 py-1 text-[0.8125rem] font-semibold text-evo-orange">⚑ {later} to review</span>
		<span class=" bg-evo-violet-soft px-2.5 py-1 text-[0.8125rem] font-semibold text-evo-violet-ink">↗ {shared} shared</span>
		<button type="button" class="min-h-10 rounded-lg border border-evo-control bg-white px-3.5 text-sm font-semibold text-evo-ink" aria-expanded={flagsOpen} onclick={() => onFlags(!flagsOpen)}>Pending points</button>
	</div>

	{#if flagsOpen}
		<div class="flex animate-lk-in-fast flex-col gap-1.5 rounded-evo-card border border-evo-orange-line bg-white px-5 py-4">
			<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-orange">ITEMS TO REVIEW OR SHARED</span>
			{#each flagged as item (item.id)}
				{@const chip = flagChip(views.get(item.id)!)}
				<button type="button" class="flex min-h-11 flex-wrap items-center gap-3 border-b border-evo-line-soft py-1.5 text-left" onclick={() => onTab(item.tab, item.id)}>
					<span class="w-[60px] font-evo-mono text-xs text-evo-muted">{item.ref}</span>
					<span class="flex-[1_1_260px]">{item.title}</span>
					<span class="text-xs text-evo-muted">{tabLabel(item.tab)}</span>
					{#if chip}<span class=" px-[9px] py-[3px] text-xs font-semibold {chip.look}">{chip.text}</span>{/if}
				</button>
			{:else}
				<span class="text-sm text-evo-muted">None for now. Use “Not sure…” on an item to set it aside.</span>
			{/each}
		</div>
	{/if}

	<nav aria-label="Specification sections" class="flex flex-wrap gap-1 rounded-2xl border border-evo-tab-line bg-white p-1.5 max-[760px]:flex-nowrap max-[760px]:overflow-x-auto">
		{#each reading.tabs as t (t.key)}
			{@const done = tabHandled(t)}
			{@const on = t.key === tab.key}
			<button type="button" class="flex min-h-12 flex-[1_1_120px] flex-col items-center justify-center rounded-evo-btn px-2.5 py-1 max-[760px]:flex-none {on ? TAB_ON : TAB_OFF}" aria-current={on ? 'page' : undefined} onclick={() => onTab(t.key)}>
				<span class="text-sm font-semibold">{t.label}</span>
				<span class="text-xs {on ? 'text-white/90' : done === t.items.length ? 'font-semibold text-evo-green' : 'text-evo-muted'}">{done} / {t.items.length}</span>
			</button>
		{/each}
	</nav>

	{#if tab.key === 'foundations'}
		<div class="flex flex-col gap-5">
			{#each tab.items as item (item.id)}<ItemCard {item} shape="numbered" next={item.id === nextId} />{/each}
		</div>
	{:else if tab.key === 'features' && tab.featureGroups}
		<FeatureGroups groups={tab.featureGroups} {nextId} />
	{:else if tab.key === 'actions' && tab.actionFeatures}
		<ActionAccordion features={tab.actionFeatures} {nextId} />
	{:else if tab.key === 'users' && tab.users}
		<UsersTab users={tab.users} {nextId} />
	{:else}
		<div class="flex flex-col gap-3">
			{#each tab.items as item (item.id)}<ItemCard {item} shape="ref" next={item.id === nextId} datamap={tab.datamap ?? null} />{/each}
		</div>
	{/if}

	<div id="retro-tab-foot" class="flex flex-wrap items-center justify-between gap-2.5">
		<button type="button" class={SECONDARY_48} onclick={() => (prev ? onTab(prev.key) : onBackToReport())}>{prev ? `← ${prev.label}` : '← Back to report'}</button>
		{#if tabDone}
			<div class="flex animate-[lk-in_0.25s_ease_both] flex-wrap items-center justify-end gap-2.5 rounded-evo-btn border border-evo-green-line bg-evo-green-soft py-2 pr-2 pl-3.5">
				<span class="text-sm font-semibold text-evo-green">{tab.label} validated.</span>
				<button type="button" class={PRIMARY_44} disabled={busy || (!next && published)} onclick={goNext}>{nextLabel}</button>
			</div>
		{:else}
			<button type="button" class="{primary48(false)} transition-colors duration-300" disabled={busy || (!next && published)} onclick={goNext}>{nextLabel}</button>
		{/if}
	</div>
</div>
