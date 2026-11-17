<script lang="ts">
	import type { DiagramMachine, DiagramPlace } from '$domain/evolution';
	import { layoutMachine, LINE_H, TITLE_H } from './layout';
	import { isMarked, isSelected, onPickKey, type DiagramSelection } from './selection';
	import ProblemMark from './ProblemMark.svelte';
	import { BOARD_FRAME, BOARD_FRAME_TITLE, BOARD_LINE_HOT, BOARD_LINE_STRONG, BOARD_SHAPE } from '$ui/design-system';

	/**
	 * The state machine of one thing the change moves (ac-evo-func-uml), in a
	 * frame named after it: its states from where it starts (the UML initial
	 * pseudostate), each transition an arrow named by what causes it, the name
	 * beside the line, and every state nothing leaves leading to the end (the
	 * UML final state). A transition a problem sits on is drawn in amber with
	 * its sign (ac-evo-func-uml-text).
	 */
	interface Props {
		machine: DiagramMachine;
		selection: DiagramSelection | null;
		marks?: readonly DiagramPlace[];
		onpick: (selection: DiagramSelection) => void;
		onsize: (w: number, h: number) => void;
	}
	let { machine, selection, marks = [], onpick, onsize }: Props = $props();

	const layout = $derived(layoutMachine(machine));
	$effect(() => onsize(layout.width, layout.height));
	const uid = $props.id();
	const tabWidth = $derived(Math.min(layout.width - 4, machine.object.length * 7.6 + 30));
</script>

<svg width={layout.width} height={layout.height} role="img" aria-label="States of {machine.object}" class="block font-sans">
	<defs>
		<marker id="{uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_STRONG} />
		</marker>
		<marker id="{uid}-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_HOT} />
		</marker>
		<marker id="{uid}-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" class="fill-orange" />
		</marker>
	</defs>

	<!-- The frame named after the thing, as UML draws a state machine. -->
	<rect x="1" y="1" width={layout.width - 2} height={layout.height - 2} rx="0" class={BOARD_FRAME} stroke-width="1.25" />
	<path d="M1,{TITLE_H - 6} H{tabWidth - 10} L{tabWidth},{TITLE_H - 16} V1" class="fill-surface-sunken stroke-line-strong" stroke-width="1" />
	<text x="12" y="20" class={BOARD_FRAME_TITLE}>{machine.object}</text>

	{#if layout.initial && layout.initialEdge}
		<circle cx={layout.initial.x} cy={layout.initial.y} r="8" class="fill-ink-900" />
		<path d={layout.initialEdge} fill="none" stroke={BOARD_LINE_STRONG} stroke-width="1.3" marker-end="url(#{uid}-arrow)" />
	{/if}

	{#each layout.finals as end, i (i)}
		<path d={end.path} fill="none" stroke={BOARD_LINE_STRONG} stroke-width="1.3" marker-end="url(#{uid}-arrow)" />
		<circle cx={end.at.x} cy={end.at.y} r="10" class="fill-surface stroke-ink-900" stroke-width="1.5" />
		<circle cx={end.at.x} cy={end.at.y} r="6" class="fill-ink-900" />
	{/each}

	{#each layout.edges as edge (edge.index)}
		{@const pick = { kind: 'transition' as const, object: machine.object, index: edge.index }}
		{@const on = isSelected(selection, pick)}
		{@const marked = isMarked(marks, pick)}
		{@const t = machine.transitions[edge.index]}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="Transition from {t.from} to {t.to}{t.trigger ? `: ${t.trigger}` : ''}{marked ? ', with a problem' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{t.from} → {t.to}{t.trigger ? `: ${t.trigger}` : ''}</title>
			<path d={edge.path} class="fill-none stroke-transparent" stroke-width="12" />
			<path
				d={edge.path}
				class="fill-none {marked && !on ? 'stroke-orange' : ''}"
				stroke={on ? BOARD_LINE_HOT : marked ? undefined : BOARD_LINE_STRONG}
				stroke-width={on || marked ? 2 : 1.3}
				marker-end="url(#{uid}-{on ? 'on' : marked ? 'warn' : 'arrow'})"
			/>
			{#if edge.lines.length > 0}
				<text text-anchor="middle" class="{on ? 'fill-blue-ink' : marked ? 'fill-orange-ink' : 'fill-ink-700'} text-[0.6875rem]" paint-order="stroke" stroke="var(--color-paper)" stroke-width="4" stroke-linejoin="round">
					{#each edge.lines as line, l (l)}<tspan x={edge.labelAt.x} y={edge.labelAt.y + l * 13}>{line}</tspan>{/each}
				</text>
			{/if}
			{#if marked}<ProblemMark x={edge.labelAt.x} y={edge.labelAt.y - 20} />{/if}
		</g>
	{/each}

	{#each layout.states as state (state.name)}
		{@const pick = { kind: 'state' as const, object: machine.object, name: state.name }}
		{@const on = isSelected(selection, pick)}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="State {state.name}{state.initial ? ', where it starts' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{state.name}</title>
			<rect x={state.x} y={state.y} width={state.w} height={state.h} rx="14" class={on ? 'fill-blue-tint stroke-blue' : `${BOARD_SHAPE} hover:stroke-blue`} stroke-width={on ? 2 : 1.2} />
			<text text-anchor="middle" class="fill-ink-900 text-[0.8125rem] font-bold">
				{#each state.lines as line, l (l)}<tspan x={state.x + state.w / 2} y={state.y + state.h / 2 + 4 - ((state.lines.length - 1) * LINE_H) / 2 + l * LINE_H}>{line}</tspan>{/each}
			</text>
		</g>
	{/each}
</svg>
