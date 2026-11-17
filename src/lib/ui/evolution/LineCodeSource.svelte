<script lang="ts">
	import CodePlace from '$ui/spec360/CodePlace.svelte';
	import { KICKER } from './evo-look';
	import type { LineCodePlace } from './report-board';

	/**
	 * What the sources button of a line of the Implementation step opens under it
	 * (criterion 2670dc31), read like the foot of an element of a feature: the
	 * place the code was located at, with the lines that prove it on hover.
	 */
	interface Props {
		projectId: string;
		code: LineCodePlace;
		/** "Rule", "Action"... and its name, said on the card. */
		kind: string;
		name: string;
	}
	let { projectId, code, kind, name }: Props = $props();
</script>

<div class="flex w-full animate-lk-in-fast flex-col gap-2 bg-evo-sunken px-3.5 py-3">
	<span class={KICKER}>1 SOURCE</span>
	<span class="flex flex-wrap items-baseline gap-2 text-xs">
		<span class="font-bold text-evo-violet-ink">Code</span>
		<CodePlace {projectId} featureId={code.featureId} place={code.place} file={code.file} line={code.line} recorded={code.recorded} {kind} {name} class="font-evo-mono text-xs break-all text-evo-ink-3" />
	</span>
</div>
