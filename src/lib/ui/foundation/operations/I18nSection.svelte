<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ComboSelect, Field, MultiSelect, SectionCard, Textarea } from '$ui/design-system';
	import { CURRENCIES, DATE_FORMATS, LANGUAGES, NUMBER_FORMATS } from '$domain/foundation';
	import { LANGUAGE_NAMES, specLanguage } from '$domain/language';
	import type { OperationsStore } from '../operations-store.svelte';

	interface Props {
		store: OperationsStore;
		/** Supported languages — the single source of truth, held on the Business
		    slice (`market.languages`) and scored there; edited here so all locale
		    settings live together. */
		languages: string[];
		onLanguagesChange: (values: string[]) => void;
		/** Shown at the foot of the card, e.g. the sources that back it. */
		children?: Snippet;
		/** What the features' prose reads as, to warn when no language is declared. */
		proseLanguage?: string | null;
	}
	let { store, languages, onLanguagesChange, children, proseLanguage = null }: Props = $props();
	const i18n = $derived(store.draft.i18n);
	// The spec is written in the primary locale, English when none is declared.
	const spec = $derived(specLanguage(i18n.primaryLocale, proseLanguage));
	// The primary locale is one of the languages served, so it is picked among them.
	const languageLabel = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;
	// An empty first entry, so an unanswered question never shows an answer it does not hold.
	const NONE = { code: '', label: 'Choose…' };
	const primaryOptions = $derived([NONE, ...languages.map((code) => ({ code, label: languageLabel(code) }))]);
	const dateOptions = [NONE, ...DATE_FORMATS];
	const numberOptions = [NONE, ...NUMBER_FORMATS];
	const currencyOptions = [NONE, ...CURRENCIES];
</script>

<SectionCard icon="globe" title="Languages & locales">
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
			<Field
				label="Primary locale"
				hint="The whole spec is written in this language; English when none is chosen."
			>
				<ComboSelect
					value={i18n.primaryLocale}
					options={primaryOptions}
					placeholder="Language code, e.g. fr"
					onchange={(v) => store.setI18nField('primaryLocale', v)}
				/>
			</Field>
			<Field label="Date format">
				<ComboSelect value={i18n.dateFormat} options={dateOptions} placeholder="e.g. DD/MM/YYYY" onchange={(v) => store.setI18nField('dateFormat', v)} />
			</Field>
			<Field label="Number format">
				<ComboSelect value={i18n.numberFormat} options={numberOptions} placeholder="e.g. 1 234,56" onchange={(v) => store.setI18nField('numberFormat', v)} />
			</Field>
			<Field label="Currency">
				<ComboSelect value={i18n.currency} options={currencyOptions} placeholder="ISO 4217 code, e.g. EUR" onchange={(v) => store.setI18nField('currency', v)} />
			</Field>
		</div>

		<p class="text-xs text-ink-600">
			The spec is written in {LANGUAGE_NAMES[spec.language] ?? spec.language}{spec.declared
				? ''
				: ' (nothing declared)'}: every description, criterion and generated sentence follows it, and the
			names the code will carry stay in English.
		</p>
		{#if spec.notice}
			<p
				class="flex items-start gap-2 rounded-field border border-warning-200 bg-warning-50/60 px-3 py-2 text-xs text-ink-700"
				role="status"
			>
				{spec.notice}
			</p>
		{/if}

		<Field label="Other notes" hint="Anything else an LLM should know about localization.">
			<Textarea
				value={i18n.notes}
				rows={2}
				placeholder="Pluralization rules, ICU usage, fallback strategy…"
				oninput={(v) => store.setI18nField('notes', v)}
			/>
		</Field>
	</div>
	{@render children?.()}
</SectionCard>
