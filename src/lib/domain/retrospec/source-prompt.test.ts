import { describe, expect, it } from 'vitest';
import { modeOf, readsCode, readsDocs, resumeRetrospecPrompt, retrospecPrompt } from './source-prompt';

describe('what the retrospecification reads', () => {
	it('keeps one box ticked: both, the code, or the documentation', () => {
		expect(modeOf(true, true)).toBe('both');
		expect(modeOf(false, true)).toBe('docs');
		expect(modeOf(true, false)).toBe('repo');
		expect(modeOf(false, false)).toBe('repo');
		expect([readsCode('both'), readsDocs('both'), readsCode('docs'), readsDocs('repo')]).toEqual([true, true, false, false]);
	});

	it('hands the AI the code prompt, the documentation prompt, or both with the code as the reference', () => {
		expect(retrospecPrompt('repo', 'Facturo', 'fac-1')).toContain('adopt this entire codebase');
		expect(retrospecPrompt('docs', 'Facturo', 'fac-1')).not.toContain('codebase');
		const both = retrospecPrompt('both', 'Facturo', 'fac-1');
		expect(both).toContain('adopt this entire codebase');
		expect(both).toContain('documentation');
		expect(both).toContain('the code is the reference');
	});
});

describe('the prompt that resumes a silent retrospecification [criterion:ac-leaf-ac-ai-session-disconnected]', () => {
	it('resumes where it stopped, from what the project holds, then runs the final check', () => {
		const prompt = resumeRetrospecPrompt('repo', 'Signal', 'signal-1a2b3c');
		expect(prompt).toContain('reconnect to the project signal-1a2b3c and resume the Reverse-Specification of Signal where it stopped');
		expect(prompt).toContain('without rewriting what is already written');
		expect(prompt).toContain('from the code,');
		expect(prompt).toContain('finish_project once it reports no blocker');
	});

	it('names the source the run reads', () => {
		expect(resumeRetrospecPrompt('docs', 'Kutt', 'k')).toContain('from the documentation,');
		expect(resumeRetrospecPrompt('both', 'Kutt', 'k')).toContain('from the code and documentation,');
	});
});

describe('a retrospecification that reads the code records the commit it read [criterion:c50587fb]', () => {
	it('asks for the commit before finish_project, never on a documentation run', () => {
		expect(retrospecPrompt('repo', 'Kutt', 'k')).toContain('report the commit you read');
		expect(retrospecPrompt('docs', 'Kutt', 'k')).not.toContain('report the commit you read');
	});
});

describe('the AI says it received the prompt before anything else [criterion:a6f870af]', () => {
	const said = 'Before anything else, call report_retrospec_reading with project_id k and received: true';

	it('opens every prompt of a run with it, whatever it reads', () => {
		for (const mode of ['repo', 'docs', 'both'] as const) expect(retrospecPrompt(mode, 'Kutt', 'k').startsWith(said)).toBe(true);
		expect(retrospecPrompt('repo', 'Kutt', 'k', { fromCommit: 'abc1234', handEdits: 0 }).startsWith(said)).toBe(true);
	});

	it('leaves the prompt that resumes a run alone: that run already moved on', () => {
		expect(resumeRetrospecPrompt('repo', 'Kutt', 'k')).not.toContain('received');
	});
});

describe('a complementary retrospecification reads the delta and erases nothing [criterion:8c9bfffe]', () => {
	const prompt = retrospecPrompt('repo', 'Kutt', 'k', { fromCommit: 'abc1234', handEdits: 2 });

	it('names the commit it starts from, reads the git diff and stops on an unknown commit', () => {
		expect(prompt).toContain('last validated run read commit abc1234');
		expect(prompt).toContain('`git diff --name-only abc1234..HEAD`');
		expect(prompt).toContain('If abc1234 is unknown in this checkout, say so and stop');
	});

	it('names the hand edits to read against the code, and changes neither [criterion:23397c95]', () => {
		expect(prompt).toContain('the 2 changes made by hand in the specification');
		expect(prompt).toContain('whether the code says what the specification now says (same) or otherwise (other)');
		expect(retrospecPrompt('repo', 'Kutt', 'k', { fromCommit: 'abc1234', handEdits: 0 })).not.toContain('hand edit');
	});

	it('starts from what the project holds, erases nothing and leaves a validated value to a person', () => {
		expect(prompt).toContain('start from the specification the project already holds and erase nothing');
		expect(prompt).toContain('First read what it holds: get_project');
		expect(prompt).toContain('a value a person validated that the product now reads otherwise, are written as findings of the run (rules.issues)');
	});

	it('finds the delta from what the specification cites when no commit was recorded, never by reading the whole product again', () => {
		const noCommit = retrospecPrompt('repo', 'Kutt', 'k', { fromCommit: null, handEdits: 0 });
		expect(noCommit).toContain('the code files whose content differs from the version attached as a source');
		expect(noCommit).not.toContain('git diff');
		expect(noCommit).not.toContain('adopt this entire codebase');
		expect(noCommit).toContain('report the commit you read');
		const docs = retrospecPrompt('docs', 'Taskora', 't', { fromCommit: null, handEdits: 0 });
		expect(docs).toContain('the documents whose version or content changed since they were registered');
		expect(docs).toContain('erase nothing');
		expect(docs).not.toContain('report the commit you read');
		// A run from the documentation reads no git delta even when a commit was recorded.
		expect(retrospecPrompt('docs', 'Kutt', 'k', { fromCommit: 'abc1234', handEdits: 0 })).not.toContain('git diff');
	});
});

