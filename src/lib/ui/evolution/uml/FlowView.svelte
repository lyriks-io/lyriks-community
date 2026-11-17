<script lang="ts">
	import type { DiagramFlow, DiagramPlace, FunctionalDiagram } from '$domain/evolution';
	import { layoutFlow, linkLines, LINE_H, wrapText } from './layout';
	import { isMarked, isSelected, onPickKey, type DiagramSelection } from './selection';
	import { BOARD_LINE_STRONG, BOARD_SHAPE } from '$ui/design-system';
	import ProblemMark from './ProblemMark.svelte';
	import { linkLabel, type DiagramWords } from './words';

	/**
	 * The activity diagram of one use case (ac-evo-func-uml), titled with it and
	 * with who starts it, its swimlanes framed together: each person or system
	 * who acts in it and the product, from a start to an end, each step in the
	 * lane of whoever does it. A step with ways out leads to a decision; each way
	 * out leaves to the column of the ways out, in the same header, where its box
	 * says when it happens and, under a line, what then happens, which ends there
	 * (the UML flow final); the flow goes on below, [else]. A step a problem sits
	 * on, or the flow itself, is drawn in amber with its sign (ac-evo-func-uml-text).
	 */
	interface Props {
		diagram: FunctionalDiagram;
		flow: DiagramFlow;
		/** The product's own lane is named after it. */
		productName: string;
		/** The words it draws, in the spec's language (ac-evo-form-spec-language). */
		words: DiagramWords;
		selection: DiagramSelection | null;
		marks?: readonly DiagramPlace[];
		onpick: (selection: DiagramSelection) => void;
		onsize: (w: number, h: number) => void;
	}
	let { diagram, flow, productName, words, selection, marks = [], onpick, onsize }: Props = $props();

	const layout = $derived(layoutFlow(diagram, flow));
	$effect(() => onsize(layout.width, layout.height));
	const uid = $props.id();
	const stepPick = (index: number) => ({ kind: 'step' as const, useCase: flow.useCase, index });
	const productLines = $derived(wrapText(productName, 152, 2));
	const flowMarked = $derived(isMarked(marks, { kind: 'flow', useCase: flow.useCase }));
	const top = $derived(layout.headerTop);
	const bodyBottom = $derived(layout.height - 8);
	const headerEnd = $derived(layout.exits ? layout.exits.x + layout.exits.w + 30 : layout.lanesEnd);
	/** Where line `l` of a lane's name stands in the header: centred, under «system» for a system. */
	const headerLine = (system: boolean, count: number, l: number) =>
		top + (system ? 30 - (count - 1) * 6 + l * 13 : layout.header / 2 + 4 - ((count - 1) * 14) / 2 + l * 14);
</script>

