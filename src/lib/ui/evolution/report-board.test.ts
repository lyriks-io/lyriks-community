import { describe, expect, it } from 'vitest';
import { aiCallWords, buildFiles, buildLineOf, buildPackages, buildProgress, buildStatus, choiceOf, codePlaceOf, decisionOf, fixPrompt, implementationBrief, lineLabels, readLine, remainingBrief, requirementParts } from './report-board';

const line = (id: string, verdict: string, decision = 'undecided', extra: Record<string, unknown> = {}) =>
	({ id, verdict, decision, requirement: `Cart › rule "Requirement ${id}"`, specStatement: `Spec of ${id}`, filePath: null, lineRange: null, scope: 'request', ...extra }) as never;
const subject = { key: 'EVO-016', title: 'Baskets', projectId: 'p', projectName: 'Bakery', requestId: 'e08a7a98-4741', specVersion: 2 };

describe('a line located in the code opens the place it was found at [criterion:2670dc31]', () => {
	const located = { verdict: 'conform', filePath: 'server/cron.js', lineRange: '12', leafId: 'feat-a', codeStatement: 'recordVisit(req, link);' } as const;

	it('names the feature, the file, the line and the code the report read there', () => {
		expect(codePlaceOf(located)).toEqual({ featureId: 'feat-a', file: 'server/cron.js', line: 12, place: 'server/cron.js · l.12', recorded: 'recordVisit(req, link);' });
	});
	it('keeps a place with no line, the file alone', () => {
		expect(codePlaceOf({ ...located, lineRange: '' })).toMatchObject({ line: null, place: 'server/cron.js' });
	});
	it('takes the standing of a line off the code it read, and holds no code when it names none', () => {
		expect(codePlaceOf({ ...located, codeStatement: 'recordVisit(req, link); (no passing result proves it yet)' })?.recorded).toBe('recordVisit(req, link);');
		expect(codePlaceOf({ ...located, codeStatement: 'located (stale)' })?.recorded).toBe('');
	});
	it('never takes the sentence of a line the code added for its code', () => {
		expect(codePlaceOf({ ...located, verdict: 'out_of_scope', codeStatement: 'The code carries the tag x.' })?.recorded).toBe('');
	});
	it('gives no place to a line the code does not locate, nor to one read on no feature', () => {
		expect(codePlaceOf({ ...located, filePath: '' })).toBeNull();
		expect(codePlaceOf({ ...located, leafId: null })).toBeNull();
	});
});

