<script lang="ts">
	import type { SpecStanding } from '$lib/shared/app-chrome';
	import Gauge from '$ui/design-system/Gauge.svelte';
	import SlideHighlight from '$ui/design-system/SlideHighlight.svelte';
	import SideIcon from '$ui/shell/SideIcon.svelte';
	import { heightVar } from '$ui/shell/height-var';
	import { shownPath } from '$ui/shell/shown-path.svelte';
	import { sidePlace } from '$ui/shell/side-nav';
	import EditTool from './page/EditTool.svelte';
	import { TAG_DRAFT } from './page/look';
	import { useEditMode } from './edit-mode.svelte';
	import { useEdits } from './edits.svelte';
	import { BETA_TIP, KNOWLEDGE_TABS, specTip, standingBand, versionLine } from './knowledge-bar';
	import { TAG_BETA } from './page/look';
	import { usePageScope, type PageScope } from './page-scope.svelte';
	import { tabAnchors } from '$application/spec360/nav-checks';
	import { pageAsk, standingTip } from './page-validation';
	import { useValidation } from './validation.svelte';
	import './knowledge-rows.css';

	/**
	 * The top of every page of Knowledge (criterion 8e942b12, action 60364635),
	 * three rows in the owner's order that stay in view while the page scrolls
	 * under them: the product's name with its DRAFT tag and Edit right after it
	 * (criterion 41514698); the tab bar of the six chapters, the tab of the page
	 * on screen underlined the moment it is chosen, a chapter all validated
	 * checked green while a draft; then the band of where the specification
	 * stands, VALIDATED with + New change, or DRAFT with what the page on
	 * screen asks of the reader (criterion f480783f: the page hands its scope
	 * through FeatureValidation), the reader's own validations and the whole
	 * specification's count; the version line closes the name's row. On a phone
	 * they scroll with the page.
	 */
	interface Props {
		projectId: string;
		productName: string;
		standing: SpecStanding | null;
		/** The tabs a draft validated (navChecks); null once the specification is validated. */
		checks: readonly string[] | null;
	}
	let { projectId, productName, standing, checks }: Props = $props();

	const validation = useValidation();
	const edits = useEdits();
	const mode = useEditMode();
	const slot = usePageScope();
	// The count takes the validations being saved at once (criterion c509fa9c).
	const summary = $derived(validation.shownBoard.summary);
	const draft = $derived(summary.state === 'draft');
	const band = $derived(standingBand(summary.state, summary));
	const line = $derived(versionLine(standing));
	const base = $derived(`/projects/${encodeURIComponent(projectId)}`);
	const place = $derived(sidePlace(shownPath()));
	const tab = $derived(place.tab);
	// The product's name is the Overview's title; on any other page the page names itself under the rows.
	const overview = $derived(tab === 'overview' && !place.item);
	const checked = $derived(new Set(checks ?? []));

	// What the page on screen is validated on, and what it asks of the reader (criterion f480783f); a page that hands
	// none is counted on what its tab shows, so the count changes with the tab at once (criterion c509fa9c).
	const tabScope = $derived.by((): PageScope | null => {
		if (!tab || tab === 'overview') return null;
		const anchors = tabAnchors(validation.source.elements, tab);
		return anchors.length ? { anchors, sectionId: 'app-scroll', label: 'validation of this tab' } : null;
	});
	const scope = $derived(slot?.scope ?? tabScope);
	const p = $derived(scope ? validation.progressOf(scope.anchors, validation.shownBoard) : null);
	// The element being edited is left out of the one-click validations until Cancel or Save (criterion 42cb9176).
	const open = $derived(scope ? edits.notEditing(scope.anchors) : []);
	const mine = $derived(scope && validation.source.canWrite ? validation.waitingOnMe(open).length : 0);
	const ask = $derived(p ? pageAsk(p, mine) : null);

	let strip = $state<HTMLElement>();
	let placed = $state(false);
</script>

