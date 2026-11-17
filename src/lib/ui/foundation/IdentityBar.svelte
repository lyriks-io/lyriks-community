<script lang="ts">
	import { ComboSelect, Field, SectionCard, TextInput } from '$ui/design-system';
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

<!-- The same card as every other Foundation block: the name and the three
     selectors are plain labelled fields, side by side when the card is wide. -->
<SectionCard icon="tag" title="Identity">
	<div class="@container">
		<div class="grid gap-4 @2xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
			<Field label="Product name">
				<TextInput
					value={store.draft.productName}
					placeholder="Untitled product"
					invalid={store.draft.productName.length > LIMITS.productName}
					oninput={store.setProductName}
				/>
			</Field>
			<Field label="Market type">
				<ComboSelect
					value={marketType}
					options={MARKET_TYPES}
					placeholder="Your market type…"
					onchange={onMarketTypeChange}
				/>
			</Field>
			<Field label="Industry">
				<ComboSelect
					value={store.draft.industry}
					options={INDUSTRIES}
					placeholder="Your industry…"
					onchange={store.setIndustry}
				/>
			</Field>
			<Field label="Type">
				<ComboSelect
					value={store.draft.productType}
					options={PRODUCT_TYPES}
					placeholder="Your project type…"
					onchange={store.setProductType}
				/>
			</Field>
		</div>
	</div>
</SectionCard>
