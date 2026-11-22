import type { DraftLeaf } from './draft';
import { ELEMENT_PATH_PREFIX } from './spec-actions';

/**
 * A feature's description, as a draft would write it, is an item of the
 * Specification of its own (criterion e384d594): validated on the synthetic
 * field `element.description` of the touched feature, whose value is the
 * description the landing writes, so a later edit sets it waiting again.
 */
export const DESCRIPTION_PATH = `${ELEMENT_PATH_PREFIX}description`;
export const isDescriptionPath = (path: string): boolean => path === DESCRIPTION_PATH;

type Describing = Pick<DraftLeaf, 'id' | 'kind' | 'baseLeafId' | 'materialisedAs' | 'description' | 'descriptionPatch' | 'descriptionAppend'>;

/**
 * The draft that writes the description of the touched feature `leafId`: an
 * amendment of it that sends a description, a patch or an appended text, or an
 * addition (named by its own id) that gives one. Null when no draft does: the
 * feature then brings no Description item.
 */
export function describingDraft<D extends Describing>(drafts: readonly D[], leafId: string): D | null {
	const draft = drafts.find((d) => d.materialisedAs === null && ((d.kind === 'amend' && d.baseLeafId === leafId) || (d.kind === 'add' && d.id === leafId)));
	if (!draft) return null;
	const writes = draft.description.trim() !== '' || (draft.kind === 'amend' && ((draft.descriptionPatch?.length ?? 0) > 0 || (draft.descriptionAppend ?? '').trim() !== ''));
	return writes ? draft : null;
}

