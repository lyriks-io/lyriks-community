<script lang="ts">
	import { BOARD_DOTS, BOARD_LINE, BOARD_LINE_HOT, BOARD_MARK, Icon, keepsPress, swallowNextClick } from '$ui/design-system';
	import { CanvasCamera } from '$ui/design-system/canvas-camera';
	import { CanvasGesture } from '$ui/design-system/canvas-gesture';
	import { MAX_ZOOM, MIN_ZOOM } from '$ui/design-system/pan-zoom.svelte';
	import WheelHint from '$ui/design-system/WheelHint.svelte';
	import { listenWheelZoom, zoomKeyLabel } from '$ui/design-system/wheel-zoom';
	import {
		DB_ENGINES,
		FIELD_TYPES,
		HOST_KINDS,
		childFieldsOfField,
		type DbEngine,
		type EntityField,
		type FieldType,
		type HostKind,
		type Protocol
	} from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import { ENGINE_HEX, HOST_TYPE_GLYPH, HOST_TYPE_HEX, PROTOCOL_HEX } from '../infra-style';
	import { RING_R } from './crows-foot';
	import {
		CARD_FOOT_H,
		CARD_HEAD_H,
		DB_HEAD_H,
		HOST_HEAD_H,
		COL_HEAD_H,
		ROW_H,
		ORIGIN_HEX,
		UNPLACED_HEX,
		VISIBILITY_HEX,
		VISIBILITY_LABEL,
		KEY_BADGE,
		fieldKeyOf,
		fieldTypeLabel,
		placementOf,
		relationEdges,
		tableColor,
		visibilityStatus,
		type FieldKey,
		type Lens,
		type LinkMode,
		type MapLayout
	} from './data-map';
	import type { Selection } from './selection';

	interface Props {
		store: DataStore;
		layout: MapLayout;
		lens: Lens;
		/** Ids the client experience surfaces (server-side cross-check). */
		surfaced: ReadonlySet<string>;
		/** Fields the search matched on their own: their row is highlighted. */
		matchedFieldIds: ReadonlySet<string>;
		selection: Selection;
		onSelect: (sel: Selection) => void;
		/** Relation lines: every one, only the focused table's, or none. */
		links: LinkMode;
		showInterfaces: boolean;
		/** Changes whenever the set of placed tables changes, which re-fits the view. */
		fitKey: string;
		/** Read the model without changing it (the Specification 360°): keys, names and types read as text. */
		readonly?: boolean;
		/**
		 * Moves a table held by its header to where it is, inside its database
		 * (criterion 7f5769bb): `done` once it is let go. Absent for who may not
		 * move tables: the header pans the map for them.
		 */
		onPlace?: ((tableId: string, x: number, y: number, done: boolean) => void) | null;
	}
	let {
		store,
		layout,
		lens,
		surfaced,
		matchedFieldIds,
		selection,
		onSelect,
		links,
		showInterfaces,
		fitKey,
		readonly = false,
		onPlace = null
	}: Props = $props();

	const kindLabel = (k: HostKind) => HOST_KINDS.find((x) => x.code === k)?.label ?? k;
	const engineLabel = (e: DbEngine) => DB_ENGINES.find((x) => x.code === e)?.label ?? e;
	// A relation is chosen from the Key column (FK) so the Type list stays about shapes.
	const SHAPES = FIELD_TYPES.filter((t) => t.code !== 'relation');

	const entityById = $derived(new Map(store.draft.entities.map((e) => [e.id, e] as const)));
	const fieldById = $derived(new Map(store.draft.fields.map((f) => [f.id, f] as const)));
	const lensCtx = $derived({ draft: store.draft, derived: surfaced });

	/* ─────────────────────────── focus + neighbours ──────────────────────── */
	let hoveredId = $state<string | null>(null);
	/** The field row under the pointer: a relation it carries lights alone (criterion 8bcd4e89). */
	let hoveredFieldId = $state<string | null>(null);
	const focusId = $derived(
		hoveredId ?? (selection.kind === 'table' ? selection.id : null)
	);
	/**
	 * The table in hand follows the pointer by an offset drawn on its card alone:
	 * the map is laid out again once, when it is let go, not at every pointer move
	 * (a move marks nothing and moves no version, so only its own links follow it live).
	 */
	let drag = $state<{ id: string; dx: number; dy: number } | null>(null);
	/** Room the relation layer keeps around the map, in map pixels. */
	const EDGE_MARGIN = 600;
	const laidEdges = $derived(relationEdges(store.draft, layout));
	/**
	 * While a table is in hand only the links that touch it are routed again, on
	 * its moving place; every other link keeps its route (criterion d5c8782c).
	 */
	const touching = $derived(
		drag
			? new Set(store.draft.fields.filter((f) => f.type === 'relation' && (f.entityId === drag!.id || f.relationTargetEntityId === drag!.id)).map((f) => f.id))
			: null
	);
	const edges = $derived.by(() => {
		if (!drag || !touching || touching.size === 0) return laidEdges;
		const held = layout.tables.get(drag.id);
		if (!held) return laidEdges;
		const tables = new Map(layout.tables);
		tables.set(drag.id, { ...held, x: held.x + drag.dx, y: held.y + drag.dy });
		const moved = relationEdges(
			{ ...store.draft, fields: store.draft.fields.filter((f) => f.type !== 'relation' || touching.has(f.id)) },
			{ ...layout, tables }
		);
		return [...laidEdges.filter((e) => !touching.has(e.id)), ...moved];
	});
	/** The lines a hovered field carries: its own as a foreign key, every one landing on it as a key. */
	const fieldLit = $derived(hoveredFieldId ? edges.filter((e) => e.id === hoveredFieldId || e.toFieldId === hoveredFieldId) : []);
	/** The rows at both ends of the lit lines, tinted. */
	const litRows = $derived(new Set(fieldLit.flatMap((e) => [e.id, ...(e.toFieldId ? [e.toFieldId] : [])])));
	/** The tables a lit line lands on by their header, having no key row shown: their header is tinted instead. */
	const litHeads = $derived(new Set(fieldLit.filter((e) => !e.toFieldId).map((e) => e.toEntityId)));
	const isHot = (e: (typeof edges)[number]) =>
		fieldLit.length > 0 ? fieldLit.includes(e) : focusId !== null && (e.fromEntityId === focusId || e.toEntityId === focusId);
	const neighbours = $derived.by(() => {
		if (fieldLit.length > 0) return new Set(fieldLit.flatMap((e) => [e.fromEntityId, e.toEntityId]));
		if (!focusId) return null;
		const set = new Set([focusId]);
		for (const e of edges) {
			if (e.fromEntityId === focusId) set.add(e.toEntityId);
			if (e.toEntityId === focusId) set.add(e.fromEntityId);
		}
		return set;
	});
	/** A second click on the selected table lets it go (criterion 95ccccd8). */
	const pick = (id: string) => onSelect(selection.kind === 'table' && selection.id === id ? { kind: 'none' } : { kind: 'table', id });

	/* ────────────────────────────── interfaces ───────────────────────────── */
	// Endpoints resolve by name, against machines and tables, as the inspector does.
	const wires = $derived.by(() => {
		if (!showInterfaces) return [];
		const at = new Map<string, { x: number; y: number }>();
		for (const h of layout.hosts) {
			if (h.id !== '__none__') at.set(h.name, { x: h.x + h.w / 2, y: h.y + 28 });
		}
		for (const [id, t] of layout.tables) {
			const name = entityById.get(id)?.name.trim();
			if (name) at.set(name, { x: t.x + t.w / 2, y: t.y + CARD_HEAD_H / 2 });
		}
		return store.draft.interfaces
			.map((i) => {
				const a = at.get(i.fromBrick.trim());
				const b = at.get(i.toBrick.trim());
				if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
				const mx = (a.x + b.x) / 2;
				const my = Math.min(a.y, b.y) - 40;
				return {
					id: i.id,
					d: `M ${a.x} ${a.y} Q ${mx} ${my}, ${b.x} ${b.y}`,
					stroke: PROTOCOL_HEX[i.protocol as Protocol] ?? '#bb46f5'
				};
			})
			.filter((w): w is { id: string; d: string; stroke: string } => w !== null);
	});

	/* ─────────────────────────────── pan + zoom ──────────────────────────── */
	let viewport = $state<HTMLDivElement | null>(null);
	let tx = $state(0);
	let ty = $state(0);
	let k = $state(1);
	const PAD = 32;

	/** Provisional (spec constant DETAIL_ZOOM): under it a table shows its name, not its rows. */
	const DETAIL_ZOOM = 0.45;
	const detailed = $derived(k >= DETAIL_ZOOM);

	/* ─────────────────────── titles, on the screen layer ─────────────────── */
	// Machine and database titles say where data lives. They are placed in screen
	// pixels from the world position, never scaled, so they stay one size and crisp.
	let vw = $state(0);
	let vh = $state(0);
	const INSET = 10;
	const HOST_TITLE_H = 22;
	const DB_TITLE_H = 18;
	/** A title narrower than this would show nothing but an ellipsis. */
	const MIN_TITLE_W = 56;

	const hostHex = (h: MapLayout['hosts'][number]) =>
		h.origin ? ORIGIN_HEX[h.origin] : h.kind ? HOST_TYPE_HEX[h.kind] : UNPLACED_HEX;

	const onScreen = (left: number, top: number, w: number, h: number) =>
		left < vw && top < vh && left + w > 0 && top + h > 0;

	// Where the band the layout keeps above a container's content is thinner on screen
	// than its title, the title becomes the container's header strip and covers the
	// top of the content: zoomed far out, titles never pile onto one another.
	const hostTitles = $derived.by(() =>
		layout.hosts.flatMap((h) => {
			const left = h.x * k + tx;
			const top = h.y * k + ty;
			const w = h.w * k;
			const hh = h.h * k;
			if (!onScreen(left, top, w, hh)) return [];
			// Pinned (the machine's top has left the view), it sits over tables: a strip too.
			const strip = HOST_HEAD_H * k < HOST_TITLE_H + INSET || top < 0;
			const inset = strip ? 2 : INSET;
			// Pinned flush to the edge of the view while the machine still runs past it.
			const x = left < 0 ? 0 : left + inset;
			const y = Math.min(top < 0 ? 0 : top + inset, top + hh - HOST_TITLE_H - inset);
			const maxW = left + w - inset - x;
			return maxW < MIN_TITLE_W ? [] : [{ h, x, y, maxW, strip }];
		})
	);
	const dbTitles = $derived.by(() => {
		const hostBottom = new Map(hostTitles.map((t) => [t.h.id, t.y + HOST_TITLE_H] as const));
		return layout.hosts.flatMap((h) =>
			h.databases.flatMap((d) => {
				const left = d.x * k + tx;
				const top = d.y * k + ty;
				const w = d.w * k;
				const dh = d.h * k;
				if (!onScreen(left, top, w, dh)) return [];
				const below = hostBottom.get(h.id) ?? -Infinity;
				const strip = DB_HEAD_H * k < DB_TITLE_H + 6 || below > top;
				const y = Math.max(top + (strip ? 1 : 6), below + 1);
				const x = left < 0 ? 0 : left + (strip ? 1 : 8);
				const maxW = left + w - (strip ? 1 : 8) - x;
				if (maxW < MIN_TITLE_W || y + DB_TITLE_H > top + dh) return [];
				return [{ d, x, y, maxW, strip }];
			})
		);
	});

	/**
	 * Zoomed out, a table's name gets the largest type its card holds on screen, in
	 * world pixels; null when even the smallest readable type would not fit.
	 */
	/** A header strip: the page colour tinted by its container's, so it reads as that container's top. */
	const stripStyle = (hex: string) =>
		`background:color-mix(in srgb, ${hex} 9%, var(--color-surface));border-color:${hex}33`;

	function nameFit(name: string, w: number, h: number) {
		const availW = w * k - 12;
		const availH = h * k - 8;
		const longest = Math.max(4, ...name.split(/\s+/).map((word) => word.length));
		let px = Math.min(15, availW / (0.6 * longest));
		const lines = Math.max(1, Math.ceil((name.length * 0.6 * px) / availW));
		px = Math.min(px, availH / (lines * 1.25));
		if (px < 8) return null;
		return { name: px / k, count: 11 / k, showCount: availH >= lines * px * 1.25 + 14 };
	}

	/* The map moves as every diagram does (ac-diag-wheel, -touch, -throw, -glide): between 20% and 400%
	   (ac-diag-fs-3), gliding to a fit or a zoom step, thrown on by a drag, kept in view by its edges. */
	const camera = new CanvasCamera({
		read: () => ({ s: k, x: tx, y: ty }),
		write: (v) => {
			k = v.s;
			tx = v.x;
			ty = v.y;
		},
		min: MIN_ZOOM,
		max: MAX_ZOOM,
		bounds: () => (viewport ? { view: { w: viewport.clientWidth, h: viewport.clientHeight }, content: { x: 0, y: 0, w: layout.width, h: layout.height } } : null)
	});
	/** Where everything shows, however small: the double-click and the ⤢ button. */
	function fitted(): { s: number; x: number; y: number } | null {
		if (!viewport) return null;
		const cw = viewport.clientWidth;
		const ch = viewport.clientHeight;
		const s = Math.max(MIN_ZOOM, Math.min(1, (cw - PAD * 2) / layout.width, (ch - PAD * 2) / layout.height));
		// Centred in the frame; a map too large even at the smallest zoom starts at its top-left corner.
		return { s, x: Math.max(PAD, (cw - layout.width * s) / 2), y: Math.max(PAD, (ch - layout.height * s) / 2) };
	}
	/** Show everything, gliding there from where the map stands. */
	function fit() {
		const to = fitted();
		if (to) camera.glideTo(to);
	}
	/** Open whole, fitted to the frame (criterion 87eebb16): never cut at its right or its bottom. */
	function open() {
		const to = fitted();
		if (to) camera.jump(to);
	}
	/** One step of the panel's zoom around the middle, counted from where a glide is going. */
	function zoomBy(factor: number) {
		if (!viewport) return;
		const from = camera.target;
		const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from.s * factor));
		const cx = viewport.clientWidth / 2;
		const cy = viewport.clientHeight / 2;
		camera.glideTo({ s, x: cx - ((cx - from.x) * s) / from.s, y: cy - ((cy - from.y) * s) / from.s });
	}

	// Re-fit when what is placed changes (a filter, a table added), not on every keystroke.
	$effect(() => {
		void fitKey;
		if (viewport) requestAnimationFrame(open);
	});

	// In a page the wheel scrolls it; Ctrl or ⌘ with the wheel, or a pinch, zooms the map (ac-diag-wheel).
	let hint = $state<WheelHint | null>(null);
	const zoomKey = zoomKeyLabel();
	$effect(() => {
		const el = viewport;
		if (!el) return;
		return listenWheelZoom(el, {
			ownsRoom: () => !!el.closest('[aria-modal="true"]'),
			zoomAt: (factor, cx, cy) => camera.zoomAt(factor, cx, cy),
			hint: () => hint?.poke()
		});
	});
	$effect(() => () => camera.stop());

	// Hold and drag pans from anywhere, cards included, once past the threshold (canvas-gesture.ts):
	// under it a press stays a click, so a card still opens; fields keep their own presses. Two fingers pinch.
	const gesture = new CanvasGesture();
	let panning = $state(false);
	/** A table held by its header by who may move it (criterion 7f5769bb): it follows once past the threshold. */
	const MOVE_THRESHOLD = 4;
	let held: { id: string; pointer: number; x0: number; y0: number; from: { x: number; y: number }; moving: boolean; card: HTMLElement | null } | null = null;
	let moving = $state(false);
	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 || keepsPress(e.target)) return;
		if (held) return;
		const handle = onPlace && !gesture.pressed && e.target instanceof Element ? e.target.closest<HTMLElement>('[data-move-table]') : null;
		const from = handle ? placementOf(layout, handle.dataset.moveTable!) : null;
		if (handle && from) {
			held = { id: handle.dataset.moveTable!, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, from, moving: false, card: handle.closest<HTMLElement>('[data-card]') };
			return;
		}
		gesture.press(e.pointerId, e.clientX, e.clientY, e.timeStamp);
		camera.hold();
	}
	function onPointerMove(e: PointerEvent) {
		if (held) {
			if (e.pointerId !== held.pointer || !onPlace) return;
			const dx = e.clientX - held.x0;
			const dy = e.clientY - held.y0;
			if (!held.moving && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
			if (!held.moving) {
				held.moving = moving = true;
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
				window.getSelection()?.removeAllRanges();
			}
			// The card in hand moves on its own, outside the reactive tree: the other cards are not read again.
			if (held.card) {
				held.card.style.transform = `translate(${dx / k}px,${dy / k}px)`;
				held.card.style.zIndex = '20';
			}
			drag = { id: held.id, dx: dx / k, dy: dy / k };
			return;
		}
		const step = gesture.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
		if (!step) return;
		const el = e.currentTarget as HTMLElement;
		if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
		if (!panning) {
			panning = true;
			window.getSelection()?.removeAllRanges();
		}
		camera.panBy(step.dx, step.dy);
		if (step.factor !== 1) {
			const r = el.getBoundingClientRect();
			camera.zoomAt(step.factor, step.cx - r.left, step.cy - r.top);
		}
	}
	function onPointerUp(e: PointerEvent) {
		if (held) {
			if (e.pointerId !== held.pointer) return;
			// Let go where it stands; a press that never moved stays a click on the header.
			if (held.moving && onPlace) {
				onPlace(held.id, held.from.x + (e.clientX - held.x0) / k, held.from.y + (e.clientY - held.y0) / k, true);
				swallowNextClick(e.currentTarget as HTMLElement);
			}
			if (held.card) {
				held.card.style.transform = '';
				held.card.style.zIndex = '';
			}
			held = null;
			moving = false;
			drag = null;
			return;
		}
		const released = gesture.release(e.pointerId, e.timeStamp);
		if (!released) return;
		if (released.moved) swallowNextClick(e.currentTarget as HTMLElement);
		// A press on the map's empty space that did not pan lets the selected table go (criterion 95ccccd8).
		else if (selection.kind === 'table' && e.target instanceof Element && !e.target.closest('[data-card], button, a, input, select, textarea'))
			onSelect({ kind: 'none' });
		panning = false;
		camera.release(released.vx, released.vy);
	}
	/** Escape lets the selected table go, unless a field being typed in takes it (criterion 95ccccd8). */
	function onEscape(e: KeyboardEvent) {
		if (e.key !== 'Escape' || selection.kind === 'none' || keepsPress(e.target)) return;
		onSelect({ kind: 'none' });
	}

	/* ──────────────────────────────── editing ────────────────────────────── */
	function onKey(f: EntityField, value: string) {
		store.setFieldKey(f.id, value as FieldKey);
	}
	function onType(f: EntityField, value: string) {
		store.setFieldType(f.id, value as FieldType);
	}
	function onTarget(f: EntityField, value: string) {
		store.setFieldKey(f.id, 'foreign', value);
	}

	const KEY_TONE: Record<FieldKey, string> = {
		none: 'text-ink-300',
		primary: 'bg-warning-100 text-warning-700',
		unique: 'bg-success-100 text-success-700',
		foreign: 'bg-brand-50 text-brand-600'
	};
	/** Lines stay a quiet grey; only the focused table's take the brand color. */
	const LINE = BOARD_LINE;
	const LINE_HOT = BOARD_LINE_HOT;

	const KEY_HELP =
		'Key: PK is the primary key that identifies a row, FK points at another table, UK must be unique.';
</script>

<svelte:window onkeydown={onEscape} />

<!-- The frame, then the line that says how to move the map, under it so it covers no table (criterion 87eebb16). -->
<div class="flex h-full min-h-[520px] flex-col gap-1.5">
	<div
		bind:this={viewport}
		bind:clientWidth={vw}
		bind:clientHeight={vh}
		class="relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl border border-line bg-surface-sunken/40 select-none {panning || moving
			? 'cursor-grabbing'
			: 'cursor-grab'}"
		style={BOARD_DOTS}
		role="application"
		aria-label="Data map: hold and drag to pan, {zoomKey} + scroll to zoom"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		ondragstart={(e) => e.preventDefault()}
		ondblclick={(e) => {
			if (!(e.target as HTMLElement).closest('[data-card]')) fit();
		}}
	>
		<div
			class="absolute left-0 top-0 origin-top-left"
			style="width:{layout.width}px;height:{layout.height}px;transform:translate({tx}px,{ty}px) scale({k})"
		>
			<!-- machines, then their databases: the boxes only; their titles live on the
			     screen layer below, so they keep one size at every zoom -->
			{#each layout.hosts as h (h.id)}
				{@const hex = hostHex(h)}
				{@const hostSel = selection.kind === 'host' && selection.id === h.id}
				<div
					class="absolute rounded-2xl border-2 {h.kind || h.origin ? '' : 'border-dashed'}"
					style="left:{h.x}px;top:{h.y}px;width:{h.w}px;height:{h.h}px;background:{hex}08;border-color:{hostSel
						? hex
						: hex + '40'}"
				></div>
				{#each h.databases as d (d.id)}
					{@const eng = d.engine ? ENGINE_HEX[d.engine] : UNPLACED_HEX}
					<div
						class="absolute grid place-items-center rounded-xl border {d.engine ? '' : 'border-dashed'}"
						style="left:{d.x}px;top:{d.y}px;width:{d.w}px;height:{d.h}px;background:{eng}06;border-color:{eng}33"
					>
						{#if d.tables.length === 0}
							<p class="text-[0.6875rem] italic text-ink-300">No table in this database yet.</p>
						{/if}
					</div>
				{/each}
			{/each}

			<!-- relation lines UNDER the cards, so a line never covers a field name: each
			     leaves from its FK row and lands on the target's key row at right angles
			     around the cards, its crow's foot marks at both ends (criteria c1f51729,
			     584cb5f6); the focused table's lines are drawn last, over the others -->
			{#if links !== 'off'}
				<!-- A margin around the map, so a line routed past its edge (a table in hand) is always repainted, never left as a trail. -->
				<svg
					class="pointer-events-none absolute overflow-visible"
					style="left:{-EDGE_MARGIN}px;top:{-EDGE_MARGIN}px"
					width={layout.width + 2 * EDGE_MARGIN}
					height={layout.height + 2 * EDGE_MARGIN}
					viewBox="{-EDGE_MARGIN} {-EDGE_MARGIN} {layout.width + 2 * EDGE_MARGIN} {layout.height + 2 * EDGE_MARGIN}"
					fill="none"
					stroke-linejoin="round"
				>
					{#each edges as e (e.id)}
						{#if !isHot(e)}
							{#if links === 'all' && focusId === null}
								<path d={e.d} stroke={LINE} stroke-width="1.4" />
								<!-- The marks in the map's dark ink, bolder than the line (criterion 584cb5f6). -->
								<g stroke={BOARD_MARK} stroke-width="1.6">
									<path d={e.marks} />
									{#each e.rings as r, i (i)}<circle cx={r.x} cy={r.y} r={RING_R} fill="var(--color-surface)" />{/each}
								</g>
							{:else if links === 'all'}
								<path d={e.d} stroke={LINE} stroke-width="1" stroke-opacity="0.15" />
							{/if}
						{/if}
					{/each}
					{#each edges.filter(isHot) as e (e.id)}
						<g stroke={LINE_HOT} stroke-width={fieldLit.length > 0 ? 2.4 : 2} stroke-opacity="0.95">
							<path d={e.d} />
							<path d={e.marks} />
							{#each e.rings as r, i (i)}<circle cx={r.x} cy={r.y} r={RING_R} fill="var(--color-surface)" />{/each}
						</g>
					{/each}
				</svg>
			{/if}

			<!-- tables: one card per table, columns named Key · Field · Type, edited in place -->
			{#each [...layout.tables.values()] as t (t.id)}
				{@const entity = entityById.get(t.id)}
				{#if entity}
					{@const color = tableColor(lens, lensCtx, entity)}
					{@const isSel = selection.kind === 'table' && selection.id === t.id}
					{@const dimmed = neighbours !== null && !neighbours.has(t.id)}
					{@const tableStatus = visibilityStatus(store.draft, surfaced, t.id)}
					<div
						data-card
						role="group"
						aria-label="Table {entity.name || 'Untitled table'}"
						class="absolute flex cursor-default flex-col overflow-hidden rounded-lg border bg-surface shadow-sm transition-opacity {isSel
							? 'shadow-lg'
							: ''}"
						style="left:{t.x}px;top:{t.y}px;width:{t.w}px;height:{t.h}px;border-left:4px solid {color};{isSel
							? `border-color:${color};box-shadow:0 0 0 2px ${color}44;`
							: ''}opacity:{dimmed ? 0.3 : 1}"
						onpointerenter={() => (hoveredId = t.id)}
						onpointerleave={() => (hoveredId = null)}
					>
						{#if !detailed}
							<!-- zoomed out: the table by its name, in the largest type its card holds;
							     too far out for any readable type, a plain block named on hover -->
							{@const label = entity.name || 'Untitled table'}
							{@const nameSize = nameFit(label, t.w, t.h)}
							<button
								type="button"
								onclick={() => pick(t.id)}
								data-move-table={onPlace ? t.id : undefined}
								class="flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden px-1.5 text-center text-ink-900 hover:bg-surface-sunken/60 {onPlace ? 'cursor-move' : ''}"
								title={readonly ? `${label}: show its relations` : `${label}: open the table inspector`}
							>
								{#if nameSize}
									<span class="break-words font-bold leading-tight" style="font-size:{nameSize.name}px">{label}</span>
									{#if nameSize.showCount}
										<span class="text-ink-400" style="font-size:{nameSize.count}px"
											>{t.fieldIds.length} field{t.fieldIds.length === 1 ? '' : 's'}</span
										>
									{/if}
								{/if}
							</button>
						{:else}
							<button
								type="button"
								onclick={() => pick(t.id)}
								data-move-table={onPlace ? t.id : undefined}
								class="flex shrink-0 items-center gap-2 border-b border-line px-3 text-left text-ink-900 transition-colors {litHeads.has(t.id) ? 'bg-brand-50' : 'hover:bg-surface-sunken/60'} {onPlace ? 'cursor-move' : ''}"
								style="height:{CARD_HEAD_H}px"
								title={`${readonly ? 'Show its relations' : 'Open the table inspector'}${onPlace ? '; hold and drag to move it' : ''}`}
							>
								{#if lens === 'visibility'}
									<span style="color:{color}"><Icon name={tableStatus === 'visible' ? 'eye' : tableStatus === 'hidden' ? 'eye-off' : 'flag'} size={13} /></span>
								{:else}
									<span style="color:{color}"><Icon name="table" size={13} /></span>
								{/if}
								<span class="min-w-0 flex-1 text-[0.8125rem] font-bold whitespace-nowrap">{entity.name || 'Untitled table'}</span>
								<span class="text-[0.625rem] text-ink-400">{t.fieldIds.length}</span>
							</button>

							<div
								class="grid shrink-0 grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-1 border-b border-line bg-surface-sunken/60 px-2 text-[0.5625rem] font-semibold uppercase tracking-wider text-ink-400"
								style="height:{COL_HEAD_H}px"
							>
								<span title={KEY_HELP}>Key</span>
								<span title="Field: the name of what the table stores">Field</span>
								<span title="Type: the shape of the value, or for an FK the table it points at">Type</span>
							</div>

							<div class="min-h-0 flex-1">
								{#each t.fieldIds as fid (fid)}
									{@const f = fieldById.get(fid)}
									{#if f}
										{@const key = fieldKeyOf(f)}
										{@const children = f.type === 'object' ? childFieldsOfField(store.draft, f.id).length : 0}
										{@const fStatus = visibilityStatus(store.draft, surfaced, f.id)}
										<!-- Hovering a row lights the relation it carries, its rows at both ends tinted (criterion 8bcd4e89). -->
										<div
											class="group/row relative grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-1 border-b border-line/60 px-2 transition-colors {litRows.has(f.id)
												? 'bg-brand-50'
												: matchedFieldIds.has(f.id)
													? 'bg-warning-50'
													: 'hover:bg-surface-sunken/70'}"
											style="height:{ROW_H}px"
											role="group"
											aria-label="Field {f.name || 'field'}"
											onpointerenter={() => (hoveredFieldId = f.id)}
											onpointerleave={() => (hoveredFieldId = null)}
										>
											{#if readonly}
												<span title={KEY_HELP} class="h-5 w-full rounded px-1 text-center text-[0.625rem] leading-5 font-bold {KEY_TONE[key]}">{KEY_BADGE[key] || '-'}</span>
											{:else}
											<select
												value={key}
												onchange={(e) => onKey(f, e.currentTarget.value)}
												aria-label="Key of {f.name || 'field'}"
												title={KEY_HELP}
												class="h-5 w-full cursor-pointer appearance-none rounded border-none px-1 text-center text-[0.625rem] font-bold {KEY_TONE[
													key
												]}"
											>
												<option value="none">-</option>
												<option value="primary">PK</option>
												<option value="foreign">FK</option>
												<option value="unique">UK</option>
											</select>
											{/if}
											<span class="flex min-w-0 items-center gap-1">
												{#if lens === 'visibility'}
													<span
														class="size-2 shrink-0 "
														style="background:{VISIBILITY_HEX[fStatus]}"
														title={VISIBILITY_LABEL[fStatus]}
													></span>
												{/if}
												{#if readonly}
													<span class="min-w-0 flex-1 font-mono text-[0.6875rem] whitespace-nowrap text-ink-800">{f.name || 'field'}</span>
												{:else}
												<input
													value={f.name}
													oninput={(e) => store.updateField(f.id, 'name', e.currentTarget.value)}
													placeholder="field"
													aria-label="Field name"
													class="min-w-0 flex-1 border-none bg-transparent p-0 font-mono text-[0.6875rem] text-ink-800 outline-none placeholder:text-ink-300 focus:bg-surface-sunken"
												/>
												{/if}
												{#if f.isList}<span class="text-[0.625rem] text-ink-400" title="A list">[]</span>{/if}
												{#if children}<span class="text-[0.625rem] text-ink-400" title="{children} nested field(s)">&#123;{children}&#125;</span>{/if}
											</span>
											{#if readonly}
												<span class="rounded px-1 font-mono text-[0.625rem] whitespace-nowrap {key === 'foreign' ? 'bg-brand-50 text-brand-600' : 'text-ink-500'}"
													>{fieldTypeLabel(store.draft, f)}</span
												>
											{:else if key === 'foreign'}
												<select
													value={f.relationTargetEntityId ?? ''}
													onchange={(e) => onTarget(f, e.currentTarget.value)}
													aria-label="Table {f.name || 'field'} points at"
													class="h-5 w-full min-w-0 cursor-pointer truncate rounded border-none bg-brand-50 px-1 font-mono text-[0.625rem] text-brand-600"
												>
													{#each store.draft.entities as e (e.id)}
														<option value={e.id}>→ {e.name || 'table'}</option>
													{/each}
												</select>
											{:else}
												<select
													value={f.type}
													onchange={(e) => onType(f, e.currentTarget.value)}
													aria-label="Type of {f.name || 'field'}"
													class="h-5 w-full min-w-0 cursor-pointer rounded border-none bg-transparent px-1 font-mono text-[0.625rem] text-ink-500 hover:bg-surface-sunken"
												>
													{#each SHAPES as s (s.code)}
														<option value={s.code}>{s.label}</option>
													{/each}
												</select>
											{/if}
											{#if !readonly}
											<button
												type="button"
												onclick={() => store.removeField(f.id)}
												class="absolute -right-0.5 top-1/2 hidden -translate-y-1/2 rounded bg-surface px-0.5 text-ink-300 hover:text-danger-500 group-hover/row:block"
												title="Remove this field"
												aria-label="Remove field {f.name}"><Icon name="x" size={11} /></button
											>
											{/if}
										</div>
									{/if}
								{:else}
									<p class="px-3 text-[0.6875rem] italic text-ink-300" style="line-height:{ROW_H}px">No field yet.</p>
								{/each}
							</div>

							{#if readonly}
								<span class="shrink-0 border-t border-line" style="height:{CARD_FOOT_H}px"></span>
							{:else}
							<button
								type="button"
								onclick={() => store.addField(t.id)}
								class="shrink-0 border-t border-line text-left text-[0.6875rem] font-medium text-brand-600 hover:bg-surface-sunken"
								style="height:{CARD_FOOT_H}px;padding:0 12px"
							>
								+ field
							</button>
							{/if}
						{/if}
					</div>
				{/if}
			{/each}

			<!-- interface wires on top: they join named bricks across the whole map -->
			<svg
				class="pointer-events-none absolute left-0 top-0 overflow-visible"
				width={layout.width}
				height={layout.height}
			>
				<defs>
					<marker id="erd-wire" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
						<path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(85 85 92 / 0.8)" />
					</marker>
				</defs>
				{#each wires as w (w.id)}
					{@const isSel = selection.kind === 'interface' && selection.id === w.id}
					<path
						d={w.d}
						fill="none"
						stroke={w.stroke}
						stroke-width={isSel ? 3 : 1.6}
						stroke-opacity={isSel ? 1 : 0.6}
						stroke-dasharray="4 4"
						marker-end="url(#erd-wire)"
					/>
					<!-- a wide invisible twin so the dashed wire is easy to click -->
					<path
						d={w.d}
						fill="none"
						stroke="transparent"
						stroke-width="12"
						class="pointer-events-auto cursor-pointer"
						role="button"
						tabindex="-1"
						aria-label="Interface"
						onclick={() => onSelect({ kind: 'interface', id: w.id })}
						onkeydown={() => {}}
					/>
				{/each}
			</svg>
		</div>

		<!-- screen layer: container titles at one size whatever the zoom; databases first so a
		     machine title pinned to the top of the view passes over them -->
		<div class="pointer-events-none absolute inset-0 overflow-hidden">
			{#each dbTitles as { d, x, y, maxW, strip } (d.id)}
				{@const eng = d.engine ? ENGINE_HEX[d.engine] : UNPLACED_HEX}
				<div
					class="absolute flex items-center gap-2 whitespace-nowrap {strip ? ' border-b px-2.5' : 'title-halo'}"
					style="left:{x}px;top:{y}px;height:{DB_TITLE_H}px;{strip
						? `width:${maxW}px;${stripStyle(eng)}`
						: `max-width:${maxW}px`}"
				>
					<span class="truncate text-[0.6875rem] font-extrabold uppercase tracking-[0.08em]" style="color:{eng}">⛁ {d.name}</span>
					<span class="shrink-0 text-[0.6875rem] text-ink-500">
						{d.engine ? engineLabel(d.engine) + ' · ' : ''}{d.tables.length} table{d.tables.length === 1 ? '' : 's'}
					</span>
				</div>
			{/each}
			{#each hostTitles as { h, x, y, maxW, strip } (h.id)}
				{@const hex = hostHex(h)}
				<button
					type="button"
					disabled={!h.kind || readonly}
					onclick={() => onSelect({ kind: 'host', id: h.id })}
					class="pointer-events-auto absolute flex items-center gap-2 whitespace-nowrap text-left enabled:cursor-pointer disabled:cursor-default {strip
						? ' border-b px-2'
						: 'title-halo rounded-md enabled:hover:underline'}"
					style="left:{x}px;top:{y}px;height:{HOST_TITLE_H}px;{strip
						? `width:${maxW}px;${stripStyle(hex)}`
						: `max-width:${maxW}px`}"
					title={h.kind ? 'Open the machine inspector' : undefined}
				>
					<span
						class="grid size-5 shrink-0 place-items-center rounded text-[0.6875rem]"
						style="background:{hex}1f;color:{hex}">{h.kind ? HOST_TYPE_GLYPH[h.kind] : h.origin ? '◆' : '?'}</span
					>
					<span class="shrink-0 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]" style="color:{hex}">
						{h.origin ? 'Origin' : h.kind ? kindLabel(h.kind) : 'Unplaced'}
					</span>
					<span class="min-w-0 truncate text-sm font-bold text-ink-900">{h.name}</span>
					{#if h.kind}
						<span class="min-w-0 shrink-[2] truncate text-[0.6875rem] text-ink-500">
							{h.kind === 'onprem' ? 'Customer site' : `${h.provider || 'No provider'}${h.region ? ' · ' + h.region : ''}`}
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- zoom controls -->
		<div class="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-field border border-line bg-surface shadow-sm">
			<button type="button" onclick={() => zoomBy(1.2)} class="p-1.5 text-ink-500 hover:bg-surface-sunken" title="Zoom in" aria-label="Zoom in"><Icon name="plus" size={14} /></button>
			<button type="button" onclick={() => zoomBy(1 / 1.2)} class="border-t border-line p-1.5 text-ink-500 hover:bg-surface-sunken" title="Zoom out" aria-label="Zoom out"><Icon name="minus" size={14} /></button>
			<button type="button" onclick={fit} class="border-t border-line p-1.5 text-ink-500 hover:bg-surface-sunken" title="Fit the whole map" aria-label="Fit"><Icon name="maximize" size={14} /></button>
		</div>
		<WheelHint bind:this={hint} />
	</div>
	<p class="shrink-0 px-1 text-[0.625rem] text-ink-400">
		Hold and drag to pan · {zoomKey} + scroll to zoom · double-click to fit · {Math.round(k * 100)}%
	</p>
</div>

<style>
	/* A map label reads over lines and boxes through a halo of the page colour, not a box. */
	.title-halo {
		text-shadow:
			0 0 2px var(--color-surface),
			0 0 4px var(--color-surface),
			0 0 8px var(--color-surface);
	}
</style>
