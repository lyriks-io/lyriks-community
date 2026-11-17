import { describe, expect, it } from 'vitest';
import { codeSummary, testedTip, type CodeGlance } from './code-summary';

const code = (over: Partial<CodeGlance> = {}): CodeGlance => ({
	deploymentBranch: 'main',
	branch: 'evo/EVO-001-fix',
	codeHead: '6767ffac7ded',
	clean: true,
	proofsChecked: 55,
	proofsOnOtherCommits: 0,
	validatedCommit: null,
	validationSetAside: false,
	mergedCommit: null,
	mergedInto: null,
	...over
});

describe('the code of a request at a glance', () => {
	it('says the one thing that matters now, the most urgent first', () => {
		expect(codeSummary(code({ branch: null }))).toMatchObject({ word: 'not created yet', tone: 'muted' });
		expect(codeSummary(code())).toMatchObject({ word: 'tested on 6767ffa', tone: 'ok' });
		expect(codeSummary(code({ clean: false }))).toMatchObject({ word: 'uncommitted changes', tone: 'warn' });
		expect(codeSummary(code({ proofsOnOtherCommits: 2 })).word).toBe('2 tests on another commit');
		expect(codeSummary(code({ validatedCommit: '6767ffac' })).word).toBe('validated at 6767ffa');
		expect(codeSummary(code({ validatedCommit: '6767ffac', validationSetAside: true, clean: false })).word).toBe('moved since the validation: validate again');
		expect(codeSummary(code({ mergedCommit: 'm3r6e01aa', mergedInto: 'main' })).word).toBe('merged into main@m3r6e01 · official');
		expect(codeSummary(code({ proofsChecked: 0 }))).toMatchObject({ word: 'committed · 6767ffa', tone: 'muted' });
	});

	it('says on hover how the tests were established and what committed means', () => {
		expect(testedTip(code())).toContain('55 of 55 test results were taken on 6767ffa');
		expect(testedTip(code())).toContain('Lyriks did not run them itself');
		expect(codeSummary(code()).tip).toContain('Nothing is left uncommitted on the branch');
	});
});
