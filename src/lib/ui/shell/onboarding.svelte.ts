/**
 * App-wide state of the "Create your project" dialog: the project menu (and a
 * reader with no project yet) opens it, and `OnboardingDialog`, mounted once
 * with the app bar, renders it. Same host-singleton pattern as the feedback
 * dialog.
 */
let open = $state(false);

export function onboardingOpen(): boolean {
	return open;
}

export function openOnboarding(): void {
	open = true;
}

export function closeOnboarding(): void {
	open = false;
}
