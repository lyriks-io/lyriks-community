<script lang="ts">
	import { Card, ComboSelect, EditableText, Field, Icon } from '$ui/design-system';
	import { INDUSTRIES, LIMITS, MARKET_TYPES, PRODUCT_TYPES } from '$domain/foundation';
	import type { IdentityStore } from './identity-store.svelte';

	interface Props {
		store: IdentityStore;
		/** Market type is owned by the Business slice; surfaced here so it sits with
		    the other identity selectors, right after the product name. */
		marketType: string;
		onMarketTypeChange: (value: string) => void;
	}
	let { store, marketType, onMarketTypeChange }: Props = $props();
</script>

<!-- Compact identity bar : icon + name + Industry + Type. Surfaces the spec
     actions Set Product Name, Pick Industry, Pick Type. The product name reads
     as a large inline-editable heading; Industry/Type are boxed selects. Just
     two layouts (same pieces / same colours in both): a single 4-column row on
     desktop (icon centered), and a full-width stack below — icon, name, then
     Industry and Type each on their own row. The switch is a CONTAINER query so
     it tracks the card's real width, not the viewport (the card can be narrow
     under a sidebar even when the viewport is wide). -->
<Card>
	<div class="@container">
		<div
			class="grid grid-cols-1 items-start gap-x-5 gap-y-4 @2xl:grid-cols-[auto_minmax(0,1fr)_190px_190px_190px]"
		>
			<!-- icon : a tile at the top when stacked; vertically centered in the row when wide -->
			<div class="@2xl:grid @2xl:self-stretch @2xl:place-items-center">
				<span class="grid size-10 shrink-0 place-items-center rounded-field bg-brand-50 text-brand-500">
					<Icon name="tag" size={18} />
				</span>
			</div>

			<!-- product name : inline-editable heading -->
			<div class="min-w-0">
				<p class="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-500">
					Identity · Product name
				</p>
				<EditableText
					ariaLabel="Product name"
					value={store.draft.productName}
					onCommit={store.setProductName}
					placeholder="Untitled product"
					class="flex h-12 items-center truncate text-2xl font-semibold leading-tight tracking-tight text-ink-900"
				/>
				{#if store.draft.productName.length > LIMITS.productName}
					<p class="mt-1 text-xs text-danger-500">
						{store.draft.productName.length}/{LIMITS.productName}
					</p>
				{/if}
			</div>

			<Field label="Market type">
				<ComboSelect
					value={marketType}
					options={MARKET_TYPES}
					placeholder="Your market type…"
					onchange={onMarketTypeChange}
					class="h-12"
				/>
			</Field>
			<Field label="Industry">
				<ComboSelect
					value={store.draft.industry}
					options={INDUSTRIES}
					placeholder="Your industry…"
					onchange={store.setIndustry}
					class="h-12"
				/>
			</Field>
			<Field label="Type">
				<ComboSelect
					value={store.draft.productType}
					options={PRODUCT_TYPES}
					placeholder="Your project type…"
					onchange={store.setProductType}
					class="h-12"
				/>
			</Field>
		</div>
	</div>
</Card>
