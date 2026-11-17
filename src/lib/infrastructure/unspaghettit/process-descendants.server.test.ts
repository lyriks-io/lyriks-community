import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stopProcessDescendants } from './process-descendants.server';

describe.skipIf(process.platform !== 'linux')('engine solver cleanup', () => {
	it('terminates a real solver child that ignores SIGTERM without killing its owner', async () => {
		const owner = spawn('/bin/sh', ['-c',
			'trap "" TERM; sleep 30 & child=$!; echo "$child"; read ack; wait "$child"'
		], { stdio: ['pipe', 'pipe', 'inherit'] });
		const closed = once(owner, 'close');
		let childPid: number | undefined;
		try {
			const [line] = await once(owner.stdout!, 'data', { signal: AbortSignal.timeout(2_000) });
			childPid = Number(String(line).trim());
			expect(childPid).toBeGreaterThan(0);
			stopProcessDescendants(owner.pid, 20);
			await expect.poll(() => {
				try {
					const stat = readFileSync(`/proc/${childPid}/stat`, 'utf8');
					return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z') ? false : true;
				} catch { return false; }
			}).toBe(false);
			expect(owner.exitCode).toBeNull();
		} finally {
			if (childPid) { try { process.kill(childPid, 'SIGKILL'); } catch { /* Exited. */ } }
			owner.stdin!.end('done\n');
			await closed;
		}
	});
});
