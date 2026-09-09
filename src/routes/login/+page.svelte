<script lang="ts">
	import { Logo } from '$ui/design-system';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// `userMode` wins once the user toggles; until then we follow the action
	// result (a failed register POST comes back in register mode). Full-POST form
	// (no enhance) remounts on submit, so `userMode` resets to null each time.
	let userMode = $state<'login' | 'register' | null>(null);
	// An invited teammate (arriving via /join with a live invitation) has no
	// account yet → default to the register form so they create it in one step.
	// An action result outranks that: a register attempt on an address that
	// already exists comes back as `login` precisely to move them there.
	const initialMode = $derived(
		form?.mode ? form.mode : data.viaInvite ? 'register' : 'login'
	);
	const mode = $derived(data.allowSignup ? (userMode ?? initialMode) : 'login');
	const isRegister = $derived(mode === 'register');
	// Named action + preserved post-auth destination (a bare `?/login` would drop
	// the ?redirect=/join/<token> query, stranding an invited teammate at `/`).
	const redirectSuffix = $derived(
		data.redirectTo && data.redirectTo !== '/' ? `&redirect=${encodeURIComponent(data.redirectTo)}` : ''
	);
	const formAction = $derived(`?/${isRegister ? 'register' : 'login'}${redirectSuffix}`);

	// First run: this appliance has no account yet, so the visitor claims it with
	// the licence key as the credential. Two steps, because proving the pair and
	// choosing a password are different questions and a refusal on the first must
	// not throw away the second.
	const firstRunStep = $derived(
		form && 'step' in form && form.step === 'password' ? 'password' : 'identify'
	);
	const firstRunEmail = $derived(form && 'email' in form ? String(form.email ?? '') : '');
	const firstRunKey = $derived(form && 'key' in form ? String(form.key ?? '') : '');
	const firstRunLicense = $derived(form && 'license' in form ? form.license : null);
</script>

