// assets/hold.js
// Parental gate: `action` runs only after a long-press (the element fills up while held, see .hold-gate CSS).
// A plain tap or click does nothing, including following a link.
export function holdToActivate(el, action, ms = 1500) {
    let hold = null;
    el.classList.add('hold-gate');
    el.style.setProperty('--hold-ms', `${ms}ms`);
    const release = () => { clearTimeout(hold); hold = null; el.classList.remove('holding'); };
    el.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        release();
        el.classList.add('holding');
        hold = setTimeout(() => { release(); action(); }, ms);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => e.preventDefault());
}
