/**
 * Promise-based confirm/prompt dialogs, replacing native `confirm()`/`prompt()`
 * with on-brand modals. `ConfirmHost` (mounted once in the root layout) renders
 * whatever request is pending here.
 */
export interface DialogRequest {
	kind: 'confirm' | 'prompt';
	title: string;
	message?: string;
	confirmLabel: string;
	cancelLabel: string;
	/** Destructive action — confirm button renders in danger style. */
	danger: boolean;
	/** Prompt only: seed value + placeholder for the text input. */
	initial: string;
	placeholder: string;
	/** Confirm only: exact text the user must retype to arm the confirm button
	    (e.g. a project name before a destructive delete). '' = no typed gate. */
	requireText: string;
}

interface PendingDialog {
	request: DialogRequest;
	/** confirm → boolean; prompt → string (value) or null (cancelled). */
	resolve: (result: boolean | string | null) => void;
}

let pending = $state<PendingDialog | null>(null);

/** The request the host should render right now (null = no dialog open). */
export function pendingDialog(): PendingDialog | null {
	return pending;
}

export function settleDialog(result: boolean | string | null): void {
	pending?.resolve(result);
	pending = null;
}

/** Ask the user to confirm an action. Resolves false when dismissed. */
export function confirmDialog(opts: {
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
	requireText?: string;
}): Promise<boolean> {
	settleDialog(null); // a newer request replaces a stale one
	return new Promise((resolve) => {
		pending = {
			request: {
				kind: 'confirm',
				title: opts.title,
				message: opts.message,
				confirmLabel: opts.confirmLabel ?? 'Confirm',
				cancelLabel: opts.cancelLabel ?? 'Cancel',
				danger: opts.danger ?? false,
				initial: '',
				placeholder: opts.requireText ?? '',
				requireText: opts.requireText ?? ''
			},
			resolve: (r) => resolve(r === true)
		};
	});
}

/** Ask the user for a short text value. Resolves null when dismissed. */
export function promptDialog(opts: {
	title: string;
	message?: string;
	confirmLabel?: string;
	initial?: string;
	placeholder?: string;
}): Promise<string | null> {
	settleDialog(null);
	return new Promise((resolve) => {
		pending = {
			request: {
				kind: 'prompt',
				title: opts.title,
				message: opts.message,
				confirmLabel: opts.confirmLabel ?? 'Save',
				cancelLabel: 'Cancel',
				danger: false,
				initial: opts.initial ?? '',
				placeholder: opts.placeholder ?? '',
				requireText: ''
			},
			resolve: (r) => resolve(typeof r === 'string' ? r : null)
		};
	});
}
