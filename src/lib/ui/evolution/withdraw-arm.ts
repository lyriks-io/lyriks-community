// Pointed at (or reached by the keyboard) this long, a Validated pill offers to take the validation back.
const ARM_AFTER_MS = 600;
// Armed by a touch, it waits this long for the second one.
const TOUCH_ARMED_MS = 4000;
const ARMED = 'data-armed';

/**
 * A Validated pill that takes the validation back only once it says so: once
 * pointed at a moment, or reached by the keyboard, it arms and reads Withdraw
 * (app.css, [data-armed]); a click before that does nothing, so a click on
 * Validated never undoes it by surprise. A touch screen points at nothing: a
 * first touch arms it, the next one withdraws. Leaving it disarms it.
 * `{@attach armWithdraw}` on the button, while a click would withdraw.
 */
export function armWithdraw(button: HTMLElement) {
	let timer = 0;
	// Armed by the very touch now landing: the click it gives does not withdraw yet.
	let justArmed = false;
	const arm = () => button.setAttribute(ARMED, '');
	const disarm = () => {
		window.clearTimeout(timer);
		button.removeAttribute(ARMED);
	};
	const armSoon = () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(arm, ARM_AFTER_MS);
	};
	const onEnter = (e: PointerEvent) => e.pointerType !== 'touch' && armSoon();
	const onLeave = (e: PointerEvent) => e.pointerType !== 'touch' && disarm();
	const onDown = (e: PointerEvent) => {
		if (e.pointerType !== 'touch' || button.hasAttribute(ARMED)) return;
		justArmed = true;
		arm();
		window.clearTimeout(timer);
		timer = window.setTimeout(disarm, TOUCH_ARMED_MS);
	};
	const onFocus = () => button.matches(':focus-visible') && armSoon();
	// Caught before the button's own handler: a click while not armed is kept from it.
	const onClick = (e: MouseEvent) => {
		if (button.hasAttribute(ARMED) && !justArmed) return;
		justArmed = false;
		e.preventDefault();
		e.stopImmediatePropagation();
	};
	button.addEventListener('pointerenter', onEnter);
	button.addEventListener('pointerleave', onLeave);
	button.addEventListener('pointerdown', onDown);
	button.addEventListener('focus', onFocus);
	button.addEventListener('blur', disarm);
	button.addEventListener('click', onClick, { capture: true });
	return () => {
		disarm();
		button.removeEventListener('pointerenter', onEnter);
		button.removeEventListener('pointerleave', onLeave);
		button.removeEventListener('pointerdown', onDown);
		button.removeEventListener('focus', onFocus);
		button.removeEventListener('blur', disarm);
		button.removeEventListener('click', onClick, { capture: true });
	};
}
