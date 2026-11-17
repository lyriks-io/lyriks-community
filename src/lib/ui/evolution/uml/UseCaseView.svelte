<script lang="ts">
	import type { DiagramPlace, FunctionalDiagram } from '$domain/evolution';
	import { BOARD_FRAME, BOARD_FRAME_TITLE, BOARD_LINE, BOARD_LINE_HOT, BOARD_LINE_STRONG, BOARD_SHAPE } from '$ui/design-system';
	import { routePath } from '$ui/data/board/erd-route';
	import { layoutUseCases, linkLines, LINE_H, SYSTEM_W } from './layout';
	import { isMarked, isSelected, onPickKey, type DiagramSelection } from './selection';
	import { namesAnAdmin } from '$application/spec360/users';
	import { getAdminNames } from '$ui/users/admin-names-context';
	import ActorMark from './ActorMark.svelte';
	import ProblemMark from './ProblemMark.svelte';
	import { linkLabel, type DiagramWords } from './words';

	/**
	 * The use case diagram (ac-evo-func-uml): the people on the left, the other
	 * systems on the right, each use case as an ellipse inside a frame named after
	 * the product. An arrow goes from whoever starts a use case to it, a lighter
	 * one from the use case to each other one it involves, and the legend says
	 * which is which. A use case or a person a problem sits on is drawn in amber
	 * with its sign (ac-evo-func-uml-text). It is drawn in the data map's look,
	 * its lines at right angles around the shapes (criterion 59998858).
	 */
	interface Props {
		diagram: FunctionalDiagram;
		productName: string;
		/** The words it draws, in the spec's language (ac-evo-form-spec-language). */
		words: DiagramWords;
		selection: DiagramSelection | null;
		marks?: readonly DiagramPlace[];
		onpick: (selection: DiagramSelection) => void;
		/** The natural size the drawing takes, for the canvas to fit it. */
		onsize: (w: number, h: number) => void;
	}
	let { diagram, productName, words, selection, marks = [], onpick, onsize }: Props = $props();

	const layout = $derived(layoutUseCases(diagram));
	const adminNames = getAdminNames();
	$effect(() => onsize(layout.width, layout.height));
	const uid = $props.id();
	const lineTop = (count: number, centre: number) => centre - ((count - 1) * LINE_H) / 2 + 4;
	const linked = (name: string) =>
		(selection?.kind === 'actor' && selection.name.toLowerCase() === name.toLowerCase()) ||
		(selection?.kind === 'use_case' && selection.name.toLowerCase() === name.toLowerCase());
</script>

