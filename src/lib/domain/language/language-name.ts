import { LANGUAGES } from '../foundation/identity-enums';

/**
 * A language named the way its own speakers name it, from a locale tag:
 * "en" and "en-GB" read "English", "fr-FR" reads "Français". The runtime's
 * language names (bundled, no network) say it; the platform's language list
 * answers where the runtime cannot, the tag itself last.
 */
export function languageOwnName(tag: string): string {
	const primary = tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? '';
	if (!primary) return tag.trim();
	try {
		const name = new Intl.DisplayNames([primary], { type: 'language' }).of(primary);
		if (name && name.toLowerCase() !== primary) return name.charAt(0).toLocaleUpperCase(primary) + name.slice(1);
	} catch {
		// An unknown or malformed tag: the platform's list, then the tag.
	}
	return LANGUAGES.find((l) => l.code === primary)?.label ?? tag.trim();
}
