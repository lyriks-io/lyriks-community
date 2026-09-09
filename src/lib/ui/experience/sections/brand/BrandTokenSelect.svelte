<script lang="ts" module>
	export interface TokenOption {
		value: string;
		label: string;
		swatch?: string;
	}
</script>

<script lang="ts">
	interface Props {
		label: string;
		value: string;
		options: TokenOption[];
		swatchKey?: boolean;
		onChange: (value: string) => void;
	}
	let { label, value, options, swatchKey = false, onChange }: Props = $props();

	const active = $derived(options.find((o) => o.value === value));
</script>

<label class="block text-[10px] font-medium text-ink-500">
	<span class="mb-0.5 block uppercase tracking-widest text-ink-400">{label}</span>
	<span class="flex items-center gap-1.5">
		{#if swatchKey && active?.swatch}
			<span class="size-5 shrink-0 rounded border border-line" style="background:{active.swatch}"></span>
		{/if}
		<select
			value={value}
			onchange={(e) => onChange(e.currentTarget.value)}
			class="w-full rounded-field border border-line bg-surface-sunken px-2 py-1.5 text-xs text-ink-700 transition-colors hover:border-line-strong focus:border-brand-400"
		>
			{#each options as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</span>
</label>
