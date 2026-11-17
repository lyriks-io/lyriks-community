import { describe, expect, it } from 'vitest';
import { replaceOccurrence, segmentText } from './highlight';
import type { GlossaryTerm } from './draft';

describe('replaceOccurrence', () => {
	it('treats dollar replacement sequences in canonical terms literally', () => {
		expect(replaceOccurrence('Use customer here', 'customer', '$& account')).toBe(
			'Use $& account here'
		);
		expect(replaceOccurrence('Use customer here', 'customer', '$1')).toBe('Use $1 here');
	});
});

describe('a term is recognised whatever separates its words and in its plural or third-person forms [criterion:ac-leaf-ac-glos-match-forms]', () => {
	// Kutt's glossary, as the retro-spec wrote it.
	const term = (id: string, name: string, allowed: string[] = [], avoid: string[] = []): GlossaryTerm =>
		({ id, term: name, definition: `${name}.`, synonymsAllowed: allowed, synonymsAvoid: avoid }) as unknown as GlossaryTerm;
	const kutt = [
		term('t-expire', 'Expire in', ['expiration time']),
		term('t-short', 'Short link', ['shortened link', 'shortened URL']),
		term('t-protected', 'Protected link', ['password-protected link']),
		term('t-domain', 'Custom domain', ['domain']),
		term('t-view', 'View', ['visit', 'tracked visit'], ['click', 'hit']),
		term('t-stats', 'Stats', ['statistics'], ['analytics'])
	];
	const marked = (text: string) =>
		segmentText(text, kutt)
			.filter((s) => s.mark)
			.map((s) => `${s.text}=${s.mark!.kind}:${s.mark!.canonical}`);

	it('reads a term of several words typed exactly, inflected, across a line break, a non-breaking space or a hyphen', () => {
		expect(marked('Set an Expire in of 2 hours.')).toEqual(['Expire in=canonical:Expire in']);
		expect(marked('The link expires in 2 hours.')).toEqual(['expires in=canonical:Expire in']);
		expect(marked('An expire\nin value')).toEqual(['expire\nin=canonical:Expire in']);
		expect(marked('An expire in value')).toEqual(['expire in=canonical:Expire in']);
		expect(marked('The Expire-in field')).toEqual(['Expire-in=canonical:Expire in']);
	});

	it('reads a plural as its term, the longest match first, and a word to avoid as such', () => {
		expect(marked('Short links on a custom domain')).toEqual(['Short links=canonical:Short link', 'custom domain=canonical:Custom domain']);
		expect(marked('the password-protected link and the protected links')).toEqual([
			'password-protected link=allowed:Protected link',
			'protected links=canonical:Protected link'
		]);
		expect(marked('Every click is a view; analytics show clicks.')).toEqual([
			'click=banned:View',
			'view=canonical:View',
			'analytics=banned:Stats',
			'clicks=banned:View'
		]);
	});

	it('stays whole-word: a term inside a longer word is not marked', () => {
		expect(marked('A clicker, an interview, a domainless page.')).toEqual([]);
		expect(marked('Set DEFAULT_DOMAIN_ALIASES, then click2 or view_count.')).toEqual([]);
	});

	it('fixes exactly what the mark covers, wherever its words are split', () => {
		expect(replaceOccurrence('Every clicks counts; one clicks more.', 'clicks', 'views')).toBe('Every views counts; one views more.');
		expect(replaceOccurrence('an expire\nin and an expire in', 'expire in', 'Expire in')).toBe('an Expire in and an Expire in');
		expect(replaceOccurrence('A clicker clicks', 'click', 'view')).toBe('A clicker clicks');
	});
});
