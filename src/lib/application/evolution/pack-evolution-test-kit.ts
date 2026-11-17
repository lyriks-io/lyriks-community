import type { ArchiveCodecPort } from '$application/ports/archive-codec';
import { testKitFiles, type TestKitInput } from '$domain/evolution';

/**
 * The tests of a frozen version, packed as one archive to download
 * (ac-evo-impl-test-kit). The files come from the domain; the container they
 * travel in is the composition root's choice.
 */
export class PackEvolutionTestKitUseCase {
	constructor(private readonly archive: ArchiveCodecPort) {}

	execute(input: TestKitInput): { bytes: Uint8Array; fileCount: number } {
		const encoder = new TextEncoder();
		const files = testKitFiles(input);
		const bytes = this.archive.encode(
			Object.entries(files).map(([path, text]) => ({ path, bytes: encoder.encode(text) }))
		);
		return { bytes, fileCount: Object.keys(files).length };
	}
}
