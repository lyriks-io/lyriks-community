# Editions

Lyriks is offered in four plans, in the words of the Plans entry of the app's
account menu. Their prices are on <https://lyriks.io/pricing>.

## Community Edition

Free: discover Lyriks on one project. It holds 1 active project (as many
inactive ones as you want), 1 user (the operator account, held by the
platform), Reverse (the reverse specification of a product) and Knowledge
(its knowledge base). The behaviour engine and every score come with it, and
the MCP gateway for AI clients. Offline, self-hosted, PostgreSQL only.

Community does not open Changes (evolutions, impact simulation and
verification) nor a second active project: Solo Builder opens them. Sharing
the project with a team opens with Team, and proving a rule for every value
with Enterprise. Each locked capability names the plan that opens it, on the
page and to an AI client alike.

The Community licence key is issued to an email address on
<https://get.lyriks.io>. Activation is verified locally.

## Solo Builder, Team and Enterprise

The paid plans, all commercial and self-hosted:

- **Solo Builder**: every feature, on your own, on as many projects as you
  buy. 1 active project per project bought, 1 user, Reverse and Knowledge,
  and Changes.
- **Team**: collaborative, end-to-end SDLC. 1 active project and 5 users per
  project bought, Reverse and Knowledge, and Changes.
- **Enterprise**: specific contract terms, built with us. Projects and users
  as per contract, everything in Team, and a dedicated CSM.

Enterprise carries what a team needs: workspaces, members, invitations, roles
and per-project grants, the `lyriks-back` companion API that carries them,
SSO, and the formal DPO coherence engine that turns the heuristic verdict into
a machine-checked one.

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