describe('the whole product again starts from what is gathered and rewords nothing that holds [criterion:98612117]', () => {
	it('reads everything element by element against the specification, with no git delta to stop on', () => {
		const whole = retrospecPrompt('repo', 'Kutt', 'k', { fromCommit: 'abc1234', handEdits: 0, scope: 'whole' });
		expect(whole).toContain('read the whole product again, its code');
		expect(whole).toContain('confirm what still holds without rewording it');
		expect(whole).toContain('erase nothing');
		expect(whole).not.toContain('git diff');
		expect(whole).not.toContain('If abc1234 is unknown');
		expect(retrospecPrompt('docs', 'Taskora', 't', { fromCommit: null, handEdits: 0, scope: 'whole' })).toContain('read the whole product again, its documentation');
	});
});

describe('a run that holds its changes reports them instead of writing them [criterion:50b00229]', () => {
	const prompt = retrospecPrompt('repo', 'Kutt', 'k', { fromCommit: 'abc1234', handEdits: 0, held: true });

	it('asks for each difference and writes nothing', () => {
		expect(prompt).toContain('Write nothing in the specification');
		expect(prompt).toContain('changes: [{ id, kind: new | changed | removed');
		expect(prompt).not.toContain('Write what you find through the section tools');
	});

	it('ends by saying it is finished, never by the final check', () => {
		expect(prompt).toContain('report_retrospec_reading with finished: true');
		expect(prompt).not.toContain('finish_project');
	});

	it('keeps it when the run is resumed', () => {
		const resumed = resumeRetrospecPrompt('repo', 'Kutt', 'k', undefined, true);
		expect(resumed).toContain('Write nothing in the specification');
		expect(resumed).not.toContain('finish_project');
	});
});

describe('a run that holds its changes says where its reading is (EVO-014) [criterion:bfb521ca]', () => {
	it('asks its AI to say each phase it starts and each feature it finished re-reading', () => {
		const prompt = retrospecPrompt('repo', 'Shop', 'shop', { fromCommit: '7c0d4b1', handEdits: 0, held: true });
		expect(prompt).toContain('report_retrospec_reading, phase: sources | product | features | data | experience | rules | tech | check');
		expect(prompt).toContain('report it with report_retrospec_reading, read: [its featureId]');
		// A run that writes as it reads is followed from the sections it writes.
		expect(retrospecPrompt('repo', 'Shop', 'shop', { fromCommit: '7c0d4b1', handEdits: 0 })).not.toContain('phase: sources');
	});

	it('resumes at the phase, from the commit the closed run read [criterion:0fb33bf2]', () => {
		const resumable = { fromRunId: 'run-1', read: ['sources', 'product'], interrupted: ['features'], left: ['data', 'check'], fromCommit: 'abc1234' };
		const prompt = retrospecPrompt('repo', 'Shop', 'shop', { fromCommit: null, handEdits: 0, held: true, scope: 'resume', resumable });
		expect(prompt).toContain('That run read Reading the code, Product and users whole: do not read them again.');
		expect(prompt).toContain('It stopped in Features, actions and rules: read what is already written there and continue from it without rewriting it.');
		expect(prompt).toContain('Then read Data model.');
		expect(prompt).toContain('the files `git diff --name-only abc1234..HEAD` lists.');
		expect(prompt).toContain('If abc1234 is unknown in this checkout, say so and stop');
	});
});
