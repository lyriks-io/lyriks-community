import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Said to whoever tries to write the baselines: Lyriks records them, nobody writes them (criterion 20f33346). */
const BASELINES_NOT_WRITTEN =
	'The baselines are recorded by Lyriks at each validation, code change kept, evolution closed and Reverse-Specification published; they are never written.';

/**
 * The write door of the baselines section, kept so that set_section and
 * patch_section on it answer why instead of a bare 404.
 */
export const PUT: RequestHandler = async () => error(405, BASELINES_NOT_WRITTEN);
