<script lang="ts">
	import type { DiagramPlace, TechnicalDiagram } from '$domain/evolution';
	import { layoutComponents } from './layout-tech';
	import { LINE_H } from './layout';
	import PartShape from './PartShape.svelte';
	import { namesAnAdmin } from '$application/spec360/users';
	import { getAdminNames } from '$ui/users/admin-names-context';
	import { isMarked, isSelected, onPickKey, type TechSelection } from './selection';
	import ProblemMark from './ProblemMark.svelte';
	import { BOARD_FRAME, BOARD_FRAME_TITLE, BOARD_LINE, BOARD_LINE_HOT, BOARD_LINE_STRONG } from '$ui/design-system';
	import type { DiagramWords } from './words';

	/**
	 * The components view of the Technical spec's diagram (ac-evo-tech-uml): what
	 * the change involves and adds to the architecture. The product's frame holds
	 * its parts and the stores where its data lives; the other systems stand
	 * outside, the people on the left; each link an arrow saying what goes
	 * through it; the constraints and risks numbered on their part and written in
	 * full under the drawing. A link or a note a problem sits on is drawn in
	 * amber with its sign (ac-evo-func-uml-text).
	 */
	interface Props {
		diagram: TechnicalDiagram;
		productName: string;
		words: DiagramWords;
		selection: TechSelection | null;
		marks?: readonly DiagramPlace[];
		onpick: (selection: TechSelection) => void;
		onsize: (w: number, h: number) => void;
	}
	let { diagram, productName, words, selection, marks = [], onpick, onsize }: Props = $props();

	const layout = $derived(layoutComponents(diagram));
	const adminNames = getAdminNames();
	$effect(() => onsize(layout.width, layout.height));
	const uid = $props.id();
	const hasNew = $derived(diagram.elements.some((e) => e.isNew));
</script>

<svg width={layout.width} height={layout.height} role="img" aria-label="Components of the change" class="block font-sans">
	<defs>
		<marker id="{uid}-arrow" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_STRONG} />
		</marker>
		<marker id="{uid}-on" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_HOT} />
		</marker>
		<marker id="{uid}-warn" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" class="fill-orange" />
		</marker>
	</defs>

	<rect x={layout.frame.x} y={layout.frame.y} width={layout.frame.w} height={layout.frame.h} rx="0" class={BOARD_FRAME} stroke-width="1.25" />
	<text x={layout.frame.x + 14} y={layout.frame.y + 21} class={BOARD_FRAME_TITLE}>{productName}</text>

	<!-- A person uses the parts they talk to in a sequence: a UML dependency, dashed. -->
	{#each layout.uses as use (use.actor + '>' + use.component)}
		<line x1={use.from.x} y1={use.from.y} x2={use.to.x} y2={use.to.y} stroke={BOARD_LINE} stroke-width="1.2" stroke-dasharray="5 3" marker-end="url(#{uid}-arrow)">
			<title>{use.actor} → {use.component}</title>
		</line>
	{/each}

	{#each layout.links as link (link.index)}
		{@const pick = { kind: 'link' as const, index: link.index }}
		{@const on = isSelected(selection, pick)}
		{@const marked = isMarked(marks, pick)}
		{@const l = diagram.links[link.index]}
		{@const path = link.points.map((p) => `${p.x},${p.y}`).join(' ')}
		{@const middle = link.points[Math.floor(link.points.length / 2)]}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="Link from {l.from} to {l.to}{l.label ? `: ${l.label}` : ''}{marked ? ', with a problem' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{l.from} → {l.to}{l.label ? `: ${l.label}` : ''}</title>
			<polyline points={path} fill="none" class="stroke-transparent" stroke-width="12" />
			<polyline
				points={path}
				fill="none"
				stroke-linejoin="round"
				class={marked && !on ? 'stroke-orange' : ''}
				stroke={on ? BOARD_LINE_HOT : marked ? undefined : BOARD_LINE_STRONG}
				stroke-width={on || marked ? 2 : 1.3}
				marker-end="url(#{uid}-{on ? 'on' : marked ? 'warn' : 'arrow'})"
			/>
			{#if link.lines.length > 0}
				<text text-anchor={link.anchor} class="{on ? 'fill-blue-ink' : marked ? 'fill-orange-ink' : 'fill-ink-700'} text-[0.6875rem]" paint-order="stroke" stroke="var(--color-paper)" stroke-width="4" stroke-linejoin="round">
					{#each link.lines as line, i (i)}<tspan x={link.labelAt.x} y={link.anchor === 'middle' ? link.labelAt.y - (link.lines.length - 1 - i) * 13 : link.labelAt.y + i * 13}>{line}</tspan>{/each}
				</text>
			{/if}
			{#if marked && middle}<ProblemMark x={middle.x} y={middle.y} />{/if}
		</g>
	{/each}

	{#each layout.parts as part (part.name)}
		{@const pick = { kind: 'element' as const, name: part.name }}
		{@const on = isSelected(selection, pick)}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="{part.kind} {part.name}{part.isNew ? ', new' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{part.name}</title>
			<PartShape kind={part.kind} isNew={part.isNew} x={part.x} y={part.y} w={part.w} h={part.h} lines={part.lines} selected={on} {words} notes={part.notes} uses={part.uses} admin={part.kind === 'actor' && namesAnAdmin(part.name, adminNames())} />
		</g>
	{/each}

	{#if hasNew}
		<g transform="translate({layout.frame.x},{layout.notesTop - 30})" class="text-[0.6875rem]">
			<rect width="26" height="14" rx="0" class="fill-paper stroke-blue" stroke-width="2" />
			<text x="34" y="11" class="fill-ink-700 font-mono">{words.isNew}: {words.newLegend}</text>
		</g>
	{/if}

	<!-- The constraints and risks, in full, by their number (ac-evo-tech-uml). -->
	{#if layout.notes.length > 0}
		<text x={layout.frame.x} y={layout.notesTop + 12} class="fill-ink-500 font-mono text-[0.75rem] font-medium uppercase tracking-[0.08em]">{words.risks}</text>
		{#each layout.notes as note (note.index)}
			{@const pick = { kind: 'note' as const, index: note.index }}
			{@const on = isSelected(selection, pick)}
			{@const marked = isMarked(marks, pick)}
			<g class="cursor-pointer" role="button" tabindex="0" aria-label="Note {note.number} on {note.on}{marked ? ', with a problem' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
				<circle cx={layout.frame.x + 9} cy={note.y + 4} r="9" class={marked ? 'fill-orange' : 'fill-ink'} />
				<text x={layout.frame.x + 9} y={note.y + 7.5} text-anchor="middle" class="fill-paper font-mono text-[0.625rem] font-bold">{note.number}</text>
				<text class="{on ? 'fill-blue-ink' : marked ? 'fill-orange-ink' : 'fill-ink-800'} text-[0.75rem]">
					{#each note.lines as line, i (i)}<tspan x={layout.frame.x + 26} y={note.y + 8 + i * LINE_H}>{line}</tspan>{/each}
				</text>
			</g>
		{/each}
	{/if}
</svg>
