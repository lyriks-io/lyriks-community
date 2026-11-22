import { describe, expect, it } from 'vitest';
import { createEmptyEvolutionDraft, type ImplementationFinding, type ProjectEvolutionDraft } from '$domain/evolution';
import { parseEvolutionDraft } from './parse-evolution-draft';
import { storedEvolutionDraft, storedLine } from './stored-evolution-draft';

const line = (over: Partial<ImplementationFinding>): ImplementationFinding => ({
	id: 'line-1',
	iteration: 1,
	verdict: 'missing',
	requirement: 'Carry a request › criterion "A list comes back whole"',
	leafId: 'feat-1',
	key: 'criterion:abc',
	filePath: '',
	lineRange: '',
	specStatement: 'A list comes back whole',
	codeStatement: 'Nothing proves it yet.',
	hasRequirementAnchor: true,
	anchorForeignLeaf: false,
	acceptanceTestPassing: false,
	specVersion: 2,
	scope: 'request',
	decision: 'undecided',
	decidedBy: null,
	decidedAt: null,
	...over
});

/** A whole draft written then read back the way the repository does. */
function roundTrip(lines: ImplementationFinding[]): ImplementationFinding[] {
	const base = parseEvolutionDraft({ ...createEmptyEvolutionDraft('p'), requests: [{ id: 'r1', title: 'A change' }] }, 'p');
	const draft: ProjectEvolutionDraft = { ...base, requests: [{ ...base.requests[0], implementationFindings: lines }] };
	const stored = JSON.parse(JSON.stringify(storedEvolutionDraft(draft)));
	return parseEvolutionDraft(stored, 'p').requests[0].implementationFindings;
}

describe('the Evolution document keeps less than it reads back', () => {
	it('reads a line of the request back exactly as it was, defaults left out of the write', () => {
		const own = line({});
		expect(Object.keys(storedLine(own))).not.toContain('decidedBy');
		expect(roundTrip([own])).toEqual([own]);
		const decided = line({ id: 'line-2', verdict: 'conform', decision: 'validated', decidedBy: 'ada@example.test', decidedAt: '2026-11-20T10:00:00.000Z', filePath: 'src/a.ts', lineRange: '12', acceptanceTestPassing: true });
		expect(roundTrip([decided])).toEqual([decided]);
	});

	it('keeps no statement of an inherited line, which no page shows, and everything else of it', () => {
		const inherited = line({ id: 'line-3', scope: 'inherited' });
		const [back] = roundTrip([inherited]);
		expect(back).toEqual({ ...inherited, specStatement: '', codeStatement: '' });
	});
});
