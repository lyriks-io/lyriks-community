// Build-context guard for the bundled skill catalog.
//
// The server inlines `.claude/skills/*/SKILL.md` at `pnpm build` time
// (bundled-skill-catalog.server.ts), and `.dockerignore` excludes `.claude`
// with one `!.claude/skills/<id>` re-include per published skill. Any id in
// PUBLISHED_SKILL_IDS whose SKILL.md is absent from the tree being built is
// skipped by buildSkillCatalog, so the image silently ships a short catalog;
// that is exactly how lyriks-retrospec and lyriks-delivery went missing from
// the appliance. This script fails the DOCKER IMAGE BUILD instead (it runs
// from the Dockerfile between `COPY . .` and `pnpm build`); the running
// server itself never throws for this, a throw there would crash-loop
// customer appliances.
//
//   node scripts/check-skill-catalog.mjs                       # check this repo tree
//   node scripts/check-skill-catalog.mjs --skills-root <dir>   # check another skills dir (tests)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogModulePath = join(
	repoRoot,
	'src/lib/infrastructure/skills/skill-catalog-build.ts'
);

// PUBLISHED_SKILL_IDS lives in a TS module (the single source of truth) that
// plain node cannot import, so parse the literal array out of the source. Any
// parse failure is fatal: a guard that finds zero ids guards nothing.
const source = readFileSync(catalogModulePath, 'utf8');
const arrayMatch = /PUBLISHED_SKILL_IDS\s*=\s*\[([\s\S]*?)\]/.exec(source);
const ids = arrayMatch
	? [...arrayMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2])
	: [];
if (ids.length === 0) {
	console.error(
		`[check-skill-catalog] could not parse PUBLISHED_SKILL_IDS out of ${catalogModulePath}; fix this script before trusting the build.`
	);
	process.exit(1);
}

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--skills-root');
const skillsRoot =
	rootFlag === -1 ? join(repoRoot, '.claude', 'skills') : resolve(argv[rootFlag + 1] ?? '');

const missing = ids.filter((id) => !existsSync(join(skillsRoot, id, 'SKILL.md')));
if (missing.length > 0) {
	console.error('[check-skill-catalog] published skills missing from the build context:');
	for (const id of missing) {
		console.error(`  - ${join(skillsRoot, id, 'SKILL.md')}`);
	}
	console.error(
		'[check-skill-catalog] every id in PUBLISHED_SKILL_IDS needs its SKILL.md in the build context: add a `!.claude/skills/<id>` re-include to .dockerignore (and a .gitignore exception), or the image ships a short catalog.'
	);
	process.exit(1);
}
console.log(
	`[check-skill-catalog] all ${ids.length} published skills present under ${skillsRoot}.`
);
