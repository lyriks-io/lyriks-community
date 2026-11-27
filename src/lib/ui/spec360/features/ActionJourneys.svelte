<script lang="ts">
	import { mintUuid } from '$ui/shell/mint-id';
	import { canLink, journeyThrough, journeysOnFeature, layoutJourney, linkKindOf, shownDiagram, stepNumbers, JOURNEY_LINK_KINDS, JOURNEY_LINK_LABELS, type ActionJourney, type JourneyAct, type JourneyLink, type JourneyLinkKind, type JourneyPosition } from '$domain/features';
	import type { FeatureActionView } from '$application/spec360/features';
	import { Icon } from '$ui/design-system';
	import { BTN, LINK, META, TAG } from '$ui/spec360/page/look';
	import { trackSave } from '$ui/shell/pending-saves.svelte';
	import { JourneySaves, type JourneySaveAnswer } from './journey-saves';
	import ActionHoverCard from './ActionHoverCard.svelte';

	/**
	 * A feature's journeys (actions f3bbf419, 2d9a8378): one diagram, the
	 * journeys being the paths its arrows draw between action cards; nothing is
	 * declared or named. Its linked paths read first, each card numbered by its
	 * step (1 where no arrow leads in; cards at the same step share one); the
	 * actions no arrow touches stand apart under them, side by side in rows as
	 * wide as the box, without a number (criterion 6bc24100).
	 * Define journeys, offered on hover, opens its own edit mode: every action shows as a
	 * card with a connector on its left (arrows in) and its right (arrows out),
	 * an arrow is pulled from a connector onto another card or drawn by clicking
	 * a connector then the card, one card may lead to several, a card is dragged
	 * aside while drawing, and Done puts every card back where the arrows place
	 * it and saves that arrangement. Each change shows at once and is saved behind it, in the order
	 * made (criterion a8a7f1d5), and changes nothing the actions do.
	 */
	interface Props {
		projectId: string;
		featureId: string;
		actions: readonly FeatureActionView[];
		journeys: readonly ActionJourney[];
		canArrange: boolean;
		/** The action read under the diagram, clicked on its card (action 6f38e6ed). */
		picked?: string | null;
		onpick?: (actionId: string) => void;
		/** Told each time the journeys on screen change, so the page reads the same steps as the diagram. */
		onsaved?: (journeys: readonly ActionJourney[]) => void;
	}
	let { projectId, featureId, actions, journeys: stored, canArrange, picked = null, onpick, onsaved }: Props = $props();

	// The drawing's measures, in pixels.
	const W = 196;
	const H = 54;
	const GX = 48;
	const GY = 22;
	const PAD = 18;
	/** How far an arrow keeps from a card's side, so its connector and its head both show. */
	const GAP = 9;
	/** Room left around the cards so one can be dragged further out. */
	const ROOM = 140;
	/** The actions outside the journeys: the gaps between their cards (wider while editing, so two connectors never touch), and the line above them. */
	const TX = 12;
	const TX_EDIT = 40;
	const TY = 10;
	const LINE = 30;
	/** How far under the journeys that line stands. */
	const APART = 26;

	// What the diagram shows: the changes made, ahead of the server; the page's own read until the first change.
	let saved = $state<readonly ActionJourney[] | null>(null);
	let refusal = $state<string | null>(null);
	/** The arrow being drawn: from which card and which side, to where the pointer is. */
	let drawing = $state<{ at: string; side: 'out' | 'in'; x: number; y: number; moved: boolean; held: boolean } | null>(null);
	/** The card being dragged, where it stands now. */
	let dragging = $state<{ actionId: string; x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
	let hovered = $state<string | null>(null);
	let selected = $state<JourneyLink | null>(null);
	/** Whether the pointer is in the diagram: Edit is offered. */
	let inside = $state(false);
	/** The box's width, so the actions outside the journeys fill its rows. */
	let boxWidth = $state(0);
	/** The action whose card the pointer rests on, and where that card stood: its hover card shows (criterion 3feec278). */
	let hover = $state<{ actionId: string; at: DOMRect } | null>(null);
	/** The diagram's own edit mode: every card, its connectors and moves; a diagram with no arrow yet opens in it. */
	let editing = $state(false);
	const canEdit = $derived(canArrange && editing);

	const ids = $derived(actions.map((a) => a.id));
	// The feature's one diagram: a person's with an arrow, else a suggestion with one; none yet until the first arrow or move saves it.
	const stored1 = $derived(shownDiagram(journeysOnFeature(saved ?? stored, ids).journeys));
	const diagram = $derived<ActionJourney>({
		id: stored1?.id ?? '',
		name: stored1?.name ?? 'Journeys',
		nodes: ids,
		links: stored1?.links ?? [],
		positions: stored1?.positions,
		origin: stored1?.origin ?? 'person'
	});
	const named = $derived(new Map(actions.map((a) => [a.id, a.name])));
	const described = $derived(new Map(actions.map((a) => [a.id, a.description])));
	/** The action whose journey the diagram is narrowed to, while reading. */
	const focused = $derived(!editing && picked && named.has(picked) ? picked : null);

	const url = () => `/api/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/journeys`;
	const saves = new JourneySaves({
		send: async (change) => {
			try {
				const res = await fetch(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: change }) });
				const body = await res.json().catch(() => ({}));
				return (res.ok ? { ok: true, journeys: body.journeys as ActionJourney[] } : { ok: false, refusal: body.refusal ?? body.message ?? 'The change was not saved.' }) as JourneySaveAnswer;
			} catch {
				return { ok: false, refusal: 'The change was not saved: the server could not be reached.' };
			}
		},
		reread: async () => {
			const res = await fetch(url()).catch(() => null);
			const body = res?.ok ? await res.json().catch(() => null) : null;
			return Array.isArray(body?.journeys) ? (body.journeys as ActionJourney[]) : null;
		},
		onview: (journeys, refused) => {
			saved = journeys;
			refusal = refused;
			onsaved?.(journeys ?? stored);
		},
		track: trackSave
	});

	/** Shows a change at once and saves it behind (criterion a8a7f1d5); false when the rules refuse it, which then says why. */
	function act(change: JourneyAct): boolean {
		refusal = null;
		const refused = saves.apply(saved ?? stored, change, new Set(ids));
		if (refused) refusal = refused;
		return !refused;
	}

	/** A change to the diagram; the first one saves it, holding every action of the feature. */
	function change(make: (journeyId: string) => JourneyAct) {
		let id = diagram.id;
		if (!id) {
			id = mintUuid();
			if (!act({ kind: 'declare', id, name: 'Journeys', nodes: ids })) return;
		}
		act(make(id));
	}

	/** Where every card stands, which show, the arrows between them and the numbers they read. */
	const drawn = $derived.by(() => {
		// An action picked while reading narrows the diagram to its journey: what leads to it and what it leads to (action 6f38e6ed).
		const focus = !editing && picked ? journeyThrough(diagram, picked) : null;
		const part = focus ? { nodes: diagram.nodes.filter((a) => focus.has(a)), links: diagram.links.filter((l) => focus.has(l.from) && focus.has(l.to)) } : diagram;
		const linkedOut = new Set(part.links.map((l) => l.from));
		const linkedIn = new Set(part.links.map((l) => l.to));
		// Every action of the feature shows, read or edited, unless one is picked.
		const shown = part.nodes;
		const linked = (a: string) => linkedOut.has(a) || linkedIn.has(a);
		const inJourney = part.nodes.filter(linked);
		const apart = part.nodes.filter((a) => !linked(a));
		const auto = new Map(layoutJourney({ nodes: inJourney, links: part.links }).map((p) => [p.actionId, { x: PAD + p.column * (W + GX), y: PAD + p.row * (H + GY) }]));
		// Read, every card is arranged automatically; editing, a card dragged aside stays there until Done arranges all again.
		const moved = editing ? (diagram.positions ?? {}) : {};
		const placed = (a: string) => (dragging?.actionId === a ? { x: dragging.x, y: dragging.y } : moved[a]);
		const at = new Map<string, JourneyPosition>(inJourney.map((a) => [a, placed(a) ?? auto.get(a) ?? { x: PAD, y: PAD }]));
		// The actions no arrow touches stand apart under the journeys, side by side in rows as wide as the box, under a line saying what they are.
		const journeyBottom = Math.max(0, ...inJourney.map((a) => auto.get(a)!.y + H));
		const lineAt = focus ? null : inJourney.length ? journeyBottom + APART : PAD;
		const top = lineAt === null ? PAD : lineAt + LINE;
		const tx = editing ? TX_EDIT : TX;
		const perRow = Math.max(1, Math.floor(((boxWidth || 4 * (W + tx)) - 2 * PAD + tx) / (W + tx)));
		apart.forEach((a, i) => at.set(a, placed(a) ?? { x: PAD + (i % perRow) * (W + tx), y: top + Math.floor(i / perRow) * (H + TY) }));
		const arrows = part.links.flatMap((link) => {
			const a = at.get(link.from);
			const b = at.get(link.to);
			// Editing, the arrow keeps clear of the connectors; reading, it leaves the card's edge.
			const gap = editing ? GAP : 0;
			return a && b ? [{ link, ...curve(a.x + W + gap, a.y + H / 2, b.x - gap, b.y + H / 2) }] : [];
		});
		const visible = shown.map((a) => at.get(a)!);
		const right = Math.max(...visible.map((p) => p.x + W), W);
		const bottom = Math.max(...visible.map((p) => p.y + H), H);
		// A card's number is its step along the arrows of the whole diagram: 1 where none leads in, shared by the cards at the same step.
		const step = stepNumbers(diagram);
		const line = lineAt === null || !apart.length ? null : { y: lineAt, text: inJourney.length ? 'Not in a journey yet' : 'No journey yet: link the actions in the order a person does them.' };
		return { at, arrows, shown, linkedOut, linkedIn, step, line, width: right + PAD + (editing ? ROOM : 0), height: bottom + PAD + (editing ? ROOM / 2 : 0) };
	});

	/** A smooth arrow from a card's right side to another's left side, wherever they stand. */
	function curve(x1: number, y1: number, x2: number, y2: number) {
		const dx = Math.max(40, Math.abs(x2 - x1) / 2);
		return { d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
	}

	const isSelected = (link: JourneyLink) => selected?.from === link.from && selected.to === link.to;

	let canvas: HTMLElement | null = null;
	function pointAt(e: PointerEvent | MouseEvent, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	const cardUnder = (e: { clientX: number; clientY: number }) => document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-node]') ?? null;

	// Drawing an arrow: pull from a connector and let go on a card, or click a connector and then the card.
	function startArrow(e: PointerEvent, at: string, side: 'out' | 'in') {
		if (!canEdit) return;
		e.preventDefault();
		e.stopPropagation();
		canvas = (e.currentTarget as HTMLElement).closest('[data-canvas]');
		if (!canvas) return;
		if (drawing && drawing.at === at && drawing.side === side && !drawing.held) {
			stopDrawing();
			return;
		}
		selected = null;
		leaveCard();
		drawing = { at, side, ...pointAt(e, canvas), moved: false, held: true };
		window.addEventListener('pointermove', follow);
		window.addEventListener('pointerup', release, { once: true });
	}
	function follow(e: PointerEvent) {
		if (!drawing || !canvas) return;
		const p = pointAt(e, canvas);
		drawing = { ...drawing, ...p, moved: drawing.moved || Math.hypot(p.x - drawing.x, p.y - drawing.y) > 4 };
		const under = cardUnder(e)?.dataset.node ?? null;
		const ok = under && under !== drawing.at && (drawing.side === 'out' ? canLink(diagram, drawing.at, under) : canLink(diagram, under, drawing.at));
		hovered = ok ? under : null;
	}
	function release(e: PointerEvent) {
		if (!drawing) return;
		// A click on a connector: the arrow follows the pointer until a card is clicked.
		if (!drawing.moved) drawing = { ...drawing, held: false };
		else finish(cardUnder(e));
	}
	function finish(target: HTMLElement | null) {
		const d = drawing;
		stopDrawing();
		const other = target?.dataset.node;
		if (!d || !other || other === d.at) return;
		const [from, to] = d.side === 'out' ? [d.at, other] : [other, d.at];
		change((journeyId) => ({ kind: 'link', journeyId, from, to }));
	}
	function stopDrawing() {
		drawing = null;
		hovered = null;
		window.removeEventListener('pointermove', follow);
	}

	// Moving a card: drag it by its body; a press that does not move is not a move.
	function startDrag(e: PointerEvent, actionId: string, from: JourneyPosition) {
		if (!canEdit || drawing || e.button !== 0) return;
		if ((e.target as HTMLElement).closest('button')) return;
		canvas = (e.currentTarget as HTMLElement).closest('[data-canvas]');
		if (!canvas) return;
		const p = pointAt(e, canvas);
		leaveCard();
		dragging = { actionId, x: from.x, y: from.y, dx: p.x - from.x, dy: p.y - from.y, moved: false };
		window.addEventListener('pointermove', drag);
		window.addEventListener('pointerup', drop, { once: true });
	}
	/** The card under the pointer other than the one dragged, which covers it. */
	const otherCardUnder = (e: PointerEvent, dragged: string) =>
		document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest<HTMLElement>('[data-node]')?.dataset.node).find((id) => id && id !== dragged) ?? null;
	function drag(e: PointerEvent) {
		if (!dragging || !canvas) return;
		const p = pointAt(e, canvas);
		const x = Math.max(0, p.x - dragging.dx);
		const y = Math.max(0, p.y - dragging.dy);
		dragging = { ...dragging, x, y, moved: dragging.moved || Math.hypot(x - dragging.x, y - dragging.y) > 3 };
		// A card dragged over another it may lead to lights that one up: let go, and they are linked (criterion 14c7a2da).
		dropOn = otherCardUnder(e, dragging.actionId);
		hovered = dropOn && canLink(diagram, dragging.actionId, dropOn) ? dropOn : null;
	}
	function drop(e: PointerEvent) {
		window.removeEventListener('pointermove', drag);
		const d = dragging;
		const target = d?.moved ? otherCardUnder(e, d.actionId) : null;
		dragging = null;
		dropOn = null;
		hovered = null;
		if (!d || !d.moved) return;
		// Dropped on another card: an arrow from the dragged one to it, which goes back where it stood; never a card hiding another.
		if (target) change((journeyId) => ({ kind: 'link', journeyId, from: d.actionId, to: target }));
		else change((journeyId) => ({ kind: 'move', journeyId, actionId: d.actionId, x: d.x, y: d.y }));
	}
	/** The card a dragged card is over, if any. */
	let dropOn = $state<string | null>(null);

	/** Edit opens the edit mode; Done arranges every card automatically, saves it and closes, so the next Edit starts from it. */
	function toggleEdit() {
		stopDrawing();
		selected = null;
		if (editing && diagram.id && Object.keys(diagram.positions ?? {}).length) act({ kind: 'tidy', journeyId: diagram.id });
		editing = !editing;
	}

	function clickCanvas(e: MouseEvent) {
		if (drawing && !drawing.held) finish((e.target as HTMLElement).closest<HTMLElement>('[data-node]'));
		else selected = null;
	}
	function unlink(link: JourneyLink) {
		selected = null;
		act({ kind: 'unlink', journeyId: diagram.id, from: link.from, to: link.to });
	}
	/** Gives an arrow another kind (criterion 415a3006); the menu stays on it. */
	function retype(link: JourneyLink, linkKind: JourneyLinkKind) {
		if (linkKindOf(link) === linkKind) return;
		if (act({ kind: 'retype', journeyId: diagram.id, from: link.from, to: link.to, linkKind })) selected = { ...link, kind: linkKind };
	}

	/** How each kind of arrow is drawn: its colour, and a dash for what no one does by hand. */
	const KIND_LOOK: Record<JourneyLinkKind, { color: string; dash?: string }> = {
		then: { color: 'var(--color-ink-2)' },
		enables: { color: 'var(--color-blue-ink)' },
		triggers: { color: 'var(--color-violet-ink)', dash: '6 4' },
		fails: { color: 'var(--color-red-ink)' }
	};
	/** The kinds the diagram's arrows use, in their order, for the legend. */
	const kindsUsed = $derived(JOURNEY_LINK_KINDS.filter((k) => diagram.links.some((l) => linkKindOf(l) === k)));
	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement | null)?.closest('input, select, textarea, [contenteditable]')) return;
		if (e.key === 'Escape') {
			// Esc first drops what is being drawn, then leaves the edit mode as Done does.
			if (!drawing && !selected && editing) toggleEdit();
			stopDrawing();
			selected = null;
		} else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && canEdit) {
			e.preventDefault();
			unlink(selected);
		}
	}

	// The hover card of an action (criterion 3feec278): after a moment, at once when moving on from another
	// card; never over a connector, nor while an arrow is drawn or a card dragged.
	const HOVER_MS = 400;
	const WARM_MS = 600;
	let hoverTimer = 0;
	let warmUntil = 0;
	function restOn(e: PointerEvent, actionId: string) {
		if (e.pointerType === 'touch' || drawing || dragging) return;
		if ((e.target as HTMLElement).closest('button')) return leaveCard();
		if (hover?.actionId === actionId) return;
		const card = e.currentTarget as HTMLElement;
		clearTimeout(hoverTimer);
		hoverTimer = window.setTimeout(() => showCard(card, actionId), hover || Date.now() < warmUntil ? 0 : HOVER_MS);
	}
	function showCard(card: HTMLElement, actionId: string) {
		if (drawing || dragging) return;
		hover = { actionId, at: card.getBoundingClientRect() };
	}
	function leaveCard() {
		clearTimeout(hoverTimer);
		if (hover) warmUntil = Date.now() + WARM_MS;
		hover = null;
	}

	const DOT = 'absolute top-1/2 z-20 size-4 -translate-y-1/2 cursor-crosshair rounded-full border-[1.5px] border-ink transition-opacity hover:scale-125 hover:bg-violet-ink';
	/** A connector's fill: violet while an arrow is drawn from it, ink when an arrow uses it, paper when free. */
	const fill = (drawingHere: boolean, used: boolean) => (drawingHere ? 'bg-violet-ink' : used ? 'bg-ink' : 'bg-paper');
