// assets/agent/input.js
// Listens, decides nothing. Touch: a floating joystick on the left half of the screen, a drag on the right half turns
// the camera, DOM buttons for action / jump / sprint / gadget. Desktop: WASD or arrows, mouse drag, Space, E, Q,
// Shift. read() returns the stick in screen terms (x right, y forward, length ≤ 1) and the one-shot presses since
// the last read; app.js turns the stick by the camera yaw.
const STICK_PX = 56;

export function createInput(root, { stick = null, buttons = {} } = {}) {
    const keys = new Set();
    const once = { jump: false, action: false, gadget: false };
    let yawDelta = 0;
    let sprintHeld = false;
    let joy = null;   // { id, x0, y0, x, y }
    let look = null;  // { id, x }
    let enabled = true;

    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    const onKeyDown = (e) => {
        if (!enabled || typing(e)) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === ' ') { once.jump = true; e.preventDefault(); }
        if (k === 'e' || k === 'Enter') once.action = true;
        if (k === 'q') once.gadget = true;
        if (k.startsWith('Arrow')) e.preventDefault();
        keys.add(k);
    };
    const onKeyUp = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.delete(k); };
    const onBlur = () => { keys.clear(); joy = null; look = null; sprintHeld = false; showStick(null); };

    function showStick(j) {
        if (!stick) return;
        stick.hidden = !j;
        if (!j) return;
        stick.style.left = `${j.x0}px`;
        stick.style.top = `${j.y0}px`;
        const dx = Math.max(-STICK_PX, Math.min(STICK_PX, j.x - j.x0)), dy = Math.max(-STICK_PX, Math.min(STICK_PX, j.y - j.y0));
        const len = Math.hypot(dx, dy), k = len > STICK_PX ? STICK_PX / len : 1;
        stick.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }

    const onDown = (e) => {
        if (!enabled) return;
        const touchLike = e.pointerType !== 'mouse';
        if (touchLike && e.clientX < root.clientWidth / 2 && !joy) {
            joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
            showStick(joy);
        } else if (!look) {
            look = { id: e.pointerId, x: e.clientX };
        }
        root.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };
    const onMove = (e) => {
        if (joy?.id === e.pointerId) { joy.x = e.clientX; joy.y = e.clientY; showStick(joy); }
        else if (look?.id === e.pointerId) { yawDelta -= (e.clientX - look.x) * 0.008; look.x = e.clientX; }
    };
    const onUp = (e) => {
        if (joy?.id === e.pointerId) { joy = null; showStick(null); }
        if (look?.id === e.pointerId) look = null;
    };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    globalThis.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener('keyup', onKeyUp);
    globalThis.addEventListener('blur', onBlur);

    const press = (name) => (e) => { e.preventDefault(); if (enabled) once[name] = true; };
    const cleanups = [];
    const bind = (el, ev, fn) => { if (!el) return; el.addEventListener(ev, fn); cleanups.push(() => el.removeEventListener(ev, fn)); };
    bind(buttons.action, 'pointerdown', press('action'));
    bind(buttons.jump, 'pointerdown', press('jump'));
    bind(buttons.gadget, 'pointerdown', press('gadget'));
    bind(buttons.sprint, 'pointerdown', (e) => { e.preventDefault(); sprintHeld = !sprintHeld; buttons.sprint.classList.toggle('on', sprintHeld); });

    function read() {
        let x = 0, y = 0;
        if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
        if (keys.has('d') || keys.has('ArrowRight')) x += 1;
        if (keys.has('w') || keys.has('ArrowUp')) y += 1;
        if (keys.has('s') || keys.has('ArrowDown')) y -= 1;
        if (joy) {
            const jx = (joy.x - joy.x0) / STICK_PX, jy = -(joy.y - joy.y0) / STICK_PX;
            const len = Math.hypot(jx, jy);
            if (len > 0.15) { const k = Math.min(1, len) / len; x = jx * k; y = jy * k; }
        }
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        const out = { dx: x, dz: y, yawDelta, jump: once.jump, action: once.action, gadget: once.gadget,
            sprint: sprintHeld || keys.has('Shift') };
        yawDelta = 0;
        once.jump = once.action = once.gadget = false;
        return out;
    }

    return {
        read,
        // While a panel is open the world is paused: drop held keys so he does not walk off when it closes.
        setEnabled(on) { enabled = on; if (!on) onBlur(); },
        dispose() {
            root.removeEventListener('pointerdown', onDown);
            root.removeEventListener('pointermove', onMove);
            root.removeEventListener('pointerup', onUp);
            root.removeEventListener('pointercancel', onUp);
            globalThis.removeEventListener('keydown', onKeyDown);
            globalThis.removeEventListener('keyup', onKeyUp);
            globalThis.removeEventListener('blur', onBlur);
            for (const c of cleanups) c();
        },
    };
}
