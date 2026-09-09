<script lang="ts">
	import {
		DB_ENGINES,
		HOST_KINDS,
		PROTOCOLS,
		databasesOfHost,
		type DbEngine,
		type HostKind,
		type Protocol
	} from '$domain/data';
	import type { DataStore } from '../draft-store.svelte';
	import { HOST_TYPE_HEX, HOST_TYPE_GLYPH, ENGINE_HEX, PROTOCOL_HEX } from '../infra-style';
	import type { Selection } from './selection';

	interface Props {
		store: DataStore;
		selection: Selection;
		onSelect: (sel: Selection) => void;
		showInterfaces: boolean;
		showRelations: boolean;
	}
	let { store, selection, onSelect, showInterfaces, showRelations }: Props = $props();

	// Geometry — a district per host, a block per database technology, a building
	// per placed table, windows per field.
	const DISTRICT_W = 300;
	const GAP = 22;
	const PAD = 24;
	/** Host header band: kind, name, provider · region, database summary. */
	const HEAD_H = 82;
	/** District inner padding around the database blocks. */
	const IPAD = 12;
	/** Database block header band (engine name + database + table count). */
	const GHEAD = 22;
	const GPAD = 10;
	const BW = 124;
	const BH = 54;
	const BGAP = 8;
	const COLS = 3;

	const kindLabel = (k: HostKind) => HOST_KINDS.find((x) => x.code === k)?.label ?? k;
	const engineLabel = (e: DbEngine) => DB_ENGINES.find((x) => x.code === e)?.label ?? e;

	interface Building {
		id: string;
		name: string;
		fields: number;
		bx: number;
		by: number;
	}
	/** One database technology on a host — the tables that live in it, labelled once. */
	interface DbBlock {
		id: string;
		name: string;
		engine: DbEngine;
		x: number;
		y: number;
		w: number;
		h: number;
		buildings: Building[];
	}
	interface District {
		id: string;
		name: string;
		kind: HostKind;
		provider: string;
		region: string;
		dbLabel: string;
		x: number;
		y: number;
		w: number;
		h: number;
		blocks: DbBlock[];
	}

	const blockHeight = (tables: number) => {
		const rows = Math.max(1, Math.ceil(tables / 2));
		return tables === 0 ? GHEAD + 34 : GHEAD + rows * BH + (rows - 1) * BGAP + GPAD;
	};

	const map = $derived.by(() => {
		const d = store.draft;
		const fieldCount = (entityId: string) => d.fields.filter((f) => f.entityId === entityId).length;

		const districts: District[] = d.hosts.map((h) => {
			// One block per technology: databases on the same host that share an engine
			// AND a name are the same store and merge; a second Postgres under its own
			// name stays its own block, because it is a genuinely different database.
			const blocks: DbBlock[] = [];
			const blockByKey = new Map<string, DbBlock>();
			const blockOfDb = new Map<string, DbBlock>();
			for (const db of databasesOfHost(d, h.id)) {
				const name = db.name.trim();
				const key = `${db.engine} ${name.toLowerCase()}`;
				let block = blockByKey.get(key);
				if (!block) {
					block = {
						id: db.id,
						name: name || engineLabel(db.engine),
						engine: db.engine,
						x: 0,
						y: 0,
						w: DISTRICT_W - IPAD * 2,
						h: 0,
						buildings: []
					};
					blockByKey.set(key, block);
					blocks.push(block);
				}
				blockOfDb.set(db.id, block);
			}
			for (const e of d.entities) {
				const block = e.databaseId ? blockOfDb.get(e.databaseId) : undefined;
				if (!block) continue;
				block.buildings.push({
					id: e.id,
					name: e.name || 'Entity',
					fields: fieldCount(e.id),
					bx: 0,
					by: 0
				});
			}
			for (const b of blocks) b.h = blockHeight(b.buildings.length);

			const tables = blocks.reduce((n, b) => n + b.buildings.length, 0);
			return {
				id: h.id,
				name: h.name || 'Host',
				kind: h.kind,
				provider: h.provider,
				region: h.region,
				dbLabel: blocks.length
					? `${blocks.length} database${blocks.length > 1 ? 's' : ''} · ${tables} table${tables === 1 ? '' : 's'}`
					: 'no database',
				x: 0,
				y: 0,
				w: DISTRICT_W,
				h:
					HEAD_H +
					(blocks.length
						? blocks.reduce((sum, b) => sum + b.h, 0) + (blocks.length - 1) * 10 + IPAD
						: 44),
				blocks
			};
		});

		// Pack into rows of COLS; assign coordinates; stack the database blocks, then
		// place their buildings 2-per-row.
		let y = PAD;
		for (let i = 0; i < districts.length; i += COLS) {
			const row = districts.slice(i, i + COLS);
			const rowH = Math.max(...row.map((r) => r.h));
			let x = PAD;
			for (const r of row) {
				r.x = x;
				r.y = y;
				r.h = rowH;
				let gy = r.y + HEAD_H;
				for (const g of r.blocks) {
					g.x = r.x + IPAD;
					g.y = gy;
					g.buildings.forEach((b, di) => {
						b.bx = g.x + GPAD + (di % 2) * (BW + BGAP);
						b.by = g.y + GHEAD + Math.floor(di / 2) * (BH + BGAP);
					});
					gy += g.h + 10;
				}
				x += DISTRICT_W + GAP;
			}
			y += rowH + GAP;
		}
		// Width spans only the columns actually used, so a sparse map (1–2 hosts)
		// isn't padded out with empty columns — it then scales up to fill the panel.
		const usedCols = Math.min(COLS, Math.max(1, districts.length));
		const totalW = PAD * 2 + usedCols * DISTRICT_W + (usedCols - 1) * GAP;
		const totalH = Math.max(y, 180);

		// Centres for link routing: interfaces resolve by name, relations by entity id.
		const entCenterById = new Map<string, { x: number; y: number }>();
		const centerByName = new Map<string, { x: number; y: number }>();
		for (const r of districts) {
			centerByName.set(r.name, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
			for (const g of r.blocks) {
				for (const b of g.buildings) {
					const c = { x: b.bx + BW / 2, y: b.by + BH / 2 };
					entCenterById.set(b.id, c);
					centerByName.set(b.name, c);
				}
			}
		}

		const bezier = (a: { x: number; y: number }, b: { x: number; y: number }) => {
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dist = Math.hypot(dx, dy) || 1;
			const nx = -dy / dist;
			const ny = dx / dist;
			const bow = Math.min(40, dist * 0.08);
			const c1x = a.x + dx * 0.3 + nx * bow;
			const c1y = a.y + dy * 0.3 + ny * bow;
			const c2x = a.x + dx * 0.7 + nx * bow;
			const c2y = a.y + dy * 0.7 + ny * bow;
			return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
		};

		const interfaceLinks = d.interfaces
			.map((it) => {
				const a = centerByName.get(it.fromBrick.trim());
				const b = centerByName.get(it.toBrick.trim());
				if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
				return {
					id: it.id,
					d: bezier(a, b),
					stroke: PROTOCOL_HEX[it.protocol as Protocol] ?? '#8b5cf6'
				};
			})
			.filter((l): l is { id: string; d: string; stroke: string } => l !== null);

		// Exit point on a table brick's border along the direction of its partner, so
		// FK links touch the boxes' edges instead of vanishing under the opaque bricks.
		const edgePoint = (
			center: { x: number; y: number },
			toward: { x: number; y: number }
		) => {
			const dx = toward.x - center.x;
			const dy = toward.y - center.y;
			const sx = dx === 0 ? Infinity : BW / 2 / Math.abs(dx);
			const sy = dy === 0 ? Infinity : BH / 2 / Math.abs(dy);
			const s = Math.min(sx, sy);
			return { x: center.x + dx * s, y: center.y + dy * s };
		};

		const relationLinks = d.fields
			.filter((f) => f.type === 'relation' && f.relationTargetEntityId)
			.map((f) => {
				const a = entCenterById.get(f.entityId);
				const b = entCenterById.get(f.relationTargetEntityId!);
				if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
				return { id: f.id, d: bezier(edgePoint(a, b), edgePoint(b, a)) };
			})
			.filter((l): l is { id: string; d: string } => l !== null);

		return { districts, interfaceLinks, relationLinks, totalW, totalH };
	});

	const usedProtocols = $derived(
		PROTOCOLS.filter((p) => store.draft.interfaces.some((i) => i.protocol === p.code))
	);
	const usedEngines = $derived(
		DB_ENGINES.filter((e) => store.draft.databases.some((db) => db.engine === e.code))
	);
</script>

<div class="rounded-card border border-line bg-surface-sunken/30 p-3">
	{#if store.draft.hosts.length === 0}
		<div class="grid min-h-48 place-items-center px-4 text-center">
			<div>
				<p class="text-sm font-semibold text-ink-600">The city is empty.</p>
				<p class="mt-1 text-xs text-ink-400">
					Add a host to open its district, then place the tables your journeys need.
				</p>
			</div>
		</div>
	{:else}
		<div class="grid max-h-[75vh] justify-items-center overflow-auto rounded-xl border border-line bg-surface">
			<svg
				viewBox="0 0 {map.totalW} {map.totalH}"
				width={map.totalW}
				preserveAspectRatio="xMidYMin meet"
				class="block h-auto max-w-full"
			>
				<defs>
					<pattern id="urbgrid" width="40" height="40" patternUnits="userSpaceOnUse">
						<path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(15,23,42,0.04)" stroke-width="0.5" />
					</pattern>
					<marker
						id="urb-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(100,116,139,0.7)" />
					</marker>
					<marker
						id="urb-fk-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="7"
						markerHeight="7"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
					</marker>
				</defs>
				<rect width={map.totalW} height={map.totalH} fill="url(#urbgrid)" />

				<!-- interface connectors — dashed, protocol-coloured, selectable -->
				{#if showInterfaces}
					{#each map.interfaceLinks as link (link.id)}
						{@const isSel = selection.kind === 'interface' && selection.id === link.id}
						<path
							d={link.d}
							fill="none"
							stroke={link.stroke}
							stroke-opacity={isSel ? 1 : 0.55}
							stroke-width={isSel ? 2.6 : 1.4}
							stroke-dasharray="3 3"
							marker-end="url(#urb-arrow)"
							style="cursor:pointer"
							role="button"
							tabindex="-1"
							onclick={() => onSelect({ kind: 'interface', id: link.id })}
							onkeydown={() => {}}
						/>
					{/each}
				{/if}

				<!-- districts (hosts) -->
				{#each map.districts as r (r.id)}
					{@const hex = HOST_TYPE_HEX[r.kind]}
					{@const isSel = selection.kind === 'host' && selection.id === r.id}
					<g
						role="button"
						tabindex="-1"
						style="cursor:pointer"
						onclick={() => onSelect({ kind: 'host', id: r.id })}
						onkeydown={() => {}}
					>
						<rect
							x={r.x}
							y={r.y}
							width={r.w}
							height={r.h}
							rx="14"
							fill="{hex}14"
							stroke={isSel ? hex : `${hex}73`}
							stroke-width={isSel ? 2.4 : 1.2}
						/>
						<text
							x={r.x + 14}
							y={r.y + 22}
							fill={hex}
							font-size="11"
							font-weight="800"
							letter-spacing="0.12em"
						>
							{HOST_TYPE_GLYPH[r.kind]}
							{kindLabel(r.kind).toUpperCase()}
						</text>
						<text x={r.x + 14} y={r.y + 40} fill="#0f172a" font-size="13" font-weight="700"
							>{r.name}</text
						>
						<text x={r.x + 14} y={r.y + 56} fill="rgba(100,116,139,0.9)" font-size="10">
							{r.kind === 'onprem'
								? 'Customer site'
								: `${r.provider || '-'}${r.region ? ' · ' + r.region : ''}`}
						</text>
						<text x={r.x + 14} y={r.y + 72} fill="rgba(100,116,139,0.75)" font-size="9">
							⛁ {r.dbLabel}
						</text>

						<!-- one block per database: the STORE NAME leads (it is what the reader
						     must identify), the engine rides along on the right and in the hue -->
						{#each r.blocks as g (g.id)}
							{@const eng = ENGINE_HEX[g.engine]}
							{@const blockName = g.name.length > 22 ? g.name.slice(0, 21).trimEnd() + '…' : g.name}
							<rect
								x={g.x}
								y={g.y}
								width={g.w}
								height={g.h}
								rx="10"
								fill="{eng}0f"
								stroke="{eng}59"
								stroke-width="1"
							/>
							<text
								x={g.x + 10}
								y={g.y + 15}
								font-size="9"
								fill={eng}
								font-weight="800"
								letter-spacing="0.08em">⛁ {blockName.toUpperCase()}</text
							>
							<text
								x={g.x + g.w - 10}
								y={g.y + 15}
								font-size="9"
								fill="rgba(100,116,139,0.9)"
								text-anchor="end"
							>
								{engineLabel(g.engine)} · {g.buildings.length} table{g.buildings.length === 1 ? '' : 's'}
							</text>

							{#each g.buildings as b (b.id)}
								{@const bSel = selection.kind === 'table' && selection.id === b.id}
								<g
									style="cursor:pointer"
									role="button"
									tabindex="-1"
									onclick={(e) => {
										e.stopPropagation();
										onSelect({ kind: 'table', id: b.id });
									}}
									onkeydown={() => {}}
								>
									<rect
										x={b.bx}
										y={b.by}
										width={BW}
										height={BH}
										rx="6"
										fill="#ffffff"
										stroke={bSel ? eng : `${eng}8c`}
										stroke-width={bSel ? 2.2 : 1}
									/>
									<rect x={b.bx} y={b.by} width="4" height={BH} rx="2" fill={eng} fill-opacity="0.8" />
									<text x={b.bx + 12} y={b.by + 22} font-size="11" fill="#0f172a" font-weight="700"
										>{b.name}</text
									>
									<text x={b.bx + 12} y={b.by + 36} font-size="9" fill="rgba(100,116,139,0.9)"
										>{b.fields} fields</text
									>
									{#each Array(Math.min(8, b.fields)) as _, fi (fi)}
										<rect
											x={b.bx + 12 + (fi % 4) * 18}
											y={b.by + 42 + Math.floor(fi / 4) * 4}
											width="14"
											height="2"
											rx="1"
											fill={eng}
											fill-opacity="0.7"
										/>
									{/each}
								</g>
							{/each}

							{#if g.buildings.length === 0}
								<text
									x={g.x + g.w / 2}
									y={g.y + GHEAD + 18}
									fill="rgba(100,116,139,0.5)"
									font-size="10"
									text-anchor="middle"
									font-style="italic"
								>
									No table in this database yet.
								</text>
							{/if}
						{/each}

						{#if r.blocks.length === 0}
							<text
								x={r.x + r.w / 2}
								y={r.y + r.h / 2 + 12}
								fill="rgba(100,116,139,0.5)"
								font-size="10"
								text-anchor="middle"
								font-style="italic"
							>
								No database here - add one from the host panel.
							</text>
						{/if}
					</g>
				{/each}

				<!-- relation (FK) links — solid indigo, drawn on top so they stay visible -->
				{#if showRelations}
					{#each map.relationLinks as link (link.id)}
						<path
							d={link.d}
							fill="none"
							stroke="#6366f1"
							stroke-opacity="0.9"
							stroke-width="1.6"
							marker-end="url(#urb-fk-arrow)"
						/>
					{/each}
				{/if}
			</svg>
		</div>
	{/if}

	<!-- legend -->
	<div
		class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-1 pt-2 text-[9px] text-ink-400"
	>
		<span class="font-semibold uppercase tracking-widest">Hosts</span>
		{#each HOST_KINDS as k (k.code)}
			<span class="flex items-center gap-1">
				<span
					class="grid size-3.5 place-items-center rounded text-[8px]"
					style="background:{HOST_TYPE_HEX[k.code]}1a;color:{HOST_TYPE_HEX[k.code]}"
					>{HOST_TYPE_GLYPH[k.code]}</span
				>
				{k.label}
			</span>
		{/each}
		{#if usedEngines.length > 0}
			<span class="text-ink-300">·</span>
			<span class="font-semibold uppercase tracking-widest">Databases</span>
			{#each usedEngines as e (e.code)}
				<span class="flex items-center gap-1">
					<span
						class="inline-block size-3.5 rounded border"
						style="background:{ENGINE_HEX[e.code]}1a;border-color:{ENGINE_HEX[e.code]}59"
					></span>
					{e.label}
				</span>
			{/each}
		{/if}
		{#if showRelations}
			<span class="text-ink-300">·</span>
			<span class="flex items-center gap-1"
				><span class="inline-block w-3.5 border-t" style="border-color:#6366f1"></span> FK</span
			>
		{/if}
		{#if showInterfaces && usedProtocols.length > 0}
			<span class="text-ink-300">·</span>
			<span class="font-semibold uppercase tracking-widest">Interfaces</span>
			{#each usedProtocols as p (p.code)}
				<span class="flex items-center gap-1" style="color:{PROTOCOL_HEX[p.code]}">
					<span
						class="inline-block w-3.5 border-t border-dashed"
						style="border-color:{PROTOCOL_HEX[p.code]}"
					></span>
					{p.label}
				</span>
			{/each}
		{/if}
	</div>
</div>
