import { promptDialog, pushToast } from '$ui/design-system';

/**
 * Copies a prompt for the person's AI agent and says what to do with it
 * (ac-evo-live-no-session). Where the browser keeps the clipboard closed, the
 * prompt shows in a box to copy by hand, so it is never out of reach.
 */
export async function copyPrompt(prompt: string, said: string): Promise<void> {
	if (await toClipboard(prompt)) return void pushToast({ level: 'info', message: said });
	await promptDialog({
		title: 'Copy this prompt',
		message: 'Your browser kept the clipboard closed: select the prompt, copy it, then paste it in a new conversation with your AI agent.',
		initial: prompt,
		confirmLabel: 'Done'
	});
}

async function toClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// An origin the browser does not trust with the clipboard API: the older copy command may still work.
	}
	try {
		const box = document.createElement('textarea');
		box.value = text;
		box.setAttribute('readonly', '');
		box.style.position = 'fixed';
		box.style.opacity = '0';
		document.body.appendChild(box);
		box.select();
		const copied = document.execCommand('copy');
		box.remove();
		return copied;
	} catch {
		return false;
	}
}