<div class="grid h-screen place-items-center bg-canvas px-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<Logo size={44} class="mx-auto mb-3" />
			<h1 class="text-lg font-bold text-ink-900">
				{#if data.firstRun}Set up Lyriks{:else}{isRegister
						? 'Create your Lyriks account'
						: 'Sign in to Lyriks'}{/if}
			</h1>
			<p class="mt-1 text-xs text-ink-400">
				{#if data.firstRun}Nobody has claimed this installation yet.{:else}{isRegister
						? 'Start specifying and shipping coherent products.'
						: 'Welcome back.'}{/if}
			</p>
		</div>

		{#if data.viaInvite}
			<p class="mb-4 rounded-field border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-ink-600">
				You've been invited to
				<span class="font-semibold text-ink-800">{data.inviteWorkspace ?? 'a workspace'}</span>
				as <span class="font-semibold text-ink-800">{data.inviteEmail}</span>. Create your account
				to join it.
			</p>
		{/if}

		{#if data.inviteExpired}
			<p class="mb-4 rounded-field border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-600">
				This invite link is no longer valid. It may have been used, revoked, or expired. Ask your
				workspace admin for a fresh one.
			</p>
		{/if}

		{#if !data.authConfigured}
			<p class="mb-4 rounded-field border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-600">
				Authentication isn't configured on this instance (no Lyriks server URL). Contact your admin.
			</p>
		{/if}

		{#if data.backUnreachable}
			<p class="mb-4 rounded-field border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-600">
				The Lyriks server could not be reached. Try again in a moment.
			</p>
		{/if}

		{#if form?.message}
			<p class="mb-4 rounded-field border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-600">
				{form.message}
			</p>
		{/if}

		{#if data.firstRun}
			<!-- No account exists on this installation. Nothing was configured at
			     install time on purpose: the person who owns the licence is the
			     person who claims the box, and they prove it here. -->
			<div class="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
				{#if firstRunStep === 'identify'}
					<div>
						<h2 class="text-sm font-semibold text-ink-900">Claim this installation</h2>
						<p class="mt-1 text-xs leading-relaxed text-ink-500">
							Enter the address your licence was issued to, and the key we sent you. Your key is
							checked on this machine; nothing leaves it.
						</p>
					</div>
					<form method="POST" action="?/firstRunCheck" class="space-y-3">
						<label class="block">
							<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Email</span>
							<input
								name="email"
								type="email"
								required
								autocomplete="email"
								value={firstRunEmail}
								class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
								placeholder="you@company.com"
							/>
						</label>
						<label class="block">
							<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Licence key</span>
							<textarea
								name="key"
								rows="3"
								required
								spellcheck="false"
								autocomplete="off"
								class="w-full resize-none rounded-field border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-900 outline-none focus:border-brand-300"
								placeholder="lyk_…">{firstRunKey}</textarea>
						</label>
						<button
							type="submit"
							class="w-full rounded-field bg-brand-gradient py-2 text-sm font-semibold text-white shadow-card transition-opacity hover:opacity-95"
						>
							Continue
						</button>
					</form>
				{:else}
					<div>
						<h2 class="text-sm font-semibold text-ink-900">Choose your password</h2>
						<p class="mt-1 text-xs leading-relaxed text-ink-500">
							Your key checks out{firstRunLicense?.entitlements?.customer
								? ` for ${firstRunLicense.entitlements.customer}`
								: ''}. This creates the administrator account for
							<span class="font-medium text-ink-700">{firstRunEmail}</span>.
						</p>
					</div>
					<form method="POST" action={`?/firstRunCreate${redirectSuffix}`} class="space-y-3">
						<input type="hidden" name="email" value={firstRunEmail} />
						<input type="hidden" name="key" value={firstRunKey} />
						<label class="block">
							<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Password</span>
							<input
								name="password"
								type="password"
								required
								autocomplete="new-password"
								class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
								placeholder="••••••••"
							/>
						</label>
						<label class="block">
							<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Confirm password</span>
							<input
								name="confirm"
								type="password"
								required
								autocomplete="new-password"
								class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
								placeholder="••••••••"
							/>
						</label>
						<button
							type="submit"
							disabled={!data.authConfigured}
							class="w-full rounded-field bg-brand-gradient py-2 text-sm font-semibold text-white shadow-card transition-opacity hover:opacity-95 disabled:opacity-40"
						>
							Create my account
						</button>
					</form>
				{/if}
			</div>
		{:else}
		<form method="POST" action={formAction} class="space-y-3">
			{#if isRegister}
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">First name</span>
						<input
							name="firstName"
							type="text"
							autocomplete="given-name"
							class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
							placeholder="Ada"
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Last name</span>
						<input
							name="lastName"
							type="text"
							autocomplete="family-name"
							class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
							placeholder="Lovelace"
						/>
					</label>
				</div>
			{/if}
			<label class="block">
				<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Email</span>
				<!-- An invitation is issued to ONE address and acceptance only works for
				     it, so while registering via invite the field is locked: editing it
				     could only produce a confusing refusal three fields later. Signing in
				     instead (an invitee who already has an account) unlocks it. -->
				<input
					name="email"
					type="email"
					required
					autocomplete="email"
					readonly={isRegister && data.viaInvite}
					value={form?.email ?? data.inviteEmail ?? ''}
					class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300 read-only:cursor-not-allowed read-only:bg-surface-2 read-only:text-ink-500"
					placeholder="you@company.com"
				/>
				{#if isRegister && data.viaInvite}
					<span class="mt-1 block text-[11px] text-ink-400">The invitation was issued to this address.</span>
				{/if}
			</label>
			<label class="block">
				<span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete={isRegister ? 'new-password' : 'current-password'}
					class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300"
					placeholder="••••••••"
				/>
			</label>
			<button
				type="submit"
				disabled={!data.authConfigured}
				class="w-full rounded-field bg-brand-gradient py-2 text-sm font-semibold text-white shadow-card transition-opacity hover:opacity-95 disabled:opacity-40"
			>
				{isRegister ? 'Create account' : 'Sign in'}
			</button>
		</form>

		{#if data.allowSignup && !data.firstRun}
			<p class="mt-4 text-center text-xs text-ink-400">
				{isRegister ? 'Already have an account?' : "Don't have an account?"}
				<button
					type="button"
					onclick={() => (userMode = isRegister ? 'login' : 'register')}
					class="font-semibold text-brand-600 hover:text-brand-700"
				>
					{isRegister ? 'Sign in' : 'Create one'}
				</button>
			</p>
		{/if}
		{/if}
	</div>
</div>
