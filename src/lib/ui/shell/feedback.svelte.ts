/**
 * App-wide feedback dialog state: any surface (user menu, settings) opens it,
 * and `FeedbackHost` (mounted once in the root layout) renders it. Same
 * host-singleton pattern as the confirm dialog and the toasts.
 */
let open = $state(false);

/** Whether the host should render the dialog right now. */
export function feedbackOpen(): boolean {
	return open;
}

export function openFeedback(): void {
	open = true;
}

export function closeFeedback(): void {
	open = false;
}
