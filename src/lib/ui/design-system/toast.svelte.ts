/**
 * Transient toast stack, the visible counterpart to `ConsoleToastNotifier`.
 * `ToastHost` (mounted once in the root layout) renders whatever is pushed
 * here. The optional `action` is a UI-only affordance — it never crosses the
 * `ToastNotifierPort`, which stays `notify(level, message)`.
 */
import type { ToastLevel } from '$application/ports';
import { toastHeadline } from './toast-headline';

export interface ToastAction {
	label: string;
	run: () => void;
}

export interface Toast {
	id: number;
	level: ToastLevel;
	message: string;
	action?: ToastAction;
	/** How many times it came while shown (criterion cb973a27); absent for once. */
	count?: number;
}

/** How long toasts linger before leaving on their own; one that offers an act stays longer. */
const AUTO_DISMISS_MS = 3800;
const WITH_ACTION_MS = 6000;
/** Provisional constant failureLingers: a failure stays longer, then leaves too (criterion 8613eec9). */
const FAILURE_MS = 10_000;

let stack = $state<Toast[]>([]);
let nextId = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
// The toasts the pointer or the keyboard is in: they wait (criterion 8613eec9).
const held = new Set<number>();

/** The toasts the host should render right now (oldest first). */
export function toasts(): Toast[] {
	return stack;
}

/**
 * Show a toast. Returns its id. Success/info/warn auto-dismiss after ~4s (6s
 * when it offers an act); error toasts persist until dismissed so failures
 * aren't missed.
 */
export function pushToast(t: Omit<Toast, 'id' | 'count'>): number {
	const message = toastHeadline(t.message);
	// The same message shown already takes the new one: counted, its time started again (criterion cb973a27).
	const same = stack.find((x) => x.level === t.level && x.message === message && x.action?.label === t.action?.label);
	if (same) {
		stack = stack.map((x) => (x.id === same.id ? { ...x, count: (x.count ?? 1) + 1, ...(t.action ? { action: t.action } : {}) } : x));
		startTimer(same.id);
		return same.id;
	}
	const id = nextId++;
	stack = [...stack, { ...t, message, id }];
	startTimer(id);
	return id;
}

/** How long a toast lingers, counted afresh each time it is left. */
export function lingerOf(t: Pick<Toast, 'level' | 'action'>): number {
	if (t.level === 'error') return FAILURE_MS;
	return t.action ? WITH_ACTION_MS : AUTO_DISMISS_MS;
}

/** Every toast leaves at once (Dismiss all). */
export function dismissAllToasts(): void {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
	held.clear();
	stack = [];
}

function startTimer(id: number): void {
	const t = stack.find((x) => x.id === id);
	if (!t || held.has(id)) return;
	const linger = lingerOf(t);
	clearTimeout(timers.get(id));
	timers.set(
		id,
		setTimeout(() => dismissToast(id), linger)
	);
}

/**
 * The pointer or the keyboard is in a toast: it stays while it is read
 * (criterion 8613eec9). Its time starts again in full once both have left.
 */
export function holdToast(id: number): void {
	held.add(id);
	clearTimeout(timers.get(id));
	timers.delete(id);
}

export function releaseToast(id: number): void {
	if (!held.delete(id)) return;
	startTimer(id);
}

export function dismissToast(id: number): void {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	held.delete(id);
	stack = stack.filter((t) => t.id !== id);
}
