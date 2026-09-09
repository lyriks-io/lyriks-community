import type { ToastLevel, ToastNotifierPort } from '$application/ports';
import { pushToast } from '$ui/design-system';

/**
 * Client-side composition root — the ONLY module that constructs UI-layer adapters.
 *
 * The server composition root (`container.server.ts`) wires server adapters, but it
 * cannot construct client adapters (they touch the browser design-system). This is
 * the client counterpart: it owns the concrete `ToastNotifierPort` adapter so no
 * component `new`s one itself. Keeping the adapter here (UI layer) also fixes the
 * old dependency-arrow violation — the previous `infrastructure/notifier` adapter
 * imported `$ui/design-system`, i.e. infrastructure → UI. A toast renderer IS a UI
 * concern, so it belongs on this side of the boundary.
 */
class ToastStoreNotifier implements ToastNotifierPort {
	notify(level: ToastLevel, message: string): void {
		pushToast({ level, message });
	}
}

/** The shared client toast notifier. Import this instead of constructing an adapter. */
export const toastNotifier: ToastNotifierPort = new ToastStoreNotifier();
