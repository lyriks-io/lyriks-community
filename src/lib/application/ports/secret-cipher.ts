/**
 * Seals a secret the server keeps for itself, such as the built-in
 * assistant's API key (ac-adm-ai-key): what is stored is unreadable without the
 * server's own key, and opening fails, rather than guessing, when that key
 * changed since.
 */
export interface SecretCipherPort {
	seal(plain: string): string;
	/** Null when the sealed value cannot be opened with the key the server holds now. */
	open(sealed: string): string | null;
}
