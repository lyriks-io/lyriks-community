import { readdirSync, readFileSync } from 'node:fs';

/** Stop solver children before their owning engine is closed (Linux appliance). */
export function stopProcessDescendants(parentPid: number | null | undefined, graceMs = 1_000): void {
	if (process.platform !== 'linux' || !parentPid || parentPid === process.pid) return;
	const descendants = new Map<number, string>();
	const seen = new Set([parentPid]);
	const pending = [parentPid];
	while (pending.length) {
		const parent = pending.pop()!;
		let tasks: string[];
		try { tasks = readdirSync(`/proc/${parent}/task`); }
		catch { continue; }
		for (const task of tasks) {
			let children: string;
			try { children = readFileSync(`/proc/${parent}/task/${task}/children`, 'utf8'); }
			catch { continue; }
			for (const value of children.trim().split(/\s+/)) {
				const pid = Number(value);
				if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid || seen.has(pid)) continue;
				seen.add(pid);
				const identity = processIdentity(pid);
				if (identity === null) continue;
				descendants.set(pid, identity);
				pending.push(pid);
			}
		}
	}
	if (!descendants.size) return;
	const signal = (name: NodeJS.Signals) => {
		for (const [pid, identity] of [...descendants].reverse()) {
			// An exited child may already have given its PID to another process.
			if (processIdentity(pid) !== identity) continue;
			try { process.kill(pid, name); } catch { /* Already exited or inaccessible. */ }
		}
	};
	signal('SIGTERM');
	setTimeout(() => signal('SIGKILL'), graceMs).unref();
}

/** Kernel start ticks distinguish a process from a later reuse of its PID. */
function processIdentity(pid: number): string | null {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
		return stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/)[19] ?? null;
	} catch { return null; }
}
