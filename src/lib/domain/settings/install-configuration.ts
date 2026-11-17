import { LANGUAGE_NAMES } from '$domain/language';
import type { FeedbackSettings } from './feedback-settings';

/**
 * What an administrator decided for this installation, right after the password
 * and at any time after that in Settings: the language specifications are written
 * in, and what may leave the installation.
 *
 * The appliance is sold and audited on zero runtime egress, so nothing is allowed
 * until somebody with the authority has answered: `validatedAt` stays null until
 * then, and every allowance reads false whatever the stored switches say.
 */
export interface InstallConfiguration {
	readonly updateCheck: boolean;
	readonly onlineHelp: boolean;
	/** The language new projects start in; empty until validated. */
	readonly specLanguage: string;
	readonly validatedAt: string | null;
	readonly validatedBy: string | null;
}

/** What the form asks. The online feedback channel keeps its own stored switch. */
export interface InstallChoices {
	readonly updateCheck: boolean;
	readonly feedbackOnline: boolean;
	readonly onlineHelp: boolean;
	readonly specLanguage: string;
}

/** What may actually leave right now. */
export interface OutboundAllowance {
	readonly updateCheck: boolean;
	readonly feedbackOnline: boolean;
	readonly onlineHelp: boolean;
}

export const DEFAULT_SPEC_LANGUAGE = 'en';

export function defaultInstallConfiguration(): InstallConfiguration {
	return { updateCheck: false, onlineHelp: false, specLanguage: '', validatedAt: null, validatedBy: null };
}

const isLanguage = (value: unknown): value is string =>
	typeof value === 'string' && Object.hasOwn(LANGUAGE_NAMES, value);

const textOrNull = (value: unknown): string | null =>
	typeof value === 'string' && value ? value : null;

/** Coerce a stored document: anything malformed degrades to "nobody decided". */
export function normalizeInstallConfiguration(input: unknown): InstallConfiguration {
	if (!input || typeof input !== 'object') return defaultInstallConfiguration();
	const o = input as Record<string, unknown>;
	return {
		updateCheck: o.updateCheck === true,
		onlineHelp: o.onlineHelp === true,
		specLanguage: isLanguage(o.specLanguage) ? o.specLanguage : '',
		validatedAt: textOrNull(o.validatedAt),
		validatedBy: textOrNull(o.validatedBy)
	};
}

/** Read what a browser posted; null when any answer is missing or out of the list. */
export function parseInstallChoices(input: unknown): InstallChoices | null {
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	if (
		typeof o.updateCheck !== 'boolean' ||
		typeof o.feedbackOnline !== 'boolean' ||
		typeof o.onlineHelp !== 'boolean' ||
		!isLanguage(o.specLanguage)
	) {
		return null;
	}
	return {
		updateCheck: o.updateCheck,
		feedbackOnline: o.feedbackOnline,
		onlineHelp: o.onlineHelp,
		specLanguage: o.specLanguage
	};
}

export function outboundAllowance(
	configuration: InstallConfiguration,
	feedback: FeedbackSettings
): OutboundAllowance {
	const validated = configuration.validatedAt !== null;
	return {
		updateCheck: validated && configuration.updateCheck,
		feedbackOnline: validated && feedback.onlineEnabled,
		onlineHelp: validated && configuration.onlineHelp
	};
}
