/**
 * The editorial note of the Evolution design (ac-evo-form-step-note): at the
 * top of a step, what the person's AI or Lyriks produced or suggested there,
 * in three panels (taken or found, suggested to double-check, what to do now),
 * and only when there is something. Every line is read from the request as it
 * stands; nothing counts what the platform cannot see. Pure: the page hands in
 * the facts of each step and opens the place a line names.
 */

/**
 * One step of what to do now. It stays in place once done and reads checked:
 * the note keeps the steps its step had to give (ac-evo-form-step-note).
 */
export interface NoteStep {
	readonly text: string;
	readonly done: boolean;
}

/** One line of a panel: the section it names by number, and the element it opens. */
export interface NoteItem {
	readonly ref: string;
	readonly text: string;
	readonly target: string;
}

export interface EditorialNote {
	/** Who speaks: the person's AI wrote or suggested it, or Lyriks read it. */
	readonly author: 'ai' | 'lyriks';
	readonly title: string;
	readonly lede: string;
	readonly takenLabel: string;
	readonly taken: readonly NoteItem[];
	readonly suggestedLabel: string;
	readonly suggested: readonly NoteItem[];
	/** At most three steps, each a verb, each checked once nothing it asks still waits. */
	readonly todo: readonly NoteStep[];
	/** The Simulation and the Verification ask for decisions while they hold one to take, the other steps for a review. */
	readonly decide: boolean;
}

// The platform does not know which AI the person uses: the design's "CLAUDE" reads "YOUR AI".
export const noteAuthorLine = (note: EditorialNote): string => (note.author === 'ai' ? 'NOTE FROM LYRIKS × YOUR AI' : 'NOTE FROM LYRIKS');
export const noteCta = (note: EditorialNote): string => (note.decide ? 'I’ve read it, let’s decide' : 'I’ve read it, let’s review');

/**
 * What a reader folds is the note as it reads then (ac-evo-form-step-note-read):
 * a new line, or a count that moves, makes another key and opens it again.
 */
export function noteReadKey(requestId: string, step: string, note: EditorialNote): string {
	const lines = [...note.taken, ...note.suggested].map((i) => `${i.ref} ${i.text}`).join('|');
	return `${requestId}:${step}:${lines}`;
}

// A non-breaking hyphen (U+2011): a narrow panel wraps the label between words, never inside "DOUBLE-CHECK".
const SUGGESTED_BY_AI = 'SUGGESTED BY YOUR AI · TO DOUBLE‑CHECK';
const SUGGESTED_BY_LYRIKS = 'SUGGESTED BY LYRIKS · TO DOUBLE‑CHECK';
const counted = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Read 1.1.", "Read 2.1 and 2.2.", "Read 1.1 to 1.3.", the way the design says it. */
function readThrough(refs: readonly string[]): string {
	if (refs.length === 1) return `Read ${refs[0]}.`;
	if (refs.length === 2) return `Read ${refs[0]} and ${refs[1]}.`;
	return `Read ${refs[0]} to ${refs[refs.length - 1]}.`;
}
const note = (fields: Omit<EditorialNote, 'todo'> & { todo: readonly (NoteStep | false)[] }): EditorialNote => ({
	...fields,
	todo: fields.todo.filter((t): t is NoteStep => t !== false).slice(0, 3)
});
const todoStep = (text: string, done: boolean): NoteStep => ({ text, done });

/** A section of the Briefing or of the Solution, as the note reads it. */
export interface ProseSection {
	readonly number: string;
	readonly title: string;
	readonly target: string;
	/** How many of its answers stand as the AI wrote them. */
	readonly aiWritten: number;
	/** How many suggestions of the AI wait on its questions. */
	readonly suggestions: number;
	/** How many of its answers are suggestions of the AI a person accepted: the suggestions decided there. */
	readonly accepted: number;
	/** How many of its written answers still wait for a person's validation. */
	readonly waiting: number;
}

