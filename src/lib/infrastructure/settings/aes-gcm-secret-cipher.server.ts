import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { SecretCipherPort } from '$application/ports';

const VERSION = 'v1';
const SALT = 'lyriks/settings-secrets';

/**
 * AES-256-GCM adapter for `SecretCipherPort`. The key is derived (HKDF-SHA256)
 * from the first of: `LYRIKS_SECRETS_KEY`, the server's `LYRIKS_JWT_SECRET`, or
 * a random key file written once next to the settings (`data/secrets.key`,
 * mode 600), so an install with neither variable still never stores a key in
 * clear. Rotating the source makes what was sealed before unreadable, which
 * `open` reports as null instead of failing. The key is derived on first use,
 * so an install that never stores a secret never writes the key file.
 */
export class AesGcmSecretCipher implements SecretCipherPort {
	readonly #source: { readonly secret?: string; readonly keyFile?: string };
	#derived: Buffer | null = null;

	constructor(source: { readonly secret?: string; readonly keyFile?: string }) {
		this.#source = source;
	}

	get #key(): Buffer {
		if (this.#derived === null) {
			const secret = this.#source.secret?.trim() || readOrCreateKeyFile(resolve(this.#source.keyFile ?? 'data/secrets.key'));
			this.#derived = Buffer.from(hkdfSync('sha256', secret, SALT, VERSION, 32));
		}
		return this.#derived;
	}

	seal(plain: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
		const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
		return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
	}

	open(sealed: string): string | null {
		const [version, iv, tag, body] = sealed.split(':');
		if (version !== VERSION || !iv || !tag || body === undefined) return null;
		try {
			const decipher = createDecipheriv('aes-256-gcm', this.#key, Buffer.from(iv, 'base64'));
			decipher.setAuthTag(Buffer.from(tag, 'base64'));
			return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
		} catch {
			return null;
		}
	}
}

function readOrCreateKeyFile(path: string): string {
	if (existsSync(path)) return readFileSync(path, 'utf8').trim();
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	const key = randomBytes(32).toString('base64');
	writeFileSync(path, key, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
	chmodSync(path, 0o600);
	return key;
}
