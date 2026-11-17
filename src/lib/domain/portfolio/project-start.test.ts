import { describe, expect, it } from 'vitest';
import { parseProjectStart, rebuildsSpec, sourceModeOf, startPrompt, startWayOfSourceMode, wayOf } from './project-start';

describe('project start', () => {
	it('records each way as the source mode the identity knows', () => {
		expect(sourceModeOf('code')).toBe('code_to_spec');
		expect(sourceModeOf('code_and_docs')).toBe('code_to_spec');
		expect(sourceModeOf('docs')).toBe('from_document');
		expect(sourceModeOf('manual')).toBe('greenfield');
		expect(sourceModeOf('scratch')).toBe('greenfield');
	});

	it('reads an older project’s way off its source mode only when it says enough', () => {
		expect(startWayOfSourceMode('code_to_spec')).toBe('code');
		expect(startWayOfSourceMode('from_document')).toBe('docs');
		expect(startWayOfSourceMode('greenfield')).toBeNull();
		expect(startWayOfSourceMode(null)).toBeNull();
	});

	it('rebuilds the specification only for an existing product it learns from a source', () => {
		expect(['code', 'docs', 'code_and_docs', 'manual', 'scratch'].filter((w) => rebuildsSpec(w as never))).toEqual(['code', 'docs', 'code_and_docs']);
	});

	it('makes a way of what the person picked', () => {
		const none = { code: false, docs: false, manual: false };
		expect(wayOf('scratch', none)).toBe('scratch');
		expect(wayOf('existing', none)).toBeNull();
		expect(wayOf('existing', { ...none, code: true })).toBe('code');
		expect(wayOf('existing', { ...none, docs: true })).toBe('docs');
		expect(wayOf('existing', { ...none, code: true, docs: true })).toBe('code_and_docs');
		expect(wayOf('existing', { code: true, docs: true, manual: true })).toBe('manual');
	});

	it('parses what it stored and nothing else', () => {
		expect(parseProjectStart({ way: 'manual', at: '2026-10-26T00:00:00Z', by: 'p1' })).toEqual({ way: 'manual', at: '2026-10-26T00:00:00Z', by: 'p1' });
		expect(parseProjectStart({ way: 'sideways' })).toBeNull();
		expect(parseProjectStart(null)).toBeNull();
	});
});

describe('startPrompt', () => {
	const base = { name: 'Facturo', projectId: 'facturo-a1b2c3' };

	it('addresses the project by name and id', () => {
		expect(startPrompt({ ...base, way: 'code' })).toContain('the “Facturo” project (id facturo-a1b2c3)');
	});

	it('asks the LLM to email the person through its own connector only when they asked', () => {
		expect(startPrompt({ ...base, way: 'code' })).not.toContain('email');
		expect(startPrompt({ ...base, way: 'docs', emailWhenReady: { url: 'https://lyriks.local/projects/x/retrospec' } })).toContain(
			'send me an email through your mail connector saying it is ready to validate, with this link: https://lyriks.local/projects/x/retrospec'
		);
	});

	it('keeps the code as the reference when both sources are read', () => {
		expect(startPrompt({ ...base, way: 'code_and_docs' })).toContain('keep the code’s version and flag the gap as “to check”');
	});

	it('words a new product after where it starts and how fast it goes', () => {
		const fromDoc = startPrompt({ ...base, way: 'scratch', scratch: { source: 'document', pace: 'all' } });
		expect(fromDoc).toContain('Read the document I give you');
		expect(fromDoc).toContain('suggest a complete first specification in one go');
		const fromIdea = startPrompt({ ...base, way: 'scratch', scratch: { source: 'idea', pace: 'block' } });
		expect(fromIdea).toContain('ask me what problem it solves');
		expect(fromIdea).toContain('block by block');
	});
});
