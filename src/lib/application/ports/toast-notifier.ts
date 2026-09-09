export type ToastLevel = 'info' | 'warn' | 'error';

export interface ToastNotifierPort {
	notify(level: ToastLevel, message: string): void;
}
