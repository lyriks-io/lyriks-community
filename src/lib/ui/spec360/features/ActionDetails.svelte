<script lang="ts">
	import type { ActionData } from '$application/spec360/action-data';
	import type { ActionWho } from '$application/spec360/features';
	import UserMark from '$ui/spec360/UserMark.svelte';
	import ActionDataBlock from './ActionDataBlock.svelte';
	import { KICK } from '$ui/spec360/page/look';

	/**
	 * What only an action's Details say, unfolded under its row (criterion
	 * 119af301): who may do it, and the data it reads and writes through the links field to
	 * state, what no field carries named apart (criterion d0e0e1a5). No data
	 * block when the behavior model could not be read: saying it reads nothing
	 * would be false.
	 */
	interface Props {
		who: readonly ActionWho[];
		data?: ActionData;
	}
	let { who, data }: Props = $props();
	const CHIP = 'inline-flex h-[22px] items-center gap-1 border border-line bg-toner px-[7px] font-evo-mono text-[0.6875rem] text-ink-2';
</script>

<div class="flex animate-lk-in-fast flex-col gap-2.5 pb-1 pl-9">
	<div class="flex flex-wrap items-center gap-1.5">
		<span class="{KICK} mr-1">Who may do it</span>
		{#each who as person (person.id)}
			<span class={CHIP}><UserMark admin={person.userClass === 'admin'} size={14} />{person.name}</span>
		{:else}
			<span class={CHIP}>Nobody is granted it yet</span>
		{/each}
	</div>
	{#if data}<ActionDataBlock {data} />{/if}
</div>
