import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher.server';

/** The assistant's key is stored sealed, never in clear (ac-adm-ai-key). */
describe('the secret cipher [criterion:ac-leaf-ac-adm-ai-key]', () => {
	it('opens what it sealed, never stores the secret in clear, and seals the same secret differently each time', () => {
		const cipher = new AesGcmSecretCipher({ secret: 'session-secret' });
		const sealed = cipher.seal('sk-ant-api03-secret');
		expect(sealed).not.toContain('sk-ant');
		expect(cipher.seal('sk-ant-api03-secret')).not.toBe(sealed);
		expect(cipher.open(sealed)).toBe('sk-ant-api03-secret');
	});

	it('reads nothing once the server secret changed, and nothing tampered', () => {
		const sealed = new AesGcmSecretCipher({ secret: 'before' }).seal('sk-ant-api03-secret');
		expect(new AesGcmSecretCipher({ secret: 'after' }).open(sealed)).toBeNull();
		const [v, iv, tag, body] = sealed.split(':');
		// Always a different first character: a body that happens to start with 'A' would otherwise come back untouched.
		const tampered = `${body[0] === 'A' ? 'B' : 'A'}${body.slice(1)}`;
		expect(new AesGcmSecretCipher({ secret: 'before' }).open([v, iv, tag, tampered].join(':'))).toBeNull();
		expect(new AesGcmSecretCipher({ secret: 'before' }).open('not sealed')).toBeNull();
	});

	it('writes its own key file, readable by the server alone, only when a secret is first sealed', () => {
		const keyFile = join(mkdtempSync(join(tmpdir(), 'lyriks-cipher-')), 'secrets.key');
		const cipher = new AesGcmSecretCipher({ keyFile });
		expect(() => statSync(keyFile)).toThrow();
		const sealed = cipher.seal('sk-proj-secret');
		expect(statSync(keyFile).mode & 0o777).toBe(0o600);
		expect(readFileSync(keyFile, 'utf8')).not.toContain('sk-proj');
		expect(new AesGcmSecretCipher({ keyFile }).open(sealed)).toBe('sk-proj-secret');
	});
});
