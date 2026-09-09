<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import { pendingDialog } from '$ui/design-system/dialog.svelte';
	import {
		FEEDBACK_CATEGORIES,
		FEEDBACK_EMAIL,
		FEEDBACK_RATINGS,
		MAX_FEEDBACK_ITEMS,
		MAX_FEEDBACK_MESSAGE,
		feedbackInviteDue,
		feedbackItems,
		feedbackMailto,
		feedbackReport,
		feedbackSendable,
		type FeedbackCategory,
		type FeedbackContext,
		type FeedbackRating
	} from '$domain/feedback';
	import { closeFeedback, feedbackOpen, openFeedback } from './feedback.svelte';

	/**
	 * The feedback dialog. One visit, as many entries as the user has in mind:
	 * each row is one typed point (bug, idea, other) and travels as its own
	 * entry, so the team triages a line at a time instead of splitting an essay.
	 *
	 * Channel policy, in order:
	 *  - The operator switch (Settings → Feedback) decides whether the online
	 *    channel may even be offered; /api/feedback resolves it into `endpoint`.
	 *  - The user's own choice, asked once and stored per browser
	 *    (`lyriks.feedback.mode`), decides whether THIS browser uses it. Nothing
	 *    is posted before that explicit pick plus a Send click, and the post goes
	 *    from this browser to the relay: the appliance server does no egress.
	 *  - Offline (or when the relay cannot be reached) the same report leaves by
	 *    mailto to the team address, or through the clipboard.
	 */
	const MODE_KEY = 'lyriks.feedback.mode';
	// Whether the online channel was available last time this browser opened the
	// dialog ('1'|'0'). Lets a re-open decide its first step synchronously, so the
	// "choose a channel" step no longer flashes the form for the half-second the
	// /api/feedback fetch takes. Only the very first open (no cache) waits.
	const ONLINE_AVAIL_KEY = 'lyriks.feedback.online';
	// Invite cadence, per browser: cumulative visible-tab usage, the last
	// automatic invite, the last actual send, and the "don't ask again" mute.
	const USAGE_KEY = 'lyriks.feedback.usage';
	const INVITED_KEY = 'lyriks.feedback.invitedAt';
	const SENT_KEY = 'lyriks.feedback.sentAt';
	const MUTE_KEY = 'lyriks.feedback.nudge';
	const USAGE_TICK_MS = 60_000;

	type Mode = 'online' | 'offline';

	/** One editable row. `id` keys the list and its input; it never leaves the dialog. */
	interface EntryRow {
		id: string;
		category: FeedbackCategory;
		message: string;
	}

	const open = $derived(feedbackOpen());

	let panel = $state<HTMLElement | null>(null);
	let emailInput = $state<HTMLInputElement | null>(null);
	// Row inputs by row id: a Map survives insertions and removals, where an
	// index-keyed array would keep stale slots after a row is dropped.
	const entryInputs = new Map<string, HTMLTextAreaElement>();

	// Server-provided config, refetched on each open (cheap, and the operator
	// switch may have flipped since). `endpoint` is '' when the channel is off.
	let endpoint = $state('');
	let context = $state<FeedbackContext | null>(null);

	let mode = $state<Mode | null>(null);
	/**
	 * The walk: rate, then write, then send. Three small steps beat one tall
	 * form, because the first is one click and already worth sending, and a
	 * user who stops there has still told us something.
	 */
	const WALK = ['rate', 'notes', 'send'] as const;
	type Step = 'loading' | 'choose' | (typeof WALK)[number] | 'sent';
	// 'loading' shows only on the first-ever open, while we learn whether the
	// online channel exists; every later open starts on its real step at once.
	let step = $state<Step>('rate');
	// Where the channel picker hands control back, so "Change" never costs a draft.
	let resumeStep = $state<Step>('rate');
	const walkIndex = $derived(WALK.indexOf(step as (typeof WALK)[number]));

	// The signed-in operator's own address (empty for a dev/no-auth session):
	// the default reply-to, shared unless the user opts out.
	const accountEmail = $derived((page.data.session?.email as string | undefined) ?? '');

	let nextRowId = 0;
	function newRow(category: FeedbackCategory = 'idea'): EntryRow {
		nextRowId += 1;
		return { id: `entry-${nextRowId}`, category, message: '' };
	}

	let rows = $state<EntryRow[]>([newRow()]);
	let rating = $state<FeedbackRating | ''>('');
	let contactEmail = $state('');
	// Opt-out, not opt-in: an authenticated user shares their email by default so
	// the team can reply, and unchecks this to stay anonymous.
	let shareEmail = $state(true);
	let includeContext = $state(true);
	let sending = $state(false);
	let sendFailed = $state(false);
	let copied = $state(false);

	// True when the dialog opened on its own (usage invite), not by the user.
	let invited = $state(false);

	function storedMode(): Mode | null {
		try {
			const value = localStorage.getItem(MODE_KEY);
			return value === 'online' || value === 'offline' ? value : null;
		} catch {
			return null;
		}
	}

	function storedOnlineAvail(): boolean | null {
		try {
			const value = localStorage.getItem(ONLINE_AVAIL_KEY);
			return value === '1' ? true : value === '0' ? false : null;
		} catch {
			return null;
		}
	}

	function storedNumber(key: string): number | null {
		try {
			const value = Number(localStorage.getItem(key));
			return Number.isFinite(value) && value > 0 ? value : null;
		} catch {
			return null;
		}
	}

	function store(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			// Storage unavailable: the cadence just restarts from zero next time.
		}
	}

	function markSent() {
		store(SENT_KEY, String(Date.now()));
	}

	function muteInvites() {
		store(MUTE_KEY, 'off');
		invited = false;
		closeFeedback();
	}

	/**
	 * The proactive invite, VSCode-extension style: after two hours of real
	 * (visible-tab) usage the dialog opens once on its own, then at most weekly,
	 * pausing a month after any actual send. It never interrupts: nothing fires
	 * while another dialog is up, while this one is open, or on the entry pages
	 * (login/join/activate). "Don't ask again" (footer, or Settings → Feedback)
	 * mutes it for good.
	 */
	$effect(() => {
		const timer = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			const usage = (storedNumber(USAGE_KEY) ?? 0) + USAGE_TICK_MS;
			store(USAGE_KEY, String(usage));
			const path = page.url.pathname;
			if (open || pendingDialog() !== null) return;
			if (path.startsWith('/login') || path.startsWith('/join') || path.startsWith('/activate')) return;
			let muted = false;
			try {
				muted = localStorage.getItem(MUTE_KEY) === 'off';
			} catch {
				muted = true; // no storage = no way to remember "don't ask again": stay quiet
			}
			const due = feedbackInviteDue(
				{
					usageMs: usage,
					invitedAt: storedNumber(INVITED_KEY),
					sentAt: storedNumber(SENT_KEY),
					muted
				},
				Date.now()
			);
			if (!due) return;
			store(INVITED_KEY, String(Date.now()));
			invited = true;
			openFeedback();
		}, USAGE_TICK_MS);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (!open) {
			invited = false;
			cancelAdvance();
			return;
		}
		// Fresh dialog each visit; only the remembered channel survives.
		rows = [newRow()];
		resumeStep = 'rate';
		rating = '';
		contactEmail = accountEmail;
		shareEmail = Boolean(accountEmail);
		includeContext = true;
		sending = false;
		sendFailed = false;
		copied = false;
		endpoint = '';
		context = null;
		mode = storedMode();
		// Decide the first step without flashing the form. A remembered channel goes
		// straight to the form; otherwise last visit's cached availability picks the
		// step, and only a browser that has never opened the dialog waits on 'loading'.
		if (mode !== null) {
			step = 'rate';
		} else {
			const avail = storedOnlineAvail();
			step = avail === null ? 'loading' : avail ? 'choose' : 'rate';
		}
		void (async () => {
			try {
				const res = await fetch('/api/feedback');
				if (!res.ok) {
					// No config = offline behavior; leave a 'loading' first-open on the walk.
					if (step === 'loading') step = 'rate';
					return;
				}
				const body = (await res.json()) as { endpoint?: string; context?: FeedbackContext };
				endpoint = body.endpoint ?? '';
				context = body.context ?? null;
				store(ONLINE_AVAIL_KEY, endpoint ? '1' : '0');
				// Reconcile the guessed step with the truth: an undecided user is asked
				// to choose when the online channel exists, else sent to the form.
				if (mode === null) step = endpoint ? 'choose' : 'rate';
			} catch {
				// No config reachable = offline behavior; the dialog still works fully.
				if (step === 'loading') step = 'rate';
			}
		})();
		void tick().then(() => focusRow(rows[0]?.id));
	});

	function chooseMode(next: Mode) {
		mode = next;
		try {
			localStorage.setItem(MODE_KEY, next);
		} catch {
			// Storage unavailable: the dialog will simply ask again next time.
		}
		goTo(resumeStep === 'choose' ? 'rate' : resumeStep);
	}

	/* ---------------------------------------------------------------- the walk */

	// A picked face turns the page on its own, but only after it has been seen
	// as picked: an instant jump reads as a glitch rather than as an answer.
	let advanceTimer: ReturnType<typeof setTimeout> | null = null;
	function cancelAdvance() {
		if (advanceTimer !== null) clearTimeout(advanceTimer);
		advanceTimer = null;
	}

	/** Move to a step and put the caret where that step starts. */
	function goTo(next: Step) {
		cancelAdvance();
		step = next;
		void tick().then(() => {
			if (next === 'notes') focusRow(rows[0]?.id);
			// An address already filled in is right: land on it only when it is
			// empty, so a stray keystroke never edits someone's own email.
			else if (next === 'send' && emailInput && !emailInput.value) emailInput.focus();
			else panel?.focus();
		});
	}

	function pickRating(id: FeedbackRating) {
		cancelAdvance();
		rating = rating === id ? '' : id;
		if (rating === '') return;
		advanceTimer = setTimeout(() => {
			advanceTimer = null;
			if (step === 'rate') goTo('notes');
		}, 220);
	}

	/* ------------------------------------------------------------- the entries */

	/**
	 * Binds one row's input: registers it so a new or neighbouring row can be
	 * focused, and grows it with its content so a long story stays readable
	 * without turning every row into a tall box.
	 */
	function entryInput(node: HTMLTextAreaElement, id: string) {
		entryInputs.set(id, node);
		const fit = () => {
			node.style.height = 'auto';
			node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
		};
		fit();
		node.addEventListener('input', fit);
		return {
			destroy() {
				node.removeEventListener('input', fit);
				entryInputs.delete(id);
			}
		};
	}

	function focusRow(id: string | undefined) {
		const input = id ? entryInputs.get(id) : null;
		(input ?? panel)?.focus();
	}

	function addRow() {
		if (rows.length >= MAX_FEEDBACK_ITEMS) return;
		// The next point is usually of the same kind as the last one.
		const row = newRow(rows[rows.length - 1]?.category ?? 'idea');
		rows = [...rows, row];
		void tick().then(() => focusRow(row.id));
	}

	function removeRow(index: number) {
		// The form always keeps one row to type in; removing the last one clears it.
		if (rows.length === 1) {
			rows = [newRow(rows[0].category)];
			void tick().then(() => focusRow(rows[0].id));
			return;
		}
		rows = rows.filter((_, i) => i !== index);
		void tick().then(() => focusRow(rows[Math.min(index, rows.length - 1)]?.id));
	}

	/** Enter starts the next entry (this is a list); Shift+Enter stays a newline. */
	function onEntryKey(event: KeyboardEvent, index: number) {
		if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
		event.preventDefault();
		const next = rows[index + 1];
		if (next) focusRow(next.id);
		else if (rows[index].message.trim()) addRow();
	}

	const online = $derived(Boolean(endpoint) && mode === 'online');
	const draft = $derived({
		items: rows.map((row) => ({ category: row.category, message: row.message })),
		rating,
		contactEmail
	});
	// What actually leaves: the written rows, one entry each.
	const items = $derived(feedbackItems(draft));
	// The last step says what is about to go, so Send is never a leap of faith.
	const ratingLabel = $derived(FEEDBACK_RATINGS.find((r) => r.id === rating)?.label ?? '');
	const recap = $derived(
		[
			items.length === 0 ? 'No note' : items.length === 1 ? '1 entry' : `${items.length} entries`,
			ratingLabel ? `rated ${ratingLabel.toLowerCase()}` : ''
		]
			.filter(Boolean)
			.join(', ')
	);
	// A rating alone is enough: the one-click path for users who won't write.
	const canSend = $derived(feedbackSendable(draft) && !sending);
	const attachedContext = $derived(includeContext ? context : null);
	const mailto = $derived(feedbackMailto(draft, attachedContext));
	// A chosen rating makes the text optional; the placeholder then nudges for
	// the detail that makes an okay/bad rating actionable, without demanding it.
	const firstPlaceholder = $derived(
		rating === 'bad'
			? 'What went wrong? (optional)'
			: rating === 'okay'
				? 'What would make it better?'
				: rating === 'good'
					? 'Anything to add? (optional)'
					: 'What happened, or what to improve?'
	);

	async function sendOnline() {
		if (!canSend) return;
		sending = true;
		sendFailed = false;
		try {
			const controller = new AbortController();
			// Each entry is filed on its own upstream, so a long list needs longer.
			const timer = setTimeout(() => controller.abort(), Math.min(8000 + 2000 * items.length, 30_000));
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items,
					// The list is the payload; these two are the shape a relay that
					// predates it understands. Such a relay would otherwise keep the
					// rating, find no `message`, and file "Rated good" while the notes
					// vanish without a word, so it gets the whole list as one report
					// instead. A relay that speaks `items` never reads them.
					message: feedbackReport({ ...draft, items }, null),
					category: items.length === 1 ? items[0].category : 'other',
					rating,
					contactEmail: shareEmail ? contactEmail.trim() : '',
					edition: attachedContext?.edition ?? '',
					versions: attachedContext?.versions ?? '',
					license: attachedContext?.license ?? '',
					install: attachedContext?.install ?? '',
					website: ''
				}),
				signal: controller.signal
			});
			clearTimeout(timer);
			if (!res.ok) throw new Error(String(res.status));
			markSent();
			step = 'sent';
		} catch {
			// Relay unreachable (air gap, outage): the offline exits take over below.
			sendFailed = true;
		} finally {
			sending = false;
		}
	}

	// Selected-state tones per rating: the color says what the face says.
	const RATING_SELECTED: Record<FeedbackRating, string> = {
		good: 'border-success-300 bg-success-50 text-success-700',
		okay: 'border-warning-300 bg-warning-50 text-warning-700',
		bad: 'border-danger-300 bg-danger-50 text-danger-600'
	};

	async function copyReport() {
		try {
			await navigator.clipboard.writeText(feedbackReport(draft, attachedContext));
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard blocked (insecure origin): mailto remains the way out.
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={panel}
		role="dialog"
		aria-modal="true"
		aria-label="Share feedback"
		tabindex="-1"
		class="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeFeedback();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeFeedback();
		}}
	>
		<div class="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-pop outline-none">
			<!-- One quiet way out, so no step needs a Cancel button of its own. -->
			<button
				type="button"
				onclick={closeFeedback}
				aria-label="Close"
				class="absolute right-3 top-3 grid size-6 place-items-center rounded-field text-ink-400 transition hover:bg-surface-sunken hover:text-ink-700"
			>
				<Icon name="x" size={14} />
			</button>

			{#if walkIndex >= 0}
				<!-- Three segments, no numbers: the point is how much is left, and
				     the steps are short enough that counting them adds nothing. -->
				<div class="mb-3 flex gap-1 pr-7" aria-hidden="true">
					{#each WALK as s, i (s)}
						<span
							class="h-1 flex-1 rounded-pill transition-colors {i <= walkIndex ? 'bg-brand-500' : 'bg-line'}"
						></span>
					{/each}
				</div>
				<p class="sr-only">Step {walkIndex + 1} of {WALK.length}</p>
			{/if}

			{#if step === 'loading'}
				<!-- First-ever open only: a quiet skeleton while we learn which channels
				     exist, so the real step appears in place instead of replacing a form. -->
				<div class="animate-pulse space-y-3" aria-hidden="true">
					<div class="h-4 w-1/3 rounded bg-surface-sunken"></div>
					<div class="h-3 w-2/3 rounded bg-surface-sunken"></div>
					<div class="h-20 w-full rounded bg-surface-sunken"></div>
				</div>
				<p class="sr-only">Loading feedback options…</p>
			{:else if step === 'choose'}
				<p class="pr-6 text-sm font-semibold text-ink-900">How should your feedback reach us?</p>
				<p class="mt-1 text-xs leading-snug text-ink-500">
					Asked once; your choice is remembered in this browser and can be changed any time in
					Settings. Nothing is ever sent until you press Send.
				</p>
				<div class="mt-3 space-y-2">
					<button
						type="button"
						onclick={() => chooseMode('online')}
						class="flex w-full items-start gap-3 rounded-field border border-line p-3 text-left transition hover:border-brand-400 hover:bg-brand-500/5"
					>
						<span class="mt-0.5 text-brand-500"><Icon name="send" size={16} /></span>
						<span class="min-w-0">
							<span class="block text-sm font-semibold text-ink-900">Send online</span>
							<span class="mt-0.5 block text-xs leading-snug text-ink-500">
								Delivered straight to the Lyriks team. Only this browser talks to the internet,
								and only when you press Send.
							</span>
						</span>
					</button>
					<button
						type="button"
						onclick={() => chooseMode('offline')}
						class="flex w-full items-start gap-3 rounded-field border border-line p-3 text-left transition hover:border-brand-400 hover:bg-brand-500/5"
					>
						<span class="mt-0.5 text-brand-500"><Icon name="mail" size={16} /></span>
						<span class="min-w-0">
							<span class="block text-sm font-semibold text-ink-900">Use my email app</span>
							<span class="mt-0.5 block text-xs leading-snug text-ink-500">
								Opens a pre-filled message to {FEEDBACK_EMAIL}. Lyriks itself never goes online.
							</span>
						</span>
					</button>
				</div>
			{:else if step === 'sent'}
				<div class="flex items-start gap-3">
					<span class="mt-0.5 text-success-600"><Icon name="check" size={18} /></span>
					<div>
						<p class="text-sm font-semibold text-ink-900">Thank you!</p>
						<p class="mt-1 text-xs leading-snug text-ink-500">
							{items.length > 1 ? `Your ${items.length} entries` : 'Your message'} just landed on the
							team's desk. It is read by the people who build Lyriks, not by a bot.
						</p>
					</div>
				</div>
				<div class="mt-4 flex justify-end">
					<button
						type="button"
						onclick={closeFeedback}
						class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
					>
						Close
					</button>
				</div>
			{:else if step === 'rate'}
				<!-- Step one is one click, and one click is already a complete piece
				     of feedback: whoever stops here has still told us something. -->
				<p class="pr-6 text-sm font-semibold text-ink-900">How is your journey with Lyriks going?</p>
				<p class="mt-0.5 pr-6 text-xs leading-snug text-ink-500">
					{#if invited}
						You have been using Lyriks for a while. One tap answers it; the next step is where you
						say more, if you feel like it.
					{:else}
						One tap answers it. You can write the details on the next step.
					{/if}
				</p>
				<div
					class="mt-3 grid grid-cols-3 gap-1.5"
					role="group"
					aria-label="How is your journey with Lyriks going?"
				>
					{#each FEEDBACK_RATINGS as r (r.id)}
						<button
							type="button"
							aria-pressed={rating === r.id}
							onclick={() => pickRating(r.id)}
							class="flex flex-col items-center gap-1 rounded-field border py-2.5 text-xs font-medium transition {rating === r.id
								? RATING_SELECTED[r.id]
								: 'border-line text-ink-500 hover:border-line-strong hover:text-ink-700'}"
						>
							<Icon name={r.icon} size={20} />
							{r.label}
						</button>
					{/each}
				</div>
				<div class="mt-3.5 flex items-center gap-2">
					{#if invited}
						<button
							type="button"
							onclick={muteInvites}
							class="rounded-field px-2 py-1.5 text-xs font-medium text-ink-400 transition hover:text-ink-700 hover:underline"
						>
							Don't ask again
						</button>
					{/if}
					<span class="flex-1"></span>
					<button
						type="button"
						onclick={() => goTo('notes')}
						class="inline-flex items-center gap-1 rounded-field px-3 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
					>
						{rating ? 'Next' : 'Skip'}
						<Icon name="chevron-right" size={15} />
					</button>
				</div>
			{:else if step === 'notes'}
				<!-- One row per point to make: each is filed on its own, so a bug and
				     two ideas never arrive as a single blob to untangle. -->
				<!-- No sentence explaining the list: the typed rows and the empty slot
				     under them say it, and a paragraph about not writing paragraphs
				     would be the one thing the panel does not need. -->
				<div class="flex items-baseline justify-between gap-2 pr-6">
					<p class="text-sm font-semibold text-ink-900">What would you like to tell us?</p>
					{#if items.length > 1}
						<span class="shrink-0 text-[11px] text-ink-400">{items.length} entries</span>
					{/if}
				</div>
				<ul class="mt-3 space-y-1.5">
					{#each rows as row, index (row.id)}
						<li class="flex items-start gap-1.5">
							<select
								bind:value={row.category}
								aria-label="Type of entry {index + 1}"
								class="h-8 shrink-0 rounded-field border border-line/60 bg-transparent px-1.5 text-xs font-medium text-ink-600 outline-none transition hover:border-line focus:border-brand-400"
							>
								{#each FEEDBACK_CATEGORIES as c (c.id)}
									<option value={c.id}>{c.label}</option>
								{/each}
							</select>
							<textarea
								use:entryInput={row.id}
								bind:value={row.message}
								rows="1"
								maxlength={MAX_FEEDBACK_MESSAGE}
								placeholder={index === 0 ? firstPlaceholder : 'One more thing…'}
								aria-label="Entry {index + 1}"
								onkeydown={(e) => onEntryKey(e, index)}
								class="min-h-8 flex-1 resize-none overflow-hidden rounded-field border border-line bg-surface px-2.5 py-1.5 text-sm leading-snug text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
							></textarea>
							<!-- Nothing to remove while the form is one empty row. -->
							{#if rows.length > 1 || row.message}
								<button
									type="button"
									onclick={() => removeRow(index)}
									aria-label="Remove entry {index + 1}"
									class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-field text-ink-400 transition hover:bg-surface-sunken hover:text-ink-700"
								>
									<Icon name="x" size={13} />
								</button>
							{:else}
								<span class="size-7 shrink-0"></span>
							{/if}
						</li>
					{/each}
				</ul>
				<!-- The next line, drawn as the empty slot it is: a full-width dashed
				     row under the list has visible bounds and a target you cannot
				     miss, where the bare text link read as a footnote. -->
				{#if rows.length < MAX_FEEDBACK_ITEMS}
					<button
						type="button"
						onclick={addRow}
						class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-line-strong py-2 text-xs font-semibold text-ink-500 outline-none transition hover:border-brand-400 hover:bg-brand-500/5 hover:text-brand-600 focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400"
					>
						<Icon name="plus" size={14} />
						Add another
					</button>
				{:else}
					<p class="mt-2 text-center text-[11px] text-ink-400">
						That is the most one message can carry.
					</p>
				{/if}
				<div class="mt-3.5 flex items-center gap-2">
					<button
						type="button"
						onclick={() => goTo('rate')}
						class="inline-flex items-center gap-1 rounded-field px-2 py-2 text-xs font-medium text-ink-500 transition hover:bg-surface-sunken hover:text-ink-700"
					>
						<Icon name="chevron-left" size={15} />
						Back
					</button>
					<span class="flex-1"></span>
					<button
						type="button"
						onclick={() => goTo('send')}
						class="inline-flex items-center gap-1 rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
					>
						Next
						<Icon name="chevron-right" size={15} />
					</button>
				</div>
			{:else}
				<p class="pr-6 text-sm font-semibold text-ink-900">Ready to send</p>
				<p class="mt-0.5 pr-6 text-xs leading-snug text-ink-500">
					{recap}. It goes to the people who build Lyriks, not to a bot.
				</p>
				{#if online}
					{#if accountEmail}
						<!-- Opt-out, not opt-in: the address is there, on one line, and
						     unchecking it is what makes the report anonymous. -->
						<label class="mt-3 flex items-center gap-2 text-xs text-ink-600">
							<input type="checkbox" bind:checked={shareEmail} />
							{#if shareEmail}
								<span class="shrink-0">Reply to</span>
								<input
									bind:this={emailInput}
									bind:value={contactEmail}
									type="email"
									aria-label="Reply-to email"
									class="min-w-0 flex-1 border-b border-transparent bg-transparent py-0.5 text-xs text-ink-900 outline-none transition hover:border-line focus:border-brand-400"
								/>
							{:else}
								<span class="text-ink-400">Sending anonymously, no reply possible</span>
							{/if}
						</label>
					{:else}
						<input
							bind:this={emailInput}
							bind:value={contactEmail}
							type="email"
							placeholder="Your email, if you'd like an answer (optional)"
							aria-label="Contact email (optional)"
							class="mt-3 h-8 w-full rounded-field border border-line bg-surface px-2.5 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
						/>
					{/if}
				{/if}
				{#if context}
					<label
						class="mt-2 flex items-start gap-2 text-xs leading-snug text-ink-600"
						title="Attached: the {context.edition} edition, the full component versions report with its build details, and the licence summary. The licence key itself is never sent."
					>
						<input type="checkbox" bind:checked={includeContext} class="mt-0.5" />
						<span>Attach install info: {context.edition} edition, versions, licence summary (never the key).</span>
					</label>
				{/if}
				{#if sendFailed}
					<p class="mt-2 text-xs font-medium text-danger-500">
						The feedback service could not be reached. Your notes are not lost: send them through
						your email app, or copy them.
					</p>
				{/if}
				<div class="mt-3.5 flex items-center gap-2">
					<button
						type="button"
						onclick={() => goTo('notes')}
						class="inline-flex items-center gap-1 rounded-field px-2 py-2 text-xs font-medium text-ink-500 transition hover:bg-surface-sunken hover:text-ink-700"
					>
						<Icon name="chevron-left" size={15} />
						Back
					</button>
					<button
						type="button"
						onclick={copyReport}
						disabled={!feedbackSendable(draft)}
						title="Copy the whole report to the clipboard"
						class="inline-flex items-center gap-1.5 rounded-field px-2 py-1.5 text-xs font-semibold text-ink-500 transition hover:bg-surface-sunken hover:text-ink-700 disabled:opacity-40 disabled:hover:bg-transparent"
					>
						<Icon name="copy" size={13} />
						{copied ? 'Copied' : 'Copy'}
					</button>
					<span class="flex-1"></span>
					{#if online && !sendFailed}
						<button
							type="button"
							onclick={sendOnline}
							disabled={!canSend}
							class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
						>
							{sending ? 'Sending…' : items.length > 1 ? `Send ${items.length} entries` : 'Send'}
						</button>
					{:else}
						<a
							href={mailto}
							onclick={markSent}
							class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 {feedbackSendable(draft)
								? ''
								: 'pointer-events-none opacity-60'}"
						>
							Open email app
						</a>
					{/if}
				</div>
				{#if endpoint}
					<p class="mt-3 border-t border-line pt-2 text-[11px] text-ink-400">
						Channel: {mode === 'online' ? 'online, direct to the team' : `email app (${FEEDBACK_EMAIL})`}
						<button
							type="button"
							class="ml-1 font-medium text-brand-600 hover:underline"
							onclick={() => {
								resumeStep = 'send';
								goTo('choose');
							}}
						>
							Change
						</button>
					</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}
