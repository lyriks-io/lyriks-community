<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		FIX_TO_CONFIRM_KEY,
		FIX_TO_CONFIRM_LABEL,
		FIX_TO_CONFIRM_MEANING,
		ORIGIN_FILTERS,
		fixesWord,
		noticedGroups,
		noticedTypeKey,
		showsUnder,
		type NoticedPoint,
		type NoticedView,
		type OriginFilter
	} from '$application/spec360/noticed';
	import { Icon, ScoreCount, floatInView, portalWhile } from '$ui/design-system';
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import EarsText from '$ui/glossary/EarsText.svelte';
	import FindingDecision from '../FindingDecision.svelte';
	import FixDecision from '../FixDecision.svelte';
	import OriginTag from './OriginTag.svelte';
	import SummaryBar from '../page/SummaryBar.svelte';
	import { BIG, LIST, META, MORE, POINT, POP, QUIET } from '../page/look';
	import { PRIMARY } from '../page/tools';
	import { dismissable } from '$ui/shell/dismissable';
	import type { FindingDecisions } from './finding-decisions.svelte';

	/**
	 * What Lyriks noticed, on its page (criteria 14be32d5, 4189e074, 55a7fe86): how many
	 * points are left to review of all of them, settled against waiting on one
	 * bar, then every point, non-blocking included and the heaviest first,
	 * narrowed by severity and grouped by type: one folded line per type,
	 * saying on hover what the type means (criterion 4996a6b4); an opened type
	 * lists its first ten points with their decisions (criterion e0f69b3c),
	 * the rest one click away; a title opens the point in its drawer, which the
	 * page draws outside its animated column (a transformed ancestor would
	 * hold a fixed drawer inside it). The design's review (.ly-review, .ly-point):
	 * the big number over a 1.5px ink rule, each point a bold title on its
	 * severity square, Reject quiet beside New evolution filled, then where it stands in mono.
	 * A type named by the page's address (`?type=dead-end`, the Overview's summary) opens unfolded,
	 * brought into view. Points are ticked to compose one evolution (criterion 3f977777): a bar at the
	 * foot of the screen counts them in like a game score, opens a new request on them all or, while one is still open
	 * to changes, adds them to it. Each point says where its problem lies (criterion c86ea441), a filter beside the
	 * severity narrows to it; the fixes waiting for confirmation read apart under Fix to confirm, after the types, in
	 * none of the counts (criterion 2a55c3e7).
	 */
	interface Props {
		view: NoticedView;
		decisions: FindingDecisions;
		writable: boolean;
		onOpen: (findingId: string) => void;
		/** The key of the type to open and bring into view (noticedTypeKey). */
		focus?: string | null;
	}
	let { view, decisions, writable, onOpen, focus = null }: Props = $props();

	/** The points an opened type lists before its "Show the other points"; a fold that would hide one point hides none. */
	const FOLD = 10;
	const foldedAway = (n: number) => (n - FOLD > 1 ? n - FOLD : 0);
	/** The types opened, and the opened types shown whole, by name: every type starts folded. */
	let opened = $state<ReadonlySet<string>>(new Set());
	let whole = $state<ReadonlySet<string>>(new Set());
	const flip = (set: ReadonlySet<string>, label: string) => {
		const next = new Set(set);
		if (!next.delete(label)) next.add(label);
		return next;
	};
	/** Every point is listed, non-blocking included (criterion 4189e074): the list narrows by severity. */
	type Severity = 'all' | 'major' | 'minor';
	let severity = $state<Severity>('all');
	const SEVERITIES: readonly { key: Severity; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'major', label: 'Major' },
		{ key: 'minor', label: 'Minor' }
	];
	/** Where the problem lies (criterion c86ea441): the second narrowing, combined with the severity. */
	let origin = $state<OriginFilter>('all');
	const ofSeverity = (p: NoticedPoint, key: Severity) => key === 'all' || p.finding.tone === key;
	const filtered = $derived(view.points.filter((p) => ofSeverity(p, severity) && showsUnder(p, origin)));
	const typeDomId = (label: string) => `noticed-type-${noticedTypeKey(label)}`;

	// The type the address names opens, every severity shown, and comes into view under the page's head.
	$effect(() => {
		const key = focus;
		if (!key) return;
		untrack(() => {
			if (key === FIX_TO_CONFIRM_KEY) {
				void tick().then(() => document.getElementById(FIXES_DOM_ID)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' }));
				return;
			}
			const group = noticedGroups(view.points).find((g) => noticedTypeKey(g.kind.label) === key);
			if (!group) return;
			severity = 'all';
			origin = 'all';
			opened = new Set([...opened, group.kind.label]);
			void tick().then(() => document.getElementById(typeDomId(group.kind.label))?.scrollIntoView({ behavior: scrollMotion(), block: 'start' }));
		});
	});
	const groups = $derived(noticedGroups(filtered));
	/** What Pick all takes: every point of the severity shown a request can settle, folded types included (criterion 780c62df). */
	const pickable = $derived(writable ? filtered.filter((p) => decisions.canPick(p)) : []);
	const allPicked = $derived(pickable.length > 0 && pickable.every((p) => decisions.isPicked(p)));
	/** A list of one type has nothing to fold it against: it reads open. */
	const isOpen = (label: string) => groups.length === 1 || opened.has(label);
	const countOf = (key: Severity) => view.points.filter((p) => ofSeverity(p, key) && showsUnder(p, origin)).length;
	const originCount = (key: OriginFilter) => view.points.filter((p) => ofSeverity(p, severity) && showsUnder(p, key)).length;
	const FIXES_DOM_ID = `noticed-type-${FIX_TO_CONFIRM_KEY}`;
	const toFixes = () => document.getElementById(FIXES_DOM_ID)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
	// Read live from the page, so a decision taken in the drawer reads there at once.
	const pending = $derived(view.points.filter((p) => decisions.stateOf(p) === 'pending'));
	const settled = $derived(view.points.length - pending.length);
	const major = $derived(pending.filter((p) => p.finding.tone === 'major').length);
	const minor = $derived(pending.length - major);

	/**
	 * Where the point stands in the spec, its type left to the group that names it;
	 * a point of the final check says how far it reaches (criterion ad34b2f4).
	 */
	const where = (p: NoticedPoint) =>
		[p.finding.where === p.finding.kind.label ? '' : p.finding.where, p.finding.unconfirmed ? p.finding.reach : ''].filter(Boolean).join(' · ');
	const pointsWord = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

	/** The points ticked to compose one evolution, whatever type or severity shows them. */
	const pickedPoints = $derived(writable ? decisions.pickedOf(view.points) : []);
	const composing = $derived(decisions.composing(view.points));
	let targetsOpen = $state(false);
	$effect(() => {
		if (pickedPoints.length === 0) targetsOpen = false;
	});
</script>

<div class={LIST}>
	<div class="flex flex-wrap items-center gap-5 border-b-[1.5px] border-ink px-5 py-[18px]">
		<div class="min-w-[150px]">
			<div class={BIG}>{pending.length}</div>
			<div class={META}>to review, of {view.total}</div>
			{#if view.toConfirm.length > 0}
				<!-- Counted apart: a fix waiting for confirmation is not a point to review (criterion 2a55c3e7). -->
				<button type="button" class="mt-0.5 cursor-pointer border-0 bg-transparent p-0 text-left {META} underline decoration-dotted underline-offset-4 hover:text-evo-ink" onclick={toFixes}
					>{fixesWord(view.toConfirm.length)}</button
				>
			{/if}
		</div>
		<SummaryBar
			total={view.total}
			segments={[{ value: settled, color: 'var(--color-green)', label: 'settled' }]}
			rest={{ value: pending.length, label: 'to review' }}
			dots={[
				{ value: major, color: 'var(--color-evo-major)', label: 'major' },
				{ value: minor, color: 'var(--color-evo-minor)', label: 'minor' }
			]}
		/>
	</div>
	<div class="flex flex-wrap items-center gap-1.5 border-b border-evo-line-soft px-[18px] py-2.5" role="group" aria-label="Narrow the points by severity">
		{#each SEVERITIES as option (option.key)}
			{@const on = severity === option.key}
			<button
				type="button"
				aria-pressed={on}
				class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border-[1.5px] px-2.5 font-evo-mono text-[0.75rem] font-semibold transition-colors duration-150 {on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink'}"
				onclick={() => (severity = option.key)}
			>
				{#if option.key !== 'all'}<span class="size-2 flex-none {option.key === 'major' ? 'bg-evo-major' : 'bg-evo-minor'}" aria-hidden="true"></span>{/if}
				{option.label}
				<span class={on ? 'text-paper/70' : 'text-evo-muted'}>{countOf(option.key)}</span>
			</button>
		{/each}
		<!-- Where the problem lies, beside the severity (criterion c86ea441). -->
		<span class="mx-1.5 h-6 w-px flex-none bg-evo-line-soft max-[700px]:hidden" aria-hidden="true"></span>
		<span class="contents" role="group" aria-label="Narrow the points by where the problem lies">
			{#each ORIGIN_FILTERS as option (option.key)}
				{@const on = origin === option.key}
				<button
					type="button"
					aria-pressed={on}
					class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border-[1.5px] px-2.5 font-evo-mono text-[0.75rem] font-semibold transition-colors duration-150 {on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink'}"
					onclick={() => (origin = option.key)}
				>
					{option.label}
					<span class={on ? 'text-paper/70' : 'text-evo-muted'}>{originCount(option.key)}</span>
				</button>
			{/each}
		</span>
		{#if pickable.length > 0}
			<button
				type="button"
				class="ml-auto inline-flex min-h-8 cursor-pointer items-center border-[1.5px] border-line bg-paper px-2.5 font-evo-mono text-[0.75rem] font-semibold text-ink transition-colors duration-150 hover:border-ink"
				title={allPicked ? 'Untick the points shown' : 'Tick every point shown that an evolution can settle'}
				onclick={() => (allPicked ? decisions.clearPicksOf(pickable) : decisions.pickAll(pickable))}>{allPicked ? 'Clear all' : `Pick all ${pickable.length}`}</button
			>
		{/if}
	</div>
	<ul class="m-0 list-none p-0">
		{#each groups as group (group.kind.label)}
			{@const open = isOpen(group.kind.label)}
			{@const hidden = whole.has(group.kind.label) ? 0 : foldedAway(group.points.length)}
			<li id={typeDomId(group.kind.label)} class="scroll-mt-36 border-t border-evo-line-soft first:border-t-0">
				<h3 class="m-0">
					<!-- One line per type, the meaning in the app's tooltip on hover or focus (criterion 4996a6b4). -->
					<button
						type="button"
						class="flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-[18px] py-2.5 text-left text-evo-ink transition-colors duration-150 hover:bg-evo-hover {open ? 'bg-evo-hover' : ''}"
						aria-expanded={open}
						title={group.kind.meaning}
						onclick={() => (opened = flip(opened, group.kind.label))}
					>
						<Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} class="flex-none text-evo-muted" />
						<span class="min-w-0 flex-1 {POINT}">{group.kind.label}</span>
						<span class="flex flex-none items-center gap-3 {META}">
							{#if group.major > 0}<span class="inline-flex items-center gap-1.5" aria-label="{group.major} major"><span class="size-2 bg-evo-major" aria-hidden="true"></span>{group.major}</span>{/if}
							{#if group.minor > 0}<span class="inline-flex items-center gap-1.5" aria-label="{group.minor} minor"><span class="size-2 bg-evo-minor" aria-hidden="true"></span>{group.minor}</span>{/if}
							<span class="min-w-[5.5rem] text-right">{pointsWord(group.points.length)}</span>
						</span>
					</button>
				</h3>
				{#if open}
					<ul class="m-0 list-none border-t border-evo-line-soft bg-paper/40 p-0">
						{#each hidden > 0 ? group.points.slice(0, FOLD) : group.points as p, i (p.finding.id)}
							{@const standing = decisions.stateOf(p)}
							<li class="relative flex items-start gap-3 border-t border-evo-line-soft py-3 pr-[18px] pl-11 first:border-t-0 {i >= FOLD ? 'animate-lk-in-fast' : ''} {decisions.isPicked(p) ? 'bg-blue-tint/60' : ''}">
								{#if writable && decisions.canPick(p)}
									<!-- Ticked, the point joins the evolution being composed (criterion 3f977777). -->
									<button
										type="button"
										class="absolute top-[13px] left-[18px] grid size-[18px] cursor-pointer place-items-center border-[1.5px] p-0 {decisions.isPicked(p) ? 'border-blue-ink bg-blue-ink text-paper' : 'border-ink-3 bg-paper text-transparent hover:border-ink'}"
										role="checkbox"
										aria-checked={decisions.isPicked(p)}
										aria-label="Pick this point for an evolution"
										title={decisions.isPicked(p) ? 'Picked for an evolution' : 'Pick this point to compose an evolution with others'}
										onclick={() => decisions.togglePick(p)}><Icon name="check" size={12} /></button
									>
								{/if}
								<span
									class="mt-[7px] size-2.5 flex-none {p.finding.tone === 'major' ? 'bg-evo-major' : 'bg-evo-minor'}"
									role="img"
									aria-label={p.finding.tone === 'major' ? 'Major impact' : 'Minor impact'}
								></span>
								<div class="min-w-0 flex-1">
									<button
										type="button"
										class="cursor-pointer border-0 bg-transparent p-0 text-left {POINT} hover:text-evo-violet {standing === 'rejected' ? 'text-ink-3 line-through' : 'text-evo-ink'}"
										title={p.finding.hint}
										aria-haspopup="dialog"
										onclick={() => onOpen(p.finding.id)}
										>{#if p.finding.ears}<EarsText text={p.finding.ears} />{:else}{p.finding.text}{/if}</button
									>
									<div class="mt-2 flex flex-wrap items-center gap-1.5">
										<FindingDecision point={p} {decisions} {writable} {composing} />
										{#if p.finding.origin}<OriginTag origin={p.finding.origin} means={p.finding.originLine} />{/if}
										{#if where(p)}<span class="ml-1 {META}">· {where(p)}</span>{/if}
									</div>
								</div>
							</li>
						{/each}
						{#if foldedAway(group.points.length) > 0}
							<li class="border-t border-evo-line-soft">
								<button
									type="button"
									class="block min-h-11 w-full cursor-pointer border-0 bg-transparent pr-[18px] pl-11 text-left {MORE} hover:bg-evo-hover"
									aria-expanded={whole.has(group.kind.label)}
									onclick={() => (whole = flip(whole, group.kind.label))}
									>{hidden > 0 ? `Show the ${hidden} other ${hidden === 1 ? 'point' : 'points'}` : 'Show fewer'}</button
								>
							</li>
						{/if}
					</ul>
				{/if}
			</li>
		{/each}
		{#if groups.length === 0 && view.points.length > 0}
			<li class="px-[18px] py-3.5 {META}">No point matches what is picked above.</li>
		{/if}
	</ul>
	{#if view.toConfirm.length > 0}
		<!-- Apart from the points and in none of their counts: each fix is confirmed or reopened (criterion 2a55c3e7). -->
		<section id={FIXES_DOM_ID} class="scroll-mt-36 border-t-[1.5px] border-ink" aria-label={FIX_TO_CONFIRM_LABEL}>
			<h3 class="m-0 flex min-h-12 items-center gap-2.5 px-[18px] py-2.5" title={FIX_TO_CONFIRM_MEANING}>
				<span class="min-w-0 flex-1 {POINT}">{FIX_TO_CONFIRM_LABEL}</span>
				<span class="{META} min-w-[5.5rem] text-right">{pointsWord(view.toConfirm.length)}</span>
			</h3>
			<ul class="m-0 list-none border-t border-evo-line-soft bg-paper/40 p-0">
				{#each view.toConfirm as p (p.finding.id)}
					<li class="flex items-start gap-3 border-t border-evo-line-soft py-3 pr-[18px] pl-11 first:border-t-0">
						<div class="min-w-0 flex-1">
							<button
								type="button"
								class="cursor-pointer border-0 bg-transparent p-0 text-left {POINT} text-evo-ink hover:text-evo-violet"
								title={p.finding.hint}
								aria-haspopup="dialog"
								onclick={() => onOpen(p.finding.id)}>{p.finding.text}</button
							>
							{#if p.finding.fix?.note}<p class="m-0 mt-1 line-clamp-2 text-[0.875rem] leading-snug whitespace-pre-line text-evo-ink-2">{p.finding.fix.note}</p>{/if}
							<div class="mt-2 flex flex-wrap items-center gap-1.5">
								<FixDecision point={p} {decisions} {writable} />
								{#if p.finding.origin}<OriginTag origin={p.finding.origin} means={p.finding.originLine} />{/if}
								<span class="ml-1 {META}">· {p.finding.where}</span>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#if pickedPoints.length > 0}
	<!-- The evolution being composed (criterion 3f977777): how many points, then a new request on them or an open one to add them to.
	     Portalled under body: the page fades in with a transform, which would hold a fixed bar at the foot of the list, out of view. -->
	<div class="contents" use:portalWhile={true}>
	<div
		role="region"
		aria-label="Points picked for an evolution"
		class="animate-lk-in-fast fixed bottom-[calc(20px+var(--app-foot-h,0px)+env(safe-area-inset-bottom,0px))] left-[calc(50%+var(--side-w,0px)/2)] z-[80] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-3 border-2 border-ink bg-paper py-2.5 pr-3 pl-4 text-[0.8125rem] text-ink shadow-[4px_4px_0_var(--color-blue)]"
	>
		<!-- The count arrives like a game score, the first point included, large over the room of two digits; the words keep
		     the room of "points picked": ticking a point never resizes the bar (criterion 3f977777). -->
		<b class="inline-flex items-center gap-2 font-evo-mono font-bold"
			><ScoreCount value={pickedPoints.length} from={0} reserve={2} class="text-[1.375rem]" /><span class="min-w-[13ch]"
				>{pickedPoints.length === 1 ? 'point' : 'points'} picked</span
			></b
		>
		<button type="button" class={PRIMARY} onclick={() => void decisions.evolveMany(view.points)}>New change</button>
		<!-- Offered only while a request is still open to changes: with none, New evolution stands alone, never a greyed button. -->
		{#if view.targets.length > 0}
			<span class="relative" {@attach dismissable(() => (targetsOpen = false))}>
				<button
					type="button"
					class="pressable inline-flex h-9 cursor-pointer items-center gap-1.5 border-[1.5px] border-ink bg-paper px-3.5 font-evo text-[0.6875rem] font-bold tracking-[0.07em] text-ink uppercase"
					aria-haspopup="menu"
					aria-expanded={targetsOpen}
					title="Add the picked points to an evolution still open to changes"
					onclick={() => (targetsOpen = !targetsOpen)}>Add to an evolution<span class="inline-flex rotate-180" aria-hidden="true"><Icon name="chevron-down" size={13} /></span></button
				>
				{#if targetsOpen}
					<span role="menu" use:floatInView={{ prefer: 'above' }} class="flex max-h-72 w-[340px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto py-1 {POP}">
						{#each view.targets as target (target.id)}
							<button
								type="button"
								role="menuitem"
								class="flex min-h-10 w-full cursor-pointer items-baseline gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-[0.8125rem] text-ink hover:bg-toner-1"
								onclick={() => ((targetsOpen = false), void decisions.addTo(target, view.points))}
								><span class="flex-none font-evo-mono text-xs font-bold text-blue-ink">{target.key}</span><span class="min-w-0 truncate">{target.title || 'Untitled request'}</span></button
							>
						{/each}
					</span>
				{/if}
			</span>
		{/if}
		<button type="button" class="{QUIET} min-h-8 cursor-pointer border-0 bg-transparent text-[0.6875rem] font-bold tracking-[0.07em] uppercase" onclick={() => decisions.clearPicks()}>Clear</button>
	</div>
	</div>
{/if}
