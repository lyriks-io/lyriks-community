<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { EnlargeableDiagram } from '$ui/design-system';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import AddButton from '$ui/spec360/page/AddButton.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { ARCH_LAYERS } from '$domain/architecture';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import { BTN, H2, MODULE } from '$ui/spec360/page/look';
	import { outOfView } from '$ui/spec360/tech/out-of-view';
	import ViewEmpty from '$ui/spec360/tech/ViewEmpty.svelte';
	import type { PageData } from './$types';

	/**
	 * Tech and data · Architecture: the technologies of the stack in one column
	 * per layer, every layer on one row that scrolls sideways, the layers out
	 * of view named at its head (criterion 2c6de3d9), each a card with its
	 * name, what it is for and its version, discussed, cited, edited in place
	 * and validated; the board opens large.
	 */
	let { data }: { data: PageData } = $props();
	const validation = useValidation();
	const edits = useEdits();
	const mode = useEditMode();
	// Adding is a draft's, in its Edit mode, for whoever may write it (criterion 51e215ef).
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite);
	// A technology added here joins the Backend layer, at its foot, until the AI or the reader places it elsewhere.
	const layers = $derived.by(() => {
		const added = edits.added('stack', data.layers.flatMap((l) => l.components.map((c) => c.id))).map((a) => ({ id: a.id, name: a.name, role: '', version: '', repository: '' }));
		if (added.length === 0) return data.layers;
		const backend = ARCH_LAYERS.find((l) => l.code === 'backend')!;
		const held = data.layers.some((l) => l.code === backend.code);
		const base = held ? data.layers : [...data.layers, { code: backend.code, label: backend.label.toUpperCase(), components: [] }];
		return base.map((l) => (l.code === backend.code ? { ...l, components: [...l.components, ...added] } : l));
	});
	const describePrompt = $derived(
		`With the Lyriks MCP, on project ${data.projectId}, list the technologies of the product's stack, layer by layer, in the architecture section (describe_section says how), from the code or from what I tell you. Ask me what you cannot tell.`
	);
	const WRAP = '[&>span]:min-w-0 [&>span]:flex-[0_1_auto] [&>span]:flex-wrap [&>span]:gap-y-1 [&>span>span.isolate]:max-w-full [&>span>span.isolate]:flex-wrap';

	// The layers the row shows no part of, on each side, named at the head of the board (criterion 2c6de3d9).
	let row: HTMLElement | null = null;
	let hidden = $state<{ before: number[]; after: number[] }>({ before: [], after: [] });
	function measure() {
		if (!row) return;
		const next = outOfView([...row.children].map((c) => c.getBoundingClientRect()), row.getBoundingClientRect());
		if (next.before.join() !== hidden.before.join() || next.after.join() !== hidden.after.join()) hidden = next;
	}
	const watchRow = (node: HTMLElement) => {
		row = node;
		measure();
		const resized = new ResizeObserver(measure);
		resized.observe(node);
		node.addEventListener('scroll', measure, { passive: true });
		return () => {
			resized.disconnect();
			node.removeEventListener('scroll', measure);
			if (row === node) row = null;
		};
	};
	/** Scrolls the row until the layer shows whole, at the edge it came from. */
	function reveal(index: number) {
		const column = row?.children[index] as HTMLElement | undefined;
		if (!row || !column) return;
		const left = hidden.before.includes(index) ? column.offsetLeft : column.offsetLeft + column.offsetWidth - row.clientWidth;
		row.scrollTo({ left, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	}
	const names = (indexes: readonly number[]) => indexes.map((i) => layers[i]?.label ?? '').join(', ');
</script>

<section aria-label="Architecture" class="animate-lk-in">
	{#if layers.length === 0}
		<!-- Nothing yet: what the view holds, what fills it, and the step that starts it (criterion 0b935dad). -->
		<div class="mt-7"><ViewEmpty headline="No technology yet." text="Your AI lists the stack layer by layer, from the code or from what you tell it, and you review it here." prompt={validation.source.canWrite ? describePrompt : null} /></div>
	{:else}
		<EnlargeableDiagram title="Architecture" class="mt-7">
			{#snippet children(enlarged)}
				<!-- One Validate all for the board: a column is too narrow to hold its own beside its title. -->
				<div id="kb-stack" class="group/section {enlarged ? 'p-1' : ''}">
				<div class="mb-4 flex min-h-8 flex-wrap items-center gap-3 pr-10">
					{#if !enlarged}<h2 class={H2}>Architecture</h2>{/if}
					<SectionValidateAll anchors={data.layers.flatMap((l) => l.components.map((c) => anchorOf('stack', c.id)))} what="technologies" sectionId="kb-stack" />
					{#if hidden.before.length || hidden.after.length}
						<!-- The layers out of view, named on the side where they are; each button brings its nearest one in. -->
						<span class="ml-auto flex min-w-0 items-center gap-2">
							{#if hidden.before.length}
								<button type="button" class="{BTN} min-w-0" title="Show {names(hidden.before)}" onclick={() => reveal(hidden.before[hidden.before.length - 1])}>
									<span aria-hidden="true">←</span><span class="truncate">{names(hidden.before)}</span>
								</button>
							{/if}
							{#if hidden.after.length}
								<button type="button" class="{BTN} min-w-0" title="Show {names(hidden.after)}" onclick={() => reveal(hidden.after[0])}>
									<span class="truncate">{names(hidden.after)}</span><span aria-hidden="true">→</span>
								</button>
							{/if}
						</span>
					{/if}
				</div>
				<!-- Every layer on one row, scrolling sideways rather than wrapping a layer out of sight (criterion 2c6de3d9). -->
				<div {@attach watchRow} class="relative grid auto-cols-[minmax(200px,1fr)] grid-flow-col items-start gap-4 overflow-x-auto pb-2">
					{#each layers as layer (layer.code)}
						<div class="flex min-w-0 flex-col gap-3">
							<h3 class="m-0 font-evo-mono text-xs font-normal tracking-[0.08em] text-ink-3 uppercase">{layer.label}</h3>
							{#each layer.components as c (c.id)}
								{@const anchor = anchorOf('stack', c.id)}
								{@const read = { text: c.name, desc: c.role }}
								{@const e = edits.shown(anchor, read)}
								<div
									id={anchorDomId(anchor)}
									data-evo-waits={validation.waitsOnMe(anchor) || undefined}
									class="flex scroll-mt-36 flex-col gap-2 {MODULE} p-4"
								>
									{#if edits.editing === anchor}
										<InlineEditor {anchor} />
									{:else}
										<div class="flex flex-wrap items-start justify-between gap-x-2.5 gap-y-1">
											<!-- Its name and what it is for are fields of the Edit mode, held until Save (criterion 41514698). -->
											<b class="min-w-0 text-[0.9375rem] leading-[1.4] [overflow-wrap:anywhere]"><StagedText {anchor} {read} field="text" label="Name">{e.text}</StagedText></b>
											<!-- In a column this narrow the controls wrap rather than run past the card: Validate and its stamps go under the icons. -->
											<span class="flex max-w-full min-w-0 {WRAP}"><SpecControls {anchor} title={e.text} values={e} inline /></span>
										</div>
										<StagedText {anchor} {read} field="desc" multiline label="What it is for" class="m-0 text-[0.8125rem] leading-[1.45] text-ink-2">
											{#if e.desc}<p class="m-0 text-[0.8125rem] leading-[1.45] text-ink-2">{e.desc}</p>{/if}
										</StagedText>
									{/if}
									{#if c.version}<div class="mt-0.5 font-evo-mono text-xs text-ink-3 [overflow-wrap:anywhere]">{c.version}</div>{/if}
									{#if c.repository}<div class="font-evo-mono text-[0.6875rem] text-evo-muted [overflow-wrap:anywhere]">{c.repository}</div>{/if}
									<BlockFoot {anchor} title={e.text} />
								</div>
							{/each}
						</div>
					{/each}
				</div>
				</div>
			{/snippet}
		</EnlargeableDiagram>
	{/if}
	{#if editable}<AddButton label="Add a stack component" onclick={() => void edits.add('stack')} />{/if}
</section>
