<script lang="ts">
	import { Icon, fieldBase, fieldBorder, fieldHeight, fieldSideButton } from '$ui/design-system';

	interface Props {
		items: string[];
		tone: 'success' | 'danger' | 'brand';
		placeholder: string;
		maxLength?: number;
		onadd: (text: string) => void;
		onremove: (index: number) => void;
	}
	let { items, tone, placeholder, maxLength = 200, onadd, onremove }: Props = $props();

	let draft = $state('');
	const dot = $derived(
		tone === 'success' ? 'bg-success-500' : tone === 'danger' ? 'bg-danger-500' : 'bg-brand-500'
	);

	function commit() {
		const value = draft.trim();
		if (value.length === 0 || value.length > maxLength) return;
		onadd(value);
		draft = '';
	}
</script>

<div class="space-y-2.5">
	{#if items.length > 0}
		<ul class="space-y-1.5">
			{#each items as item, i (item + i)}
				<!-- py-3.5 + one 20px line = h-12, the height of the add field below. -->
				<li class="group flex items-start gap-2.5 rounded-field bg-surface-sunken px-3.5 py-3.5 text-sm leading-5 text-ink-700">
					<span class="mt-1.75 size-1.5 shrink-0 {dot}"></span>
					<span class="min-w-0 flex-1 break-words">{item}</span>
					<button
						type="button"
						onclick={() => onremove(i)}
						aria-label="Remove"
						class="mt-0.75 shrink-0 text-ink-400 opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
					>
						<Icon name="x" size={14} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="flex items-center gap-2">
		<input
			bind:value={draft}
			{placeholder}
			maxlength={maxLength}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					commit();
				}
			}}
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
