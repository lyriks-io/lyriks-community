import { describe, expect, it } from 'vitest';
import { parseIdentityDraft } from './parse-foundation-identity';

describe('the identity read back from storage [criterion:ac-leaf-ac-brief-identity-sources]', () => {
	it('keeps the sources its summary was written from, and nothing that is not a source id', () => {
		expect(parseIdentityDraft({ brief: 'Kutt shortens links.', sourceIds: ['src-readme', '', 42, 'src-package'] }, 'kutt').sourceIds).toEqual(['src-readme', 'src-package']);
		expect(parseIdentityDraft({ brief: 'Kutt shortens links.' }, 'kutt').sourceIds).toEqual([]);
	});
});