<!-- Its height is published (--kb-head-h) for what lands under it (data-sticky-head, landing-mark). -->
<div class="kbar" class:editing={mode.available && mode.active} data-sticky-head {@attach heightVar('--kb-head-h')}>
	<div class="khead">
		<svelte:element this={overview ? 'h1' : 'p'} class="kname">{productName}</svelte:element>
		{#if draft}<span class={TAG_DRAFT} title={specTip('draft', summary)}>Draft</span>{/if}
		<span class="ktools"><EditTool /></span>
		<!-- The version line, at the row's far right, so the band keeps one line (criterion 8e942b12). -->
		<span class="ver">
			<a href="{base}/retrospec" title={line.title}>{line.text}</a>
			{#if line.byHand}<span title="Changed in the specification by hand since the last Reverse-Specification: the next one reads them">{line.byHand}</span>{/if}
		</span>
	</div>
	<nav bind:this={strip} class="ktabs" aria-label="Knowledge">
		<SlideHighlight container={strip} target={tab ? `[data-tab="${tab}"]` : null} class="kt-hl" radius={0} onPlaced={(placedNow) => (placed = placedNow)} />
		{#each KNOWLEDGE_TABS as t (t.id)}
			<a class="tab" class:on={tab === t.id} class:own={tab === t.id && !placed} href="{base}/spec{t.path}" data-tab={t.id} aria-current={tab === t.id ? 'page' : undefined}
				>{t.label}{#if t.beta}<span class={TAG_BETA} title={BETA_TIP}>Beta</span>{/if}{#if checked.has(t.id)}<span class="chk" title="Validated" aria-label="Validated"><SideIcon name="check" size={12} strokeWidth={2.4} /></span>{/if}</a
			>
		{/each}
	</nav>
	<div class="ksb" class:draft role={scope ? 'group' : 'status'} aria-label={scope?.label} data-page-validation={scope ? true : undefined}>
		<span class="pill">{band.pill}</span>
		{#if draft && ask && p}
			<span class="ask" class:done={ask.done} data-ask>{#if ask.lead}<b>{ask.lead}</b>{' '}{/if}{ask.text}</span>
			{#if p.total > 0}
				<!-- Beside its count: drawn whole, the validated share then the partly validated one (criterion b663dee4). -->
				<span class="pg" title={standingTip(p)}>
					<Gauge
						class="min-w-[64px] flex-1"
						height={4}
						parts={[
							{ value: (100 * p.ok) / p.total, tone: 'bg-evo-green-stroke' },
							{ value: Math.max(0, p.pct - (100 * p.ok) / p.total), tone: 'bg-evo-green-line' }
						]}
						total={100}
					/>
					<span class="num">{p.ok} / {p.total}</span>
				</span>
			{/if}
		{:else}
			<span class="txt">{band.text}</span>
		{/if}
		{#if draft && mine > 0 && scope}
			<span class="acts">
				<button type="button" class="act fill" onclick={() => void validation.validateAll(open, scope.sectionId)}>Validate my {mine}</button>
			</span>
		{/if}
		{#if draft && scope}
			<span class="whole" title="{summary.validated} of {summary.total} elements of the specification validated"
				>Spec <span class="num">{summary.validated} / {summary.total}</span><span class="bar" aria-hidden="true"><i style:width="{band.pct}%"></i></span></span
			>
		{:else if draft}
			<span class="bar" aria-hidden="true"><i style:width="{band.pct}%"></i></span>
		{/if}
		{#if !draft}<a class="newc" href="{base}/evolution?new">+ New change</a>{/if}
	</div>
</div>

<style>
	/* The band's own parts; the rows themselves are in knowledge-rows.css, shared with a change request. */
	.bar {
		display: block;
		flex: none;
		width: 120px;
		height: 6px;
		background: var(--color-toner-2);
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--color-green);
	}
	.ver {
		display: flex;
		flex: none;
		margin-left: auto;
		flex-wrap: wrap;
		gap: 4px 10px;
		color: var(--color-ink-3);
		font: 400 0.6875rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.02em;
	}
	.ver a {
		color: inherit;
		text-decoration: none;
	}
	.ver a:hover {
		color: var(--color-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.newc {
		display: inline-flex;
		flex: none;
		margin-left: auto;
		align-items: center;
		min-height: 30px;
		padding: 0 12px;
		border: 1px solid var(--color-ink);
		background: var(--color-paper);
		box-shadow: 3px 3px 0 var(--color-ink);
		color: var(--color-ink);
		font: 700 0.65625rem/1 var(--font-evo);
		letter-spacing: 0.04em;
		text-decoration: none;
		text-transform: uppercase;
	}
	.newc:hover {
		background: var(--color-toner);
		color: var(--color-ink);
	}
	.ask {
		flex: 0 1 auto;
		min-width: 0;
		color: var(--color-ink-2);
	}
	.ask b {
		color: var(--color-ink);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.ask.done {
		color: var(--color-green-ink);
		font-weight: 600;
	}
	.pg {
		display: flex;
		flex: 1 1 140px;
		align-items: center;
		gap: 8px;
		min-width: 110px;
		max-width: 220px;
	}
	.num {
		color: var(--color-ink-3);
		font: 400 0.71875rem/1.3 var(--font-evo-mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.acts {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-left: auto;
	}
	.act {
		min-height: 28px;
		padding: 0 10px;
		border: 1.5px solid var(--color-ink);
		background: transparent;
		color: var(--color-ink);
		font: 700 0.6875rem/1 var(--font-evo);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
	}
	.act.fill {
		background: var(--color-evo-violet);
		color: #fff;
	}
	.act:disabled {
		cursor: default;
		opacity: 0.4;
	}
	.whole {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 8px;
		color: var(--color-ink-3);
		font: 400 0.6875rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.whole .bar {
		width: 64px;
	}
</style>
