import type { ProjectTabs } from '$domain/portfolio/project-tabs';

/**
 * What a section of the navigation says when it has nothing to show yet
 * (criterion 6213ef4c of feat-feedback-docs): the navigation always offers
 * its five entries (criterion b2f17eef), so a section opened too early says
 * why it is empty and offers the one step that fills it. Pure: the words are
 * tested without a browser.
 */
export type WaitingSection = 'knowledge' | 'notices' | 'changes' | 'mismatch';

export interface SectionWait {
	/** Why the section is empty, then where the knowledge stands when that matters. */
	readonly lines: readonly string[];
	/** The one step that fills it. */
	readonly step: { readonly label: string; readonly href: string };
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/** No specification yet: started by a Reverse-Specification still under way, or not started at all. */
function noKnowledge(tabs: ProjectTabs, projectId: string): SectionWait {
	// `reversed`: a run was started; without the specification open, it is still under way.
	if (tabs.reversed)
		return {
			lines: ['No knowledge yet. The Reverse-Specification under way writes it; it opens here once its analysis is ready to review.'],
			step: { label: 'Open the run', href: `${base(projectId)}/retrospec` }
		};
	return {
		lines: ["No knowledge yet. A Reverse-Specification writes it from the product's code, or the team describes the product itself."],
		// The project's own entry asks how to start a project with nothing yet, and opens the run of one that has one.
		step: { label: 'Get started', href: base(projectId) }
	};
}

/** Changes and Mismatch need a validated specification: what they are for, then where the knowledge stands. */
function needsValidated(lead: string, tabs: ProjectTabs, projectId: string): SectionWait {
	if (!tabs.tabs.includes('spec')) return { lines: [lead, 'There is no knowledge yet.'], step: noKnowledge(tabs, projectId).step };
	const p = tabs.specProgress;
	const standing = p && p.total > 0 ? `${p.validated} of ${p.total} ${p.total === 1 ? 'element' : 'elements'} validated so far.` : 'Its validation has not started yet.';
	return { lines: [lead, standing], step: { label: 'Open Knowledge', href: `${base(projectId)}/spec` } };
}

/** Null when the section has something to show, or when what the project holds is not known (the page then shows as is). */
export function sectionWait(section: WaitingSection, tabs: ProjectTabs | null, projectId: string): SectionWait | null {
	if (!tabs) return null;
	const knowledge = tabs.tabs.includes('spec');
	switch (section) {
		case 'knowledge':
		case 'notices':
			return knowledge ? null : noKnowledge(tabs, projectId);
		case 'changes':
			// A project that already has evolutions always opens its Changes, whatever its knowledge.
			return tabs.tabs.includes('evolutions') ? null : needsValidated('A change starts from the validated knowledge of the product.', tabs, projectId);
		case 'mismatch':
			return tabs.specBadge === 'validated' || tabs.laterRunOpen ? null : needsValidated('Mismatch compares the code with the validated knowledge of the product.', tabs, projectId);
	}
}
