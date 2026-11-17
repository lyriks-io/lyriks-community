<script module lang="ts">
	import type { CodeEvidence } from '$application/spec360/code-evidence';

	/** One read per place and page load: hovering the same place again opens at once. */
	const read = new Map<string, Promise<CodeEvidence | null>>();
</script>

<script lang="ts">
	import { leaveTheStage, takeTheStage } from '$ui/shell/one-card';
	import { codeCardPlace, type CodeCardPlace } from './code-card-place';
	import { POP } from './page/look';

	/**
	 * A place in the code (a file, a file and its line) that opens, on hover or
	 * focus, the evidence behind it (ac-src-code-place): the numbered lines that
	 * prove the element, the file, the range and the element. The card opens in
	 * the free space beside the page when it holds it, else over the page
	 * (code-card-place.ts); fixed, under the body, so it never moves the list it
	 * sits in nor gets clipped by it.
	 */
	interface Props {
		projectId: string;
		featureId: string;
		/** What the page prints: "src/orders.js:17". */
		place: string;
		file: string;
		line: number | null;
		elementId?: string;
		/** "Action", "Rule"... and its name, said on the card. */
		kind: string;
		name: string;
		/** The line of code the page already read here: a request's report, whose places date from its own sync. */
		recorded?: string;
		class?: string;
	}
	let { projectId, featureId, place, file, line, elementId, kind, name, recorded = '', class: cls = '' }: Props = $props();

	let open = $state(false);
	let evidence = $state<CodeEvidence | null | undefined>(undefined);
	let at = $state<CodeCardPlace | null>(null);
	let anchor: HTMLElement;
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	const url = $derived(
		`/projects/${encodeURIComponent(projectId)}/spec/code-evidence?` +
			new URLSearchParams({ feature: featureId, file, ...(line !== null ? { line: String(line) } : {}), ...(elementId ? { element: elementId } : {}), ...(recorded ? { recorded } : {}) }).toString()
	);

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function load() {
		let pending = read.get(url);
		if (!pending) {
			pending = fetch(url)
				.then((r) => (r.ok ? (r.json() as Promise<CodeEvidence>) : null))
				.catch(() => null);
			read.set(url, pending);
		}
		void pending.then((e) => (evidence = e));
	}

	/**
	 * The right edge of what the page shows around the place: the outermost box
	 * that stops short of the window and is seen (a background or a border), so
	 * the page's own padding counts as free space.
	 */
	function columnRight(): number {
		let right = anchor.getBoundingClientRect().right;
		for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
			const r = el.getBoundingClientRect();
			if (r.right >= window.innerWidth - 8) break;
			const cs = getComputedStyle(el);
			const seen = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderRightWidth) > 0;
			if (seen) right = Math.max(right, r.right);
		}
		return right;
	}

	// One card at a time: another card opening closes this one at once.
	function closeNow() {
		if (closeTimer) clearTimeout(closeTimer);
		open = false;
		leaveTheStage(closeNow);
	}
	function show() {
		if (closeTimer) clearTimeout(closeTimer);
		const r = anchor.getBoundingClientRect();
		at = codeCardPlace({ anchor: r, columnRight: columnRight(), viewport: { width: window.innerWidth, height: window.innerHeight } });
		takeTheStage(closeNow);
		open = true;
		load();
	}
	function scheduleHide() {
		if (closeTimer) clearTimeout(closeTimer);
		closeTimer = setTimeout(closeNow, 120);
	}
	function keepOpen() {
		if (closeTimer) clearTimeout(closeTimer);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeNow();
	}

	const range = $derived(evidence?.kind === 'span' ? (evidence.from === evidence.to ? `line ${evidence.from}` : `lines ${evidence.from} to ${evidence.to}`) : line !== null ? `line ${line}` : '');
</script>

<span
	bind:this={anchor}
	role="button"
	tabindex="0"
	aria-label="{place}: show the code behind it"
	aria-expanded={open}
	onmouseenter={show}
	onmouseleave={scheduleHide}
	onfocus={show}
	onblur={scheduleHide}
	{onkeydown}
	class="cursor-help underline decoration-evo-line decoration-dotted underline-offset-2 outline-none hover:decoration-evo-violet focus-visible:decoration-evo-violet {cls}">{place}</span
>{#if open && at}
	<span
		use:portal
		role="tooltip"
		onmouseenter={keepOpen}
		onmouseleave={scheduleHide}
		class="fixed z-120 flex max-h-[calc(100vh-24px)] flex-col gap-2 overflow-auto rounded-evo-card {POP} px-4 py-3 text-left"
		style="left:{at.left}px; top:{at.top}px; width:{at.width}px;{at.mode === 'over' ? ` transform: translateY(${at.above ? 'calc(-100% - 8px)' : '8px'});` : ''}"
		data-code-evidence
		data-placed={at.mode}
	>
		<span class="font-evo-mono text-[0.625rem] font-bold tracking-[0.08em] text-evo-violet-ink uppercase">Proof in the code</span>
		<span class="text-[0.8125rem] font-semibold text-evo-ink">{kind} · {name}</span>
		<span class="font-evo-mono text-[0.6875rem] break-all text-evo-ink-3">{file}{range ? ` · ${range}` : ''}</span>
		{#if evidence === undefined}
			<span class="text-xs text-evo-muted">Reading the code…</span>
		{:else if evidence === null || evidence.kind === 'none'}
			<span class="text-xs text-evo-muted">No excerpt is held for this place: the analysis recorded no span for it and the index no line.</span>
		{:else}
			<span class="block max-h-80 overflow-auto rounded-lg border border-ink bg-ink py-2 font-evo-mono text-[0.75rem] leading-relaxed text-paper">
				{#each evidence.lines as l (l.n)}
					<span class="flex gap-3 px-3"><span class="w-9 flex-none text-right text-ink-4 select-none">{l.n || ''}</span><span class="whitespace-pre-wrap wrap-anywhere">{l.text || ' '}</span></span>
				{/each}
			</span>
			{#if evidence.kind === 'span' && evidence.leftOut > 0}
				<span class="text-[0.6875rem] text-evo-muted">{evidence.leftOut} more line{evidence.leftOut === 1 ? '' : 's'} up to line {evidence.to}.</span>
			{:else if evidence.kind === 'index_line'}
				<span class="text-[0.6875rem] text-evo-muted">The line the implementation index recorded here; Lyriks holds no longer excerpt of this code as it stands.</span>
			{/if}
		{/if}
	</span>
{/if}
