/** `success` says an act went through, `info` says something worth knowing. */
export type ToastLevel = 'success' | 'info' | 'warn' | 'error';

export interface ToastNotifierPort {
	notify(level: ToastLevel, message: string): void;
}
