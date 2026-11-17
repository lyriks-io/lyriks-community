<script lang="ts">
	import type { DiagramPlace, TechSequence, TechnicalDiagram } from '$domain/evolution';
	import { layoutSequence } from './layout-tech';
	import { LINE_H } from './layout';
	import PartShape from './PartShape.svelte';
	import { namesAnAdmin } from '$application/spec360/users';
	import { getAdminNames } from '$ui/users/admin-names-context';
	import { isMarked, isSelected, onPickKey, type TechSelection } from './selection';
	import ProblemMark from './ProblemMark.svelte';
	import { BOARD_LINE, BOARD_LINE_HOT, BOARD_LINE_STRONG, BOARD_SHAPE } from '$ui/design-system';
	import type { DiagramWords } from './words';

	/**
	 * One exchange of the Technical spec's diagram as a UML sequence diagram
	 * (ac-evo-tech-uml): the parts it involves as lifelines in the order they
	 * first act, each message an arrow in order (a call solid, an answer dashed,
	 * a message to itself a loop), and what happens when a message goes wrong in
	 * a frame under it saying when and what then happens. A message a problem
	 * sits on is drawn in amber with its sign, its frames too (ac-evo-func-uml-text).
	 */
	interface Props {
		diagram: TechnicalDiagram;
		sequence: TechSequence;
		words: DiagramWords;
		selection: TechSelection | null;
		marks?: readonly DiagramPlace[];
		onpick: (selection: TechSelection) => void;
		onsize: (w: number, h: number) => void;
	}
	let { diagram, sequence, words, selection, marks = [], onpick, onsize }: Props = $props();

	const layout = $derived(layoutSequence(diagram, sequence));
	const adminNames = getAdminNames();
	$effect(() => onsize(layout.width, layout.height));
	const uid = $props.id();
	const messagePick = (index: number) => ({ kind: 'message' as const, sequence: sequence.name, index });
	/** A message to itself: out to the right, down, and back. */
	const loop = (x: number, y: number) => `M${x},${y - 16} H${x + 40} V${y} H${x + 4}`;
</script>

