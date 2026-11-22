import { counted, inWords, plain, quoted, shortDate, shortLine, strong, type ActivityNotice, type NoticeAction, type NoticePerson, type NoticeRun, type NoticeVisual } from '../activity/notice';
import type { BuiltFigures } from './events';

/**
 * What the notifications of a Reverse-Specification and of the validation of
 * its specification say, each in the brief's feed order (criterion 65fdff0a
 * of feat-feedback-docs): it started or the specification is being updated
 * (criterion 3fccc273), it is ready to review (criterion f04182b8), its LLM went
 * silent and it stopped (criterion fcd8a267); the specification fully
 * validated, an element rejected, a review still pending (criterion 4fce1259).
 * Lyriks is the one who works (criterion ccaa0784); the person comes last.
 */

const REVIEW: NoticeAction = { label: 'Review the Specification 360°', icon: 'go' };
const READY = 'The specification is ready to review.';
const SECTION = 'Reverse-Specification' as const;

/** How many names of features the picture shows before it counts the others. */
const CHIPS = 8;

/** "26 features, five of them at the core, 247 rules and 11 users": a figure the specification does not hold is left out with its words. */
function found(f: BuiltFigures | undefined): NoticeRun[] {
	if (!f || f.features <= 0) return [];
	const runs: NoticeRun[] = [strong(counted(f.features, 'feature'))];
	if (f.cores > 0) runs.push(plain(`, ${inWords(f.cores)} of them at the core`));
	const rest = [f.rules > 0 ? counted(f.rules, 'rule') : '', f.users > 0 ? counted(f.users, 'user') : ''].filter(Boolean);
	rest.forEach((r, i) => runs.push(plain(i === rest.length - 1 ? ' and ' : ', '), strong(r)));
	return runs;
}

/** The features found, the core ones first and set apart, then the figures (brief case 2). */
function foundPicture(f: BuiltFigures | undefined): NoticeVisual | undefined {
	if (!f || f.features <= 0) return undefined;
	const names = f.names ?? [];
	const chips = names.slice(0, CHIPS).map((n) => ({ label: n.name, ...(n.core ? { strong: true } : {}) }));
	const figures = [
		{ n: String(f.features), label: f.features === 1 ? 'feature' : 'features' },
		...(f.rules > 0 ? [{ n: String(f.rules), label: f.rules === 1 ? 'rule' : 'rules' }] : []),
		...(f.users > 0 ? [{ n: String(f.users), label: f.users === 1 ? 'user' : 'users' }] : [])
	];
	return { kind: 'chips', chips, more: Math.max(0, names.length - chips.length), figures };
}

/** "26 features, 247 rules and 11 users uncovered." */
function uncovered(f: BuiltFigures | undefined, product: string): string {
	if (!f || f.features <= 0) return `The specification of ${product} is ready to review.`;
	const parts = [counted(f.features, 'feature'), ...(f.rules > 0 ? [counted(f.rules, 'rule')] : []), ...(f.users > 0 ? [counted(f.users, 'user')] : [])];
	return `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]} uncovered.`;
}

/** The AI ran its final check: the specification is there to review. A later run that read only what changed says so. */
export function readyNotice(figures: BuiltFigures | undefined, delta: boolean, product: string, held = false): ActivityNotice {
	const what = found(figures);
	const body = held
		? [plain('Lyriks read what changed in the product. Nothing is written yet: what it found waits on Mismatch.')]
		: delta
		? [plain('Lyriks read what changed in the product and brought its specification up to date'), ...(what.length ? [plain('. It now holds '), ...what] : []), plain('.')]
		: [plain('Lyriks went through the whole product and rebuilt its specification'), ...(what.length ? [plain(': '), ...what] : []), plain('.')];
	const visual = foundPicture(figures);
	return { section: SECTION, level: 'info', title: READY, body, line: shortLine(uncovered(figures, product)), action: REVIEW, ...(visual ? { visual } : {}) };
}

/** A person closed the analysis before the AI's final check: what was read waits for review, and they are named last. */
export function closedNotice(name: string, figures: BuiltFigures | undefined): ActivityNotice {
	const visual = foundPicture(figures);
	return {
		section: SECTION,
		level: 'info',
		title: READY,
		body: [plain("The analysis was closed before Lyriks's final check: what was read is ready to review. "), strong(name), plain(' closed it.')],
		line: shortLine(`${name} closed the analysis before its final check.`),
		action: REVIEW,
		...(visual ? { visual } : {})
	};
}

