<script lang="ts">
	import { untrack } from 'svelte';
	import { confirmDialog, promptDialog, pushToast } from '$ui/design-system';
	import QuestionMenu from './QuestionMenu.svelte';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { patchKey } from './dossier-overlay';

	/**
	 * The discreet settings of a request, a gear beside its title
	 * (ac-evo-req-settings): cancel it with a reason or reopen it
	 * (ac-evo-req-cancel), or delete it. Each act asks first and says what stays:
	 * what the request wrote into the specification is never taken back. The
	 * reader also lets their own AI validate here, or, as a project admin, on
	 * every evolution, and takes it back (ac-evo-llm-delegation).
	 *
	 * Each act reads at once once confirmed (ac-evo-form-edit-optimistic): the
	 * request cancelled or reopened, the delegation on or off, the board without
	 * the deleted request; a refusal puts it back, its reason said.
	 */
	interface Props {
		projectId?: string;
		requestId: string;
		status: 'open' | 'closed' | 'cancelled' | 'deleted';
		/** Whether a freeze already wrote its drafts into the specification. */
		frozen: boolean;
		/** Deletes the request, the board showing without it at once; false once the deletion failed. */
		onDelete: () => Promise<boolean>;
		/** Whether the reader's AI validates here, and on every evolution. */
		aiDelegation?: { readonly request: boolean; readonly project: boolean };
		/** Who acts, named on a cancellation. */
		actorId: string;
		/** Who may delegate validation to their AI on every evolution of the project. */
		isAdmin?: boolean;
	}
	let { projectId = '', requestId, status, frozen, onDelete, aiDelegation = { request: false, project: false }, actorId, isAdmin = false }: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));

	const POWERS = 'It validates in your name what you validate on the request and accepts its own suggestions. Moving the request on, accepting a risk, approving the delivery and closing it stay yours. You can take it back at any time; what it validated stays.';
	async function delegate(scope: 'request' | 'project', on: boolean) {
		if (on) {
			const sure = await confirmDialog({
				title: scope === 'request' ? 'Let your AI validate this evolution?' : 'Let your AI validate every evolution?',
				message: POWERS,
				confirmLabel: 'Let it validate'
			});
			if (!sure) return;
		}
		const op = scope === 'request' ? { op: 'delegate_to_ai', scope, on, requestId } : { op: 'delegate_to_ai', scope, on };
		const patches = { [patchKey.delegation(scope)]: { kind: 'delegation', on, at: new Date().toISOString() } as const };
		if (await writes.send(patches, [op], on ? 'letting your AI validate in your name' : 'taking validation back from your AI'))
			pushToast({ level: 'success', message: on ? 'Your AI now validates in your name' : 'Your AI no longer validates in your name' });
	}

	async function cancel() {
		const reason = await promptDialog({
			title: 'Cancel this request?',
			message: `It leaves the columns of the board and stays readable; you can reopen it. ${
				frozen ? 'What its frozen version wrote into the specification stays.' : 'What it wrote into the specification stays.'
			}`,
			confirmLabel: 'Cancel the request',
			cancelLabel: 'Keep it',
			placeholder: 'Why, in one sentence'
		});
		if (reason === null) return;
		if (reason.trim() === '') return pushToast({ level: 'info', message: 'Say why the request is cancelled.' });
		const at = new Date().toISOString();
		if (await writes.send({ [patchKey.status]: { kind: 'status', status: 'cancelled', reason, by: actorId, at } }, [{ op: 'cancel_request', requestId, reason }], 'the cancellation of the request'))
			pushToast({ level: 'success', message: 'Request cancelled' });
	}

	async function reopen() {
		const at = new Date().toISOString();
		if (await writes.send({ [patchKey.status]: { kind: 'status', status: 'open', reason: '', by: actorId, at } }, [{ op: 'reopen_request', requestId }], 'the reopening of the request'))
			pushToast({ level: 'success', message: 'Request reopened where it stood' });
	}

	async function remove() {
		const sure = await confirmDialog({
			title: 'Delete this request?',
			message: 'The dossier goes for good, its threads and history with it. The specification it wrote stays where it is.',
			confirmLabel: 'Delete the request',
			danger: true
		});
		if (!sure) return;
		if (await onDelete()) pushToast({ level: 'success', message: 'Request deleted; the specification it wrote stays' });
	}

	const items = $derived([
		...(status === 'open'
			? [
					aiDelegation.request
						? { label: 'Stop letting my AI validate here', icon: 'sparkles' as const, onSelect: () => void delegate('request', false) }
						: { label: 'Let my AI validate this evolution…', icon: 'sparkles' as const, onSelect: () => void delegate('request', true) }
				]
			: []),
		...(isAdmin
			? [
					aiDelegation.project
						? { label: 'Stop letting my AI validate every evolution', icon: 'sparkles' as const, onSelect: () => void delegate('project', false) }
						: { label: 'Let my AI validate every evolution…', icon: 'sparkles' as const, onSelect: () => void delegate('project', true) }
				]
			: []),
		...(status === 'open' ? [{ label: 'Cancel the request…', icon: 'x' as const, onSelect: () => void cancel() }] : []),
		...(status === 'cancelled' ? [{ label: 'Reopen the request', icon: 'rotate' as const, onSelect: () => void reopen() }] : []),
		...(status !== 'deleted' ? [{ label: 'Delete the request…', icon: 'trash' as const, onSelect: () => void remove() }] : [])
	]);
</script>

{#if items.length > 0}
	<QuestionMenu label="Settings of this request" icon="settings" {items} />
{/if}