<svg width={layout.width} height={layout.height} role="img" aria-label="Sequence {sequence.name}" class="block font-sans">
	<defs>
		<marker id="{uid}-call" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_STRONG} />
		</marker>
		<marker id="{uid}-reply" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,1 L9,5 L0,9" fill="none" stroke={BOARD_LINE_STRONG} stroke-width="1.6" />
		</marker>
		<marker id="{uid}-on" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_HOT} />
		</marker>
		<marker id="{uid}-warn" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" class="fill-orange" />
		</marker>
	</defs>

	<text x="4" y="20" class="fill-ink-900 text-[0.875rem] font-semibold">{sequence.name}</text>

	{#each layout.participants as p (p.name)}
		{@const pick = { kind: 'element' as const, name: p.name }}
		{@const on = isSelected(selection, pick)}
		<line x1={p.x} y1={layout.lifelineTop} x2={p.x} y2={layout.lifelineBottom} stroke={BOARD_LINE} stroke-width="1.2" stroke-dasharray="5 4" />
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="{p.kind} {p.name}" onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{p.name}</title>
			<PartShape
				kind={p.kind}
				isNew={p.isNew}
				x={p.x}
				y={p.kind === 'actor' ? layout.headerY + 26 : layout.headerY + layout.headerH / 2}
				w={p.w}
				h={p.h}
				lines={p.lines}
				selected={on}
				{words}
				admin={p.kind === 'actor' && namesAnAdmin(p.name, adminNames())}
			/>
		</g>
	{/each}

	{#each layout.fragments as f (f.message + ':' + f.failure)}
		{@const pick = messagePick(f.message)}
		{@const on = isSelected(selection, pick)}
		{@const marked = isMarked(marks, pick)}
		{@const failure = sequence.messages[f.message]?.failures[f.failure]}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="{words.goesWrongWhen} {failure?.when ?? f.when.join(' ')}" onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{words.goesWrongWhen} {failure?.when ?? ''}: {failure?.then ?? ''}</title>
			<rect x={f.x} y={f.y} width={f.w} height={f.h} rx="3" class={on ? 'fill-surface/90 stroke-blue' : marked ? 'fill-surface/90 stroke-orange' : BOARD_SHAPE} stroke-width={on || marked ? 1.75 : 1.1} />
			<!-- The UML fragment tag, then its guard. -->
			<path d="M{f.x},{f.y + 18} H{f.x + 84} L{f.x + 94},{f.y + 9} V{f.y}" class="fill-surface-sunken stroke-line-strong" stroke-width="1" />
			<text x={f.x + 8} y={f.y + 13} class="fill-ink-700 text-[0.625rem] font-semibold">{words.goesWrong}</text>
			<text class="fill-ink-700 text-[0.6875rem]">
				{#each f.when as line, i (i)}<tspan x={f.x + 104} y={f.y + 14 + i * 14}>{i === 0 ? '[' : ''}{line}{i === f.when.length - 1 ? ']' : ''}</tspan>{/each}
			</text>
			<text class="fill-ink-900 text-[0.75rem] font-medium">
				{#each f.then as line, i (i)}<tspan x={f.x + (i === 0 ? 12 : 26)} y={f.y + 26 + Math.max(f.when.length * 14, 14) + i * LINE_H}>{i === 0 ? '→ ' : ''}{line}</tspan>{/each}
			</text>
		</g>
	{/each}

	{#each layout.messages as m (m.index)}
		{@const pick = messagePick(m.index)}
		{@const on = isSelected(selection, pick)}
		{@const marked = isMarked(marks, pick)}
		{@const marker = on ? 'on' : marked ? 'warn' : m.reply ? 'reply' : 'call'}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="Message {m.index + 1}: {sequence.messages[m.index].text}{marked ? ', with a problem' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{m.index + 1}. {sequence.messages[m.index].text}</title>
			{#if m.self}
				<path d={loop(m.x1, m.y)} class="fill-none stroke-transparent" stroke-width="12" />
				<path
					d={loop(m.x1, m.y)}
					class="fill-none {marked && !on ? 'stroke-orange' : ''}"
					stroke={on ? BOARD_LINE_HOT : marked ? undefined : BOARD_LINE_STRONG}
					stroke-width={on || marked ? 2 : 1.3}
					stroke-dasharray={m.reply ? '5 3' : undefined}
					marker-end="url(#{uid}-{marker})"
				/>
			{:else}
				<line x1={m.x1} y1={m.y} x2={m.x2} y2={m.y} class="stroke-transparent" stroke-width="12" />
				<line
					x1={m.x1}
					y1={m.y}
					x2={m.x2 + (m.x2 > m.x1 ? -2 : 2)}
					y2={m.y}
					class={marked && !on ? 'stroke-orange' : ''}
					stroke={on ? BOARD_LINE_HOT : marked ? undefined : BOARD_LINE_STRONG}
					stroke-width={on || marked ? 2 : 1.3}
					stroke-dasharray={m.reply ? '5 3' : undefined}
					marker-end="url(#{uid}-{marker})"
				/>
			{/if}
			<text text-anchor={m.self ? 'start' : 'middle'} class="{on ? 'fill-blue-ink' : marked ? 'fill-orange-ink' : 'fill-ink-800'} text-[0.71875rem]">
				{#each m.lines as line, i (i)}<tspan x={m.labelX} y={m.labelY + i * 14}>{i === 0 ? `${m.index + 1}. ` : ''}{line}</tspan>{/each}
			</text>
			{#if marked}<ProblemMark x={m.x1 + (m.self || m.x2 > m.x1 ? 14 : -14)} y={m.y + 12} />{/if}
		</g>
	{/each}
</svg>
