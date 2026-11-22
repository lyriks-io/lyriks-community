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

	// A refused sign-up hands back the names typed, so only the passwords are
	// typed again.
	const registerFirstName = $derived(form && 'firstName' in form ? String(form.firstName ?? '') : '');
	const registerLastName = $derived(form && 'lastName' in form ? String(form.lastName ?? '') : '');
</script>

<div class="grid h-screen place-items-center bg-canvas px-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<Logo size={44} class="mx-auto mb-3" />
			<h1 class="text-lg font-bold tracking-[-0.02em] text-ink">
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
			<p class="mb-4 border-l-[6px] border-blue bg-blue-tint px-3 py-2 text-xs text-ink-2">
				You've been invited to
				<span class="font-semibold text-ink-800">{data.inviteWorkspace ?? 'a workspace'}</span>
				as <span class="font-semibold text-ink-800">{data.inviteEmail}</span>. Create your account
				to join it.
			</p>
		{/if}

		{#if data.inviteExpired}
			<p class="mb-4 border-l-[6px] border-orange bg-orange-tint px-3 py-2 text-xs text-ink-2">
				This invite link is no longer valid. It may have been used, revoked, or expired. Ask your
				workspace admin for a fresh one.
			</p>
		{/if}

		{#if !data.authConfigured}
			<p class="mb-4 border-l-[6px] border-orange bg-orange-tint px-3 py-2 text-xs text-ink-2">
				Authentication isn't configured on this instance (no Lyriks server URL). Contact your admin.
			</p>
		{/if}

		{#if data.backUnreachable}
			<p class="mb-4 border-l-[6px] border-red bg-red-tint px-3 py-2 text-xs text-red-ink">
				The Lyriks server could not be reached. Try again in a moment.
			</p>
		{/if}

		{#if form?.message}
			<p class="mb-4 border-l-[6px] border-red bg-red-tint px-3 py-2 text-xs text-red-ink">
				{form.message}
			</p>
		{/if}

		{#if data.firstRun}
			<!-- No account exists on this installation. Nothing was configured at
			     install time on purpose: the person who owns the licence is the
			     person who claims the box, and they prove it here. -->
			<div class="space-y-4 border border-line bg-surface p-5">
				{#if firstRunStep === 'identify'}
					<div>
						<h2 class="text-sm font-bold tracking-[-0.01em] text-ink">Claim this installation</h2>
						<p class="mt-1 text-xs leading-relaxed text-ink-2">
							Enter the address your licence was issued to, and the key we sent you. Your key is
							checked on this machine; nothing leaves it.
						</p>
					</div>
					<form method="POST" action="?/firstRunCheck" class="space-y-3">
						<label class="block">
							<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Email</span>
							<input
								name="email"
								type="email"
								required
								autocomplete="email"
								value={firstRunEmail}
								class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
								placeholder="you@company.com"
							/>
						</label>
						<label class="block">
							<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Licence key</span>
							<textarea
								name="key"
								rows="3"
								required
								spellcheck="false"
								autocomplete="off"
								class="w-full resize-none border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-3 focus:border-blue"
								placeholder="lyk_…">{firstRunKey}</textarea>
						</label>
						<button
							type="submit"
							class="pressable w-full border-[1.5px] border-ink bg-brand-500 py-2 text-xs font-bold tracking-[0.07em] text-paper uppercase"
						>
							Continue
						</button>
					</form>
				{:else}
					<div>
						<h2 class="text-sm font-bold tracking-[-0.01em] text-ink">Choose your password</h2>
						<p class="mt-1 text-xs leading-relaxed text-ink-2">
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
							<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Password</span>
							<input
								name="password"
								type="password"
								required
								autocomplete="new-password"
								class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
								placeholder="••••••••"
							/>
						</label>
						<label class="block">
							<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Confirm password</span>
							<input
								name="confirm"
								type="password"
								required
								autocomplete="new-password"
								class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
								placeholder="••••••••"
							/>
						</label>
						<button
							type="submit"
							disabled={!data.authConfigured}
							class="pressable w-full border-[1.5px] border-ink bg-brand-500 py-2 text-xs font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40"
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
						<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">First name</span>
						<input
							name="firstName"
							type="text"
							autocomplete="given-name"
							value={registerFirstName}
							class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
							placeholder="Ada"
						/>
					</label>
					<label class="block">
						<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Last name</span>
						<input
							name="lastName"
							type="text"
							autocomplete="family-name"
							value={registerLastName}
							class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
							placeholder="Lovelace"
						/>
					</label>
				</div>
			{/if}
			<label class="block">
				<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Email</span>
				<!-- An invitation is issued to ONE address and acceptance only works for
				     it, so while registering via invite the field is locked: editing it
				     could only produce a confusing refusal three fields later. Signing in
				     instead (an invitee who already has an account) unlocks it.
				     While registering, the address is the account's username: a browser
				     that generates passwords saves the new one under it, readonly or not. -->
				<input
					name="email"
					type="email"
					required
					autocomplete={isRegister ? 'username' : 'email'}
					readonly={isRegister && data.viaInvite}
					value={form?.email ?? data.inviteEmail ?? ''}
					class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue read-only:cursor-not-allowed read-only:bg-toner-2 read-only:text-ink-3"
					placeholder="you@company.com"
				/>
				{#if isRegister && data.viaInvite}
					<span class="mt-1 block text-[0.6875rem] text-ink-400">The invitation was issued to this address.</span>
				{/if}
			</label>
			<label class="block">
				<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete={isRegister ? 'new-password' : 'current-password'}
					class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
					placeholder="••••••••"
				/>
			</label>
			{#if isRegister}
				<!-- Asked twice so a mistyped password cannot lock the person out of the
				     account they just created; both fields ask for a new password, so a
				     browser that generates one fills them both. -->
				<label class="block">
					<span class="mb-1 block font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Confirm password</span>
					<input
						name="confirm"
						type="password"
						required
						autocomplete="new-password"
						class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-blue"
						placeholder="••••••••"
					/>
				</label>
			{/if}
			<button
				type="submit"
				disabled={!data.authConfigured}
				class="pressable w-full border-[1.5px] border-ink bg-brand-500 py-2 text-xs font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40"
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
					class="font-semibold text-blue-ink hover:underline"
				>
					{isRegister ? 'Sign in' : 'Create one'}
				</button>
			</p>
		{/if}
		{/if}
	</div>
</div>
