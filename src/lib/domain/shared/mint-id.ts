/**
 * A UUID v4 for what the product adds, minted wherever the code runs. In the
 * browser `crypto.randomUUID` only exists on a secure origin: an install served
 * over plain http has `crypto.getRandomValues` alone, so a bare
 * `crypto.randomUUID()` there throws and the gesture is lost without a word.
 * Every id outside server-only code is minted here (src/lib/ui/lint/
 * secure-origin.lint.test.ts keeps it so).
 */
export function mintUuid(): string {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
