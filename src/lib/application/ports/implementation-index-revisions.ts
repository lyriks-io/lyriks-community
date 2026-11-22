/**
 * The revision of each project's implementation index, and when each unit of
 * it (an action, a surface, a criterion record) was last written (feat-100,
 * criteria fbe61ab1 and 93abb7df).
 *
 * The platform stores no copy of any index: what it keeps is the count of the
 * writes that landed, so two checkouts writing the same project can be told
 * apart from one writing after the other.
 */
export interface ImplementationIndexRevisionsPort {
	/** The current revision of the project's index (0 before any write). */
	current(projectId: string): Promise<number>;

	/**
	 * Run `body` while no other index write of this project runs. It receives
	 * the current revision and, for each of `units`, the revision of its last
	 * write (absent when never written). When it answers `written` (the units it
	 * wrote), the revision grows by one and those units are recorded at it; when
	 * it answers null, nothing changes. Answers the revision after the call.
	 */
	serialize<T>(
		projectId: string,
		units: readonly string[],
		body: (now: {
			readonly revision: number;
			readonly lastWritten: ReadonlyMap<string, number>;
		}) => Promise<{ readonly written: readonly string[] | null; readonly value: T }>
	): Promise<{ readonly revision: number; readonly value: T }>;
}
