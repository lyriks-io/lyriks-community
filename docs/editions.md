# Editions

## Community

One operator account, held by the platform. The whole specification
workspace: foundation, users and permissions, features and behaviour, journeys
and screens with the Experience simulator, rules and edge cases, data,
architecture, coherence, roadmap and delivery. The behaviour engine and every
score. The MCP gateway for AI clients. Offline, self-hosted, PostgreSQL only.

The Community licence key is issued to an email address on
<https://get.lyriks.io>. Activation is verified locally.

## Enterprise

Everything above, plus what a team needs: workspaces, members, invitations,
roles and per-project grants, the `lyriks-back` companion API that carries
them, SSO, and the formal DPO coherence engine that turns the heuristic
verdict into a machine-checked one. Enterprise is a commercial edition.

## Where the seam is

Enterprise is built from this repository plus a private overlay. What the
overlay adds, and how it does it, lives in the overlay; this tree carries the
extension points it fills and nothing else, and `pnpm test:oss-boundary` fails
the build if that ever changes. Nobody needs the overlay to use Community fully.

## Moving between editions

An install keeps its data across editions. The appliance kit carries the
operator account across when the edition changes: the operator becomes the
first workspace owner on the way up, and the first workspace owner becomes the
operator on the way down. Projects created under Community are assigned to a
workspace by an administrator after an upgrade.