/** The Briefing's or the Solution's note: the sections the AI wrote, the suggestions waiting. */
export function proseNote(step: 'briefing' | 'solution', sections: readonly ProseSection[]): EditorialNote | null {
	const taken = sections.filter((s) => s.aiWritten > 0).map((s) => ({ ref: s.number, text: s.title, target: s.target }));
	const suggested = sections
		.filter((s) => s.suggestions > 0)
		.map((s) => ({ ref: s.number, text: `${counted(s.suggestions, 'suggestion')} waiting`, target: s.target }));
	if (taken.length === 0 && suggested.length === 0) return null;
	const noted = sections.filter((s) => s.aiWritten > 0 || s.suggestions > 0);
	const several = noted.length > 1;
	// Reading and correcting are not seen: the validation of what they bear on closes them.
	const validated = noted.every((s) => s.waiting === 0);
	const validate = todoStep(several ? 'Validate each section.' : 'Validate the section.', validated);
	const decideSuggestions = todoStep('Accept or reject each suggestion.', sections.every((s) => s.suggestions === 0));
	if (taken.length === 0)
		return note({
			author: 'ai',
			title: `Suggestions added to the ${step === 'briefing' ? 'Briefing' : 'Solution'}.`,
			lede: 'Nothing is kept until you accept it.',
			takenLabel: '',
			taken: [],
			suggestedLabel: SUGGESTED_BY_AI,
			suggested,
			todo: [decideSuggestions, validate],
			decide: false
		});
	return note({
		author: 'ai',
		title: step === 'briefing' ? 'Briefing pre-filled by Lyriks.' : 'Requirements written by Lyriks.',
		lede: suggested.length > 0 ? 'A few suggestions to check.' : 'Check it, then validate it.',
		takenLabel: 'WRITTEN BY YOUR AI',
		taken,
		suggestedLabel: SUGGESTED_BY_AI,
		suggested,
		todo: [
			todoStep(
				readThrough(taken.map((t) => t.ref)),
				sections.filter((s) => s.aiWritten > 0).every((s) => s.waiting === 0)
			),
			sections.some((s) => s.suggestions > 0 || s.accepted > 0) ? decideSuggestions : todoStep('Correct what is wrong.', validated),
			validate
		],
		decide: false
	});
}

export interface SpecificationFacts {
	/** The person's AI wrote the specification through the MCP. */
	readonly byAi: boolean;
	readonly features: number;
	readonly actions: number;
	readonly dataChanges: number;
	/** The names of the features the request removes: a choice to double-check. */
	readonly removals: readonly string[];
	/** Suggestions of the AI waiting on the answers of the touched features. */
	readonly featureSuggestions: number;
	/** The journey stands as the AI drew it, not validated yet. */
	readonly journeyByAi: boolean;
	readonly journey: boolean;
	/** What still waits for a person's validation: answers of the touched features, actions, the journey. */
	readonly waiting: { readonly features: number; readonly actions: number; readonly journey: boolean };
}

/** The Specification's note, once the person's AI wrote it. */
export function specificationNote(facts: SpecificationFacts): EditorialNote | null {
	if (!facts.byAi || facts.features === 0) return null;
	const taken: NoteItem[] = [
		{ ref: '3.1', text: counted(facts.features, 'feature'), target: 'sg-features' },
		...(facts.actions > 0 ? [{ ref: '3.2', text: 'Actions and rules', target: 'sg-actions' }] : []),
		...(facts.dataChanges > 0 ? [{ ref: '3.4', text: 'Datamap', target: 'sg-data' }] : [])
	];
	const suggested: NoteItem[] = [
		...facts.removals.map((name) => ({ ref: '3.1', text: `Removal of ${name}`, target: 'sg-features' })),
		...(facts.featureSuggestions > 0 ? [{ ref: '3.1', text: `${counted(facts.featureSuggestions, 'suggestion')} on the features`, target: 'sg-features' }] : []),
		...(facts.journeyByAi ? [{ ref: '3.3', text: 'Journey', target: 'sg-diagram' }] : [])
	].slice(0, 3);
	return note({
		author: 'ai',
		title: 'Specification written from the Solution.',
		lede: suggested.length > 0 ? 'A few choices to check.' : 'Check it, then validate it.',
		takenLabel: 'FROM THE SOLUTION',
		taken,
		suggestedLabel: SUGGESTED_BY_AI,
		suggested,
		todo: [
			todoStep('Validate each feature.', facts.waiting.features === 0),
			facts.actions > 0 && todoStep('Validate each action.', facts.waiting.actions === 0),
			facts.journey && todoStep('Validate the journey.', !facts.waiting.journey)
		],
		decide: false
	});
}

