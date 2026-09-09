<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Simulation } from 'd3-force';
	import type { GraphContext, GraphEdgeKind, GraphNode, KnowledgeGraph } from '$domain/graph';
	import { nodeSourceHref } from '$domain/graph/node-link';
	import { edgePresentation, summarizeEdgeKinds } from './edge-presentation';
	import { createForceLayout, type ForceLink, type ForceNode } from './force-layout';

	// The parent keys this component on projectId + source, so it remounts (and
	// rebuilds the layout) whenever either changes — `graph` is read once per mount.
	let {
		graph,
		productName,
		source,
		formalDpoEnabled,
		sourceHref
	}: {
		graph: KnowledgeGraph;
		productName: string;
		source: 'local' | 'engine' | 'merged';
		formalDpoEnabled: boolean;
		/**
		 * Where the Combined/Local/Engine switch points. The explorer is embedded in
		 * a host page (the Data & Architecture "Knowledge graph" tab), so it cannot
		 * know its own URL — the host supplies one that preserves its tab.
		 */
		sourceHref: (source: 'local' | 'engine' | 'merged') => string;
	} =
		$props();

	/** Per-context display metadata (label + colour, tuned for the dark canvas). */
	const CONTEXTS: { key: GraphContext; label: string; color: string }[] = [
		{ key: 'project', label: 'Project', color: '#e2e8f0' },
		{ key: 'users', label: 'Users / Roles', color: '#a78bfa' },
		{ key: 'features', label: 'Features', color: '#60a5fa' },
		{ key: 'experience', label: 'Experience', color: '#22d3ee' },
		{ key: 'data', label: 'Data', color: '#34d399' },
		{ key: 'rules', label: 'Rules', color: '#fbbf24' },
		{ key: 'architecture', label: 'Architecture', color: '#94a3b8' },
		{ key: 'coherence', label: 'Coherence gaps', color: '#f87171' },
		{ key: 'behavior', label: 'Behavior (unspa)', color: '#f472b6' },
		{ key: 'engine', label: 'Formal (DPO)', color: '#c084fc' }
	];
	const colorOf = (c: string) => CONTEXTS.find((x) => x.key === c)?.color ?? '#94a3b8';

	// Deep-link a node to the exact editor (page + tab + anchor) that owns it —
	// shared with project search via `$domain/graph/node-link`.
	const editorHref = (node: GraphNode): string | null => nodeSourceHref(graph.projectId, node);
	const editorLabel = (node: GraphNode) =>
		`Open in ${CONTEXTS.find((c) => c.key === node.context)?.label ?? node.context}`;

	// ── Layout state (D3 mutates these plain node records in place) ─────────────
	// One-time layout scaffold. Read inside `untrack` because the component is
	// keyed on projectId (it remounts when the project changes), so the initial
	// `graph` IS the value for this mount's lifetime — no reactive capture wanted.
	const { n, idIndex, pos, degree } = untrack(() => {
		const nodes = graph.nodes;
		const idIndex = new Map(nodes.map((node, i) => [node.id, i]));
		// Deterministic golden-angle spiral seed (stable across SSR/CSR, no Math.random).
		const GOLDEN = Math.PI * (3 - Math.sqrt(5));
		const degree: number[] = nodes.map(() => 0);
		for (const e of graph.edges) {
			const a = idIndex.get(e.from);
			const b = idIndex.get(e.to);
			if (a !== undefined) degree[a]++;
			if (b !== undefined) degree[b]++;
		}
		const radius = (i: number, kind: string) =>
			kind === 'project' ? 18 : Math.min(14, 5.5 + Math.sqrt(degree[i] ?? 0) * 1.7);
		const pos: ForceNode[] = nodes.map((node, i) => {
			const r = 18 * Math.sqrt(i + 1);
			const a = i * GOLDEN;
			return {
				id: node.id,
				kind: node.kind,
				radius: radius(i, node.kind),
				x: Math.cos(a) * r,
				y: Math.sin(a) * r
			};
		});
		return { n: nodes.length, idIndex, pos, degree };
	});
	const radiusOf = (i: number, kind: string) =>
		kind === 'project' ? 18 : Math.min(14, 5.5 + Math.sqrt(degree[i] ?? 0) * 1.7);

	let selectedId = $state<string | null>(null);
	let hoverId = $state<string | null>(null);
	let hidden = $state(new Set<string>());
	let hiddenEdgeKinds = $state(new Set<GraphEdgeKind>());
	let reduceMotion = false;
	const edgeKinds = untrack(() => summarizeEdgeKinds(graph.edges));

	// ── Camera (eased): `cam` is what renders, `target` is where it is heading ──
	let cam = $state({ s: 1, x: 0, y: 0 });
	const target = { s: 1, x: 0, y: 0 };
	let vw = $state(800);
	let vh = $state(600);
	let camRaf = 0;
	let canvasEl: HTMLCanvasElement | null = null;
	let canvasContext: CanvasRenderingContext2D | null = null;
	let canvasDpr = 1;
	let drawRaf = 0;
	let simulation: Simulation<ForceNode, ForceLink> | null = null;

	function startCam() {
		cancelAnimationFrame(camRaf);
		const step = () => {
			const ease = reduceMotion ? 1 : 0.16;
			cam.s += (target.s - cam.s) * ease;
			cam.x += (target.x - cam.x) * ease;
			cam.y += (target.y - cam.y) * ease;
			requestDraw();
			if (
				Math.abs(target.s - cam.s) < 0.001 &&
				Math.abs(target.x - cam.x) < 0.5 &&
				Math.abs(target.y - cam.y) < 0.5
			) {
				cam.s = target.s;
				cam.x = target.x;
				cam.y = target.y;
				return;
			}
			camRaf = requestAnimationFrame(step);
		};
		camRaf = requestAnimationFrame(step);
	}
	/** Move camera instantly (panning, dragging) — no easing lag under the pointer. */
	function jumpCam(s: number, x: number, y: number) {
		cancelAnimationFrame(camRaf);
		target.s = s;
		target.x = x;
		target.y = y;
		cam.s = s;
		cam.x = x;
		cam.y = y;
		requestDraw();
	}

	const isVisible = (node: GraphNode) => !hidden.has(node.context);
	const visibleEdges = $derived(
		graph.edges.filter((e) => {
			const a = idIndex.get(e.from);
			const b = idIndex.get(e.to);
			return (
				a !== undefined &&
				b !== undefined &&
				!hiddenEdgeKinds.has(e.kind) &&
				isVisible(graph.nodes[a]) &&
				isVisible(graph.nodes[b])
			);
		})
	);
	const visibleNodes = $derived(graph.nodes.filter(isVisible));
	// Labels reveal themselves as you zoom in; small graphs always get them.
	const showLabels = $derived(visibleNodes.length <= 90 || cam.s >= 1.05);

	const selected = $derived(selectedId ? (graph.nodes[idIndex.get(selectedId) ?? -1] ?? null) : null);
	const neighbors = $derived.by(() => {
		if (!selectedId) return new Set<string>();
		const set = new Set<string>();
		for (const e of visibleEdges) {
			if (e.from === selectedId) set.add(e.to);
			if (e.to === selectedId) set.add(e.from);
		}
		return set;
	});
	const selectedEdges = $derived(
		selectedId ? visibleEdges.filter((e) => e.from === selectedId || e.to === selectedId) : []
	);
	$effect(() => {
		void selectedId;
		void hoverId;
		void hidden;
		void hiddenEdgeKinds;
		void cam.s;
		requestDraw();
	});
	$effect(() => {
		void vw;
		void vh;
		resizeCanvas();
	});
	function toggleContext(c: string, solo: boolean) {
		if (solo) {
			// Shift-click: show only this context (or reset if it is already solo).
			const others = CONTEXTS.map((x) => x.key as string).filter(
				(k) => k !== c && (graph.stats.byContext[k] ?? 0) > 0
			);
			const alreadySolo = others.every((k) => hidden.has(k)) && !hidden.has(c);
			hidden = alreadySolo ? new Set() : new Set(others);
			return;
		}
		const next = new Set(hidden);
		if (next.has(c)) next.delete(c);
		else next.add(c);
		hidden = next;
	}
	function toggleEdgeKind(kind: GraphEdgeKind, solo: boolean) {
		if (solo) {
			const others = edgeKinds.map((edge) => edge.kind).filter((candidate) => candidate !== kind);
			const alreadySolo =
				others.every((candidate) => hiddenEdgeKinds.has(candidate)) && !hiddenEdgeKinds.has(kind);
			hiddenEdgeKinds = alreadySolo ? new Set() : new Set(others);
			return;
		}
		const next = new Set(hiddenEdgeKinds);
		if (next.has(kind)) next.delete(kind);
		else next.add(kind);
		hiddenEdgeKinds = next;
	}

	// ── Force layout (D3 Barnes–Hut + automatic cooling) ────────────────────────
	const forceLinks: ForceLink[] = untrack(() =>
		graph.edges.map((edge) => ({
			id: edge.id,
			kind: edge.kind,
			source: edge.from,
			target: edge.to
		}))
	);
	let fitAfterSettle = false;

	function bounds() {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (let i = 0; i < n; i++) {
			if (!isVisible(graph.nodes[i])) continue;
			minX = Math.min(minX, pos[i].x ?? 0);
			minY = Math.min(minY, pos[i].y ?? 0);
			maxX = Math.max(maxX, pos[i].x ?? 0);
			maxY = Math.max(maxY, pos[i].y ?? 0);
		}
		if (minX === Infinity) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
		return { minX, minY, maxX, maxY };
	}

	function fitToView() {
		const b = bounds();
		const pad = 120;
		const w = b.maxX - b.minX || 1;
		const h = b.maxY - b.minY || 1;
		target.s = Math.min(2, Math.max(0.15, Math.min((vw - pad) / w, (vh - pad) / h)));
		target.x = vw / 2 - ((b.minX + b.maxX) / 2) * target.s;
		target.y = vh / 2 - ((b.minY + b.maxY) / 2) * target.s;
		startCam();
	}

	/** Glide the camera to a node (search hit, connection click). */
	function flyTo(id: string) {
		const p = pos[idIndex.get(id) ?? 0];
		if (!p) return;
		target.s = Math.min(2.2, Math.max(target.s, 1.35));
		target.x = vw / 2 - (p.x ?? 0) * target.s;
		target.y = vh / 2 - (p.y ?? 0) * target.s;
		startCam();
	}

	function zoomBy(factor: number, cx = vw / 2, cy = vh / 2) {
		const next = Math.min(4, Math.max(0.1, target.s * factor));
		target.x = cx - ((cx - target.x) * next) / target.s;
		target.y = cy - ((cy - target.y) * next) / target.s;
		target.s = next;
		startCam();
	}

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		canvasContext = canvasEl?.getContext('2d') ?? null;
		jumpCam(1, vw / 2, vh / 2);
		resizeCanvas();
		simulation = createForceLayout(
			pos,
			forceLinks,
			requestDraw,
			() => {
				requestDraw();
				if (fitAfterSettle) {
					fitAfterSettle = false;
					fitToView();
				}
			}
		);
		fitAfterSettle = true;
		return () => {
			simulation?.stop();
			cancelAnimationFrame(camRaf);
			cancelAnimationFrame(drawRaf);
		};
	});

	// ── Pointer interaction: pan background, drag nodes, wheel zoom ──────────────
	let dragNode = -1;
	let dragged = false;
	let panning = false;
	let lastX = 0;
	let lastY = 0;
	// Where the background press started — used to tell a click (deselect) from a
	// pan (keep selection), tolerating the sub-pixel jitter a real click emits.
	let panStartX = 0;
	let panStartY = 0;

	function onPointerDownNode(e: PointerEvent, i: number) {
		e.stopPropagation();
		(e.target as Element).setPointerCapture(e.pointerId);
		dragNode = i;
		dragged = false;
		pos[i].fx = pos[i].x;
		pos[i].fy = pos[i].y;
		simulation?.alphaTarget(0.16).restart();
		lastX = e.clientX;
		lastY = e.clientY;
		selectedId = graph.nodes[i].id;
	}
	function onPointerDownBg(e: PointerEvent) {
		panning = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		lastX = e.clientX;
		lastY = e.clientY;
	}
	function onPointerMove(e: PointerEvent) {
		if (dragNode >= 0) {
			pos[dragNode].fx = (pos[dragNode].fx ?? pos[dragNode].x ?? 0) + (e.clientX - lastX) / cam.s;
			pos[dragNode].fy = (pos[dragNode].fy ?? pos[dragNode].y ?? 0) + (e.clientY - lastY) / cam.s;
			lastX = e.clientX;
			lastY = e.clientY;
			dragged = true;
			requestDraw();
		} else if (panning) {
			jumpCam(cam.s, cam.x + (e.clientX - lastX), cam.y + (e.clientY - lastY));
			lastX = e.clientX;
			lastY = e.clientY;
		} else {
			const i = hitNode(e.clientX, e.clientY);
			hoverId = i >= 0 ? graph.nodes[i].id : null;
			if (canvasEl) canvasEl.style.cursor = i >= 0 ? 'pointer' : 'grab';
		}
	}
	function onPointerUp() {
		if (dragNode >= 0 && !dragged && cam.s < 1) {
			// A plain click while zoomed out dives into the node so its
			// neighbourhood labels have room to breathe.
			flyTo(graph.nodes[dragNode].id);
		} else if (panning && Math.hypot(lastX - panStartX, lastY - panStartY) < 5) {
			// A plain click on empty canvas clears the selection; a real pan
			// (moved past the jitter threshold) keeps it.
			selectedId = null;
		}
		if (dragNode >= 0) {
			pos[dragNode].fx = null;
			pos[dragNode].fy = null;
			simulation?.alphaTarget(0);
		}
		dragNode = -1;
		panning = false;
		requestDraw();
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		zoomBy(e.deltaY < 0 ? 1.16 : 1 / 1.16, e.clientX - rect.left, e.clientY - rect.top);
	}
	function onDblClickNode(node: GraphNode) {
		const href = editorHref(node);
		if (href) goto(href);
	}

	// ── Search: type-ahead over labels, Enter / click flies the camera there ─────
	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const starts: GraphNode[] = [];
		const rest: GraphNode[] = [];
		for (const node of graph.nodes) {
			const l = node.label.toLowerCase();
			if (l.startsWith(q)) starts.push(node);
			else if (l.includes(q) || node.kind.includes(q)) rest.push(node);
			if (starts.length >= 8) break;
		}
		return [...starts, ...rest].slice(0, 8);
	});
	function choose(node: GraphNode) {
		if (hidden.has(node.context)) toggleContext(node.context, false);
		selectedId = node.id;
		query = '';
		flyTo(node.id);
	}
	function onKeydown(e: KeyboardEvent) {
		const typing =
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			(e.target as HTMLElement | null)?.isContentEditable;
		if (e.key === '/' && !typing) {
			e.preventDefault();
			searchEl?.focus();
		} else if (e.key === 'Enter' && typing && matches.length > 0) {
			choose(matches[0]);
			searchEl?.blur();
		} else if (e.key === 'Escape') {
			if (query) query = '';
			else selectedId = null;
			searchEl?.blur();
		} else if ((e.key === '+' || e.key === '=') && !typing) zoomBy(1.25);
		else if (e.key === '-' && !typing) zoomBy(1 / 1.25);
		else if ((e.key === 'f' || e.key === 'F') && !typing) fitToView();
	}

	const dim = (id: string) => selectedId !== null && id !== selectedId && !neighbors.has(id);
	const labelled = (node: GraphNode) =>
		showLabels ||
		hoverId === node.id ||
		selectedId === node.id ||
		(selectedId !== null && neighbors.has(node.id));

	function resizeCanvas() {
		if (!canvasEl || !canvasContext || vw <= 0 || vh <= 0) return;
		canvasDpr = Math.min(window.devicePixelRatio || 1, 2);
		canvasEl.width = Math.round(vw * canvasDpr);
		canvasEl.height = Math.round(vh * canvasDpr);
		canvasEl.style.width = `${vw}px`;
		canvasEl.style.height = `${vh}px`;
		canvasContext.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
		requestDraw();
	}

	function requestDraw() {
		if (drawRaf || !canvasContext) return;
		drawRaf = requestAnimationFrame(() => {
			drawRaf = 0;
			drawCanvas();
		});
	}

	function curveControl(a: ForceNode, b: ForceNode, id: string) {
		const ax = a.x ?? 0;
		const ay = a.y ?? 0;
		const bx = b.x ?? 0;
		const by = b.y ?? 0;
		const dx = bx - ax;
		const dy = by - ay;
		const distance = Math.hypot(dx, dy) || 1;
		let hash = 0;
		for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
		const offset = Math.min(26, distance * 0.14) * (hash % 2 === 0 ? 1 : -1);
		return {
			x: (ax + bx) / 2 - (dy / distance) * offset,
			y: (ay + by) / 2 + (dx / distance) * offset
		};
	}

	function drawCanvas() {
		const ctx = canvasContext;
		if (!ctx) return;
		ctx.clearRect(0, 0, vw, vh);

		// Screen-space grid: cheap and independent from graph size.
		ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
		const grid = 44;
		const ox = ((cam.x % grid) + grid) % grid;
		const oy = ((cam.y % grid) + grid) % grid;
		for (let x = ox; x < vw; x += grid) {
			for (let y = oy; y < vh; y += grid) {
				ctx.beginPath();
				ctx.arc(x, y, 1, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		ctx.save();
		ctx.translate(cam.x, cam.y);
		ctx.scale(cam.s, cam.s);

		for (const edge of visibleEdges) {
			const sourceIndex = idIndex.get(edge.from);
			const targetIndex = idIndex.get(edge.to);
			if (sourceIndex === undefined || targetIndex === undefined) continue;
			const sourceNode = pos[sourceIndex];
			const targetNode = pos[targetIndex];
			const sx = sourceNode.x ?? 0;
			const sy = sourceNode.y ?? 0;
			const tx = targetNode.x ?? 0;
			const ty = targetNode.y ?? 0;
			const control = curveControl(sourceNode, targetNode, edge.id);
			const hot = selectedId === edge.from || selectedId === edge.to;
			const warm = !hot && hoverId !== null && (hoverId === edge.from || hoverId === edge.to);
			const style = edgePresentation(edge.kind);
			ctx.globalAlpha = selectedId !== null && !hot ? 0.06 : hot ? 1 : warm ? 0.8 : 0.42;
			ctx.strokeStyle = hot ? 'rgba(125, 211, 252, 0.9)' : style.color;
			ctx.lineWidth = (hot ? 1.7 : 1) / cam.s;
			ctx.setLineDash((style.dash || '').split(' ').map(Number).filter(Number.isFinite).map((value) => value / cam.s));
			ctx.beginPath();
			ctx.moveTo(sx, sy);
			ctx.quadraticCurveTo(control.x, control.y, tx, ty);
			ctx.stroke();

			if (hot) {
				const mx = 0.25 * sx + 0.5 * control.x + 0.25 * tx;
				const my = 0.25 * sy + 0.5 * control.y + 0.25 * ty;
				ctx.setLineDash([]);
				ctx.font = `${8.5 / cam.s}px Inter, system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.lineWidth = 3 / cam.s;
				ctx.strokeStyle = '#070b16';
				ctx.fillStyle = 'rgba(186, 230, 253, 0.9)';
				ctx.strokeText(edge.label ?? edge.kind, mx, my);
				ctx.fillText(edge.label ?? edge.kind, mx, my);
			}
		}
		ctx.setLineDash([]);

		for (const node of visibleNodes) {
			const i = idIndex.get(node.id);
			if (i === undefined) continue;
			const point = pos[i];
			const x = point.x ?? 0;
			const y = point.y ?? 0;
			const radius = radiusOf(i, node.kind);
			const color = colorOf(node.context);
			const selectedNode = selectedId === node.id;
			const hoveredNode = hoverId === node.id;
			ctx.globalAlpha = dim(node.id) ? 0.12 : 1;
			ctx.shadowColor = color;
			ctx.shadowBlur = selectedNode || hoveredNode ? radius + 6 : Math.max(4, radius / 1.5);
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(x, y, hoveredNode ? radius * 1.15 : radius, 0, Math.PI * 2);
			ctx.fill();
			ctx.shadowBlur = 0;
			ctx.strokeStyle = selectedNode ? '#fff' : 'rgba(255,255,255,.5)';
			ctx.lineWidth = (selectedNode ? 2.5 : 1) / cam.s;
			ctx.stroke();

			if (node.kind === 'gap') {
				ctx.globalAlpha *= 0.45;
				ctx.strokeStyle = color;
				ctx.lineWidth = 1.2 / cam.s;
				ctx.beginPath();
				ctx.arc(x, y, radius + 7 / cam.s, 0, Math.PI * 2);
				ctx.stroke();
			}

			if (labelled(node)) {
				const fontSize = 11 / cam.s;
				ctx.globalAlpha = dim(node.id) ? 0.18 : 1;
				ctx.font = `${selectedNode ? 650 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';
				ctx.lineWidth = 3 / cam.s;
				ctx.strokeStyle = '#070b16';
				ctx.fillStyle = '#cbd5e1';
				ctx.strokeText(node.label, x + radius + 6 / cam.s, y);
				ctx.fillText(node.label, x + radius + 6 / cam.s, y);
			}
		}

		ctx.restore();
		ctx.globalAlpha = 1;
	}

	function hitNode(clientX: number, clientY: number): number {
		if (!canvasEl) return -1;
		const rect = canvasEl.getBoundingClientRect();
		const x = (clientX - rect.left - cam.x) / cam.s;
		const y = (clientY - rect.top - cam.y) / cam.s;
		for (let visibleIndex = visibleNodes.length - 1; visibleIndex >= 0; visibleIndex--) {
			const node = visibleNodes[visibleIndex];
			const i = idIndex.get(node.id);
			if (i === undefined) continue;
			const point = pos[i];
			const radius = radiusOf(i, node.kind) + 7 / cam.s;
			if (((point.x ?? 0) - x) ** 2 + ((point.y ?? 0) - y) ** 2 <= radius ** 2) return i;
		}
		return -1;
	}

	function onPointerDownCanvas(e: PointerEvent) {
		const i = hitNode(e.clientX, e.clientY);
		if (i >= 0) onPointerDownNode(e, i);
		else {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
			onPointerDownBg(e);
		}
	}

	function onDblClickCanvas(e: MouseEvent) {
		const i = hitNode(e.clientX, e.clientY);
		if (i >= 0) onDblClickNode(graph.nodes[i]);
		else fitToView();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="page" bind:clientWidth={vw} bind:clientHeight={vh}>
	<!-- Slow-drifting aurora glows give the canvas depth (pure CSS, GPU-cheap). -->
	<div class="aurora a1" aria-hidden="true"></div>
	<div class="aurora a2" aria-hidden="true"></div>

	<canvas
		bind:this={canvasEl}
		aria-label="Project knowledge graph"
		tabindex="0"
		onpointerdown={onPointerDownCanvas}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointerleave={onPointerUp}
		onwheel={onWheel}
		ondblclick={onDblClickCanvas}
	></canvas>

	<div class="vignette" aria-hidden="true"></div>

	<header class="hud top">
		<div class="panel identity">
			<p class="back">{productName}</p>
			<h1>Knowledge graph</h1>
			<p class="sub">
				{graph.stats.nodeCount} nodes · {visibleEdges.length}{hidden.size > 0 || hiddenEdgeKinds.size > 0
					? ` / ${graph.stats.edgeCount}`
					: ''} relationships
			</p>
		</div>
		<div class="panel controls">
			<div class="search">
				<svg class="mag" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
					<path d="m20 20-3.8-3.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				<input
					bind:this={searchEl}
					bind:value={query}
					type="search"
					placeholder="Find anything…  ( / )"
					aria-label="Search nodes"
				/>
				{#if matches.length > 0}
					<ul class="results" role="listbox">
						{#each matches as m (m.id)}
							<li>
								<button role="option" aria-selected="false" onclick={() => choose(m)}>
									<span class="dot" style:background={colorOf(m.context)}></span>
									<span class="ml">{m.label}</span>
									<span class="mk">{m.kind}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="toggle" role="tablist" aria-label="Graph source">
				<a
					class:active={source === 'merged'}
					href={sourceHref('merged')}
					title={formalDpoEnabled
						? 'Wizard projection + unspa behavior + the DPO verdict, combined'
						: 'Wizard projection + local behavior coherence'}>Combined</a
				>
				<a class:active={source === 'local'} href={sourceHref('local')} title="The wizard projection alone"
					>Local</a
				>
				{#if formalDpoEnabled}
					<a
						class:active={source === 'engine'}
						href={sourceHref('engine')}
						title="The raw formal DPO/MRS substrate from the Enterprise engine">Engine</a
					>
				{/if}
			</div>
		</div>
	</header>

	<nav class="hud legend" aria-label="Contexts">
		{#each CONTEXTS as c (c.key)}
			{@const count = graph.stats.byContext[c.key] ?? 0}
			{#if count > 0}
				<button
					class="chip"
					class:off={hidden.has(c.key)}
					aria-pressed={!hidden.has(c.key)}
					onclick={(e) => toggleContext(c.key, e.shiftKey)}
					title="Click: show / hide · Shift-click: solo"
				>
					<span class="dot" style:background={c.color}></span>
					{c.label}
					<span class="n">{count}</span>
				</button>
			{/if}
		{/each}
		{#if hidden.size > 0}
			<button class="chip all" onclick={() => (hidden = new Set())}>Show all</button>
		{/if}
	</nav>

	{#if edgeKinds.length > 0}
		<details class="hud panel relationships" open>
			<summary>
				<span>Relationships</span>
				<span class="summary-count">{edgeKinds.length} types · {visibleEdges.length} links</span>
			</summary>
			<div class="relationship-list">
				{#each edgeKinds as edge (edge.kind)}
					<button
						class="relationship"
						class:off={hiddenEdgeKinds.has(edge.kind)}
						aria-pressed={!hiddenEdgeKinds.has(edge.kind)}
						onclick={(event) => toggleEdgeKind(edge.kind, event.shiftKey)}
						title={`${edge.description} · Click to show or hide · Shift-click to isolate`}
					>
						<svg class="edge-swatch" viewBox="0 0 28 8" aria-hidden="true">
							<line
								x1="1"
								y1="4"
								x2="27"
								y2="4"
								stroke={edge.color}
								stroke-width="2"
								stroke-dasharray={edge.dash}
							/>
						</svg>
						<span>{edge.label}</span>
						<span class="n">{edge.count}</span>
					</button>
				{/each}
			</div>
			<div class="relationship-help">
				Click to hide · Shift-click to isolate
				{#if hiddenEdgeKinds.size > 0}
					<button onclick={() => (hiddenEdgeKinds = new Set())}>Show all</button>
				{/if}
			</div>
		</details>
	{/if}

	<div class="hud zoomer">
		<button onclick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
		<span class="pct">{Math.round(cam.s * 100)}%</span>
		<button onclick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
		<button class="fit" onclick={fitToView} title="Fit to view (F)" aria-label="Fit to view">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>

	{#if selected}
		<aside class="hud detail">
			<div class="dh">
				<span class="dot lg" style:background={colorOf(selected.context)}></span>
				<strong>{selected.label}</strong>
				<button class="x" onclick={() => (selectedId = null)} aria-label="Close">×</button>
			</div>
			<p class="kind">{selected.kind} · {selected.context}</p>
			{#if selected.detail}<p class="dd">{selected.detail}</p>{/if}
			{#if selected.meta}
				<dl class="meta">
					{#each Object.entries(selected.meta) as [k, v] (k)}
						<div><dt>{k}</dt><dd>{v}</dd></div>
					{/each}
				</dl>
			{/if}
			{#if editorHref(selected)}
				<a class="editor" href={editorHref(selected)}>{editorLabel(selected)} →</a>
			{/if}
			<h3>Connections ({selectedEdges.length})</h3>
			<ul class="conns">
				{#each selectedEdges as e (e.id)}
					{@const otherId = e.from === selectedId ? e.to : e.from}
					{@const other = graph.nodes[idIndex.get(otherId) ?? -1]}
					{@const relation = edgePresentation(e.kind)}
					{#if other}
						<li>
							<span class="rel" title={relation.description}>
								<span class="rel-dot" style:background={relation.color}></span>
								{e.from === selectedId ? `${relation.label} →` : `← ${relation.label}`}
							</span>
							<button
								class="link"
								onclick={() => {
									selectedId = other.id;
									flyTo(other.id);
								}}
							>
								<span class="dot sm" style:background={colorOf(other.context)}></span>
								{other.label}
							</button>
						</li>
					{/if}
				{/each}
			</ul>
		</aside>
	{/if}

	{#if graph.stats.nodeCount === 0}
		<div class="empty">
			<div class="orb" aria-hidden="true"></div>
			{#if source === 'engine'}
				<p>No engine graph yet.</p>
				<p class="hint">
					{formalDpoEnabled
						? 'Needs a published model on Lyriks-back.'
						: 'The formal DPO engine is an Enterprise capability.'}
				</p>
			{:else}
				<p>Nothing authored yet.</p>
				<p class="hint">Fill in the wizard and the graph fills itself.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Fills whatever box the host page gives it (the Data & Architecture
	   "Knowledge graph" tab sizes it), rather than owning the viewport. */
	.page {
		position: relative;
		height: 100%;
		overflow: hidden;
		background:
			radial-gradient(1200px 700px at 30% 20%, #0d1428 0%, transparent 60%),
			radial-gradient(1000px 800px at 75% 80%, #101031 0%, transparent 55%),
			#070b16;
		color: #e2e8f0;
		user-select: none;
	}

	/* ── Ambient depth ─────────────────────────────────────────────────────── */
	.aurora {
		position: absolute;
		width: 55vw;
		height: 55vw;
		border-radius: 50%;
		filter: blur(90px);
		opacity: 0.16;
		pointer-events: none;
	}
	.a1 {
		top: -20%;
		left: -10%;
		background: radial-gradient(circle, #2563eb, transparent 65%);
		animation: drift1 26s ease-in-out infinite alternate;
	}
	.a2 {
		bottom: -25%;
		right: -12%;
		background: radial-gradient(circle, #7c3aed, transparent 65%);
		animation: drift2 32s ease-in-out infinite alternate;
	}
	@keyframes drift1 {
		to {
			transform: translate(8vw, 6vh) scale(1.15);
		}
	}
	@keyframes drift2 {
		to {
			transform: translate(-7vw, -5vh) scale(1.1);
		}
	}
	.vignette {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(ellipse at center, transparent 55%, rgba(3, 6, 14, 0.55) 100%);
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
		cursor: grab;
	}
	canvas:active {
		cursor: grabbing;
	}

	/* ── HUD chrome (glass panels floating over the canvas) ────────────────── */
	.hud {
		position: absolute;
		z-index: 3;
	}
	.panel {
		background: rgba(10, 15, 30, 0.72);
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 0.8rem;
		backdrop-filter: blur(12px);
		box-shadow: 0 10px 30px rgba(2, 4, 10, 0.45);
	}
	.top {
		top: 1rem;
		left: 1rem;
		right: 1rem;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.identity {
		padding: 0.7rem 1rem;
	}
	.back {
		margin: 0;
		font-size: 0.78rem;
		color: #94a3b8;
	}
	h1 {
		margin: 0.15rem 0 0;
		font-size: 1.15rem;
		font-weight: 650;
		letter-spacing: 0.01em;
		background: linear-gradient(90deg, #f8fafc, #93c5fd);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.sub {
		margin: 0.1rem 0 0;
		color: #64748b;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem;
	}

	.search {
		position: relative;
		display: flex;
		align-items: center;
	}
	.mag {
		position: absolute;
		left: 0.55rem;
		width: 14px;
		height: 14px;
		color: #64748b;
		pointer-events: none;
	}
	.search input {
		width: 200px;
		padding: 0.42rem 0.6rem 0.42rem 1.9rem;
		border-radius: 0.55rem;
		border: 1px solid rgba(148, 163, 184, 0.25);
		background: rgba(2, 6, 16, 0.6);
		color: #e2e8f0;
		font-size: 0.8rem;
		outline: none;
		transition:
			border-color 0.2s ease,
			width 0.25s ease;
	}
	.search input:focus {
		border-color: #7dd3fc;
		width: 260px;
	}
	.search input::placeholder {
		color: #64748b;
	}
	.results {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.3rem;
		list-style: none;
		background: rgba(10, 15, 30, 0.92);
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 0.6rem;
		backdrop-filter: blur(14px);
		box-shadow: 0 14px 34px rgba(2, 4, 10, 0.55);
		animation: rise 0.16s ease-out;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.results button {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: none;
		border-radius: 0.4rem;
		background: none;
		color: #e2e8f0;
		font-size: 0.8rem;
		text-align: left;
		cursor: pointer;
	}
	.results button:hover,
	.results button:focus-visible {
		background: rgba(125, 211, 252, 0.12);
	}
	.ml {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mk {
		color: #64748b;
		font-size: 0.68rem;
	}

	.toggle {
		display: inline-flex;
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 0.55rem;
		overflow: hidden;
	}
	.toggle a {
		padding: 0.4rem 0.75rem;
		font-size: 0.78rem;
		text-decoration: none;
		color: #94a3b8;
		background: transparent;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}
	.toggle a + a {
		border-left: 1px solid rgba(148, 163, 184, 0.2);
	}
	.toggle a:hover {
		color: #e2e8f0;
	}
	.toggle a.active {
		background: rgba(226, 232, 240, 0.92);
		color: #0b1120;
		font-weight: 600;
	}

	/* ── Legend ────────────────────────────────────────────────────────────── */
	.legend {
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.35rem;
		max-width: min(92vw, 900px);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgba(148, 163, 184, 0.22);
		background: rgba(10, 15, 30, 0.72);
		backdrop-filter: blur(10px);
		color: #cbd5e1;
		border-radius: 999px;
		padding: 0.28rem 0.65rem;
		font-size: 0.74rem;
		cursor: pointer;
		transition:
			opacity 0.2s ease,
			border-color 0.2s ease,
			transform 0.15s ease;
	}
	.chip:hover {
		border-color: rgba(186, 230, 253, 0.5);
		transform: translateY(-1px);
	}
	.chip.off {
		opacity: 0.38;
	}
	.chip.off .dot {
		background: #475569 !important;
	}
	.chip.all {
		color: #7dd3fc;
		border-color: rgba(125, 211, 252, 0.4);
	}
	.chip .n {
		color: #64748b;
		font-variant-numeric: tabular-nums;
	}

	/* Relationship vocabulary is separate from context colour: nodes answer
	   “where?”, while these edge treatments answer “how are they connected?”. */
	.relationships {
		top: 7.6rem;
		left: 1rem;
		width: 250px;
		max-height: calc(100vh - 10rem);
		overflow: auto;
		color: #cbd5e1;
		scrollbar-width: thin;
		scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
	}
	.relationships summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		padding: 0.62rem 0.7rem;
		font-size: 0.76rem;
		font-weight: 650;
		cursor: pointer;
		list-style: none;
	}
	.relationships summary::-webkit-details-marker {
		display: none;
	}
	.relationships summary::before {
		content: '›';
		color: #64748b;
		font-size: 1rem;
		transform: rotate(0deg);
		transition: transform 0.15s ease;
	}
	.relationships[open] summary::before {
		transform: rotate(90deg);
	}
	.summary-count {
		margin-left: auto;
		color: #64748b;
		font-size: 0.65rem;
		font-weight: 450;
		font-variant-numeric: tabular-nums;
	}
	.relationship-list {
		display: grid;
		gap: 0.25rem;
		padding: 0 0.45rem 0.45rem;
	}
	.relationship {
		min-width: 0;
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.3rem;
		padding: 0.32rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 0.45rem;
		background: rgba(2, 6, 16, 0.32);
		color: #cbd5e1;
		font-size: 0.68rem;
		text-align: left;
		cursor: pointer;
		transition:
			opacity 0.2s ease,
			border-color 0.2s ease,
			background 0.2s ease;
	}
	.relationship:hover {
		border-color: rgba(186, 230, 253, 0.3);
		background: rgba(125, 211, 252, 0.08);
	}
	.relationship.off {
		opacity: 0.32;
	}
	.relationship .n {
		color: #64748b;
		font-variant-numeric: tabular-nums;
	}
	.edge-swatch {
		position: static;
		width: 28px;
		height: 8px;
		cursor: inherit;
	}
	.relationship-help {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.1rem 0.65rem 0.55rem;
		color: #64748b;
		font-size: 0.62rem;
	}
	.relationship-help button {
		border: none;
		background: none;
		padding: 0;
		color: #7dd3fc;
		font: inherit;
		cursor: pointer;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		display: inline-block;
		flex: none;
		box-shadow: 0 0 6px currentColor;
	}
	.dot.sm {
		width: 7px;
		height: 7px;
	}
	.dot.lg {
		width: 11px;
		height: 11px;
	}

	/* ── Zoom controls ─────────────────────────────────────────────────────── */
	.zoomer {
		right: 1rem;
		bottom: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		background: rgba(10, 15, 30, 0.72);
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 0.7rem;
		backdrop-filter: blur(10px);
		padding: 0.3rem;
	}
	.zoomer button {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 0.45rem;
		background: none;
		color: #cbd5e1;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.zoomer button:hover {
		background: rgba(125, 211, 252, 0.14);
	}
	.zoomer .fit svg {
		width: 15px;
		height: 15px;
		position: static;
	}
	.pct {
		font-size: 0.62rem;
		color: #64748b;
		font-variant-numeric: tabular-nums;
	}

	/* ── Detail panel ──────────────────────────────────────────────────────── */
	.detail {
		top: 4.6rem;
		right: 1rem;
		width: 290px;
		max-height: calc(100% - 8.5rem);
		overflow: auto;
		background: rgba(10, 15, 30, 0.82);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.8rem;
		backdrop-filter: blur(14px);
		box-shadow: 0 16px 44px rgba(2, 4, 10, 0.6);
		padding: 0.9rem;
		font-size: 0.82rem;
		color: #e2e8f0;
		animation: slidein 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
		scrollbar-width: thin;
		scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
	}
	@keyframes slidein {
		from {
			opacity: 0;
			transform: translateX(14px);
		}
	}
	.dh {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.dh strong {
		flex: 1;
		font-size: 0.92rem;
	}
	.x {
		border: none;
		background: none;
		font-size: 1.15rem;
		line-height: 1;
		cursor: pointer;
		color: #64748b;
	}
	.x:hover {
		color: #e2e8f0;
	}
	.kind {
		margin: 0.35rem 0 0;
		color: #64748b;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.dd {
		margin: 0.5rem 0;
		color: #94a3b8;
		line-height: 1.45;
	}
	.meta {
		margin: 0.5rem 0;
		display: grid;
		gap: 0.2rem;
	}
	.meta div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.meta dt {
		color: #64748b;
	}
	.meta dd {
		margin: 0;
		font-weight: 500;
	}
	.editor {
		display: inline-block;
		margin-top: 0.6rem;
		padding: 0.35rem 0.65rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(125, 211, 252, 0.35);
		font-size: 0.76rem;
		font-weight: 500;
		color: #7dd3fc;
		text-decoration: none;
		transition: background 0.2s ease;
	}
	.editor:hover {
		background: rgba(125, 211, 252, 0.12);
	}
	h3 {
		margin: 0.9rem 0 0.35rem;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
	}
	.conns {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.conns li {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.rel {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.66rem;
		color: #64748b;
	}
	.rel-dot {
		width: 5px;
		height: 5px;
		border-radius: 999px;
		box-shadow: 0 0 5px currentColor;
	}
	.link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: none;
		background: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		color: #e2e8f0;
		font-size: 0.82rem;
	}
	.link:hover {
		color: #7dd3fc;
	}

	/* ── Empty state ───────────────────────────────────────────────────────── */
	.empty {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 0.3rem;
		color: #cbd5e1;
		font-size: 0.95rem;
		text-align: center;
		pointer-events: none;
	}
	.empty .hint {
		margin: 0;
		color: #64748b;
		font-size: 0.8rem;
	}
	.empty p {
		margin: 0;
	}
	.orb {
		width: 70px;
		height: 70px;
		margin-bottom: 1rem;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 30%, rgba(125, 211, 252, 0.7), rgba(37, 99, 235, 0.25) 60%, transparent 75%);
		filter: blur(2px);
		animation: breathe 3.2s ease-in-out infinite alternate;
	}
	@keyframes breathe {
		to {
			transform: scale(1.12);
			opacity: 0.75;
		}
	}

	/* ── Motion safety ─────────────────────────────────────────────────────── */
	@media (prefers-reduced-motion: reduce) {
		.aurora,
		.orb {
			animation: none;
		}
		.detail,
		.results {
			animation: none;
		}
	}

	@media (max-width: 760px) {
		.relationships {
			top: auto;
			bottom: 4.2rem;
			width: min(250px, calc(100vw - 5.5rem));
			max-height: 45vh;
		}
		.legend {
			display: none;
		}
	}
</style>
