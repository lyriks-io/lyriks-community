<script lang="ts">
	import type { TechElementKind } from '$domain/evolution';
	import ActorMark from './ActorMark.svelte';
	import { LINE_H, linkLines, type LinkMark } from './layout';
	import { linkLabel, type DiagramWords } from './words';

	/**
	 * One part of the Technical spec's diagram, drawn the UML way (ac-evo-tech-uml):
	 * a component as a box with the component icon, a store as a cylinder, another
	 * system as a shaded box, a person as the app's user mark (an admin with its
	 * shield, ac-evo-func-uml). What the change adds is drawn in the not-there-yet
	 * tone and marked new.
	 */
	interface Props {
		kind: TechElementKind;
		isNew: boolean;
		/** Its middle and its size. */
		x: number;
		y: number;
		w: number;
		h: number;
		lines: readonly string[];
		selected: boolean;
		words: DiagramWords;
		/** The numbers of the notes bearing on it, as badges on its corner. */
		notes?: readonly number[];
		/** The feature or the table the product already has that it is (ac-evo-tech-uml-link). */
		uses?: LinkMark | null;
		/** A person who is one of the project's admin roles: the mark carries the shield. */
		admin?: boolean;
	}
	let { kind, isNew, x, y, w, h, lines, selected, words, notes = [], uses = null, admin = false }: Props = $props();

	const x0 = $derived(x - w / 2);
	const y0 = $derived(y - h / 2);
	// What the change adds is the design's action node: a 2px blue stroke.
	const stroke = $derived(selected ? 'stroke-blue' : isNew ? 'stroke-blue' : 'stroke-line-strong');
	const width = $derived(selected || isNew ? 2 : 1.2);
	const text = $derived(selected ? 'fill-blue-ink' : 'fill-ink-900');
	const stereo = $derived(kind === 'component' ? words.component : kind === 'store' ? words.store : kind === 'system' ? words.system : '');
	// The name and its link are centred together under the stereotype (ac-evo-uml-legible).
	const linkText = $derived(uses ? linkLabel(uses, words) : []);
	const nameTop = $derived(y + 8 - ((lines.length + linkLines(uses) - 1) * 13) / 2);
</script>

{#if kind === 'actor'}
	<ActorMark {x} y={y - 4} tone={selected ? 'stroke-blue' : 'stroke-ink-500'} strokeWidth={selected ? 2 : 1.5} {admin} />
	<rect x={x - 36} y={y - 32} width="72" height="60" class="fill-transparent" />
	<text text-anchor="middle" class="{text} text-[0.75rem] font-bold">
		{#each lines as line, i (i)}<tspan x={x} y={y + 40 + i * LINE_H}>{line}</tspan>{/each}
	</text>
{:else}
	{#if kind === 'store'}
		<path
			d="M{x0},{y0 + 8} V{y0 + h - 8} A{w / 2},8 0 0 0 {x0 + w},{y0 + h - 8} V{y0 + 8}"
			class="fill-surface {stroke}"
			stroke-width={width}
		/>
		<ellipse cx={x} cy={y0 + 8} rx={w / 2} ry="8" class="fill-surface {stroke}" stroke-width={width} />
	{:else}
		<rect x={x0} y={y0} width={w} height={h} rx="0" class="{selected ? 'fill-blue-tint' : kind === 'system' ? 'fill-surface-sunken' : 'fill-surface'} {stroke}" stroke-width={width} />
		{#if kind === 'component'}
			<!-- The UML component icon. -->
			<g class="fill-surface {stroke}" stroke-width="1">
				<rect x={x0 + w - 22} y={y0 + 8} width="14" height="16" rx="1" />
				<rect x={x0 + w - 26} y={y0 + 11} width="8" height="3.5" />
				<rect x={x0 + w - 26} y={y0 + 17.5} width="8" height="3.5" />
			</g>
		{/if}
	{/if}
	<text x={x} y={y0 + (kind === 'store' ? 26 : 15)} text-anchor="middle" class="fill-ink-500 text-[0.5625rem]">{stereo}</text>
	<text text-anchor="middle" class="{text} text-[0.75rem] font-bold">
		{#each lines as line, i (i)}<tspan x={x} y={nameTop + (kind === 'store' ? 6 : 0) + i * 13}>{line}</tspan>{/each}
	</text>
	{#if linkText.length > 0}
		<!-- Already in the product, in the grey of what was there before, never repeating the name. -->
		<text text-anchor="middle" class="fill-ink-400 text-[0.625rem]">
			{#each linkText as line, i (i)}<tspan x={x} y={nameTop + (kind === 'store' ? 6 : 0) + (lines.length + i) * 13}>{line}</tspan>{/each}
		</text>
	{/if}
	{#if isNew}
		<!-- Marked new: what a decision brings (ac-evo-tech-uml). -->
		<g transform="translate({x0 + 8},{y0 - 8})">
			<rect width={words.isNew.length * 6 + 14} height="15" rx="0" class="fill-paper stroke-blue" stroke-width="1.5" />
			<text x={(words.isNew.length * 6 + 14) / 2} y="11" text-anchor="middle" class="fill-blue-ink font-mono text-[0.5625rem] font-bold uppercase">{words.isNew}</text>
		</g>
	{/if}
{/if}
{#each notes as number, i (number)}
	<!-- A note bearing on it, by its number: the note is written in full under the drawing. -->
	<g transform="translate({(kind === 'actor' ? x + 24 : x0 + w) - 4 - (notes.length - 1 - i) * 20},{(kind === 'actor' ? y - 34 : y0) - 4})">
		<circle r="9" class="fill-ink stroke-surface" stroke-width="1.5" />
		<text y="3.5" text-anchor="middle" class="fill-paper font-mono text-[0.625rem] font-bold">{number}</text>
	</g>
{/each}