export interface SimulationFacts {
	readonly key: string;
	readonly major: number;
	readonly minor: number;
	readonly compatible: number;
	/** The evolutions in progress read against this one, by verdict. */
	readonly conflicts: number;
	readonly overlaps: number;
	readonly notChecked: number;
	/** The major impacts a person decided an option for. */
	readonly majorDecided: number;
	/** The request crossed into the Implementation: what the Simulation asked to read and settle is behind it. */
	readonly movedOn: boolean;
	/** The number each section of the details carries ("4.1"), or null when it is not shown. */
	readonly numberOf: (section: 'major' | 'minor' | 'compatible' | 'cross') => string | null;
}

/** The Simulation's note, once Lyriks read the change against the product. */
export function simulationNote(facts: SimulationFacts): EditorialNote {
	const ref = (section: Parameters<SimulationFacts['numberOf']>[0]) => facts.numberOf(section) ?? '4';
	const crossParts = [
		facts.conflicts > 0 && counted(facts.conflicts, 'conflict'),
		facts.overlaps > 0 && counted(facts.overlaps, 'overlap'),
		facts.notChecked > 0 && `${facts.notChecked} not checked`
	].filter((p): p is string => p !== false);
	const issues = facts.conflicts + facts.overlaps;
	const taken: NoteItem[] = [
		...(facts.major > 0 ? [{ ref: ref('major'), text: counted(facts.major, 'major impact'), target: 'majeurs' }] : []),
		...(facts.minor > 0 ? [{ ref: ref('minor'), text: counted(facts.minor, 'minor impact'), target: 'mineurs' }] : []),
		...(crossParts.length > 0 ? [{ ref: ref('cross'), text: crossParts.join(', '), target: 'xevo' }] : [])
	];
	if (taken.length === 0 && facts.compatible > 0) taken.push({ ref: ref('compatible'), text: counted(facts.compatible, 'compatible item'), target: 'compatibles' });
	const suggested: NoteItem[] = [
		...(facts.major > 0 ? [{ ref: ref('major'), text: 'Workarounds', target: 'majeurs' }] : []),
		...(issues > 0 ? [{ ref: ref('cross'), text: 'What to do', target: 'xevo' }] : [])
	];
	const nothing = facts.major === 0 && facts.minor === 0 && issues === 0;
	return note({
		author: 'lyriks',
		title: `${facts.key} simulated against your product.`,
		lede: facts.major > 0 ? 'Findings are facts. Ways out are suggestions.' : 'Findings are facts.',
		takenLabel: 'FOUND',
		taken,
		suggestedLabel: SUGGESTED_BY_LYRIKS,
		suggested,
		todo: nothing
			? [todoStep('Read the summary.', facts.movedOn), todoStep('Go to Implementation.', facts.movedOn)]
			: [
					facts.major > 0 && todoStep('Decide each major impact.', facts.majorDecided >= facts.major),
					facts.minor > 0 && todoStep('Review each minor impact.', facts.movedOn),
					issues > 0 && todoStep(facts.conflicts > 0 ? 'Settle each conflict.' : 'Settle each overlap.', facts.movedOn)
				],
		decide: !nothing
	});
}

export interface ImplementationFacts {
	readonly key: string;
	readonly finished: boolean;
	readonly requirements: number;
	readonly files: number;
	/** What the code added beyond the spec, by its label in the report (A1, A2), and whether a person kept or removed it. */
	readonly additions: readonly { label: string; title: string; decided: boolean }[];
	/** The verification is validated: the request was opened there and crossed it. */
	readonly verified: boolean;
}