</script>

<svelte:window onkeydown={onKey} onscroll={leaveCard} />

<!-- One who only reads sees the diagram once it has an arrow. -->
{#if canArrange || diagram.links.length}
<div class="mb-6 flex flex-col gap-3">
	{#if editing || (diagram.origin === 'ai' && stored1)}
		<div class="flex flex-wrap items-center gap-2">
			{#if editing}
				<p class="m-0 min-w-0 flex-1 {META}">Link two actions: drag a card onto the next one, or pull an arrow from a card's right dot onto another; a card can lead to several. Click an arrow to change its kind or remove it.</p>
			{/if}
			{#if diagram.origin === 'ai' && stored1}
				<span class="{TAG} border-violet text-violet-ink"><Icon name="sparkles" size={12} />Suggested by AI</span>
				{#if canArrange}
					<button type="button" class={LINK} onclick={() => act({ kind: 'keep', journeyId: diagram.id })}><Icon name="check" size={14} />Keep</button>
					<button type="button" class={LINK} onclick={() => act({ kind: 'remove', journeyId: diagram.id })}><Icon name="x" size={14} />Dismiss</button>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="relative overflow-auto border-[1.5px] {editing ? 'border-ink bg-toner/60' : 'border-line bg-toner/40'}" role="presentation" bind:clientWidth={boxWidth} onscroll={leaveCard} onpointerenter={() => (inside = true)} onpointerleave={() => (inside = false)}>
		{#if focused}
			<!-- The narrowed diagram's way back to all of it; the marked card is the action's only title (action 6f38e6ed). -->
			<button type="button" class="{LINK} absolute top-1.5 left-3 z-40 min-h-0" onclick={() => onpick?.(focused)}>Show all</button>
		{/if}
		{#if canArrange}
			<!-- Edit is offered on hover (always while nothing is drawn), so cards and connectors show only with the intent to edit. -->
			<button type="button" class="{BTN} absolute top-2 right-2 z-40 bg-paper transition-opacity {editing || inside || !diagram.links.length ? 'opacity-100' : 'pointer-events-none opacity-0'}" aria-label={editing ? 'Done defining the journeys' : 'Define journeys'} onclick={toggleEdit}>
				{#if editing}<Icon name="check" size={14} />Done{:else}<Icon name="pencil" size={14} />Define journeys{/if}
			</button>
		{/if}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div data-canvas class="relative select-none {focused ? 'mt-7' : editing ? 'mt-11' : ''} {drawing && !drawing.held ? 'cursor-crosshair' : ''}" style="width:{drawn.width}px;height:{drawn.height}px" role="presentation" onclick={clickCanvas}>
			{#if drawn.line}
				<!-- What the actions outside the journeys are, and with no journey yet, what the diagram expects. -->
				<p class="absolute m-0 {META} {drawn.line.y === PAD ? 'pr-44' : ''}" style="left:{PAD}px;top:{drawn.line.y}px;right:{PAD}px">{drawn.line.text}</p>
			{/if}
			<svg class="pointer-events-none absolute inset-0 overflow-visible" width={drawn.width} height={drawn.height} aria-hidden="true">
				<defs>
					<marker id="arrow-{featureId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-violet-ink)" /></marker>
					{#each JOURNEY_LINK_KINDS as k (k)}
						<marker id="arrow-{featureId}-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={KIND_LOOK[k].color} /></marker>
					{/each}
				</defs>
				{#each drawn.arrows as arrow (arrow.link.from + '>' + arrow.link.to)}
					{@const on = isSelected(arrow.link)}
					{@const look = KIND_LOOK[linkKindOf(arrow.link)]}
					<path d={arrow.d} fill="none" stroke={look.color} stroke-width={on ? 3 : 1.5} stroke-dasharray={look.dash} marker-end="url(#arrow-{featureId}-{linkKindOf(arrow.link)})" />
					{#if canEdit}
						<!-- A wide invisible stroke makes the arrow easy to click. -->
						<path d={arrow.d} fill="none" stroke="transparent" stroke-width="14" class="pointer-events-auto cursor-pointer" role="button" tabindex="-1" aria-label="Arrow from {named.get(arrow.link.from)} to {named.get(arrow.link.to)}" onclick={(e) => { e.stopPropagation(); selected = arrow.link; }} />
					{/if}
				{/each}
				{#if drawing && drawn.at.get(drawing.at)}
					{@const a = drawn.at.get(drawing.at)!}
					{@const line = drawing.side === 'out' ? curve(a.x + W + GAP, a.y + H / 2, drawing.x, drawing.y) : curve(drawing.x, drawing.y, a.x - GAP, a.y + H / 2)}
					<path d={line.d} fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4" class="text-violet-ink" marker-end="url(#arrow-{featureId})" />
				{/if}
			</svg>

			{#each drawn.arrows as arrow (arrow.link.from + '>' + arrow.link.to)}
				{#if canEdit && isSelected(arrow.link)}
					<!-- The clicked arrow's menu, just under it so the cards it links stay readable: its four kinds, the current one marked, and Remove (criterion 415a3006). -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="absolute z-30 flex -translate-x-1/2 translate-y-3 items-stretch border-[1.5px] border-ink bg-paper shadow-[3px_3px_0_0_var(--color-ink)]" style="left:{arrow.mid.x}px;top:{arrow.mid.y}px" role="menu" tabindex="-1" aria-label="Arrow from {named.get(arrow.link.from)} to {named.get(arrow.link.to)}" onclick={(e) => e.stopPropagation()}>
						{#each JOURNEY_LINK_KINDS as k (k)}
							{@const current = linkKindOf(selected ?? arrow.link) === k}
							<button type="button" role="menuitemradio" aria-checked={current} class="flex cursor-pointer items-center gap-1.5 border-r border-line px-2 py-1 text-xs font-semibold whitespace-nowrap {current ? 'bg-ink text-paper' : 'text-ink hover:bg-toner'}" onclick={() => retype(arrow.link, k)}>
								<span class="inline-block h-0 w-4 border-t-2" style="border-color:{KIND_LOOK[k].color};{KIND_LOOK[k].dash ? 'border-top-style:dashed' : ''}"></span>{JOURNEY_LINK_LABELS[k]}
							</button>
						{/each}
						<button type="button" role="menuitem" class="flex cursor-pointer items-center px-1.5 text-ink hover:bg-ink hover:text-paper" title="Remove this arrow (Delete)" aria-label="Remove the arrow" onclick={() => unlink(arrow.link)}>
							<Icon name="x" size={14} />
						</button>
					</div>
				{/if}
			{/each}

			{#each drawn.shown as actionId (actionId)}
				{@const p = drawn.at.get(actionId)!}
				{@const hasOut = drawn.linkedOut.has(actionId)}
				{@const hasIn = drawn.linkedIn.has(actionId)}
				{@const loose = !hasOut && !hasIn}
				{@const aiming = !!drawing && drawing.at !== actionId}
				{@const source = drawing?.at === actionId}
				<!-- While an arrow is drawn, a card it may end on shows only its opposite connector; the others are dimmed and show none. -->
				{@const target = !!drawing && aiming && (drawing.side === 'out' ? canLink(diagram, drawing.at, actionId) : canLink(diagram, actionId, drawing.at))}
				{@const outOn = drawing ? source && drawing.side === 'out' || (target && drawing.side === 'in') : loose || hasOut}
				{@const inOn = drawing ? source && drawing.side === 'in' || (target && drawing.side === 'out') : loose || hasIn}
				{@const moving = dragging?.actionId === actionId}
				{@const open = !editing && picked === actionId}
				<!-- Read, a card is a button that opens its action; edited, it is dragged and linked, so its role follows the mode. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					data-node={actionId}
					class="group absolute flex items-center gap-2 px-3 text-[0.8125rem] leading-tight text-ink {open ? 'border-[3px] border-violet-ink bg-violet-tint' : 'border-[1.5px]'} {moving ? 'z-20 cursor-grabbing shadow-lg' : 'z-10'} {canEdit && !drawing && !moving ? 'cursor-grab' : ''} {aiming ? (target ? 'cursor-pointer' : 'opacity-40') : ''} {open ? '' : hovered === actionId ? 'border-violet-ink bg-violet-tint' : source ? 'border-violet-ink bg-paper' : 'border-ink bg-paper'} {!editing && onpick ? 'cursor-pointer' : ''} {!editing && onpick && !open ? 'hover:bg-toner' : ''}"
					style="left:{p.x}px;top:{p.y}px;width:{W}px;height:{H}px"
					role={!editing && onpick ? 'button' : 'presentation'}
					tabindex={!editing && onpick ? 0 : undefined}
					aria-pressed={!editing && onpick ? open : undefined}
					aria-describedby={hover?.actionId === actionId ? `action-card-${featureId}` : undefined}
					onclick={() => !editing && onpick?.(actionId)}
					onkeydown={(e) => !editing && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onpick?.(actionId))}
					onpointerdown={(e) => startDrag(e, actionId, p)}
					onpointerenter={() => target && (hovered = actionId)}
					onpointerover={(e) => restOn(e, actionId)}
					onpointerleave={() => {
						if (hovered === actionId) hovered = null;
						leaveCard();
					}}
					onfocus={(e) => e.currentTarget.matches(':focus-visible') && showCard(e.currentTarget, actionId)}
					onblur={leaveCard}
				>
					{#if !loose}
						<!-- A card in a journey reads its step; one outside them reads no number. -->
						<span class="min-w-[1ch] font-evo-mono text-xs tabular-nums {open ? 'font-bold text-violet-ink' : 'text-ink-3'}">{drawn.step.get(actionId) ?? ''}</span>
					{/if}
					<!-- No title: the hover card says the description (criterion 3feec278). -->
					<span class="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">{named.get(actionId)}</span>
					{#if canEdit}
						<!-- Its two connectors: shown when loose, else only those in use, all of them on hover or while an arrow is drawn. -->
						<button type="button" class="{DOT} -left-[9px] {inOn ? 'opacity-100' : drawing ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} {fill(source && drawing?.side === 'in', hasIn)}" title="Pull an arrow into this action" aria-label="Draw an arrow into {named.get(actionId)}" onpointerdown={(e) => startArrow(e, actionId, 'in')} onclick={(e) => e.stopPropagation()}></button>
						<button type="button" class="{DOT} -right-[9px] {outOn ? 'opacity-100' : drawing ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} {fill(source && drawing?.side === 'out', hasOut)}" title="Pull an arrow to the next action" aria-label="Draw an arrow from {named.get(actionId)}" onpointerdown={(e) => startArrow(e, actionId, 'out')} onclick={(e) => e.stopPropagation()}></button>
					{/if}
				</div>
			{/each}
		</div>
	</div>
	{#if kindsUsed.length && !focused}
		<!-- What each kind of arrow means, for the kinds the diagram uses (criterion 415a3006). -->
		<p class="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 {META} text-xs">
			{#each kindsUsed as k (k)}
				<span class="inline-flex items-center gap-1.5"><span class="inline-block h-0 w-5 border-t-2" style="border-color:{KIND_LOOK[k].color};{KIND_LOOK[k].dash ? 'border-top-style:dashed' : ''}"></span>{JOURNEY_LINK_LABELS[k]}</span>
			{/each}
		</p>
	{/if}
	{#if refusal}<p class="m-0 text-sm text-red-ink" role="alert">{refusal}</p>{/if}
	{#if hover && named.has(hover.actionId)}
		<ActionHoverCard id="action-card-{featureId}" at={hover.at} description={described.get(hover.actionId) ?? ''} />
	{/if}
</div>
{/if}
