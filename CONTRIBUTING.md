# Contributing to Lyriks Community

Thank you for considering a contribution. This page is short on purpose: the
rules that matter are few, and each one exists because of something that went
wrong once.

## Before you start

- Open an issue for anything larger than a fix, so the design is agreed before
  the code exists.
- Read [AGENTS.md](AGENTS.md). It is written for AI agents and applies to
  people just the same: hexagonal layering, ports at the boundaries, one
  responsibility per module, evidence over assumption.
- The Community tree carries no Enterprise construct. `pnpm test:oss-boundary`
  enforces it and a pull request that fails it will not be merged.

## Working on a change

```bash
pnpm install
pnpm dev:community
pnpm check && pnpm test && pnpm test:oss-boundary
```

Commit messages follow Conventional Commits (`feat(scope): ...`,
`fix(scope): ...`, `docs(scope): ...`). The subject says what changed for the
reader of the history, not which file was touched.

## Sign-off and licence of contributions

Every commit carries a Developer Certificate of Origin sign-off
(`git commit -s`), which states that you wrote the change or have the right to
submit it under this repository's licence.

Lyriks also ships an Enterprise edition built from this tree plus a private
overlay. So that a contribution can be included there as well, contributors
sign the [Contributor License Agreement](CLA.md) once, with their first pull
request. A maintainer will ask for it on the pull request.

## Reviews

A maintainer reviews every pull request. Expect questions about naming,
placement in the layers, and tests; expect a request for a test when a
behaviour changes. Small, focused pull requests get merged faster than large
ones.
