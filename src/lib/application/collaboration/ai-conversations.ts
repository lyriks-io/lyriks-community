import { parseAiConversations, type AiConversationsDocument } from '$domain/ai-conversations';
import type { SectionDocumentStorePort } from '../ports/section-documents';

/** How many times a change is replayed on a newer document before giving up. */
const ATTEMPTS = 4;

/**
 * The private conversations of Ask my AI (surface cf20b92c), kept in the
 * section document store under an internal key no MCP section tool reads, so
 * nobody but their person reaches them (criterion 13235e8e). A change is
 * written with the store's optimistic revision and replayed on a newer
 * document when someone else wrote in between; the save publishes the section
 * change, which refreshes the open Ask my AI pages.
 */
export class AiConversationsUseCase {
	constructor(
		private readonly store: SectionDocumentStorePort,
		private readonly section: string
	) {}

	async load(projectId: string): Promise<AiConversationsDocument> {
		return parseAiConversations(await this.store.load(projectId, this.section));
	}

	/**
	 * Apply `change` to the current document and save what it returns; a null
	 * document saves nothing. Null when others kept writing at the same moment.
	 */
	async change<R>(
		projectId: string,
		origin: string | null,
		change: (document: AiConversationsDocument) => { readonly document: AiConversationsDocument | null; readonly result: R }
	): Promise<R | null> {
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			const revision = await this.store.currentRevision(projectId, this.section);
			const current = parseAiConversations(await this.store.load(projectId, this.section));
			const { document, result } = change(current);
			if (!document) return result;
			if ((await this.store.save(projectId, this.section, document, revision, origin)) !== null) return result;
		}
		return null;
	}
}
