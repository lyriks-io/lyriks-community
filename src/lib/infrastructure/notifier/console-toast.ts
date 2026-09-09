import type { ToastLevel, ToastNotifierPort } from '$application/ports';

export class ConsoleToastNotifier implements ToastNotifierPort {
	notify(level: ToastLevel, message: string): void {
		const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
		fn(`[toast:${level}] ${message}`);
	}
}
