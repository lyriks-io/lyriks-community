<script lang="ts">
	import { keyProjectsLabel, type LicenseView } from '$domain/licensing';

	/**
	 * Settings, Account repeats the licence (criterion dc792f74): everything the
	 * key reports, right where the operator looks themselves up, the number of
	 * active projects included (EVO-016, criterion 033088d7). Client-safe view
	 * only; the raw key never leaves the server. Managing (activate / replace)
	 * stays on /activate.
	 */
	let { license }: { license: LicenseView | null | undefined } = $props();
</script>

{#if license}
	<div class="bg-surface-sunken p-3 text-xs">
		<div class="mb-2 flex items-center justify-between">
			<p class="font-evo-mono tracking-[0.08em] text-ink-3 uppercase">Licence</p>
			<a href="/activate" class="font-semibold text-blue-ink hover:underline">Manage</a>
		</div>
		{#if license.entitlements}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div>
					<p class="text-ink-400">Licensed to</p>
					<p class="mt-0.5 font-medium text-ink-800">{license.entitlements.customer}</p>
				</div>
				<div>
					<p class="text-ink-400">Edition</p>
					<p class="mt-0.5 capitalize text-ink-800">{license.entitlements.edition}</p>
				</div>
				<div>
					<p class="text-ink-400">Seats</p>
					<p class="mt-0.5 text-ink-800">{license.entitlements.seats}</p>
				</div>
				<!-- The number of active projects the key grants (EVO-016, criterion 033088d7). -->
				<div>
					<p class="text-ink-400">Projects</p>
					<p class="mt-0.5 text-ink-800" data-licence-projects>{keyProjectsLabel(license.entitlements)}</p>
				</div>
				<div>
					<p class="text-ink-400">Expires</p>
					<p class="mt-0.5 text-ink-800">
						{#if license.entitlements.expiresAt}
							{license.entitlements.expiresAt.slice(0, 10)}{license.daysRemaining != null
								? ` (${license.daysRemaining} days left)`
								: ''}
						{:else}
							Never (perpetual)
						{/if}
					</p>
				</div>
				<div>
					<p class="text-ink-400">Issued</p>
					<p class="mt-0.5 text-ink-800">{license.entitlements.issuedAt.slice(0, 10)}</p>
				</div>
				<div>
					<p class="text-ink-400">Activated</p>
					<p class="mt-0.5 text-ink-800">
						{license.activatedAt ? license.activatedAt.slice(0, 10) : 'Not yet'}
					</p>
				</div>
				<div class="col-span-2 sm:col-span-3">
					<p class="text-ink-400">Licence id</p>
					<p class="mt-0.5 font-mono text-[0.6875rem] text-ink-600">{license.entitlements.licenseId}</p>
				</div>
			</div>
			{#if license.status !== 'active'}
				<p class="mt-2 font-medium text-red-ink">
					Status: {license.status.replace('_', ' ')}. See /activate.
				</p>
			{/if}
		{:else}
			<p class="text-ink-500">
				Not activated.
				<a class="font-semibold text-blue-ink hover:underline" href="/activate">Activate now</a>.
			</p>
		{/if}
	</div>
{/if}
