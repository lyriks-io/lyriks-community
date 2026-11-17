import { counted, plain, quoted, quotedWords, shortDate, shortLine, strong, type ActivityNotice, type NoticePerson, type NoticeRun } from './notice';

/**
 * What an evolution's notifications say (criterion 4bf1182d of
 * feat-feedback-docs), each in the brief's feed order: fact, consequence, then
 * the person; and what its conversations say when they name or answer the
 * reader (criterion b7f648d8). Pure: the facts come read off the request.
 */

export interface EvolutionRef {
	/** "EVO-042". */
	readonly key: string;
	readonly title: string;
}

const named = (e: EvolutionRef) => quoted(e.title, e.key);
const by = (who: NoticePerson, verb: string): NoticeRun[] => [strong(who.name), plain(` ${verb}.`)];

export function createdNotice(e: EvolutionRef, author: NoticePerson, facts: { readonly stage: string; readonly features: number; readonly impactRan: boolean }): ActivityNotice {
	return {
		section: 'Evolution',
		level: 'info',
		title: 'A new evolution was created.',
		body: [
			strong(named(e)),
			plain(` (${e.key}) is open in ${facts.stage}. ${facts.impactRan ? 'Its impact report is ready.' : 'No impact report has been run yet.'} `),
			...by(author, 'opened it')
		],
		line: shortLine(`${named(e)} was added by ${author.name}.`),
		action: { label: 'Open the evolution', icon: 'go' },
		visual: {
			kind: 'sheet',
			kicker: e.key,
			title: e.title.trim() || 'Untitled',
			badge: facts.stage,
			fields: [
				{ label: 'Features', value: facts.features > 0 ? String(facts.features) : 'Not mapped yet' },
				{ label: 'Impact report', value: facts.impactRan ? 'Ready' : 'Not run' },
				{ label: 'Opened by', value: author.name }
			]
		}
	};
}

export function impactReadyNotice(e: EvolutionRef, features: readonly string[], featureCount: number, elements: number): ActivityNotice {
	const shown = features.slice(0, 8);
	return {
		section: 'Evolution',
		level: 'info',
		title: 'The impact report is ready.',
		body: [
			plain(`Lyriks simulated ${named(e)} against the current specification: it touches `),
			strong(counted(featureCount, 'feature')),
			plain(' and moves '),
			strong(counted(elements, 'element')),
			plain('.')
		],
		line: shortLine(`${named(e)} touches ${counted(featureCount, 'feature')} and ${counted(elements, 'element')}.`),
		action: { label: 'Read the report', icon: 'go' },
		visual: {
			kind: 'chips',
			chips: shown.map((label) => ({ label, strong: true })),
			more: Math.max(0, features.length - shown.length),
			figures: [
				{ n: String(featureCount), label: featureCount === 1 ? 'feature' : 'features' },
				{ n: String(elements), label: elements === 1 ? 'element' : 'elements' }
			]
		}
	};
}

export function breakingNotice(e: EvolutionRef, counts: { readonly blocking: number; readonly major: number; readonly minor: number }, first: string): ActivityNotice {
	return {
		section: 'Evolution',
		level: 'drift',
		title: 'The simulation found breaking impacts.',
		body: [
			plain(`Lyriks checked ${named(e)} against the current specification: `),
			strong(counted(counts.blocking, 'blocking contradiction')),
			plain(` would hold it at the gate${first.trim() ? `, starting with ${quoted(quotedWords(first, 90).replace(/[.\s]+$/, ''))}` : ''}.`)
		],
		line: shortLine(`${named(e)} has ${counted(counts.blocking, 'blocking contradiction')}.`),
		action: { label: 'See the impacts', icon: 'go' },
		visual: {
			kind: 'severity',
			rows: [
				{ n: counts.blocking, label: 'blocking', tone: 'block' },
				{ n: counts.major, label: 'major', tone: 'major' },
				{ n: counts.minor, label: 'minor', tone: 'minor' }
			]
		}
	};
}

export function approvedNotice(e: EvolutionRef, who: NoticePerson, version: number, signers: readonly NoticePerson[]): ActivityNotice {
	return {
		section: 'Evolution',
		level: 'info',
		title: 'An evolution was approved.',
		body: [
			strong(named(e)),
			plain(' crossed into Build: its specification is frozen at '),
			strong(`version ${version}`),
			plain(' and implementation can start. '),
			...by(who, 'approved it')
		],
		line: shortLine(`${named(e)} is ready for implementation.`),
		action: { label: 'See the plan', icon: 'go' },
		visual: { kind: 'stamp', word: 'Approved', line: `Version ${version} · ready to build`, people: signers }
	};
}

