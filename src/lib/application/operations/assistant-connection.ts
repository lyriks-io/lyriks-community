import { modelOf, type StoredAssistant } from '$domain/settings';
import type { LanguageModelConnection, SecretCipherPort } from '../ports';

export type AssistantConnectionReading = { readonly ok: true; readonly connection: LanguageModelConnection } | { readonly ok: false; readonly reason: string };

/**
 * The connection a call goes out with, opened from what is stored: nothing at
 * all while no key is stored, and a sentence saying what to do when the
 * server's secret changed since the key was sealed.
 */
export function assistantConnection(stored: StoredAssistant, cipher: SecretCipherPort): AssistantConnectionReading {
	if (stored.sealedKey === null) return { ok: false, reason: 'No API key is stored: an administrator connects the assistant in Settings.' };
	const apiKey = cipher.open(stored.sealedKey);
	if (apiKey === null) return { ok: false, reason: "The stored API key can no longer be read, since the server's secret changed: an administrator pastes it again in Settings." };
	return { ok: true, connection: { provider: stored.provider, model: modelOf(stored), apiKey } };
}