<svg width={layout.width} height={layout.height} role="img" aria-label="Use cases of the change" class="block font-sans">
	<defs>
		<marker id="{uid}-starts" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_STRONG} />
		</marker>
		<marker id="{uid}-involves" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M0,1 L9,5 L0,9" fill="none" stroke={BOARD_LINE} stroke-width="1.6" />
		</marker>
		<marker id="{uid}-on" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill={BOARD_LINE_HOT} />
		</marker>
	</defs>

	<rect x={layout.frame.x} y={layout.frame.y} width={layout.frame.w} height={layout.frame.h} rx="0" class={BOARD_FRAME} stroke-width="1.25" />
	<text x={layout.frame.x + 14} y={layout.frame.y + 21} class={BOARD_FRAME_TITLE}>{productName}</text>

	<!-- The selected element's lines last, so they read over the others, as on the data map. -->
	{#each [...layout.links].sort((a, b) => Number(linked(a.actor) || linked(a.useCase)) - Number(linked(b.actor) || linked(b.useCase))) as link (link.actor + '>' + link.useCase)}
		{@const on = linked(link.actor) || linked(link.useCase)}
		<path
			d={routePath(link.points)}
			fill="none"
			stroke={on ? BOARD_LINE_HOT : link.starts ? BOARD_LINE_STRONG : BOARD_LINE}
			stroke-width={on ? 2 : link.starts ? 1.4 : 1.2}
			stroke-linejoin="round"
			stroke-dasharray={link.starts ? undefined : '5 3'}
			marker-end="url(#{uid}-{on ? 'on' : link.starts ? 'starts' : 'involves'})"
		>
			<title>{link.starts ? words.starts(link.actor, link.useCase) : words.involves(link.useCase, link.actor)}</title>
		</path>
	{/each}

	{#each layout.useCases as uc (uc.name)}
		{@const pick = { kind: 'use_case' as const, name: uc.name }}
		{@const count = uc.lines.length + linkLines(uc.uses)}
		{@const on = isSelected(selection, pick)}
		{@const marked = isMarked(marks, pick)}
		<g class="cursor-pointer" role="button" tabindex="0" aria-label="Use case {uc.name}{marked ? ', with a problem' : ''}" aria-pressed={on} onclick={() => onpick(pick)} onkeydown={onPickKey(() => onpick(pick))}>
			<title>{uc.name}{uc.uses ? `\n${linkLabel(uc.uses, words).join(' ')}` : ''}</title>
			<ellipse
				cx={uc.cx}
				cy={uc.cy}
				rx={uc.rx}
				ry={uc.ry}
				class={on ? 'fill-blue-tint stroke-blue' : marked ? 'fill-orange-tint stroke-orange' : `${BOARD_SHAPE} hover:stroke-blue`}
				stroke-width={on || marked ? 2 : 1.2}
			/>
			<text text-anchor="middle" class="fill-ink-900 text-[0.8125rem] font-bold">
				{#each uc.lines as line, i (i)}<tspan x={uc.cx} y={lineTop(count, uc.cy) + i * LINE_H}>{line}</tspan>{/each}
			</text>
			{#if uc.uses}
				<!-- Already in the product, in the grey of what was there before (ac-evo-func-uml-link), never repeating the name (ac-evo-uml-legible). -->
				<text text-anchor="middle" class="fill-ink-400 text-[0.6875rem]">
					{#each linkLabel(uc.uses, words) as line, i (i)}<tspan x={uc.cx} y={lineTop(count, uc.cy) + (uc.lines.length + i) * LINE_H}>{line}</tspan>{/each}
				</text>
			{/if}
			{#if marked}<ProblemMark x={uc.cx + uc.rx * 0.72} y={uc.cy - uc.ry * 0.72} />{/if}
		</g>
	{/each}

	{#each layout.actors as actor (actor.name)}
		{@const pick = { kind: 'actor' as const, name: actor.name }}
		{@const on = isSelected(selection, pick)}
		{@const marked = isMarked(marks, pick)}
		{@const tone = on ? 'stroke-blue' : marked ? 'stroke-orange' : 'stroke-ink-500'}
		<g
			class="cursor-pointer"
			role="button"
			tabindex="0"
			aria-label="{actor.kind === 'person' ? 'Person' : 'System'} {actor.name}{marked ? ', with a problem' : ''}"
			aria-pressed={on}
			onclick={() => onpick(pick)}
			onkeydown={onPickKey(() => onpick(pick))}
		>
			<title>{actor.name}{actor.declared ? '' : ': not declared'}</title>
			{#if actor.kind === 'person'}
				<!-- A person: the app's user mark, an admin with its shield, the name under it. -->
				{@const admin = namesAnAdmin(actor.name, adminNames())}
				<ActorMark x={actor.x} y={actor.y - 2} tone={tone} strokeWidth={on ? 2 : 1.5} dashed={!actor.declared} {admin} />
				<rect x={actor.x - 34} y={actor.y - 34} width="68" height="62" class="fill-transparent" />
				<text text-anchor="middle" class="{on ? 'fill-blue-ink' : marked ? 'fill-orange-ink' : 'fill-ink-900'} text-[0.8125rem] font-bold">
					{#each actor.lines as line, i (i)}<tspan x={actor.x} y={actor.y + 42 + i * LINE_H}>{line}</tspan>{/each}
				</text>
				<!-- The shield holds the top-right corner: an admin's problem sign takes the top-left. -->
				{#if marked}<ProblemMark x={admin ? actor.x - 18 : actor.x + 18} y={actor.y - 30} />{/if}
			{:else}
				<!-- Another system: a box marked «system». -->
				<rect
					x={actor.x - SYSTEM_W / 2}
					y={actor.y - actor.h / 2}
					width={SYSTEM_W}
					height={actor.h}
					rx="0"
					class={on ? 'fill-blue-tint stroke-blue' : marked ? 'fill-orange-tint stroke-orange' : BOARD_SHAPE}
					stroke-width={on || marked ? 2 : 1.2}
					stroke-dasharray={actor.declared ? undefined : '3 2'}
				/>
				<text x={actor.x} y={actor.y - actor.h / 2 + 16} text-anchor="middle" class="fill-ink-500 text-[0.625rem]">{words.system}</text>
				<text text-anchor="middle" class="{on ? 'fill-blue-ink' : marked ? 'fill-orange-ink' : 'fill-ink-900'} text-[0.75rem] font-bold">
					{#each actor.lines as line, i (i)}<tspan x={actor.x} y={actor.y - actor.h / 2 + 33 + i * 13}>{line}</tspan>{/each}
				</text>
				{#if marked}<ProblemMark x={actor.x + SYSTEM_W / 2 - 2} y={actor.y - actor.h / 2 + 2} />{/if}
			{/if}
		</g>
	{/each}

	<!-- The legend of the two arrows (ac-evo-func-uml). -->
	<g class="font-mono text-[0.6875rem]" transform="translate({layout.legend.x},{layout.legend.y})">
		<line x1="0" y1="0" x2="34" y2="0" stroke={BOARD_LINE_STRONG} stroke-width="1.4" marker-end="url(#{uid}-starts)" />
		<text x="42" y="4" class="fill-ink-700">{words.startsLegend}</text>
		<line x1="190" y1="0" x2="224" y2="0" stroke={BOARD_LINE} stroke-width="1.2" stroke-dasharray="5 3" marker-end="url(#{uid}-involves)" />
		<text x="232" y="4" class="fill-ink-700">{words.involvesLegend}</text>
	</g>
</svg>