/** The playbook's phases, laid on the brief's four steps: reading, mapping, writing, ready. */
const STEP_OF_PHASE: Readonly<Record<string, number>> = { sources: 0, product: 1, features: 1, data: 2, experience: 2, rules: 2, tech: 2, check: 3 };

const stateAt = (i: number, now: number): 'done' | 'now' | 'todo' => (i < now ? 'done' : i === now ? 'now' : 'todo');

/** The four steps of a first run, the one Lyriks is on lit (brief case 1). */
export function runSteps(phase: string | null, docs: boolean): NoticeVisual {
	const now = phase ? (STEP_OF_PHASE[phase] ?? 0) : 0;
	const steps = [
		{ label: 'Reading', sub: docs ? 'The documentation' : 'The code' },
		{ label: 'Mapping', sub: 'Features' },
		{ label: 'Writing', sub: 'Rules' },
		{ label: 'Ready', sub: 'To review' }
	];
	return { kind: 'steps', steps: steps.map((s, i) => ({ ...s, state: stateAt(i, now) })) };
}

export interface StartedFacts {
	readonly name: string;
	readonly product: string;
	/** A later run reading only what changed: the specification is being updated (brief case 6). */
	readonly delta: boolean;
	/** When the analysis it updates ran, for a later run. */
	readonly since?: string | null;
	/** The share read and the phase Lyriks is on, while it runs. */
	readonly progress: number | null;
	readonly phase: string | null;
	readonly docs: boolean;
}

/** A member started a run: the others hear it, with the share read while it runs. */
export function startedNotice(f: StartedFacts): ActivityNotice {
	const follow: NoticeAction = { label: 'Follow the progress', icon: 'go' };
	const progress = f.progress === null ? {} : { progress: f.progress };
	if (f.delta) {
		const since = f.since ? shortDate(f.since) : '';
		return {
			section: SECTION,
			level: 'info',
			title: 'The specification is being updated.',
			body: [
				plain(`Lyriks is reading what changed in the product since the last analysis${since ? ` on ${since}` : ''} and is bringing the specification up to date. You'll be notified when it is ready. `),
				strong(f.name),
				plain(' launched the update.')
			],
			line: shortLine(`What changed in ${f.product} is being analyzed.`),
			action: follow,
			visual: {
				kind: 'steps',
				steps: [
					{ label: 'Last analysis', sub: since || 'Earlier', state: 'done' },
					{ label: 'Update', sub: 'In progress', state: 'now' },
					{ label: 'Changes', sub: 'To review', state: 'todo' }
				]
			},
			...progress
		};
	}
	return {
		section: SECTION,
		level: 'info',
		title: 'The Reverse-Specification has started.',
		body: [plain("Lyriks is now reading the product. You'll be notified when the full specification is ready. "), strong(f.name), plain(' launched the process.')],
		line: shortLine(`${f.name} launched the analysis of ${f.product}.`),
		action: follow,
		visual: runSteps(f.phase, f.docs),
		...progress
	};
}

/** What Relaunch the analysis says once it copied the prompt that resumes the run, as the paused run's own copy says. */
export const RESUME_COPIED = 'Prompt copied: paste it in your LLM session to reconnect it and resume the analysis';

/**
 * The run's LLM went silent: the run stopped at its share, after what it wrote.
 * A later run names its share alone, since the specification already held what
 * an earlier run gathered. Relaunch the analysis copies `resume`, the prompt
 * that resumes the run, so nobody looks for it on the Reverse page (criterion 2012cc93).
 */
export function stoppedNotice(pct: number, figures: BuiltFigures | null, product: string, resume: string): ActivityNotice {
	const wrote = figures && figures.features > 0;
	const after: NoticeRun[] = wrote
		? [plain(', after '), strong(counted(figures.features, 'feature')), ...(figures.rules > 0 ? [plain(' and '), strong(counted(figures.rules, 'rule'))] : [])]
		: [];
	const kept = wrote ? [counted(figures.features, 'feature'), ...(figures.rules > 0 ? [counted(figures.rules, 'rule')] : [])].join(' · ') : 'What was read';
	return {
		section: SECTION,
		level: 'drift',
		title: 'The Reverse-Specification stopped unexpectedly.',
		body: [plain('The AI went silent and interrupted Lyriks at '), strong(`${pct}%`), ...after, plain('. What was analyzed is kept: relaunch the process to finish the specification.')],
		line: shortLine(`Stopped at ${pct}% on ${product}.`),
		action: { label: 'Relaunch the analysis', icon: 'relaunch', copies: { text: resume, said: RESUME_COPIED } },
		visual: { kind: 'gauge', pct, status: 'Stopped · AI silent', kept: `${kept} kept` }
	};
}