describe('the implementation report as the design reads it', () => {
	it('numbers what the spec asks E, what the code added A and what it broke R, whatever the verdict', () => {
		const lines = [line('a', 'conform'), line('b', 'non_conform'), line('c', 'out_of_scope'), line('d', 'missing'), line('e', 'regression')];
		expect([...lineLabels(lines).values()]).toEqual(['E1', 'E2', 'A1', 'E3', 'R1']);
	});

	it('reads a requirement as its name and the place it sits in the spec', () => {
		expect(requirementParts('Order online › Add a product › rule "No more than ten"')).toEqual({ title: 'No more than ten', path: 'Order online › Add a product › rule' });
		expect(requirementParts('Commander en ligne › Panier › state « slot.orderCount »')).toEqual({ title: 'slot.orderCount', path: 'Commander en ligne › Panier › state' });
		expect(requirementParts('A plain sentence')).toEqual({ title: 'A plain sentence', path: '' });
	});

	it('keeps the whole name when it quotes a message or a label itself', () => {
		expect(requirementParts('Manage users › criterion "Banning a user that no longer exists shows "No user has been found."."')).toEqual({
			title: 'Banning a user that no longer exists shows "No user has been found.".',
			path: 'Manage users › criterion'
		});
		expect(requirementParts('Manage domains › criterion "Deleting a domain that still has links without "Delete all links too" is refused."').title).toBe(
			'Deleting a domain that still has links without "Delete all links too" is refused.'
		);
		expect(requirementParts('Data change: amends table "Domain": adds addedByAdmin')).toEqual({ title: 'Data change: amends table "Domain": adds addedByAdmin', path: '' });
		expect(requirementParts('Scenario "Empty cart" of Checkout')).toEqual({ title: 'Scenario "Empty cart" of Checkout', path: '' });
	});

	it('reads an undecided gap as waiting for the code, and records the opinion a person gives as the decision of the line', () => {
		expect(choiceOf(line('x', 'non_conform'))).toBe('agree');
		expect(choiceOf(line('x', 'missing', 'validated'))).toBe('later');
		expect(choiceOf(line('x', 'out_of_scope'))).toBeNull();
		expect(choiceOf(line('x', 'regression', 'validated'))).toBe('modif');
		expect(decisionOf('gap', 'agree')).toBe('invalidated');
		expect(decisionOf('compliant', 'agree')).toBe('validated');
		expect(decisionOf('addition', 'keep')).toBe('adopted');
		expect(decisionOf('regression', 'modif')).toBe('validated');
		// A change of spec is the reopening of the request, a suggestion only shapes the prompt: no line decision.
		expect(decisionOf('gap', 'modif')).toBeNull();
		expect(decisionOf('omission', 'manual')).toBeNull();
	});

	it('keeps a deferred omission among the omissions, settled and marked as deferred [criterion:975debf9]', () => {
		const read = readLine(line('x', 'missing', 'validated'), { specVersion: 2 });
		expect(read).toMatchObject({ section: 'omission', choice: 'later', tag: 'Deferred to a future evolution', resolved: true, inFix: false, tone: 'muted' });
		expect(read.deferred).toBe(true);
		expect(readLine(line('x', 'missing'), { specVersion: 2, local: 'later' }).section).toBe('omission');
	});

	it('reads a validated line on a table as confirmed, never as deferred [criterion:975debf9]', () => {
		const table = line('x', 'missing', 'validated', { requirement: 'Data change: amends table "Domain"' });
		expect(readLine(table, { specVersion: 2 })).toMatchObject({ section: 'compliant', tag: 'Confirmed by a person', deferred: false, resolved: true });
	});

	it('moves a settled line among the compliant ones and keeps what still needs the code in its section', () => {
		const ctx = { specVersion: 2 };
		expect(readLine(line('x', 'non_conform', 'validated'), ctx)).toMatchObject({ section: 'compliant', tag: 'Gap accepted', tone: 'ok', resolved: true });
		expect(readLine(line('x', 'missing'), ctx)).toMatchObject({ section: 'omission', tag: 'In the correction', inFix: true, fix: 'Implement: Spec of x', fixLabel: 'To be implemented by the LLM:' });
		expect(readLine(line('x', 'missing'), { ...ctx, excluded: true })).toMatchObject({ tag: 'Out of fix scope', inFix: false });
		expect(readLine(line('x', 'missing'), { ...ctx, local: 'manual' })).toMatchObject({ tag: 'Suggestion to write', inFix: false });
		expect(readLine(line('x', 'missing'), { ...ctx, local: 'manual', suggestion: 'Add it to cart.js' })).toMatchObject({ tag: 'In the correction · your suggestion', fix: 'Add it to cart.js', inFix: true });
		expect(readLine(line('x', 'non_conform'), { ...ctx, local: 'modif' })).toMatchObject({ section: 'gap', tag: 'Spec change requested', specChange: true, resolved: false });
		expect(readLine(line('x', 'out_of_scope', 'adopted'), ctx)).toMatchObject({ section: 'addition', tag: 'To integrate into the spec', resolved: true, specChange: false });
		expect(readLine(line('x', 'out_of_scope', 'adopted'), { ...ctx, rechallenge: true }).specChange).toBe(true);
		expect(readLine(line('x', 'out_of_scope', 'adopted'), { ...ctx, landed: true })).toMatchObject({ section: 'compliant', tag: 'Included in spec v2' });
		expect(readLine(line('x', 'out_of_scope'), ctx)).toMatchObject({ section: 'addition', tag: 'To decide', resolved: false });
		expect(readLine(line('x', 'regression'), { ...ctx, local: 'investigate' }).fix).toBe('Analyze why Requirement x has changed, without modifying the code, and propose two options.');
	});

	it('never asks the AI to implement a table change only the person can close [criterion:ac-leaf-ac-evo-rebrief-data-line]', () => {
		const table = line('t', 'missing', 'undecided', { requirement: 'Data change: amends table "Domain": adds addedByAdmin', specStatement: 'The data model amends table "Domain": adds addedByAdmin.' });
		const read = readLine(table, { specVersion: 1 });
		expect(read).toMatchObject({ section: 'omission', inFix: true });
		expect(read.fix).toBe(
			'Make the code hold this table change if it does not yet, and name the files that hold it (migration, model): The data model amends table "Domain": adds addedByAdmin. No index sync closes this line, since the index locates no table: the person validates it once the code holds it.'
		);
		expect(fixPrompt(subject, [{ label: 'E61', fix: read.fix, where: '' }], ['E1'], '')).not.toContain('Implement:');
	});

	it('follows the build: a line counts as done only once a test proves it or a person rules it out', () => {
		const untested = { filePath: 'src/a.js', lineRange: '12', codeStatement: 'if (x) { (no passing result proves it yet)' };
		const running = buildProgress([line('a', 'conform', 'undecided', { filePath: 'src/a.js' }), line('b', 'missing'), line('c', 'non_conform', 'undecided', untested), line('i', 'missing', 'undecided', { scope: 'inherited' })]);
		expect(running).toMatchObject({ total: 3, tested: 1, found: 1, todo: 1, open: 2, finished: false, readAll: false, percent: 33, files: 1 });
		const done = buildProgress([line('a', 'conform'), line('b', 'missing', 'validated')]);
		expect(done).toMatchObject({ finished: true, readAll: true, percent: 100 });
	});

	it('says why each line is open and what closes it, never a bare "gap"', () => {
		const found = buildLineOf(line('c', 'non_conform', 'undecided', { filePath: 'src/a.js', lineRange: '12', codeStatement: 'if (x) { (no passing result proves it yet)' }));
		expect(found).toMatchObject({ state: 'found', word: 'Found · not tested', kind: 'Rule', feature: 'Cart', where: 'src/a.js · l.12' });
		expect(found.why).toBe('Found in the code, but no test of it has passed yet.');
		expect(buildLineOf(line('m', 'non_conform', 'undecided', { codeStatement: 'x (unverified: the signature no longer matches)' })).word).toBe('Found · code moved');
		expect(buildLineOf(line('t', 'non_conform', 'undecided', { requirement: 'Cart › Basket › state "cart.count"', codeStatement: 'x (no passing result proves it yet)' })).next).toBe(
			'Every action of its screen that reads or writes it (every action of the screen when none does) has to pass all its scenarios. Closes once the index is synced after it.'
		);
		// A screen's rule or always-true statement waits on its screen too [criterion:127dba2b].
		expect(buildLineOf(line('v', 'non_conform', 'undecided', { requirement: 'Cart › Basket › surface_invariant "Never negative"', codeStatement: 'x (no passing result proves it yet)' }))).toMatchObject({
			kind: 'Screen invariant',
			next: 'Every action of its screen has to pass all its scenarios. Closes once the index is synced after it.'
		});
		expect(buildLineOf(line('f', 'non_conform', 'undecided', { requirement: 'Cart › criterion "Ten at most"', codeStatement: 'Its last result failed.' }))).toMatchObject({ state: 'failing', kind: 'Criterion' });
		expect(buildLineOf(line('s', 'missing', 'undecided', { requirement: 'Use the API › Calls with the key › state "account.verified"' }))).toMatchObject({
			state: 'todo',
			kind: 'State',
			title: 'account.verified',
			place: 'Calls with the key',
			feature: 'Use the API'
		});
		expect(buildLineOf(line('d', 'missing', 'undecided', { requirement: 'Data change: amends table "Domain": adds addedByAdmin' }))).toMatchObject({
			state: 'yours',
			feature: 'Data model',
			kind: 'Data change',
			title: 'amends table "Domain": adds addedByAdmin'
		});
	});

	it('lists one package per feature, the one missing the most verification first and its open lines on top', () => {
		const packages = buildPackages([
			line('a', 'conform', 'undecided', { requirement: 'Done feature › rule "A"' }),
			line('b', 'conform', 'undecided', { requirement: 'Moving › rule "B"' }),
			line('c', 'missing', 'undecided', { requirement: 'Moving › rule "C"' }),
			line('d', 'missing', 'undecided', { requirement: 'Far › rule "D"' }),
			line('e', 'missing', 'undecided', { requirement: 'Far › rule "E"' })
		]);
		expect(packages.map((p) => [p.name, p.open, p.settled, p.total, p.done])).toEqual([
			['Far', 2, 0, 2, false],
			['Moving', 1, 1, 2, false],
			['Done feature', 0, 1, 1, true]
		]);
		expect(packages[1].lines.map((r) => r.line.id)).toEqual(['c', 'b']);
	});

	it('says what really happens: an AI at work only when it holds the build, else what the build waits for', () => {
		const open = buildProgress([line('a', 'conform'), line('b', 'missing')]);
		expect(buildStatus(open, { click: null, saying: null }, '20:45')).toMatchObject({ kind: 'waiting_code', word: 'Waiting for the code' });
		expect(buildStatus(open, { click: null, saying: null }, '20:45').text).toContain('Last reading at 20:45.');
		expect(buildStatus(open, { click: 'taken', saying: 'Running the tests' }, null)).toMatchObject({ kind: 'building', text: 'Running the tests' });
		expect(buildStatus(open, { click: null, saying: 'Proving the admin tables', busy: true }, null)).toMatchObject({ kind: 'working', word: 'Lyriks is working', text: 'Proving the admin tables' });
		// An AI that announced nothing, or is back to listening, is not said to work.
		expect(buildStatus(open, { click: null, saying: null, busy: true }, null).kind).toBe('waiting_code');
		const yours = buildProgress([line('a', 'conform'), line('d', 'missing', 'undecided', { requirement: 'Data change: adds x' })]);
		expect(buildStatus(yours, { click: null, saying: null }, null).kind).toBe('waiting_you');
		expect(buildStatus(buildProgress([line('a', 'conform')]), { click: 'taken', saying: null }, null).kind).toBe('complete');
	});

	it('says each MCP call of the AI in the log\'s words, a sync apart from a behaviour batch, nothing for another request', () => {
		expect(aiCallWords({ requestId: '', act: 'write', section: 'behavior.implementation' }, 'r1')).toBe('synced the index: Lyriks reads the code again');
		expect(aiCallWords({ requestId: '', act: 'read', section: 'behavior' }, 'r1')).toBe('read the spec');
		expect(aiCallWords({ requestId: 'r1', act: 'write' }, 'r1')).toBe('wrote on the request');
		expect(aiCallWords({ requestId: 'r2', act: 'write' }, 'r1')).toBeNull();
	});

	it('lists the files the verification reads, the busiest first', () => {
		expect(buildFiles([line('a', 'conform', 'undecided', { filePath: 'b.js' }), line('c', 'conform', 'undecided', { filePath: 'a.js' }), line('d', 'conform', 'undecided', { filePath: 'a.js' }), line('e', 'missing')])).toEqual([
			{ file: 'a.js', lines: 2 },
			{ file: 'b.js', lines: 1 }
		]);
	});

	it('hands the AI only the points still open, each with what the last reading says', () => {
		const brief = remainingBrief(subject, [
			line('a', 'conform'),
			line('c', 'non_conform', 'undecided', { filePath: 'src/a.js', lineRange: '12', codeStatement: 'if (x) { (no passing result proves it yet)' }),
			line('d', 'missing', 'undecided', { requirement: 'Data change: adds x' })
		]);
		expect(brief).toContain('Points still open (1)');
		expect(brief).toContain('- E2 Cart › rule "Requirement c": Found in the code, but no test of it has passed yet. (src/a.js · l.12)');
		expect(brief).not.toContain('Requirement a');
	});

	it('writes the brief and the fix prompt from the lines, never from anything else', () => {
		const lines = [line('a', 'conform'), line('c', 'missing'), line('i', 'missing', 'undecided', { scope: 'inherited' })];
		const brief = implementationBrief(subject, lines, [{ label: 'Payment', reason: 'Card only for now' }]);
		expect(brief).toContain('Implement evolution EVO-016 “Baskets” (Bakery project).');
		expect(brief).toContain('Validated decisions:\n- Payment: Card only for now');
		expect(brief).toContain('Requirements to cover (2):\n- E1 Cart › rule "Requirement a"\n- E2 Cart › rule "Requirement c"');
		expect(brief).not.toContain('Requirement i');
		const prompt = fixPrompt(subject, [{ label: 'E2', fix: 'Implement: Spec of c', where: 'src/pay.js · l.12' }], ['E1'], 'Keep the cache.');
		expect(prompt).toContain('1. [E2] Implement: Spec of c\n   → src/pay.js · l.12');
		expect(prompt).toContain('Instruction: Keep the cache.');
		expect(prompt).toContain('Do not modify what is compliant: E1.');
		expect(prompt).toContain('run sync_implementation_index so Lyriks can re-verify.');
	});
});

describe('while a correction is open, the build brief reads version N [criterion:ac-leaf-3baf05de-369c-4eb6-9874-c53253590160]', () => {
	const lines = [line('a', 'missing'), line('c', 'non_conform', 'undecided', { filePath: 'src/a.js', lineRange: '12' })];

	it('hands out the version built and says the corrected one waits for its validation', () => {
		for (const brief of [implementationBrief({ ...subject, correcting: 3 }, lines, []), remainingBrief({ ...subject, correcting: 3 }, lines)]) {
			expect(brief).toContain('Lyriks › EVO-016 v2');
			expect(brief).toContain('Version 3 is in correction and waits for its validation: build against v2 until it is frozen.');
		}
	});

	it('says nothing of a correction when none is open', () => {
		expect(implementationBrief(subject, lines, [])).not.toContain('in correction');
		expect(implementationBrief({ ...subject, correcting: null }, lines, [])).not.toContain('in correction');
	});
});
