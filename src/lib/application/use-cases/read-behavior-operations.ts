import type { UnspaghettitAdvisorPort } from '$application/ports';

/** Read the operation vocabulary from the running engine, keeping it version-aligned. */
export class ReadBehaviorOperationsUseCase {
	constructor(
		private readonly advisor: Pick<
			UnspaghettitAdvisorPort,
			'getOperationsReference' | 'describeOperations'
		>
	) {}

	execute(kind?: string): Promise<string | Readonly<Record<string, unknown>> | null> {
		return kind === undefined
			? this.advisor.getOperationsReference()
			: this.advisor.describeOperations(kind);
	}
}
