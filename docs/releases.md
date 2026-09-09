# Releases

## Versioning

The version is the `version` field of `package.json`, semantic, and it is
the version of the source tree this repository is exported from: Lyriks tags
both at each release. A tag `vX.Y.Z` on `main` publishes the three images
`ghcr.io/lyriks-io/lyriks-platform-community`, `lyriks-mcp-community` and
`lyriks-behavior-community` at `vX.Y.Z` through the
`publish-image` workflow. A successful main-branch run also updates `latest`.
The workflow runs the test gate, builds all three images as OCI archives, and
scans their actual runtime contents before publishing any component. Fixable
HIGH and CRITICAL vulnerabilities block publication. Complete JSON reports,
including findings without a fix, remain available as workflow artifacts for
maintainer review; a passing gate does not mean an image has no advisories.
The publisher copies those same archives, preserving their digests, SBOM and
provenance instead of rebuilding them. The behavior viewer uses the exact
engine version installed from the frozen workspace lockfile.
This repository is the only builder of those images: what a Community
appliance runs is what you can read here.

## Changelog

[CHANGELOG.md](../CHANGELOG.md) follows Keep a Changelog. Every pull request
that changes behaviour adds a line under `Unreleased`; cutting a version moves
that section under the new heading with the date.

## The appliance channel

Lyriks promotes released images into `registry.lyriks.io/community` under
their version and moves the `stable` alias only once every component of a
release has landed; the appliance kit is published beside them as
`appliance-kit`. An install tracking `stable` picks the release up with
`./lyriks update`, which takes a backup first and keeps the previous release
as `:rollback` locally.

## Validate a candidate without publishing

Run `publish-image` with `workflow_dispatch` on the candidate branch. Leave
`publish` at its default `false`: tests, all three builds and scans run and
retain their reports and OCI artifacts, while the registry publication job
is skipped. Explicitly selecting `publish: true` enables publication for a
manual run. Pushes to main and version tags retain their automatic publishing
behavior.

## Before making a release public

- Review the README and the new changelog entries, then select the release
  version consistently in the source packages and Compose defaults.
- Push the prepared commits and require successful CI and image scan jobs for
  the exact release commit. Review unresolved image advisories as well.
- Publish a version tag only after the candidate is accepted. Ensure all three
  GHCR images are publicly pullable without registry credentials before the
  public announcement; do not move the appliance `stable` channel early.
- Test the public installation path, including actual Community key delivery
  and first-operator activation. An internal test authority does not validate
  the public email and licensing services.
- Protect `main` with required checks, enable secret protection, and verify
  that the reporting mailbox in `SECURITY.md` is monitored.

The currently published image architecture is `linux/amd64`. Native arm64
images and an Apple Silicon installation have not been validated by this
release workflow; do not describe them as tested platforms.
