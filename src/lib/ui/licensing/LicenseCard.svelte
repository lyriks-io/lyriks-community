<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import type { LicenseStatus, LicenseView } from '$domain/licensing';

	let { view }: { view: LicenseView } = $props();

	const TONE: Record<LicenseStatus, { icon: IconName; color: string; label: string }> = {
		active: { icon: 'shield', color: 'text-success-600', label: 'Product activated' },
		expired: { icon: 'info', color: 'text-danger-500', label: 'Licence expired' },
		invalid: { icon: 'x', color: 'text-danger-500', label: 'Licence key invalid' },
		tampered: { icon: 'lock', color: 'text-danger-500', label: 'System clock rolled back' },
		wrong_edition: { icon: 'layers', color: 'text-danger-500', label: 'Licence covers another edition' },
		unlicensed: { icon: 'lock', color: 'text-ink-400', label: 'Product not activated' }
	};

	let tone = $derived(TONE[view.status]);
	let ent = $derived(view.entitlements);

	function fmtDate(iso: string | null): string {
		if (!iso) return '-';
		const t = Date.parse(iso);
		return Number.isNaN(t) ? iso : new Date(t).toISOString().slice(0, 10);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2.5">
		<Icon name={tone.icon} size={20} class={tone.color} />
		<h2 class="text-sm font-semibold text-ink-900">{tone.label}</h2>
	</div>

	{#if view.status === 'wrong_edition'}
		<p class="text-xs text-danger-500">
			This key is valid, but it grants the <span class="capitalize">{ent?.edition}</span> edition and
			this installation runs a higher one. A key covers its own edition and every edition below it,
			so ask us for the key matching this deployment, or reinstall the edition your key covers.
		</p>
	{/if}

	{#if view.status === 'tampered'}
		<p class="text-xs text-danger-500">
			The system clock is set earlier than a time this installation has already recorded. A
			time-limited licence cannot be validated while the clock is rolled back - set the machine to
			the correct date and time to continue.
		</p>
	{/if}

	{#if ent}
		<dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
			<div>
				<dt class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Licensed to</dt>
				<dd class="text-ink-900">{ent.customer}</dd>
			</div>
			<div>
				<dt class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Edition</dt>
				<dd class="text-ink-900 capitalize">{ent.edition}</dd>
			</div>
			<div>
				<dt class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Seats</dt>
				<dd class="text-ink-900">{ent.seats}</dd>
			</div>
			<div>
				<dt class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Expires</dt>
				<dd class="text-ink-900">
					{#if ent.expiresAt === null}
						Never · perpetual
					{:else}
						{fmtDate(ent.expiresAt)}
						{#if view.daysRemaining !== null}
							<span
								class="ml-1 text-xs {view.daysRemaining <= 14
									? 'text-danger-500'
									: 'text-ink-400'}"
							>
								({view.daysRemaining >= 0 ? `${view.daysRemaining}d left` : 'past due'})
							</span>
						{/if}
					{/if}
				</dd>
			</div>
			<div class="col-span-2">
				<dt class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
					Activated on this install
				</dt>
				<dd class="text-ink-900">{fmtDate(view.activatedAt)}</dd>
			</div>
		</dl>
	{:else if view.status === 'invalid'}
		<p class="text-xs text-ink-500">
			A licence key is stored but its signature does not verify against this build. It may have been
			edited, or issued for a different product. Enter a valid key below.
		</p>
	{:else}
		<p class="text-xs text-ink-500">
			Enter the licence key from your purchase confirmation email to activate this installation.
		</p>
	{/if}
</div>