/** Commits per day over the 14 days ending on the day of the first one, oldest first. */
export const HISTOGRAM_DAYS = 14;

export function buildStartedNotice(e: EvolutionRef, firstAt: string, days: readonly number[]): ActivityNotice {
	return {
		section: 'Implementation',
		level: 'info',
		title: 'Implementation has started.',
		body: [plain(`The first commits linked to ${named(e)} reached the repository. Lyriks follows each rule as it gets implemented.`)],
		line: shortLine(`Work began on ${named(e)}.`),
		action: { label: 'Follow the progress', icon: 'go' },
		visual: { kind: 'histogram', label: `Commits · last ${HISTOGRAM_DAYS} days`, status: `First commits ${shortDate(firstAt)}`, days }
	};
}

export function amendedNotice(e: EvolutionRef, who: NoticePerson, version: number, frozenAt: string | null, at: string): ActivityNotice {
	return {
		section: 'Implementation',
		level: 'drift',
		title: 'The specification changed during implementation.',
		body: [
			plain(`The specification of ${named(e)} was amended after `),
			strong(`version ${version}`),
			plain(' froze: the code built so far follows that version. '),
			...by(who, 'amended it')
		],
		line: shortLine(`The specification of ${named(e)} was amended during its build.`),
		action: { label: "See what's outdated", icon: 'go' },
		visual: {
			kind: 'chain',
			nodes: [
				{ kicker: `Version ${version}`, title: frozenAt ? `Frozen ${shortDate(frozenAt)}` : 'Frozen', state: 'past' },
				{ kicker: 'Amended', title: shortDate(at), state: 'now' },
				{ kicker: 'Next', title: 'Freeze again', state: 'next' }
			]
		}
	};
}

export function cancelledNotice(e: EvolutionRef, who: NoticePerson, reason: string): ActivityNotice {
	return {
		section: 'Evolution',
		level: 'info',
		title: 'An evolution was cancelled.',
		body: [strong(named(e)), plain(' was cancelled. What it wrote into the specification stays. '), ...by(who, 'cancelled it')],
		line: shortLine(`${named(e)} was cancelled by ${who.name}.`),
		action: { label: 'See why', icon: 'go' },
		visual: { kind: 'people', rows: [{ person: who, sub: `${e.key} · ${e.title.trim() || 'Untitled'}`, badge: 'Cancelled' }], ...(reason.trim() ? { quote: reason.trim() } : {}) }
	};
}

export function certifiedNotice(e: EvolutionRef, who: NoticePerson, features: number, people: readonly NoticePerson[]): ActivityNotice {
	return {
		section: 'Specification',
		level: 'certified',
		title: 'The evolution is now part of the specification.',
		body: [
			strong(named(e)),
			plain(' is live and certified: the specification now holds what it changed'),
			...(features > 0 ? [plain(', across '), strong(counted(features, 'feature'))] : []),
			plain('. '),
			...by(who, 'declared it live')
		],
		line: shortLine(`${named(e)} was merged into the specification.`),
		action: { label: 'See the updated specification', icon: 'go' },
		visual: { kind: 'stamp', word: 'Certified', line: features > 0 ? `${counted(features, 'feature')} in the specification` : 'In the specification', people }
	};
}

/** Someone named the reader in a conversation on a field of the evolution (brief case 16). */
export function mentionNotice(e: EvolutionRef, place: string, who: NoticePerson, message: string): ActivityNotice {
	return {
		section: 'Discussion',
		level: 'action',
		title: 'You were mentioned in a discussion.',
		body: [plain(`You're asked for your input on ${quoted(place, 'a field')} of ${e.key}. `), ...by(who, 'mentioned you')],
		line: shortLine(`${who.name} needs your input on ${e.key}.`),
		action: { label: 'Read the comment', icon: 'go' },
		visual: { kind: 'thread', title: `${e.key} · ${place}`, messages: [{ person: who, text: quotedWords(message) }] }
	};
}

/** Someone answered the reader in a conversation on a field of the evolution (brief case 15). */
export function replyNotice(e: EvolutionRef, place: string, who: NoticePerson, message: string, answered: { readonly person: NoticePerson; readonly text: string }): ActivityNotice {
	return {
		section: 'Discussion',
		level: 'info',
		title: 'New reply in your discussion.',
		body: [plain(`There's a new reply in your discussion on ${quoted(place, 'a field')} of ${e.key}. `), ...by(who, 'replied')],
		line: shortLine(`${who.name} replied about ${e.key}.`),
		action: { label: 'Read the reply', icon: 'go' },
		visual: { kind: 'thread', title: `${e.key} · ${place}`, messages: [{ ...answered, text: quotedWords(answered.text) }, { person: who, text: quotedWords(message) }] }
	};
}
