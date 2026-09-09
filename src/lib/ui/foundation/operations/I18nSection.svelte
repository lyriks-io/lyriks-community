<script lang="ts">
	import { Field, MultiSelect, SectionCard, TextInput, Textarea } from '$ui/design-system';
	import { LANGUAGES } from '$domain/foundation';
	import type { OperationsStore } from '../operations-store.svelte';

	interface Props {
		store: OperationsStore;
		/** Supported languages — the single source of truth, held on the Business
		    slice (`market.languages`) and scored there; edited here so all locale
		    settings live together. */
		languages: string[];
		onLanguagesChange: (values: string[]) => void;
	}
	let { store, languages, onLanguagesChange }: Props = $props();
	const i18n = $derived(store.draft.i18n);
</script>

<SectionCard
	eyebrow="i18n & locales"
	icon="globe"
	title="Languages, formats, timezone"
	subtitle="How downstream generation formats language, dates, numbers and money."
>
	<div class="space-y-4">
		<Field label="Languages to support" hint="Every language the product must serve.">
			<MultiSelect
				values={languages}
				options={LANGUAGES}
				allowCustom={false}
				tone="brand"
				onchange={onLanguagesChange}
			/>
		</Field>

		<div class="grid gap-4 sm:grid-cols-2">
			<Field label="Primary locale" hint="Default language code (BCP-47).">
				<TextInput value={i18n.primaryLocale} placeholder="fr" oninput={(v) => store.setI18nField('primaryLocale', v)} />
			</Field>
			<Field label="Timezone" hint="IANA timezone for server-side time math.">
				<TextInput value={i18n.timezone} placeholder="Europe/Paris" oninput={(v) => store.setI18nField('timezone', v)} />
			</Field>
			<Field label="Date format" hint="An example beats an abstract rule.">
				<TextInput value={i18n.dateFormat} placeholder="DD/MM/YYYY" oninput={(v) => store.setI18nField('dateFormat', v)} />
			</Field>
			<Field label="Number format" hint="Decimal and thousands separators.">
				<TextInput value={i18n.numberFormat} placeholder="1 234,56" oninput={(v) => store.setI18nField('numberFormat', v)} />
			</Field>
			<Field label="Currency" hint="ISO 4217 code.">
				<TextInput value={i18n.currency} placeholder="EUR" oninput={(v) => store.setI18nField('currency', v)} />
			</Field>
		</div>

		<Field label="Other notes" hint="Anything else an LLM should know about localization.">
			<Textarea
				value={i18n.notes}
				rows={2}
				placeholder="Pluralization rules, ICU usage, fallback strategy…"
				oninput={(v) => store.setI18nField('notes', v)}
			/>
		</Field>
	</div>
</SectionCard>
