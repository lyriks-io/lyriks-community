<script lang="ts">
	import { Button, Field, Icon, MultiSelect, SectionCard, Select, TextInput } from '$ui/design-system';
	import {
		AUDIT_LOG_LEVELS,
		AUTHORIZATION_MODELS,
		AUTH_MECHANISMS,
		CERTIFICATIONS,
		ENCRYPTION_SCOPES,
		RETENTION_ACTIONS
	} from '$domain/foundation';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { DefinitionStore } from '../definition-store.svelte';

	interface Props {
		store: DefinitionStore;
		/** Active sub-section, driven by the second-level nav (SubTabBar). */
		active?: 'access' | 'data' | 'compliance' | 'custom';
	}
	let { store, active = 'access' }: Props = $props();

	const s = $derived(store.draft.security);
</script>

<SectionCard
	icon="shield"
	color="mint"
	title="Security requirements"
	eyebrow="the trust & compliance the product must earn"
>
	<div class="space-y-7">
		{#if active === 'access'}
		<!-- Authn + Authz -->
		<div class="grid gap-6 sm:grid-cols-2">
			<Field label="Authentication" hint="how users will sign in">
				<MultiSelect
					values={s.authentication}
					options={AUTH_MECHANISMS}
					allowCustom={false}
					tone="brand"
					onchange={store.setAuthentication}
				/>
			</Field>
			<Field label="Authorization" hint="how access is granted">
				<Select
					value={store.draft.security.authorization}
					options={AUTHORIZATION_MODELS}
					onchange={(v) => store.setAuthorization(v as (typeof AUTHORIZATION_MODELS)[number]['code'])}
				/>
			</Field>
		</div>
		{/if}

		{#if active === 'data'}
		<!-- Encryption + Audit -->
		<div class="grid gap-6 sm:grid-cols-2">
			<Field label="Encryption" hint="what data protection you promise">
				<MultiSelect
					values={s.encryption}
					options={ENCRYPTION_SCOPES}
					allowCustom={false}
					tone="brand"
					onchange={store.setEncryption}
				/>
			</Field>
			<Field label="Audit logs" hint="the trail your buyers will ask for">
				<Select
					value={store.draft.security.auditLogs}
					options={AUDIT_LOG_LEVELS}
					onchange={(v) => store.setAuditLogs(v as (typeof AUDIT_LOG_LEVELS)[number]['code'])}
				/>
			</Field>
		</div>
		{/if}

		{#if active === 'compliance'}
		<!-- Certifications -->
		<Field label="Expected certifications" hint="what the market requires to buy">
			<MultiSelect
				values={s.expectedCertifications}
				options={CERTIFICATIONS}
				allowCustom={false}
				tone="brand"
				onchange={store.setCertifications}
			/>
		</Field>
		{/if}

		{#if active === 'data'}
		<!-- Data retention -->
		<Field label="Data retention">
			{#if store.draft.security.dataRetention.length > 0}
				<div class="overflow-hidden rounded-card border border-line">
					<div class="grid grid-cols-[1fr_1fr_180px_auto] gap-3 border-b border-line bg-surface-sunken px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
						<span>Data type</span>
						<span>Duration</span>
						<span>Action after</span>
						<span></span>
					</div>
					{#each store.draft.security.dataRetention as rr, i (i)}
						<div class="grid grid-cols-[1fr_1fr_180px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
							<TextInput value={rr.dataType} placeholder="Invoices" oninput={(v) => store.updateRetentionRule(i, 'dataType', v)} />
							<TextInput value={rr.duration} placeholder="10 years" oninput={(v) => store.updateRetentionRule(i, 'duration', v)} />
							<Select
								value={rr.actionAfter}
								options={RETENTION_ACTIONS}
								onchange={(v) => store.updateRetentionRule(i, 'actionAfter', v as (typeof RETENTION_ACTIONS)[number]['code'])}
							/>
							<button
								type="button"
								onclick={() => store.removeRetentionRule(i)}
								class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
								aria-label="Remove retention rule"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
			<Button variant="ghost" size="sm" onclick={() => store.addRetentionRule()}>
				<Icon name="plus" size={14} /> Retention rule
			</Button>
		</Field>
		{/if}

		{#if active === 'custom'}
		<!-- Custom security requirements -->
		<Field label="Custom security requirements" hint="label + value">
			{#if s.custom.length > 0}
				<div class="space-y-2">
					{#each s.custom as row, i (i)}
						<div class="grid grid-cols-[180px_1fr_auto] items-center gap-2">
							<TextInput value={row.label} placeholder="Label" oninput={(v) => store.updateSecCustom(i, 'label', v)} />
							<TextInput value={row.value} placeholder="Value" oninput={(v) => store.updateSecCustom(i, 'value', v)} />
							<button
								type="button"
								onclick={() => store.removeSecCustom(i)}
								class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
								aria-label="Remove custom requirement"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
			<Button variant="ghost" size="sm" onclick={() => store.addSecCustom()}>
				<Icon name="plus" size={14} /> Add custom security requirement
			</Button>
		</Field>
		{/if}
	</div>
</SectionCard>

<div class="mt-4">
	<SourceCitations
		selected={store.draft.security.sourceIds}
		onToggle={(sourceId) => store.toggleSectionSource('security', sourceId)}
		subject="these controls"
	/>
</div>
