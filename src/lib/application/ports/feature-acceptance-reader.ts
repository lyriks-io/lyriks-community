/**
 * The acceptance criteria the MODEL holds, per feature id, whoever authored
 * them: the ones the Features panel projected under its reserved prefix and the
 * ones an AI client wrote through the MCP.
 *
 * A reader, never a writer. It exists so a document that PRINTS criteria prints
 * the same list the product counts, instead of the Features residue alone.
 */
export interface FeatureAcceptanceReaderPort {
	/**
	 * Criterion titles per feature id. A feature absent from the map has no model
	 * record yet, and the caller falls back to the features draft; a feature
	 * present with an empty list genuinely holds none.
	 */
	byFeature(projectId: string): Promise<Readonly<Record<string, readonly string[]>>>;
}
