import type { AppServices } from '$composition/container.server';
import { editedFields, type ElementEdit } from '$application/spec360/edits';
import type { ElementText, RevalidationInput } from '$domain/retrospec';
import { readHandEditBefore } from './spec360-hand-edits.server';
import { readSpecElements } from './spec-elements.server';

/**
 * What an element of a draft read before an edit, so the version its people
 * validated is kept beside the one proposed (criterion e6029af6 of
 * feat-lyriks-copy-a52881-47). Read on the server, from the sections, before
 * the write: the page never says what the validated version was.
 */

const EMPTY: ElementText = { text: '', desc: '' };

/**
 * What the element reads now, its name and its description where it has them, else its title. A read that fails
 * keeps the edit going: the validated version then reads empty rather than the change being refused.
 */
export function readElementText(services: AppServices, projectId: string, anchor: string): Promise<ElementText> {
	return readText(services, projectId, anchor).catch(() => EMPTY);
}

async function readText(services: AppServices, projectId: string, anchor: string): Promise<ElementText> {
	const [kind, id] = anchor.split(':');
	if (kind === 'feature' || kind === 'action') return (await readHandEditBefore(services, projectId, anchor)).before;
	if (kind === 'core') {
		const core = (await services.loadFeaturesDraft.execute(projectId)).cores.find((c) => c.id === id);
		if (core) return { text: core.name, desc: core.description ?? '' };
	}
	if (kind === 'role') {
		const role = (await services.loadUsersDraft.execute(projectId)).roles.find((r) => r.id === id);
		if (role) return { text: role.name, desc: role.description ?? '' };
	}
	if (kind === 'product') return { text: (await services.loadFoundationDraft.loadIdentity(projectId)).brief ?? '', desc: '' };
	const element = (await readSpecElements(services, projectId).catch(() => [])).find((e) => e.id === anchor);
	return element ? { text: element.title, desc: '' } : EMPTY;
}

/** An element's own text edited: what it read before and what the edit makes of it. */
export function editedRevalidation(before: ElementText, edit: ElementEdit): RevalidationInput {
	const after = editedFields(before, edit);
	return { change: 'edited', before, after: { text: after.text, desc: after.desc } };
}
