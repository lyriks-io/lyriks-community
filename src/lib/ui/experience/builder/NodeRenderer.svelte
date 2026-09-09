<script lang="ts">
	import { tick } from 'svelte';
	import { Icon } from '$ui/design-system';
	import IconifyIcon from '@iconify/svelte';
	import { isPrototypeIcon } from '$lib/ui/icons/prototype-icons';
	import {
		flexClasses,
		flexMaxWidthPx,
		childNodes,
		hasInteractionFor,
		isInteractiveBuilderKind,
		isPanelPresentation,
		isRunClickable,
		isWiredElement,
		collectionKey,
		findCollection,
		generateRows,
		primaryFields,
		fieldKey,
		resolveRowText,
		rowContext,
		selectOptions,
		visibilityDismissValue,
		type BuilderNode,
		type ElementAppearance,
		type FlexProps,
		type RowContext,
		type TransitionTrigger
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import Self from './NodeRenderer.svelte';
	import type { RunController } from './run-types';

	interface Props {
		store: ExperienceStore;
		nodeId: string;
		/** 'design' = author/select; 'run' = interpret transitions/scenarios. */
		mode?: 'design' | 'run';
		/** Run-mode controller (only in run mode). */
		run?: RunController;
		/** When set, this subtree is a LIST ROW TEMPLATE — labels resolve `{Field}`
		 *  against this row's data, interactions act ON that row, and per-row field
		 *  values are kept apart by its key. Threaded down to every descendant. */
		rowCtx?: RowContext | null;
		/** True when this node is a component ROOT rendered inside an instance box.
		 *  A component root is a plain flex item of the instance group, so inside a
		 *  row instance it would only get its content width (a top bar component
		 *  then never spans the screen). Filling the instance box by default keeps
		 *  the instance node in charge of sizing; an explicit appearance.width on
		 *  the root still wins. */
		fillInstance?: boolean;
	}
	let { store, nodeId, mode = 'design', run, rowCtx = null, fillInstance = false }: Props = $props();
	const rowScope = $derived(rowCtx?.row ?? null);
	// Per-row field slot: one authored input rendered in N rows keeps N values.
	const rowKey = $derived(rowCtx?.key ?? null);
	// Design mode has no run state, so a `select` previews its choices against the
	// same seeded rows the canvas shows for lists.
	const designCollections = $derived(
		Object.fromEntries(
			store.draft.builder.collections.map((c) => [collectionKey(c.name), generateRows(c)])
		)
	);
	let renaming = $state(false);
	let renameInput = $state<HTMLInputElement | null>(null);

	const node = $derived<BuilderNode | undefined>(store.draft.builder.nodes[nodeId]);
	const selected = $derived(store.selectedBuilderNodeId === nodeId);
	// Global, per-type interaction styling from the design system (not per node).
	const theme = $derived(store.draft.builder.theme);

	// ── Group presentation / reuse (groups only) ──────────────────────────────
	const g = $derived(node && node.kind === 'group' ? node : null);
	const presentation = $derived(g?.presentation ?? 'inline');
	// Reuse: a group can render another surface's tree (a LibraryComponent),
	// authored once via its own root and referenced anywhere.
	const includeRootId = $derived(
		g?.componentId ? (store.draft.builder.screenRoots[g.componentId] ?? null) : null
	);
	const componentName = $derived(
		g?.componentId ? (store.draft.components.find((c) => c.id === g.componentId)?.name ?? 'Component') : ''
	);
	// Tabs/sidebar: child GROUPS are the panels; the active index lives in a state path.
	const tabPanels = $derived(
		g && isPanelPresentation(presentation)
			? childNodes(store.draft.builder, g.id).filter((c) => c.kind === 'group')
			: []
	);
	const tabsPath = $derived(g ? g.tabsKey || `tabs.${g.id}` : '');
	// Design mode keeps its own active tab so the canvas matches run output
	// (one visible panel) while staying editable.
	let designTab = $state(0);
	const activeTab = $derived(
		Math.min(
			Math.max(
				0,
				mode === 'run' && run ? Math.floor(Number(run.stateValue(tabsPath)) || 0) : designTab
			),
			Math.max(0, tabPanels.length - 1)
		)
	);
	function pickTab(i: number) {
		if (mode === 'run' && run) run.setState(tabsPath, i);
		else designTab = i;
	}
	// Selecting a node from the tree switches to the panel that contains it.
	$effect(() => {
		if (mode !== 'design' || tabPanels.length === 0) return;
		const selectedId = store.selectedBuilderNodeId;
		if (!selectedId) return;
		let cur: BuilderNode | undefined = store.draft.builder.nodes[selectedId];
		while (cur) {
			const panelIndex = tabPanels.findIndex((p) => p.id === cur!.id);
			if (panelIndex >= 0) {
				designTab = panelIndex;
				return;
			}
			cur = cur.parentId ? store.draft.builder.nodes[cur.parentId] : undefined;
		}
	});

	// Display text: in Run mode, resolve `{state.path}` placeholders live; in
	// design mode show the raw template so authors see what they wrote.
	const disp = (label: string, fallback: string): string => {
		const base = label || fallback;
		// Inside a list row template, resolve `{Field}` against the row first.
		if (rowScope)
			return mode === 'run' && run
				? run.resolveRow(base, rowScope)
				: resolveRowText(base, rowScope, {}, {});
		return mode === 'run' && run ? run.resolve(base) : base;
	};

	// A group's appearance.color CASCADES: children default their text colors to
	// the theme vars, so re-pointing --sim-ink/--sim-muted at the group color (with
	// a softened muted) recolors every descendant heading/text/list row in one
	// patch — the dark-sidebar case — while explicit child colors still win.
	// Min card width per requested column count — an `auto-fit` grid then packs as
	// many as fit, so 3 columns on a laptop degrade to 2 then 1 on narrow screens
	// without a media query.
	function gridMinPx(columns: number | undefined): number {
		const c = Math.max(1, Math.min(4, Math.round(columns ?? 3)));
		return { 1: 640, 2: 320, 3: 220, 4: 170 }[c] ?? 220;
	}

	function groupColorCascade(color: string): string {
		return `color:${color};--sim-ink:${color};--sim-muted:color-mix(in srgb,${color} 62%,transparent)`;
	}

	// Container surface CSS: an explicit `flex.background` wins; a `card` group
	// otherwise paints the theme surface (with border + shadow); a plain group is
	// transparent. Shared by the inline group and the overlay panel so both honor
	// a per-container color.
	function groupSurfaceCss(flex: FlexProps): string {
		if (flex.card)
			return `background:${flex.background || 'var(--sim-surface)'};border:var(--sim-border-width,1px) solid var(--sim-border);box-shadow:var(--sim-shadow-card,0 1px 3px rgba(0,0,0,0.06))`;
		return flex.background ? `background:${flex.background}` : '';
	}

	function select(e: MouseEvent) {
		if (mode !== 'design') return;
		e.stopPropagation();
		store.selectBuilderNode(nodeId);
	}

	function startRename(e: MouseEvent) {
		if (mode !== 'design' || node?.kind !== 'element') return;
		e.preventDefault();
		e.stopPropagation();
		store.selectBuilderNode(nodeId);
		renaming = true;
	}

	$effect(() => {
		if (!renaming || !renameInput) return;
		void tick().then(() => {
			renameInput?.focus();
			renameInput?.select();
		});
	});

	// Run-mode gating: hidden nodes render nothing, disabled render inert.
	const gate = $derived(
		mode === 'run' && run ? run.gateOf(nodeId, rowCtx) : { visible: true, enabled: true }
	);

	function fire(trigger: TransitionTrigger) {
		if (mode === 'run' && run && gate.enabled) run.interact(nodeId, trigger, rowCtx);
	}

	// Dismiss a `menu` group: write the value that falsifies its visibleWhen, the
	// same state the trigger toggles. Fired by the outside click-catcher AND by any
	// bubbled item click (run-mode leaves don't stop propagation; fields do, so a
	// search input inside a menu keeps it open).
	function dismissMenu() {
		if (mode !== 'run' || !run || !g?.visibleWhen?.path) return;
		run.setState(g.visibleWhen.path, visibilityDismissValue(g.visibleWhen));
	}

	type BtnVariant = 'primary' | 'secondary' | 'ghost';
	const BTN_VARIANTS: BtnVariant[] = ['primary', 'secondary', 'ghost'];
	// Button hierarchy: an explicit `variant` wins; otherwise infer from position —
	// a lone button is the primary CTA, and when a group holds several the first is
	// primary and the rest secondary, so a row/stack of actions reads like a real
	// screen instead of N identical filled blocks.
	function buttonVariant(n: BuilderNode): BtnVariant {
		if (n.kind !== 'element') return 'primary';
		if (n.variant && BTN_VARIANTS.includes(n.variant as BtnVariant)) return n.variant as BtnVariant;
		if (!n.parentId) return 'primary';
		const siblings = childNodes(store.draft.builder, n.parentId).filter(
			(c) => c.kind === 'element' && c.elementKind === 'button'
		);
		if (siblings.length <= 1) return 'primary';
		return siblings[0].id === n.id ? 'primary' : 'secondary';
	}
	function buttonStyle(variant: BtnVariant, blocked: boolean): string {
		if (blocked) return 'background:var(--sim-border);color:var(--sim-muted);box-shadow:none';
		if (variant === 'primary')
			return 'background:var(--sim-accent);color:var(--sim-on-accent);box-shadow:var(--sim-shadow-raised,0 1px 2px rgba(0,0,0,0.14))';
		if (variant === 'secondary')
			return 'background:var(--sim-surface);color:var(--sim-ink);border:1px solid var(--sim-border)';
		return 'background:transparent;color:var(--sim-accent)';
	}

	function elementLayoutStyle(a?: ElementAppearance): string {
		if (!a) return '';
		const align: Record<string, string> = {
			start: 'flex-start',
			center: 'center',
			end: 'flex-end',
			stretch: 'stretch'
		};
		return [
			a.width === 'full' ? 'width:100%' : a.width === 'fit' ? 'width:fit-content' : '',
			a.align && a.align !== 'auto' ? `align-self:${align[a.align]}` : '',
			a.textAlign ? `text-align:${a.textAlign}` : '',
			a.fontSize !== undefined ? `font-size:${a.fontSize}px` : '',
			a.fontWeight !== undefined ? `font-weight:${a.fontWeight}` : '',
			a.color ? `color:${a.color}` : '',
			a.opacity !== undefined ? `opacity:${a.opacity}` : ''
		]
			.filter(Boolean)
			.join(';');
	}

	// A GROUP's width intent inside a flex parent. Without this a column nested in a
	// row only ever gets its content width, so a page's main column stays narrow next
	// to a sidebar (and a card grid inside it can never use more than one column).
	// `min-width:0` keeps the growing child from being pushed out by long content.
	function groupWidthStyle(a?: ElementAppearance): string {
		if (a?.width === 'full') return 'flex:1 1 0%;min-width:0';
		if (a?.width === 'fit') return 'flex:0 0 auto';
		return '';
	}

	function elementBoxStyle(a?: ElementAppearance): string {
		if (!a) return '';
		return [
			a.gradient
				? `background:linear-gradient(${a.gradient.angle ?? 135}deg,${a.gradient.from},${a.gradient.to})`
				: a.background
					? `background:${a.background}`
					: '',
			a.borderColor ? `border-color:${a.borderColor}` : '',
			a.borderWidth !== undefined ? `border-style:solid;border-width:${a.borderWidth}px` : '',
			a.radius !== undefined ? `border-radius:${a.radius}px` : '',
			a.maxWidth !== undefined ? `max-width:${a.maxWidth}px;width:100%` : '',
			a.paddingX !== undefined ? `padding-left:${a.paddingX}px;padding-right:${a.paddingX}px` : '',
			a.paddingY !== undefined ? `padding-top:${a.paddingY}px;padding-bottom:${a.paddingY}px` : '',
			a.shadow ? 'box-shadow:var(--sim-shadow-overlay,0 8px 24px rgba(15,23,42,0.16))' : ''
		]
			.filter(Boolean)
			.join(';');
	}

	// An input is "required" when it carries a required validation rule — surfaced
	// as a `*` next to its label in both editor and run mode.
	function isRequired(n: BuilderNode): boolean {
		return n.kind === 'element' && n.wiring.validations.some((v) => v.kind === 'required');
	}
</script>

{#if node && (mode !== 'run' || gate.visible)}
	{#if node.kind === 'group'}
		{#if presentation === 'overlay' && mode === 'run' && run && g?.visibleWhen}
			<!-- Modal/overlay: a scrim + centered panel. The outer guard above only
			     renders this while the group's visibleWhen holds, so toggling that
			     state opens/closes it like a real dialog. Floating only with a live
			     runtime AND a visibleWhen to control it; otherwise (static preview,
			     or an author who has not wired the toggle yet) it renders inline so
			     a position:fixed scrim can never cover the page unclosably. -->
			<div class="fixed inset-0 z-40 grid place-items-center p-4" style="background:rgba(15,23,42,0.45)">
				<div
					class="{flexClasses(node.flex)} max-h-[90%] overflow-auto"
					style="gap:calc(var(--sim-space) * {node.flex.gap});padding:calc(var(--sim-space) * {node.flex.padding});border-radius:var(--sim-radius-card);background:{node.flex.background || 'var(--sim-surface)'};border:var(--sim-border-width,1px) solid var(--sim-border);box-shadow:var(--sim-shadow-overlay,0 18px 50px rgba(0,0,0,0.28));width:100%;max-width:{node.flex.maxWidth !== 'none' ? flexMaxWidthPx(node.flex.maxWidth) : '440px'}"
				>
					{#if includeRootId}
						<Self {store} nodeId={includeRootId} {mode} {run} {rowCtx} fillInstance />
					{/if}
					{#each childNodes(store.draft.builder, node.id) as child (child.id)}
						<Self {store} nodeId={child.id} {mode} {run} {rowCtx} />
					{/each}
				</div>
			</div>
		{:else if presentation === 'menu' && mode === 'run' && run && g?.visibleWhen}
			<!-- Dropdown menu: a zero-width, row-tall anchor at the group's slot, an
			     invisible click-catcher over the whole frame (click outside = dismiss)
			     and the panel dropping below the anchor. Right-aligned by default (the
			     header-right user-menu case); appearance.align:'start' opens rightward.
			     The outer visibleWhen guard opens/closes it, exactly like an overlay. -->
			<div class="relative self-stretch" style="width:0">
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (backdrop mirrors native menu light-dismiss; Escape/tab order stay with the trigger) -->
				<div class="fixed inset-0 z-30" onclick={dismissMenu} aria-hidden="true"></div>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (bubbled item clicks dismiss after the item handled them) -->
				<div
					role="menu"
					tabindex={-1}
					class="{flexClasses(node.flex)} absolute z-40 max-h-80 overflow-auto"
					onclick={dismissMenu}
					style="top:calc(100% + 6px);{node.appearance?.align === 'start'
						? 'left:0'
						: 'right:0'};min-width:200px;width:max-content;max-width:320px;gap:calc(var(--sim-space) * {node.flex.gap});padding:calc(var(--sim-space) * {Math.max(1, node.flex.padding)});border-radius:var(--sim-radius-card);background:{node.flex.background || 'var(--sim-surface)'};border:var(--sim-border-width,1px) solid var(--sim-border);box-shadow:var(--sim-shadow-overlay,0 12px 32px rgba(15,23,42,0.18)){node.appearance
						? ';' + elementBoxStyle(node.appearance)
						: ''}"
				>
					{#if includeRootId}
						<Self {store} nodeId={includeRootId} {mode} {run} {rowCtx} fillInstance />
					{/if}
					{#each childNodes(store.draft.builder, node.id) as child (child.id)}
						<Self {store} nodeId={child.id} {mode} {run} {rowCtx} />
					{/each}
				</div>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (role and tabindex switch together in design mode) -->
			<div
				role={mode === 'design' ? 'button' : 'group'}
				tabindex={mode === 'design' ? 0 : undefined}
				onclick={mode === 'design' ? select : undefined}
				onkeydown={mode === 'design'
					? (e) => {
							if (e.key === 'Enter') select(e as unknown as MouseEvent);
						}
					: undefined}
				class="{flexClasses(node.flex)} relative text-left {mode === 'design'
					? selected
						? 'min-h-[44px] outline outline-2 outline-brand-400'
						: 'min-h-[44px] outline-dashed outline-1 outline-transparent hover:outline-brand-200'
					: ''} transition-[outline]"
				style="gap:calc(var(--sim-space) * {node.flex.gap});padding:calc(var(--sim-space) * {node.flex.padding});border-radius:var(--sim-radius-card){groupSurfaceCss(node.flex)
					? ';' + groupSurfaceCss(node.flex)
					: ''}{node.flex.maxWidth !== 'none'
					? `;width:100%;max-width:${flexMaxWidthPx(node.flex.maxWidth)};margin-left:auto;margin-right:auto`
					: ''}{node.parentId === null ? ';min-height:100%' : ''}{node.appearance
					? ';' + elementBoxStyle(node.appearance) + (groupWidthStyle(node.appearance) ? ';' + groupWidthStyle(node.appearance) : '') + (node.appearance.color ? `;${groupColorCascade(node.appearance.color)}` : '')
					: ''}{fillInstance && node.appearance?.width === undefined ? ';flex:1 1 0%;min-width:0' : ''}"
			>
				<!-- design-mode badges float above the group so selecting a node never
				     shifts the layout being designed (WYSIWYG stays true) -->
				{#if mode === 'design' && (selected || presentation !== 'inline' || includeRootId)}
					<span class="pointer-events-none absolute -top-2.5 left-1.5 z-10 flex gap-1">
						{#if selected}
							<span class="inline-flex items-center gap-1 rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
								<Icon name="layers" size={9} />{node.label}
							</span>
						{/if}
						{#if presentation !== 'inline' || includeRootId}
							<span
								class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm"
								style="background:color-mix(in srgb,var(--sim-accent) 16%,var(--sim-surface));color:var(--sim-accent)"
							>
								{includeRootId
									? `Component: ${componentName}`
									: presentation === 'overlay'
										? 'Overlay'
										: presentation === 'sidebar'
											? 'Sidebar'
											: presentation === 'menu'
												? 'Menu'
												: 'Tabs'}
							</span>
						{/if}
					</span>
				{/if}

				{#if presentation === 'sidebar'}
					<!-- Aside nav from child-group labels; clicking a menu item swaps the
					     active panel (same tabsKey state as tabs, different chrome). The
					     inner row wraps, so on a phone the menu stacks above the panel. -->
					<div
						class="flex min-w-0 flex-1 flex-row flex-wrap items-stretch"
						style="gap:calc(var(--sim-space) * {Math.max(1, node.flex.gap)})"
					>
						<nav class="flex shrink-0 flex-col gap-1" style="min-width:168px" aria-label={node.label}>
							{#each tabPanels as panel, i (panel.id)}
								<button
									type="button"
									aria-current={i === activeTab ? 'page' : undefined}
									onclick={(e) => {
										e.stopPropagation();
										pickTab(i);
									}}
									class="sim-navitem flex items-center gap-2 px-3 py-2 text-left text-[13px] font-medium transition-colors"
									style="border-radius:var(--sim-radius-button);{i === activeTab
										? 'background:color-mix(in srgb,var(--sim-accent) 14%,transparent);color:var(--sim-accent)'
										: ''}"
								>{panel.label || `Item ${i + 1}`}</button>
							{/each}
						</nav>
						<div class="min-w-0 flex-1" style="flex-basis:16rem">
							{#if tabPanels[activeTab]}
								<Self {store} nodeId={tabPanels[activeTab].id} {mode} {run} {rowCtx} />
							{:else if mode === 'design'}
								<span class="select-none px-2 py-1 text-[11px] italic" style="color:var(--sim-muted)">
									Add a group inside - each child group becomes a nav panel.
								</span>
							{/if}
						</div>
					</div>
				{:else if presentation === 'tabs'}
					<!-- Tab bar from child-group labels; clicking sets the active index. -->
					<div
						role="tablist"
						class="flex flex-wrap gap-1"
						style="border-bottom:1px solid var(--sim-border)"
					>
						{#each tabPanels as panel, i (panel.id)}
							<button
								type="button"
								role="tab"
								aria-selected={i === activeTab}
								onclick={(e) => {
									e.stopPropagation();
									pickTab(i);
								}}
								class="-mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors"
								style="border-color:{i === activeTab ? 'var(--sim-accent)' : 'transparent'};color:{i === activeTab ? 'var(--sim-accent)' : 'var(--sim-muted)'}"
							>{panel.label || `Tab ${i + 1}`}</button>
						{/each}
					</div>
					<!-- One visible panel in BOTH modes, so the design canvas matches run
					     output. Clicking a tab (or selecting in the tree) switches panels. -->
					{#if tabPanels[activeTab]}
						<Self {store} nodeId={tabPanels[activeTab].id} {mode} {run} {rowCtx} />
					{:else if mode === 'design'}
						<span class="select-none px-2 py-1 text-[11px] italic" style="color:var(--sim-muted)">
							Add a group inside - each child group becomes a tab panel.
						</span>
					{/if}
				{:else if includeRootId}
					<Self {store} nodeId={includeRootId} {mode} {run} {rowCtx} fillInstance />
				{:else}
					{#each childNodes(store.draft.builder, node.id) as child (child.id)}
						<Self {store} nodeId={child.id} {mode} {run} {rowCtx} />
					{:else}
						{#if mode === 'design'}
							<span class="select-none px-2 py-1 text-[11px] italic" style="color:var(--sim-muted)">Empty group</span>
						{/if}
					{/each}
				{/if}
			</div>
		{/if}
	{:else}
		<!-- element leaf -->
		{@const runDisabled = mode === 'run' && !gate.enabled}
		{@const runClickable = isRunClickable(node)}
		{@const interactiveLeaf = mode === 'design' || (runClickable && !runDisabled)}
		<!-- Display kinds that carry click behavior (a wired pill, icon, image, stat
		     tile) get the theme's link hover effect, so the action is discoverable
		     without hunting; buttons/links/fields keep their own affordances. -->
		{@const hoverFx =
			mode === 'run' && runClickable && !runDisabled && !isInteractiveBuilderKind(node.elementKind)
				? `sim-actionable sim-hover-${theme.hover.link}`
				: ''}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (role and tabindex are derived from the same interaction state) -->
		<div
			role={interactiveLeaf ? 'button' : undefined}
			tabindex={interactiveLeaf ? 0 : undefined}
			aria-disabled={runDisabled || undefined}
			onclick={interactiveLeaf
				? (e) => {
						select(e);
						fire('click');
					}
				: undefined}
			ondblclick={mode === 'design' ? startRename : undefined}
			onkeydown={interactiveLeaf ? (e) => e.key === 'Enter' && fire('click') : undefined}
			onmouseenter={() => {
				if (node.kind === 'element' && hasInteractionFor(node, 'hover')) fire('hover');
			}}
			class="{interactiveLeaf ? 'cursor-pointer' : 'cursor-default'} {mode === 'design' && selected
				? 'outline outline-2 outline-brand-400'
				: ''} relative rounded {hoverFx} {runDisabled ? 'pointer-events-none opacity-40' : ''}"
			style={elementLayoutStyle(node.appearance)}
		>
			<!-- design-mode wired marker: behavior is otherwise invisible on the
			     canvas, so authors can't tell a clickable badge from a plain one -->
			{#if mode === 'design' && isWiredElement(node)}
				<span
					class="pointer-events-none absolute -right-1.5 -top-1.5 z-10 grid size-4 place-items-center rounded-full shadow-sm"
					style="background:color-mix(in srgb,var(--sim-accent) 16%,var(--sim-surface));color:var(--sim-accent)"
					title={`Wired: ${[
						node.wiring.transitions.length &&
							`${node.wiring.transitions.length} transition(s)`,
						node.wiring.scenarios.length && `${node.wiring.scenarios.length} scenario(s)`,
						node.wiring.binding?.targetRef &&
							`${node.wiring.binding.targetKind}:${node.wiring.binding.targetRef}`
					]
						.filter(Boolean)
						.join(' · ')}`}
				>
					<Icon name="bolt" size={9} />
				</span>
			{/if}
			{#if mode === 'design' && renaming}
				<input
					bind:this={renameInput}
					value={node.label}
					onclick={(e) => e.stopPropagation()}
					ondblclick={(e) => e.stopPropagation()}
					oninput={(e) => store.renameBuilderNode(node.id, e.currentTarget.value)}
					onblur={() => (renaming = false)}
					onkeydown={(e) => {
						e.stopPropagation();
						if (e.key === 'Enter' || e.key === 'Escape') {
							e.preventDefault();
							renaming = false;
						}
					}}
					class="w-full rounded border border-brand-300 bg-surface px-2 py-1 text-sm font-medium text-ink-900 outline-none shadow-[0_0_0_3px_rgba(124,58,237,0.12)]"
				/>
			{:else if node.elementKind === 'heading'}
				<p class="font-bold leading-tight tracking-tight" style="font-size:var(--sim-heading-size,1.25rem);color:{node.appearance?.color ?? 'var(--sim-ink)'};{elementBoxStyle(node.appearance)}">{disp(node.label, 'Heading')}</p>
			{:else if node.elementKind === 'text'}
				{@const body = disp(node.label, 'Body text')}
				{#if node.variant === 'pill'}
					<!-- Badge/pill in one call: accent-tinted chip by default; appearance
					     background/color/radius override (later inline declarations win). -->
					<span
						class="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold leading-relaxed"
						style="border-radius:999px;background:color-mix(in srgb,var(--sim-accent) 14%,transparent);color:{node
							.appearance?.color ?? 'var(--sim-accent)'};{elementBoxStyle(node.appearance)}"
					>{body}</span>
				{:else if body.includes('\n')}
					<!-- Multi-line text (e.g. a console/log) preserves line breaks. -->
					<pre class="m-0 whitespace-pre-wrap text-[13px] leading-relaxed" style="color:{node.appearance?.color ?? 'var(--sim-muted)'};font-family:var(--sim-font);{elementBoxStyle(node.appearance)}">{body}</pre>
				{:else}
					<p class="text-[13px] leading-relaxed" style="color:{node.appearance?.color ?? 'var(--sim-muted)'};{elementBoxStyle(node.appearance)}">{body}</p>
				{/if}
			{:else if node.elementKind === 'input' || node.elementKind === 'textarea'}
				{#if mode === 'run' && run}
					{@const firesChange = hasInteractionFor(node, 'change')}
					{@const firesSubmit = hasInteractionFor(node, 'submit')}
					{@const label = disp(node.label, '').trim()}
					<!-- Only surface validation once the user has touched the field (or
					     submitted) — a fresh run shows empty inputs, not red errors. -->
					{@const errs = run.isTouched(node.id, rowKey) ? run.fieldErrors(node.id, rowKey) : []}
					<label class="block">
						{#if label}
							<span class="sim-label mb-1 block text-[11px] font-medium" style="color:var(--sim-muted)">
								{label}{#if isRequired(node)}<span style="color:var(--sim-danger)" title="Required">&nbsp;*</span>{/if}
							</span>
						{/if}
						{#if node.elementKind === 'textarea'}
							<textarea
								value={run.inputValue(node.id, rowKey)}
								rows="3"
								oninput={(e) => {
									run.setFieldValue(node.id, e.currentTarget.value, rowKey);
									if (firesChange) fire('change');
								}}
								onblur={() => run.markTouched(node.id, rowKey)}
								onclick={(e) => e.stopPropagation()}
								placeholder={label}
								aria-invalid={errs.length > 0}
								style="border-radius:var(--sim-radius-input);background:var(--sim-surface);color:var(--sim-ink);border-color:{errs.length
									? 'var(--sim-danger)'
									: 'var(--sim-border)'};{elementBoxStyle(node.appearance)}"
								class="w-full resize-y border px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sim-accent)_18%,transparent)]"
							></textarea>
						{:else}
							<input
								type={node.wiring.inputType ?? 'text'}
								value={run.inputValue(node.id, rowKey)}
								oninput={(e) => {
									run.setFieldValue(node.id, e.currentTarget.value, rowKey);
									if (firesChange) fire('change');
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' && firesSubmit) {
										e.preventDefault();
										e.stopPropagation();
										fire('submit');
									}
								}}
								onblur={() => run.markTouched(node.id, rowKey)}
								onclick={(e) => e.stopPropagation()}
								placeholder={label}
								aria-invalid={errs.length > 0}
								style="border-radius:var(--sim-radius-input);background:var(--sim-surface);color:var(--sim-ink);border-color:{errs.length
									? 'var(--sim-danger)'
									: 'var(--sim-border)'};{elementBoxStyle(node.appearance)}"
								class="w-full border px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sim-accent)_18%,transparent)]"
							/>
						{/if}
						{#each errs as msg (msg)}
							<span class="mt-0.5 block text-[11px]" style="color:var(--sim-danger)">{msg}</span>
						{/each}
					</label>
				{:else}
					<div class="block">
						{#if node.label.trim()}
							<span class="sim-label mb-1 block text-[11px] font-medium" style="color:var(--sim-muted)">
								{node.label}{#if isRequired(node)}<span style="color:var(--sim-danger)" title="Required">&nbsp;*</span>{/if}
							</span>
						{/if}
						<div
							class="flex items-center justify-between border px-3 text-sm {node.elementKind === 'textarea' ? 'py-6' : 'py-2'}"
							style="border-radius:var(--sim-radius-input);background:var(--sim-surface);border-color:var(--sim-border);color:var(--sim-muted);{elementBoxStyle(node.appearance)}"
						>
							<span class="opacity-70">{node.elementKind === 'textarea' ? 'multi-line' : (node.wiring.inputType ?? 'text')}…</span>
							{#if node.wiring.validations.length > 0}
								<span class="text-[10px] uppercase tracking-wide opacity-70">{node.wiring.validations.length} rule(s)</span>
							{/if}
						</div>
					</div>
				{/if}
			{:else if node.elementKind === 'select'}
				<!-- Single choice. Options come from the authored list or, live, from a
				     collection field — which is what makes dependent pickers real. -->
				{@const opts =
					mode === 'run' && run
						? run.selectOptions(node.id)
						: selectOptions(node, {}, designCollections)}
				{@const label = disp(node.label, '').trim()}
				{@const errs = mode === 'run' && run && run.isTouched(node.id, rowKey) ? run.fieldErrors(node.id, rowKey) : []}
				<label class="block">
					{#if label}
						<span class="sim-label mb-1 block text-[11px] font-medium" style="color:var(--sim-muted)">
							{label}{#if isRequired(node)}<span style="color:var(--sim-danger)" title="Required">&nbsp;*</span>{/if}
						</span>
					{/if}
					<select
						value={mode === 'run' && run ? run.inputValue(node.id, rowKey) : ''}
						disabled={mode !== 'run'}
						onchange={(e) => {
							if (mode !== 'run' || !run) return;
							run.setFieldValue(node.id, e.currentTarget.value, rowKey);
							run.markTouched(node.id, rowKey);
							fire('change');
						}}
						onclick={(e) => e.stopPropagation()}
						aria-invalid={errs.length > 0}
						style="border-radius:var(--sim-radius-input);background:var(--sim-surface);color:var(--sim-ink);border-color:{errs.length
							? 'var(--sim-danger)'
							: 'var(--sim-border)'};{elementBoxStyle(node.appearance)}"
						class="w-full border px-3 py-2 text-sm outline-none disabled:opacity-100"
					>
						<option value="">{opts.length ? 'Choose…' : 'No options'}</option>
						{#each opts as opt (opt)}<option value={opt}>{opt}</option>{/each}
					</select>
					{#each errs as msg (msg)}
						<span class="mt-0.5 block text-[11px]" style="color:var(--sim-danger)">{msg}</span>
					{/each}
				</label>
			{:else if node.elementKind === 'checkbox'}
				{@const checked = mode === 'run' && run ? run.inputValue(node.id, rowKey) === 'true' : false}
				<label class="flex cursor-pointer items-center gap-2 text-sm" style="color:var(--sim-ink);{elementBoxStyle(node.appearance)}">
					<input
						type="checkbox"
						{checked}
						disabled={mode !== 'run'}
						onchange={(e) => {
							if (mode !== 'run' || !run) return;
							run.setFieldValue(node.id, e.currentTarget.checked ? 'true' : 'false', rowKey);
							run.markTouched(node.id, rowKey);
							fire('change');
						}}
						onclick={(e) => e.stopPropagation()}
						class="size-4 shrink-0"
						style="accent-color:var(--sim-accent)"
					/>
					<span>{disp(node.label, 'Checkbox')}{#if isRequired(node)}<span style="color:var(--sim-danger)" title="Required">&nbsp;*</span>{/if}</span>
				</label>
			{:else if node.elementKind === 'button'}
				{@const blocked = mode === 'run' && run ? run.isBlocked(node.id) : false}
				{@const variant = buttonVariant(node)}
				<span
					aria-disabled={blocked}
					class="sim-button inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold {blocked
						? ''
						: `sim-hover-${theme.hover.button}`}"
					style="border-radius:var(--sim-radius-button);{buttonStyle(variant, blocked)};{elementBoxStyle(node.appearance)}"
					title={blocked ? 'Complete the form to enable' : ''}
				>
					{disp(node.label, 'Button')}
				</span>
			{:else if node.elementKind === 'link'}
				<span class="sim-link sim-hover-{theme.hover.link} inline-flex items-center gap-1 text-sm font-medium" style="color:{node.appearance?.color ?? 'var(--sim-accent)'};{elementBoxStyle(node.appearance)}">{disp(node.label, 'Link')}</span>
			{:else if node.elementKind === 'list'}
				{@const col =
					node.wiring.binding?.targetKind === 'entity'
						? findCollection(store.draft.builder.collections, node.wiring.binding.targetRef)
						: null}
				{@const rows = col
					? mode === 'run' && run
						? run.listRows(node.id)
						: generateRows(col).slice(0, 5)
					: []}
				{@const rowTplRoot = node.componentId
					? (store.draft.builder.screenRoots[node.componentId] ?? null)
					: null}
				{#if rowTplRoot && col && rows.length}
					<!-- Row template: render the referenced component once per row, with the
					     row's fields in scope (a label `{Field}` resolves to that row) and the
					     row itself in scope for its actions. `rowLayout` decides whether that
					     repeats as a stacked list or as a wrapping grid of cards. -->
					{@const layout = node.rowLayout ?? 'stack'}
					{#if layout === 'stack'}
						<div class="overflow-hidden border" style="border-radius:var(--sim-radius-card);border-color:var(--sim-border);background:var(--sim-surface)">
							{#each rows.slice(0, mode === 'run' ? 50 : 5) as row, i (i)}
								<div class="border-b last:border-b-0" style="border-color:color-mix(in srgb,var(--sim-border) 70%,transparent)">
									<Self {store} nodeId={rowTplRoot} {mode} {run} rowCtx={rowContext(row, i)} />
								</div>
							{/each}
						</div>
					{:else}
						<!-- Responsive by default: cards wrap down to one column on a phone. -->
						<div class="grid gap-3" style="grid-template-columns:repeat(auto-fit,minmax({gridMinPx(node.rowColumns)}px,1fr))">
							{#each rows.slice(0, mode === 'run' ? 50 : 5) as row, i (i)}
								<div
									class={layout === 'cards' ? 'overflow-hidden border' : ''}
									style={layout === 'cards'
										? 'border-radius:var(--sim-radius-card);border-color:var(--sim-border);background:var(--sim-surface);box-shadow:var(--sim-shadow-card,0 1px 3px rgba(0,0,0,0.06))'
										: ''}
								>
									<Self {store} nodeId={rowTplRoot} {mode} {run} rowCtx={rowContext(row, i)} />
								</div>
							{/each}
						</div>
					{/if}
				{:else if col && rows.length}
					{@const cols = primaryFields(col)}
					<ul
						class="overflow-hidden border"
						style="border-radius:var(--sim-radius-card);border-color:var(--sim-border);background:var(--sim-surface)"
					>
						{#each rows.slice(0, mode === 'run' ? 50 : 5) as row, i (i)}
							{@const primary = String(row[fieldKey(cols[0])] ?? '')}
							<li
								class="flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--sim-accent)_6%,transparent)]"
								style="border-color:color-mix(in srgb,var(--sim-border) 70%,transparent)"
							>
								<span
									class="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold uppercase"
									style="background:color-mix(in srgb,var(--sim-accent) 14%,transparent);color:var(--sim-accent)"
								>
									{primary.trim().charAt(0) || '•'}
								</span>
								<span class="min-w-0 flex-1 truncate font-medium" style="color:var(--sim-ink)">{primary}</span>
								{#if cols[1]}
									<span class="shrink-0 truncate text-[12px]" style="color:var(--sim-muted)">{row[fieldKey(cols[1])] ?? ''}</span>
								{/if}
								<span class="shrink-0" style="color:var(--sim-muted);opacity:0.5"><Icon name="chevron-right" size={14} /></span>
							</li>
						{/each}
					</ul>
				{:else if col}
					<!-- Bound but empty: a clear default empty state rather than blank. -->
					<div
						class="grid place-items-center gap-1 border border-dashed px-4 py-6 text-center"
						style="border-radius:var(--sim-radius-card);border-color:var(--sim-border)"
					>
						<span style="color:var(--sim-muted);opacity:0.6"><Icon name="database" size={18} /></span>
						<p class="text-xs" style="color:var(--sim-muted)">No {col.name || 'items'} yet</p>
					</div>
				{:else}
					<!-- Unbound: ONE row using the label (authored as one list element per
					     row). No card box so sibling rows merge into a continuous list.
					     Bind to a collection for real multi-row data. -->
					<div
						class="flex items-center gap-3 border-b px-3 py-2.5 text-sm"
						style="border-color:color-mix(in srgb,var(--sim-border) 70%,transparent);background:var(--sim-surface)"
					>
						<span class="size-8 shrink-0 rounded-full" style="background:color-mix(in srgb,var(--sim-border) 60%,transparent)"></span>
						<span class="min-w-0 flex-1 truncate font-medium" style="color:var(--sim-ink)">{disp(node.label, 'List item')}</span>
						<span class="shrink-0" style="color:var(--sim-muted);opacity:0.5"><Icon name="chevron-right" size={14} /></span>
					</div>
				{/if}
			{:else if node.elementKind === 'form'}
				<div
					class="space-y-3 border p-4"
					style="border-radius:var(--sim-radius-card);border-color:var(--sim-border);background:var(--sim-surface);box-shadow:var(--sim-shadow-card,0 1px 3px rgba(0,0,0,0.05))"
				>
					<div class="block">
						<span class="sim-label mb-1 block text-[11px] font-medium" style="color:var(--sim-muted)">Field</span>
						<div class="border px-3 py-2 text-sm" style="border-radius:var(--sim-radius-input);border-color:var(--sim-border);color:var(--sim-muted)">…</div>
					</div>
					<span class="sim-button sim-hover-{theme.hover.button} inline-flex items-center justify-center px-4 py-2 text-sm font-semibold" style="border-radius:var(--sim-radius-button);background:var(--sim-accent);color:var(--sim-on-accent);box-shadow:var(--sim-shadow-raised,0 1px 2px rgba(0,0,0,0.14))">
						{disp(node.label, 'Submit')}
					</span>
				</div>
			{:else if node.elementKind === 'image'}
				{#if node.media?.src}
					<img
						src={node.media.src}
						alt={node.media.alt}
						class="block w-full border"
						style="aspect-ratio:{node.media.aspectRatio ?? '16 / 9'};object-fit:{node.media.fit};border-radius:var(--sim-radius-card);border-color:var(--sim-border);{elementBoxStyle(node.appearance)}"
					/>
				{:else}
					<div
						class="grid aspect-video w-full place-items-center border"
						style="border-radius:var(--sim-radius-card);border-color:var(--sim-border);background:linear-gradient(135deg,color-mix(in srgb,var(--sim-accent) 10%,var(--sim-surface)),var(--sim-bg));color:var(--sim-muted);{elementBoxStyle(node.appearance)}"
					>
						<span style="opacity:0.6"><Icon name="grid" size={22} /></span>
					</div>
				{/if}
			{:else if node.elementKind === 'status'}
				<!-- Feedback state: pair with visibleWhen so the right state shows at the
				     right moment (spinner while loading, banner on error/success). -->
				{@const variant = node.variant || 'loading'}
				{#if variant === 'loading'}
					<div class="flex items-center gap-2 px-1 py-2 text-sm" style="color:var(--sim-muted)">
						<span class="sim-spin inline-block size-4 rounded-full border-2" style="border-color:var(--sim-border);border-top-color:var(--sim-accent)"></span>
						<span>{disp(node.label, 'Loading…')}</span>
					</div>
				{:else if variant === 'empty'}
					<div class="grid place-items-center gap-1 border border-dashed px-4 py-6 text-center" style="border-radius:var(--sim-radius-card);border-color:var(--sim-border)">
						<span style="color:var(--sim-muted);opacity:0.6"><Icon name="database" size={18} /></span>
						<p class="text-xs" style="color:var(--sim-muted)">{disp(node.label, 'Nothing here yet')}</p>
					</div>
				{:else if variant === 'error'}
					<div class="flex items-start gap-2 border px-3 py-2 text-sm" style="border-radius:var(--sim-radius-input);background:color-mix(in srgb,var(--sim-danger) 8%,var(--sim-surface));border-color:color-mix(in srgb,var(--sim-danger) 40%,var(--sim-border));color:var(--sim-danger)">
						<span class="font-bold leading-none">!</span><span>{disp(node.label, 'Something went wrong')}</span>
					</div>
				{:else}
					<div class="flex items-start gap-2 border px-3 py-2 text-sm" style="border-radius:var(--sim-radius-input);background:color-mix(in srgb,var(--sim-success) 10%,var(--sim-surface));border-color:color-mix(in srgb,var(--sim-success) 40%,var(--sim-border));color:var(--sim-success)">
						<span class="font-bold leading-none">✓</span><span>{disp(node.label, 'Done')}</span>
					</div>
				{/if}
			{:else if node.elementKind === 'icon'}
				<!-- Bundled lucide icon; the LABEL is the icon name (e.g. "zap"). Color
				     defaults to the muted var so a group color cascade recolors it. -->
				{@const iconName = (node.label || '').trim()}
				{@const px = node.appearance?.fontSize ?? 18}
				{#if iconName && isPrototypeIcon(iconName)}
					<span
						class="inline-flex"
						style="color:{node.appearance?.color ?? 'var(--sim-muted)'};{elementBoxStyle(node.appearance)}"
					>
						<IconifyIcon icon={'lucide:' + iconName} width={px} height={px} />
					</span>
				{:else}
					<span
						class="inline-grid place-items-center rounded"
						style="width:{px}px;height:{px}px;background:color-mix(in srgb,var(--sim-border) 60%,transparent);color:var(--sim-muted)"
						title={iconName
							? `Unknown icon "${iconName}": use a name from the bundled lucide catalog`
							: 'Icon: set the label to a lucide icon name (e.g. "zap")'}
					>·</span>
				{/if}
			{:else if node.elementKind === 'meter'}
				<!-- Progress/gauge: the LABEL is the value 0–100 (interpolates run state,
				     e.g. "{usage.pct}"). Default = horizontal bar; variant "ring" = gauge. -->
				{@const pct = Math.max(
					0,
					Math.min(100, Number(String(disp(node.label, '0')).replace('%', '').trim()) || 0)
				)}
				{@const fill = node.appearance?.color ?? 'var(--sim-accent)'}
				{#if node.variant === 'ring'}
					<div class="inline-grid place-items-center" style={elementBoxStyle(node.appearance)}>
						<div
							class="grid place-items-center rounded-full"
							style="width:64px;height:64px;background:conic-gradient({fill} {pct}%, color-mix(in srgb,var(--sim-border) 55%,transparent) 0)"
						>
							<div
								class="grid place-items-center rounded-full text-[12px] font-semibold"
								style="width:48px;height:48px;background:var(--sim-surface);color:var(--sim-ink)"
							>{Math.round(pct)}%</div>
						</div>
					</div>
				{:else}
					<div class="w-full" style={elementBoxStyle(node.appearance)}>
						<div
							class="h-2 w-full overflow-hidden rounded-full"
							style="background:color-mix(in srgb,var(--sim-border) 55%,transparent)"
						>
							<div class="h-full rounded-full" style="width:{pct}%;background:{fill}"></div>
						</div>
					</div>
				{/if}
			{:else}
				<!-- container -->
				<div
					class="grid min-h-12 place-items-center border border-dashed px-3 py-4 text-center text-[11px]"
					style="border-radius:var(--sim-radius-card);border-color:var(--sim-border);color:var(--sim-muted)"
				>
					{node.label || 'Container'}
				</div>
			{/if}
		</div>
	{/if}
{/if}

<!--
	Global rules for the simulated app: per-type hover effects, plus the design
	markers the theme holds no token for (motion, label case, border weight). Class
	names are composed dynamically (`sim-hover-{effect}`) or set by the scope root,
	so they must be :global or Svelte would prune them as "unused". The `sim-`
	prefix keeps them collision-free; every var falls back to the seed marker.
-->
<style>
	/* Border style trait — only the plain `border` utility scales, so a deliberate
	   `border-2` (spinner ring) or a single-side divider keeps its own weight. */
	:global(.sim-scope [class~='border']) {
		border-width: var(--sim-border-width, 1px);
	}
	/* Label case trait — buttons and field labels, per the marker's definition. */
	:global(.sim-button),
	:global(.sim-label) {
		text-transform: var(--sim-text-transform, none);
	}
	:global(.sim-button),
	:global(.sim-link),
	:global(.sim-actionable) {
		transition:
			filter var(--sim-transition, 150ms ease-out),
			transform var(--sim-transition, 150ms ease-out),
			box-shadow var(--sim-transition, 150ms ease-out);
	}
	/* Sidebar-presentation menu items: quiet by default, accent-tinted on hover;
	   the ACTIVE item's inline accent styling wins over these. */
	:global(.sim-navitem) {
		color: var(--sim-muted);
	}
	:global(.sim-navitem:hover) {
		background: color-mix(in srgb, var(--sim-accent) 8%, transparent);
		color: var(--sim-ink);
	}
	:global(.sim-hover-darken:hover) {
		filter: brightness(0.92);
	}
	:global(.sim-hover-lighten:hover) {
		filter: brightness(1.08);
	}
	:global(.sim-hover-lift:hover) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
	}
	:global(.sim-hover-grow:hover) {
		transform: scale(1.03);
	}
	:global(.sim-hover-underline:hover) {
		text-decoration: underline;
	}
	/* Status (loading) spinner. */
	:global(.sim-spin) {
		animation: sim-spin 0.7s linear infinite;
	}
	@keyframes sim-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