/** The Implementation's note, once every requirement was read against the code. */
export function implementationNote(facts: ImplementationFacts): EditorialNote | null {
	if (!facts.finished) return null;
	return note({
		author: 'lyriks',
		title: `${facts.key} implemented.`,
		lede: 'Every requirement read against the code.',
		takenLabel: 'DELIVERED',
		taken: [{ ref: '5', text: `${counted(facts.requirements, 'requirement')}, ${counted(facts.files, 'file')}`, target: 'dev-verification' }],
		suggestedLabel: 'BEYOND THE SPEC · TO DECIDE',
		suggested: facts.additions.slice(0, 3).map((a) => ({ ref: a.label, text: a.title, target: 'verification' })),
		todo: [
			todoStep('Open the Verification.', facts.verified),
			facts.additions.length > 0 && todoStep(`Keep or remove the ${counted(facts.additions.length, 'addition')}.`, facts.additions.every((a) => a.decided))
		],
		decide: false
	});
}

export interface VerificationFacts {
	/** The sections of the details shown, in order, with their number, how many lines each holds and how many of them nobody settled (all, when left out). */
	readonly sections: readonly { key: 'compliant' | 'gap' | 'omission' | 'addition' | 'regression'; title: string; number: string; count: number; open?: number }[];
	/** Lines in the correction sent back to the person's AI. */
	readonly corrections: number;
	/** The number of the LLM instructions section. */
	readonly guideNumber: string;
	/** The gaps (gaps, omissions, regressions) and the additions the report found, settled or not: what the note had to ask. */
	readonly found: { readonly gaps: number; readonly additions: number };
	/** The verification is validated: the request crossed it. */
	readonly movedOn: boolean;
}

/** The Verification's note, once its report reads. */
export function verificationNote(facts: VerificationFacts): EditorialNote {
	const shown = facts.sections.filter((s) => s.count > 0);
	// A deferred omission stays listed but asks nothing more (criterion 975debf9).
	const issues = shown.filter((s) => (s.key === 'gap' || s.key === 'omission' || s.key === 'regression') && (s.open ?? s.count) > 0);
	const allDeferred = issues.length === 0 && shown.some((s) => s.key === 'omission');
	const addition = shown.find((s) => s.key === 'addition');
	const taken = shown
		.filter((s) => s.key !== 'addition')
		.map((s) => ({ ref: s.number, text: counted(s.count, s.title.toLowerCase().replace(/s$/, ''), s.title.toLowerCase()), target: `sec-${s.key}` }));
	const suggested: NoteItem[] = [
		...(facts.corrections > 0 && issues[0] ? [{ ref: issues[0].number, text: 'Fixes', target: `sec-${issues[0].key}` }] : []),
		...(addition ? [{ ref: addition.number, text: 'Keep or remove additions', target: 'sec-addition' }] : []),
		...(facts.corrections > 0 ? [{ ref: facts.guideNumber, text: 'LLM instruction', target: 'guider' }] : [])
	];
	return note({
		author: 'lyriks',
		title: 'Code checked against the spec.',
		lede: facts.corrections > 0 ? 'Each gap comes with a fix.' : issues.length > 0 || addition ? 'A few points to decide.' : allDeferred ? 'Nothing left to decide.' : 'Everything matches the spec.',
		takenLabel: 'CHECKED',
		taken,
		suggestedLabel: SUGGESTED_BY_LYRIKS,
		suggested,
		todo:
			facts.found.gaps === 0 && facts.found.additions === 0
				? [todoStep('Read the summary.', facts.movedOn)]
				: [
						facts.found.gaps > 0 && todoStep('Review each gap.', issues.length === 0),
						facts.found.additions > 0 && todoStep('Decide each addition.', !addition),
						facts.found.gaps > 0 && todoStep('Send the fixes to your AI.', facts.corrections === 0)
					],
		decide: issues.length > 0 || !!addition
	});
}
