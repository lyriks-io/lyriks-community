/**
 * The three ways Lyriks learns an existing product, in the words and tags their
 * tiles show (criterion 1ba1817e): what happens, and the kinds of source each
 * reads. Code and documents are picked together; Manually is picked alone.
 * Pure, so the choice is tested without a browser.
 */
export type LearnKey = 'code' | 'docs' | 'manual';
export type LearnPicks = { readonly code: boolean; readonly docs: boolean; readonly manual: boolean };

export interface LearnSource {
	readonly key: LearnKey;
	readonly name: string;
	readonly line: string;
	readonly tags: readonly string[];
	/** The path of its line icon, on a 24 by 24 grid. */
	readonly icon: string;
	readonly recommended: boolean;
}

export const LEARN_SOURCES: readonly LearnSource[] = [
	{
		key: 'code',
		name: 'From a codebase',
		line: 'Your LLM reads the repository and Lyriks rebuilds the whole specification.',
		tags: ['Code', 'Tests', 'Infrastructure'],
		icon: 'M8 6l-6 6 6 6M16 6l6 6-6 6',
		recommended: true
	},
	{
		key: 'docs',
		name: 'From anything else',
		line: 'Documents, even outdated, read by your LLM.',
		tags: ['Word', 'PDF', 'Notion', 'Confluence', 'Tickets', 'Mock-ups'],
		icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
		recommended: false
	},
	{
		key: 'manual',
		name: 'Manually',
		line: 'You describe the product section by section, with your LLM.',
		tags: ['No source'],
		icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
		recommended: false
	}
];

/** The picks once a tile is clicked: code and documents toggle together, Manually toggles alone and clears the others. */
export function pickLearnSource(from: LearnPicks, key: LearnKey): LearnPicks {
	if (key === 'manual') return { code: false, docs: false, manual: !from.manual };
	return { code: key === 'code' ? !from.code : from.code, docs: key === 'docs' ? !from.docs : from.docs, manual: false };
}
