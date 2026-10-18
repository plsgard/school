// assets/hold.js
// Parental gate: `action` runs only after a long-press (the element fills up while held, see .hold-gate CSS).
// A plain tap or click does not run it (nor follow a link): it shows a short "Maintiens appuyé" hint under the
// element, so an adult does not take the gate for a broken button.
const HINT_MS = 1600;
let hint = null;

function showHint(el) {
    hint?.remove();
    const r = el.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.textContent = 'Maintiens appuyé';
    tip.setAttribute('role', 'status');
    Object.assign(tip.style, {
        position: 'fixed', top: `${Math.round(r.bottom + 6)}px`, left: `${Math.round(r.left + r.width / 2)}px`,
        transform: 'translateX(-50%)', zIndex: '1000', pointerEvents: 'none', whiteSpace: 'nowrap',
        background: '#1d2433', color: '#fff', font: '600 14px system-ui, sans-serif', padding: '4px 10px', borderRadius: '999px',
    });
    document.body.append(tip);
    hint = tip;
    setTimeout(() => { tip.remove(); if (hint === tip) hint = null; }, HINT_MS);
}

export function holdToActivate(el, action, ms = 1500) {
    let hold = null;
    let fired = false;
    el.classList.add('hold-gate');
    el.style.setProperty('--hold-ms', `${ms}ms`);
    const release = () => { clearTimeout(hold); hold = null; el.classList.remove('holding'); };
    el.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        release();
        fired = false;
        el.classList.add('holding');
        hold = setTimeout(() => { release(); fired = true; action(); }, ms);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
        e.preventDefault();
        if (fired) { fired = false; return; } // the click that ends a successful long-press
        showHint(el);
    });
}
