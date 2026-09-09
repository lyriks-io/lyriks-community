/**
 * Transient toast stack, the visible counterpart to `ConsoleToastNotifier`.
 * `ToastHost` (mounted once in the root layout) renders whatever is pushed
 * here. The optional `action` is a UI-only affordance — it never crosses the
 * `ToastNotifierPort`, which stays `notify(level, message)`.
 */
import type { ToastLevel } from '$application/ports';

export interface ToastAction {
	label: string;
	run: () => void;
}

export interface Toast {
	id: number;
	level: ToastLevel;
	message: string;
	action?: ToastAction;
}

/** How long non-error toasts linger before auto-dismissing. */
const AUTO_DISMISS_MS = 5000;

let stack = $state<Toast[]>([]);
let nextId = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** The toasts the host should render right now (oldest first). */
export function toasts(): Toast[] {
	return stack;
}

/**
 * Show a toast. Returns its id. Info/warn auto-dismiss after ~5s; error
 * toasts persist until dismissed so failures aren't missed.
 */
export function pushToast(t: Omit<Toast, 'id'>): number {
	const id = nextId++;
	stack = [...stack, { ...t, id }];
	if (t.level !== 'error') {
		timers.set(
			id,
			setTimeout(() => dismissToast(id), AUTO_DISMISS_MS)
		);
	}
	return id;
}

export function dismissToast(id: number): void {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	stack = stack.filter((t) => t.id !== id);
}
