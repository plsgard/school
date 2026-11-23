// assets/en/clock.js
// A clock face for the lessons on telling the time: a lesson group with `"clock": true` shows each item's cue
// ("4:10") as a drawn clock instead of the digits, as on the clocks of the class exercises. The geometry is pure
// (tested); clockFace builds the SVG with createElementNS, never innerHTML.

const SVG = 'http://www.w3.org/2000/svg';
const C = 50; // the face is drawn in a 100 × 100 box, centre (50, 50)

// "4:10", "12:55" → { h: 4, m: 10 }; anything else → null.
export function parseClock(text) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ''));
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h <= 23 && min <= 59 ? { h, m: min } : null;
}

// Hand angles in degrees, clockwise from 12. The hour hand moves on between two hours (half-way at half past).
export const handAngles = ({ h, m }) => ({ hour: (h % 12) * 30 + m * 0.5, minute: m * 6 });

const round = (v) => Math.round(v * 100) / 100;
export const pointAt = (deg, r) => ({
    x: round(C + r * Math.sin((deg * Math.PI) / 180)),
    y: round(C - r * Math.cos((deg * Math.PI) / 180)),
});

// Everything to draw: the 12 numbers, the 60 ticks (thick every 5 minutes) and the two hands.
export function clockModel(time) {
    const a = handAngles(time);
    return {
        numbers: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, ...pointAt((i + 1) * 30, 37) })),
        ticks: Array.from({ length: 60 }, (_, i) => ({ major: i % 5 === 0, from: pointAt(i * 6, i % 5 === 0 ? 43 : 45), to: pointAt(i * 6, 47) })),
        hour: pointAt(a.hour, 21),
        minute: pointAt(a.minute, 32),
    };
}

// The SVG element for a cue such as "4:10" (null when the cue is not a time).
export function clockFace(doc, text, { size = 168 } = {}) {
    const time = parseClock(text);
    if (!time) return null;
    const model = clockModel(time);
    const node = (name, attrs, text) => {
        const n = doc.createElementNS(SVG, name);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
        if (text != null) n.textContent = text;
        return n;
    };
    const svg = node('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'en-clock', role: 'img', 'aria-label': `Horloge : ${text.trim()}` });
    svg.append(node('circle', { cx: C, cy: C, r: 48, fill: '#fff', stroke: '#c62828', 'stroke-width': 3 }));
    for (const t of model.ticks) {
        svg.append(node('line', { x1: t.from.x, y1: t.from.y, x2: t.to.x, y2: t.to.y, stroke: '#222', 'stroke-width': t.major ? 1.6 : 0.6 }));
    }
    for (const { n, x, y } of model.numbers) {
        svg.append(node('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 9, 'font-weight': 700, fill: '#222', 'font-family': 'system-ui, sans-serif' }, String(n)));
    }
    svg.append(node('line', { x1: C, y1: C, x2: model.hour.x, y2: model.hour.y, stroke: '#222', 'stroke-width': 4.2, 'stroke-linecap': 'round' }));
    svg.append(node('line', { x1: C, y1: C, x2: model.minute.x, y2: model.minute.y, stroke: '#222', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    svg.append(node('circle', { cx: C, cy: C, r: 2.6, fill: '#222' }));
    return svg;
}