<svg width={layout.width} height={layout.height} role="img" aria-label="Flow of {flow.useCase}" class="block font-sans">
	<defs>
		<marker id="{uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_STRONG} />
		</marker>
	</defs>

	<!-- The title: the use case it walks through, and who starts it. -->
	{#if flowMarked}<ProblemMark x={10} y={15} />{/if}
	<text x={flowMarked ? 26 : 2} y="20" class="text-[0.875rem]">
		<tspan class="{flowMarked ? 'fill-orange-ink' : 'fill-ink-900'} font-semibold">{flow.useCase}</tspan>
		{#if layout.startedBy}<tspan class="fill-ink-500 text-[0.75rem]" dx="10">{words.startedBy(layout.startedBy)}</tspan>{/if}
	</text>

	<!-- The swimlanes: one partition per person or system who acts, and the product, framed together. -->
	{#each layout.lanes as lane (lane.name)}
		<rect x={lane.x} y={top} width={lane.w} height={bodyBottom - top} class={lane.kind === 'product' ? 'fill-surface-sunken/50' : 'fill-surface'} />
	{/each}
	<rect x="0" y={top} width={headerEnd} height={layout.header} class="fill-surface-sunken" />
	{#each layout.lanes as lane, i (lane.name)}
		{@const pick = { kind: 'actor' as const, name: lane.name }}
		{@const on = lane.kind !== 'product' && isSelected(selection, pick)}
		{#if i > 0}<line x1={lane.x} y1={top} x2={lane.x} y2={bodyBottom} class="stroke-line-strong" stroke-width="1" />{/if}
		{#if lane.kind === 'product'}
			<text text-anchor="middle" class="fill-ink-800 text-[0.75rem] font-semibold">
				{#each productLines as line, l (l)}<tspan x={lane.x + lane.w / 2} y={headerLine(false, productLines.length, l)}>{line}</tspan>{/each}
			</text>
		{:else}
			<g class="cursor-pointer" role="button" tabindex="0" aria-label="{lane.kind === 'person' ? 'Person' : 'System'} {lane.name}" onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
				<rect x={lane.x} y={top} width={lane.w} height={layout.header} class="fill-transparent" />
				{#if lane.kind === 'system'}<text x={lane.x + lane.w / 2} y={top + 13} text-anchor="middle" class="fill-ink-500 text-[0.5625rem]">{words.system}</text>{/if}
				<text text-anchor="middle" class="{on ? 'fill-blue-ink' : 'fill-ink-800'} text-[0.75rem] font-semibold">
					{#each lane.lines as line, l (l)}<tspan x={lane.x + lane.w / 2} y={headerLine(lane.kind === 'system', lane.lines.length, l)}>{line}</tspan>{/each}
				</text>
			</g>
		{/if}
	{/each}
	<rect x="0.5" y={top + 0.5} width={layout.lanesEnd - 1} height={bodyBottom - top - 1} class="fill-none stroke-line-strong" stroke-width="1" />
	<line x1="0" y1={top + layout.header} x2={headerEnd} y2={top + layout.header} class="stroke-line-strong" stroke-width="1" />
	{#if layout.exits}
		<text x={layout.exits.x} y={top + layout.header / 2 + 4} class="fill-ink-600 text-[0.6875rem] font-mono font-medium uppercase tracking-[0.08em]">{words.waysOut}</text>
	{/if}

	{#each layout.edges as edge, i (i)}
		<path d={edge.path} fill="none" stroke={BOARD_LINE_STRONG} stroke-width="1.25" marker-end="url(#{uid}-arrow)" />
		{#if edge.label && edge.labelAt}
			<text x={edge.labelAt.x} y={edge.labelAt.y} class="fill-ink-600 text-[0.625rem]" paint-order="stroke" stroke="var(--color-paper)" stroke-width="3">{words.guard[edge.label]}</text>
		{/if}
	{/each}

	{#each layout.nodes as node, i (i)}
		{#if node.kind === 'start'}
			<circle cx={node.x} cy={node.y} r="8" class="fill-ink-900" />
		{:else if node.kind === 'end'}
			<circle cx={node.x} cy={node.y} r="10" class="fill-surface stroke-ink-900" stroke-width="1.5" />
			<circle cx={node.x} cy={node.y} r="6" class="fill-ink-900" />
		{:else if node.kind === 'decision'}
			<path d="M{node.x},{node.y - 15} L{node.x + 15},{node.y} L{node.x},{node.y + 15} L{node.x - 15},{node.y} Z" class={BOARD_SHAPE} stroke-width="1.25" />
		{:else if node.kind === 'step'}
			{@const pick = stepPick(node.step)}
			{@const count = node.lines.length + linkLines(node.uses)}
			{@const top = node.y + node.h / 2 + 4 - ((count - 1) * LINE_H) / 2}
			{@const on = isSelected(selection, pick)}
			{@const marked = isMarked(marks, pick)}
			<g class="cursor-pointer" role="button" tabindex="0" aria-label="Step {node.step + 1}: {flow.steps[node.step].text}{marked ? ', with a problem' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
				<title>{flow.steps[node.step].text}{node.uses ? `\n${linkLabel(node.uses, words).join(' ')}` : ''}</title>
				<rect
					x={node.x}
					y={node.y}
					width={node.w}
					height={node.h}
					rx="12"
					class={on ? 'fill-blue-tint stroke-blue' : marked ? 'fill-orange-tint stroke-orange' : `${BOARD_SHAPE} hover:stroke-blue`}
					stroke-width={on || marked ? 2 : 1.2}
				/>
				<text text-anchor="middle" class="fill-ink-900 text-[0.75rem] font-semibold">
					{#each node.lines as line, l (l)}<tspan x={node.x + node.w / 2} y={top + l * LINE_H}>{line}</tspan>{/each}
				</text>
				{#if node.uses}
					<!-- The existing process this step uses, in the grey of what was there before (ac-evo-func-uml-link), never repeating the step (ac-evo-uml-legible). -->
					<text text-anchor="middle" class="fill-ink-400 text-[0.6875rem]">
						{#each linkLabel(node.uses, words) as line, i (i)}<tspan x={node.x + node.w / 2} y={top + (node.lines.length + i) * LINE_H}>{line}</tspan>{/each}
					</text>
				{/if}
				{#if marked}<ProblemMark x={node.x + node.w - 4} y={node.y + 2} />{/if}
			</g>
		{:else if node.kind === 'exit'}
			{@const pick = stepPick(node.step)}
			{@const on = isSelected(selection, pick)}
			{@const branch = flow.steps[node.step].branches[node.branch]}
			<g class="cursor-pointer" role="button" tabindex="0" aria-label="{node.branchKind === 'refused' ? 'Refused' : 'Goes wrong'} when {branch?.when ?? node.when.join(' ')}" onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
				<title>{node.branchKind === 'refused' ? words.refusedWhen : words.goesWrongWhen} {branch?.when ?? ''}: {branch?.then ?? ''}</title>
				<rect x={node.x} y={node.y} width={node.w} height={node.h} rx="0" class={on ? 'fill-blue-tint stroke-blue' : BOARD_SHAPE} stroke-width={on ? 1.75 : 1.1} stroke-dasharray={node.branchKind === 'goes_wrong' ? '4 3' : undefined} />
				<text x={node.x + 12} y={node.y + 16} class="fill-ink-500 text-[0.5625rem] font-mono font-medium uppercase tracking-[0.08em]">{node.branchKind === 'refused' ? words.refusedWhen : words.goesWrongWhen}</text>
				<text class="fill-ink-700 text-[0.6875rem]">
					{#each node.when as line, l (l)}<tspan x={node.x + 12} y={node.y + 30 + l * 14}>{line}</tspan>{/each}
				</text>
				<!-- What then happens, set apart from the condition. -->
				<line x1={node.x + 12} y1={node.y + node.divider} x2={node.x + node.w - 12} y2={node.y + node.divider} class="stroke-line" stroke-width="1" />
				<text class="fill-ink-900 text-[0.75rem] font-medium">
					{#each node.then as line, l (l)}<tspan x={node.x + (l === 0 ? 12 : 26)} y={node.y + node.divider + 18 + l * LINE_H}>{l === 0 ? '→ ' : ''}{line}</tspan>{/each}
				</text>
				<!-- What then happens ends there: the UML flow final. -->
				<g transform="translate({node.x + node.w + 14},{node.y + Math.min(node.h / 2, 23)})" class="stroke-ink-700" stroke-width="1.3">
					<line x1="-14" y1="0" x2="-8" y2="0" />
					<circle r="7" class="fill-surface" />
					<line x1="-4.5" y1="-4.5" x2="4.5" y2="4.5" />
					<line x1="-4.5" y1="4.5" x2="4.5" y2="-4.5" />
				</g>
			</g>
		{/if}
	{/each}
</svg>
