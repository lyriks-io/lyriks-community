/** Small text helpers of the review reading. Pure. */

export const clean = (s: string | null | undefined) => (s ?? '').trim();
export const label = <T extends { code: string; label: string }>(list: readonly T[], code: string) => list.find((o) => o.code === code)?.label ?? code;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The first sentence of a long text, so a row reads as a line. */
export function firstSentence(text: string, max = 180): string {
	const t = clean(text);
	const cut = t.search(/[.!?](\s|$)/);
	const sentence = cut > 0 ? t.slice(0, cut + 1) : t;
	return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}
