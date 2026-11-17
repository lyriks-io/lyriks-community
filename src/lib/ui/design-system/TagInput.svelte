<script lang="ts">
	import Chip, { type ChipTone } from './Chip.svelte';
	import Icon from './Icon.svelte';
	import { fieldBase, fieldBorder, fieldHeight, fieldSideButton } from './field';

	interface Props {
		tags: string[];
		placeholder?: string;
		maxLength?: number;
		tone?: ChipTone;
		onadd: (tag: string) => void;
		onremove: (index: number) => void;
	}
	let { tags, placeholder = 'Add…', maxLength = 80, tone = 'neutral', onadd, onremove }: Props =
		$props();

	let draft = $state('');

	function commit() {
		const value = draft.trim();
		if (value.length === 0 || value.length > maxLength) return;
		onadd(value);
		draft = '';
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			commit();
		}
	}
</script>

<div class="flex flex-col gap-2.5">
	{#if tags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each tags as tag, i (tag + i)}
				<Chip {tone} removable onremove={() => onremove(i)}>{tag}</Chip>
			{/each}
		</div>
	{/if}
	<div class="flex items-center gap-2">
		<input
			bind:value={draft}
			{placeholder}
			{onkeydown}
			maxlength={maxLength}
			class="{fieldBase} {fieldHeight} {fieldBorder} px-3.5 py-2.5"
		/>
		<button
			type="button"
			onclick={commit}
			aria-label="Add"
			class={fieldSideButton}
		>
			<Icon name="plus" size={18} />
		</button>
	</div>
</div>