/** Every element is validated: the specification is the reference now (brief case 7). */
export function fullyValidatedNotice(by: NoticePerson, validators: readonly NoticePerson[], features: number, product: string): ActivityNotice {
	const line = [counted(validators.length, 'person', 'people'), ...(features > 0 ? [counted(features, 'feature')] : [])].join(' · ');
	return {
		section: 'Specification',
		level: 'certified',
		title: 'The specification is fully validated.',
		body: [plain('Every element of the specification is validated: it is now the reference for future evolutions. '), strong(by.name), plain(' validated it.')],
		line: shortLine(`The specification of ${product} is the reference now.`),
		action: { label: 'Open the specification', icon: 'go' },
		visual: { kind: 'stamp', word: 'Validated', line: validators.length ? `Validated by ${line}` : line, people: validators }
	};
}

/** A person rejected an element: it needs another look before it can be validated (brief case 11). */
export function rejectedNotice(by: NoticePerson, element: string, reason: string | null): ActivityNotice {
	return {
		section: 'Specification',
		level: 'drift',
		title: 'A validation was rejected.',
		body: [strong(quoted(element)), plain(' was rejected: it needs another look before it can be validated. '), strong(by.name), plain(' rejected it.')],
		line: shortLine(`${by.name} rejected ${quoted(element)}.`),
		action: { label: 'See the reason', icon: 'go' },
		visual: { kind: 'people', rows: [{ person: by, sub: element, badge: 'Rejected' }], ...(reason ? { quote: reason } : {}) }
	};
}

/** A person reminded the reader that an element waits for them (brief case 13). */
export function reminderNotice(by: NoticePerson, reader: NoticePerson, element: string): ActivityNotice {
	return {
		section: 'Specification',
		level: 'action',
		title: 'Your review is still pending.',
		body: [strong(quoted(element)), plain(' waits for your validation in the Specification 360°. '), strong(by.name), plain(' reminded you.')],
		line: shortLine(`${quoted(element)} waits for your validation.`),
		action: { label: 'Start reviewing', icon: 'go' },
		visual: {
			kind: 'people',
			rows: [
				{ person: reader, sub: `Validator · ${element}`, badge: 'Waiting' },
				{ person: by, sub: 'Reminded you', badge: 'Asked' }
			]
		}
	};
}

/**
 * An element the reader validated was changed in the draft: their validation was dropped and they are asked to
 * validate it again, or told it was removed (criterion e6029af6).
 */
export function revalidationNotice(by: NoticePerson, reader: NoticePerson, element: string, removed: boolean): ActivityNotice {
	return {
		section: 'Specification',
		level: 'action',
		title: removed ? 'An element you validated was removed.' : 'Validate it again.',
		body: removed
			? [strong(by.name), plain(' removed '), strong(quoted(element)), plain(', which you had validated.')]
			: [strong(by.name), plain(' changed '), strong(quoted(element)), plain(' you had validated: validate it again. The version you validated reads beside the proposed one.')],
		line: shortLine(removed ? `${by.name} removed ${quoted(element)}.` : `${quoted(element)} changed: validate it again.`),
		action: { label: removed ? 'See the specification' : 'Compare and validate', icon: 'go' },
		visual: { kind: 'people', rows: [{ person: reader, sub: `Validator · ${element}`, badge: removed ? 'Removed' : 'Waiting' }, { person: by, sub: removed ? 'Removed it' : 'Changed it', badge: 'Changed' }] }
	};
}

/** A direct question review request, sent only to the selected colleague. */
export function validationRequestNotice(by: NoticePerson, reader: NoticePerson, element: string): ActivityNotice {
	return {
		section: 'Specification',
		level: 'action',
		title: 'Your validation was requested.',
		body: [strong(by.name), plain(' asked you to validate '), strong(quoted(element)), plain(' in the Specification 360°.')],
		line: shortLine(`${quoted(element)} waits for your validation.`),
		action: { label: 'Review this question', icon: 'go' },
		visual: { kind: 'people', rows: [{ person: reader, sub: `Validator · ${element}`, badge: 'Waiting' }, { person: by, sub: 'Asked you', badge: 'Asked' }] }
	};
}
