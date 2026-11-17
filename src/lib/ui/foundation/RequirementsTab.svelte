<script lang="ts">
	/**
	 * Requirements is the Requirements tab of Tech & Data, beside the Data map
	 * and the Architecture (spec: criterion 3bcc538f); its answers are still
	 * Foundation's, saved through the definition and operations stores.
	 * It is one page with no menu of its own (spec: feat-constraints):
	 * precise questions first, each a card with its own sources at its foot,
	 * then the technical constraints (the architecture's list; the others are
	 * written in Foundation). Data retention, the quality budgets other than
	 * accessibility, integrations, APIs and performance are not asked for; what
	 * was recorded there stays stored.
	 */
	import { page } from '$app/state';
	import { Field, Icon, MultiSelect, SectionCard, Select } from '$ui/design-system';
	import {
		ACCESSIBILITY_STANDARDS,
		AUTHORIZATION_MODELS,
		AUTH_MECHANISMS,
		CERTIFICATIONS,
		COMPATIBILITIES,
		ENCRYPTION_SCOPES,
		REGULATIONS,
		isTechnicalConstraintTheme,
		type RequirementQuestion
	} from '$domain/foundation';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { DefinitionStore } from './definition-store.svelte';
	import type { OperationsStore } from './operations-store.svelte';
	import TechnicalConstraints from '$ui/architecture/sections/Constraints.svelte';
	import type { ArchitectureStore } from '$ui/architecture/draft-store.svelte';
	import I18nSection from './operations/I18nSection.svelte';

	interface Props {
		definition: DefinitionStore;
		operations: OperationsStore;
		/** Holds the technical constraints, pinned here rather than under Architecture. */
		arch: ArchitectureStore;
		/** What the features' prose reads as, to warn when no language is declared. */
		proseLanguage?: string | null;
	}
	let { definition, operations, arch, proseLanguage = null }: Props = $props();

	const t = $derived(definition.draft.technical);
	const s = $derived(definition.draft.security);
	const sources = $derived(definition.draft.constraints.questionSources);

	// Rows Foundation still files under Technical or Security, from before the
	// split: brought here by the person, never silently (spec: criterion 6a86ea22).
	const stillInFoundation = $derived(
		definition.draft.constraints.items.filter((c) => isTechnicalConstraintTheme(c.theme))
	);
	function bringFromFoundation() {
		for (const row of stillInFoundation) {
			arch.addConstraint({ title: row.description, category: 'other' });
			definition.removeConstraint(row.id);
		}
	}

	// The stack, schema and reference docs are the Stack tab's: point there.
	const architectureHref = $derived(
		page.params.projectId ? `/projects/${page.params.projectId}/infrastructure?tab=stack` : undefined
	);
</script>

{#snippet citations(question: RequirementQuestion, subject: string)}
	<SourceCitations
		inline
		selected={sources[question]}
		onToggle={(sourceId) => definition.toggleQuestionSource(question, sourceId)}
		{subject}
	/>
{/snippet}

<div class="@container space-y-8">
	<section>
		<SectionCard icon="server" title="Where must it run?">
			<div class="space-y-3">
				<Field label="Browsers, OS and devices" hint="the ones your users actually have">
					<MultiSelect
						values={t.compatibilities}
						options={COMPATIBILITIES}
						allowCustom={false}
						tone="brand"
						onchange={definition.setCompatibilities}
					/>
				</Field>
				{#if architectureHref}
					<p class="flex items-center gap-1.5 text-[0.71875rem] text-ink-500">
						<Icon name="server" size={13} class="shrink-0 text-info-500" />
						The tech stack lives in the
						<a href={architectureHref} class="font-semibold text-brand-600 hover:underline">Stack</a> tab.
					</p>
				{/if}
			</div>
			{@render citations('runtime', 'where it must run')}
		</SectionCard>
	</section>

	<section>
		<I18nSection
			store={operations}
			languages={definition.draft.market.languages}
			onLanguagesChange={definition.setLanguages}
			{proseLanguage}
		>
			{@render citations('languages', 'the languages and locales')}
		</I18nSection>
	</section>

	<section>
		<SectionCard icon="shield" title="Security">
			<div class="grid gap-6 @lg:grid-cols-3">
				<Field label="Authentication" hint="how users will sign in">
					<MultiSelect
						values={s.authentication}
						options={AUTH_MECHANISMS}
						allowCustom={false}
						tone="brand"
						onchange={definition.setAuthentication}
					/>
				</Field>
				<Field label="Authorization" hint="how access is granted">
					<Select
						value={s.authorization}
						options={AUTHORIZATION_MODELS}
						onchange={(v) => definition.setAuthorization(v as (typeof AUTHORIZATION_MODELS)[number]['code'])}
					/>
				</Field>
				<Field label="Encryption" hint="what data protection you promise">
					<MultiSelect
						values={s.encryption}
						options={ENCRYPTION_SCOPES}
						allowCustom={false}
						tone="brand"
						onchange={definition.setEncryption}
					/>
				</Field>
			</div>
			{@render citations('security', 'the security')}
		</SectionCard>
	</section>

	<section>
		<SectionCard icon="file-check" title="Compliance">
			<div class="grid gap-6 @lg:grid-cols-2">
				<Field label="Applicable regulations" hint="the laws the product must comply with">
					<MultiSelect
						values={definition.draft.market.regulations}
						options={REGULATIONS}
						allowCustom={false}
						tone="brand"
						onchange={definition.setRegulations}
					/>
				</Field>
				<Field label="Expected certifications" hint="what the market requires to buy">
					<MultiSelect
						values={s.expectedCertifications}
						options={CERTIFICATIONS}
						allowCustom={false}
						tone="brand"
						onchange={definition.setCertifications}
					/>
				</Field>
			</div>
			{@render citations('compliance', 'the compliance')}
		</SectionCard>
	</section>

	<section>
		<SectionCard icon="eye" title="Accessibility">
			<Field label="Standards and commitments" hint="pick every one the product holds to">
				<MultiSelect
					values={operations.draft.quality.a11yStandards}
					options={ACCESSIBILITY_STANDARDS}
					tone="brand"
					onchange={operations.setA11yStandards}
				/>
			</Field>
			{@render citations('accessibility', 'the accessibility level')}
		</SectionCard>
	</section>

	<!-- The one home of the technical constraints; every other kind is written in
	     Foundation (spec: criterion ae15ac45). -->
	<section>
		<TechnicalConstraints store={arch}>
			{#snippet notice()}
				{#if stillInFoundation.length > 0}
					<p class="flex flex-wrap items-center gap-2 border-b border-line bg-surface-sunken/40 px-4 py-2 text-[0.71875rem] text-ink-500">
						{stillInFoundation.length}
						{stillInFoundation.length === 1 ? 'technical constraint is' : 'technical constraints are'} still filed in Foundation.
						<button type="button" onclick={bringFromFoundation} class="font-semibold text-brand-600 hover:underline">
							Bring {stillInFoundation.length === 1 ? 'it' : 'them'} here
						</button>
					</p>
				{/if}
			{/snippet}
		</TechnicalConstraints>
	</section>
</div>
