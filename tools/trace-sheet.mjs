// tools/trace-sheet.mjs
// Dev aid: renders trace models as SVG (same lignage, corridors, arrows and numbered start dots as the canvas, via
// trace-geom.js) so a model can be checked by eye before it ships. Pure Node, no deps. Output goes to a temp folder:
// never commit it.
//   node tools/trace-sheet.mjs [--deck letters|numbers|caps|all] [--only a,b] [--points] [--state k] [--out DIR]
// --deck caps renders the capital models (letters.json capTrace); --state k shows the dots once k strokes are done;
// --points numbers every waypoint of every stroke. Preview a PNG on macOS: qlmanage -t -s 400 -o DIR DIR/letters-a.svg
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LIGNAGE, curveSegments, arrowSpots, strokesOf, startDots, lignageFor } from '../assets/gs/trace-geom.js';

const pathD = (pts) => `M${pts[0][0]} ${pts[0][1]}${curveSegments(pts).map(s => ` C${s.map(v => +v.toFixed(2)).join(' ')}`).join('')}`;
const line = (y, color, w, dash = '') => `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const corridor = (pts) => `<path d="${pathD(pts)}" fill="none" stroke="#b9c6d9" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const arrows = (pts) => arrowSpots(pts).map(({ x, y, ang }) =>
    `<path d="M1.1 0 L-1.1 -1.6 L-1.1 1.6 Z" fill="#8fa3c2" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(ang * 180 / Math.PI).toFixed(1)})"/>`).join('');
const POINT_COLORS = ['#c0392b', '#2c6fbf', '#b36200', '#7d3c98'];
const numbered = (pts, color) => pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="0.7" fill="${color}"/><text x="${x + 1}" y="${y - 1}" font-size="2.6" fill="${color}">${i}</text>`).join('');
const dotSvg = (d) => [
    d.active ? `<circle cx="${d.x}" cy="${d.y}" r="3.2" fill="${d.color}"/>`
        : `<circle cx="${d.x}" cy="${d.y}" r="2.4" fill="#ffffff" stroke="${d.color}" stroke-width="0.8"/>`,
    d.digit ? `<text x="${d.x}" y="${d.y + 0.15}" font-size="2.6" font-weight="bold" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="central" fill="${d.active ? '#ffffff' : d.color}">${d.n}</text>` : '',
].join('');

export function modelSvg(model, { size = 400, points = false, title = '', state = 0 } = {}) {
    const S = strokesOf(model), kind = model.lignage ?? 'cursive', lg = lignageFor(kind);
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`,
        '<rect width="100" height="100" fill="#ffffff"/>',
        lg.band ? `<rect x="0" y="${lg.band[0]}" width="100" height="${lg.band[1] - lg.band[0]}" fill="${lg.band[2]}"/>` : '',
        ...lg.lines.map(l => line(l.y, l.color, +(l.width * 0.35).toFixed(3))),
        kind === 'cursive' ? line(LIGNAGE.hampe, '#f5c6c6', 0.25, '1 1') : '', // check-only guide for t/d/digit tops (not drawn by the app)
        ...S.map(corridor), model.bar ? corridor(model.bar) : '',
        model.dot ? `<circle cx="${model.dot[0]}" cy="${model.dot[1]}" r="3" fill="#b9c6d9"/>` : '',
        ...S.map(arrows),
        ...startDots(S, state).reverse().map(dotSvg), // last stroke first, so dot 1 stays on top
        points ? S.map((s, k) => numbered(s, POINT_COLORS[k % POINT_COLORS.length])).join('') : '',
        title ? `<text x="2" y="7" font-size="6" fill="#223252">${title}</text>` : '',
        '</svg>',
    ].join('\n');
}

// Square canvas (cols = ceil(√n) by default, padded height): qlmanage thumbnails crop a non-square sheet.
export function sheetSvg(entries, { cols = Math.ceil(Math.sqrt(entries.length)), cell = 200 } = {}) {
    const rows = Math.ceil(entries.length / cols), side = Math.max(cols, rows) * cell;
    const cells = entries.map(({ model, title }, i) => modelSvg(model, { size: cell, title })
        .replace('<svg ', `<svg x="${(i % cols) * cell}" y="${Math.floor(i / cols) * cell}" `));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}">\n<rect width="${side}" height="${side}" fill="#ffffff"/>\n${cells.join('\n')}\n</svg>`;
}

const modelOf = (it, deck) => deck === 'caps'
    ? { strokes: it.capTrace, lignage: 'cap' }
    : { strokes: [it.trace, it.trace2].filter(Boolean), dot: it.dot, bar: it.bar, lignage: 'cursive' };

async function main(argv) {
    const arg = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
    const deckArg = arg('deck') ?? 'all';
    const only = arg('only')?.split(',');
    const out = arg('out') ?? join(tmpdir(), 'trace-sheet');
    const points = argv.includes('--points');
    const state = Number(arg('state') ?? 0);
    await mkdir(out, { recursive: true });
    const root = fileURLToPath(new URL('..', import.meta.url));
    for (const deck of deckArg === 'all' ? ['letters', 'numbers', 'caps'] : [deckArg]) {
        const file = deck === 'caps' ? 'letters' : deck;
        const field = deck === 'caps' ? 'capTrace' : 'trace';
        const items = JSON.parse(await readFile(join(root, 'assets', 'gs', 'decks', `${file}.json`), 'utf8')).items
            .filter(it => it[field] && (!only || only.includes(it.id)));
        for (const it of items) await writeFile(join(out, `${deck}-${it.id}.svg`), modelSvg(modelOf(it, deck), { points, title: deck === 'caps' ? it.cap : it.id, state }));
        if (!only) await writeFile(join(out, `sheet-${deck}.svg`), sheetSvg(items.map(it => ({ model: modelOf(it, deck), title: deck === 'caps' ? it.cap : it.id }))));
        console.log(`${deck}: ${items.length} model(s) → ${out}`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
