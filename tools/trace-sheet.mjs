// tools/trace-sheet.mjs
// Dev aid: renders trace models as SVG (same lignage, corridor and arrows as the canvas, via trace-geom.js) so
// a model can be checked by eye before it ships. Pure Node, no deps. Output goes to a temp folder: never commit it.
//   node tools/trace-sheet.mjs [--deck letters|numbers|all] [--only a,b] [--points] [--out DIR]
// Preview a PNG on macOS: qlmanage -t -s 400 -o DIR DIR/letters-a.svg
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LIGNAGE, curveSegments, arrowSpots } from '../assets/gs/trace-geom.js';

const pathD = (pts) => `M${pts[0][0]} ${pts[0][1]}${curveSegments(pts).map(s => ` C${s.map(v => +v.toFixed(2)).join(' ')}`).join('')}`;
const line = (y, color, w, dash = '') => `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const corridor = (pts) => `<path d="${pathD(pts)}" fill="none" stroke="#b9c6d9" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const arrows = (pts) => arrowSpots(pts).map(({ x, y, ang }) =>
    `<path d="M1.1 0 L-1.1 -1.6 L-1.1 1.6 Z" fill="#8fa3c2" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(ang * 180 / Math.PI).toFixed(1)})"/>`).join('');
const numbered = (pts, color) => pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="0.7" fill="${color}"/><text x="${x + 1}" y="${y - 1}" font-size="2.6" fill="${color}">${i}</text>`).join('');

export function modelSvg(model, { size = 400, points = false, title = '' } = {}) {
    const L = LIGNAGE;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`,
        '<rect width="100" height="100" fill="#ffffff"/>',
        `<rect x="0" y="${L.xHeight}" width="100" height="${L.baseline - L.xHeight}" fill="#f3f7fc"/>`,
        line(L.ascender, '#eef2f8', 0.35), line(L.xHeight, '#dfe7f2', 0.35), line(L.baseline, '#9fb2cf', 0.7), line(L.descender, '#eef2f8', 0.35),
        line(L.hampe, '#f5c6c6', 0.25, '1 1'), // check-only guide for t/d/digit tops (not drawn by the app)
        corridor(model.pts), model.pts2 ? corridor(model.pts2) : '', model.bar ? corridor(model.bar) : '',
        model.dot ? `<circle cx="${model.dot[0]}" cy="${model.dot[1]}" r="3" fill="#b9c6d9"/>` : '',
        arrows(model.pts), model.pts2 ? arrows(model.pts2) : '',
        model.pts2 ? `<circle cx="${model.pts2[0][0]}" cy="${model.pts2[0][1]}" r="2.4" fill="#4c8fd9"/>` : '',
        `<circle cx="${model.pts[0][0]}" cy="${model.pts[0][1]}" r="3.2" fill="#4cb944"/>`,
        points ? numbered(model.pts, '#c0392b') + (model.pts2 ? numbered(model.pts2, '#2c6fbf') : '') : '',
        title ? `<text x="2" y="7" font-size="6" fill="#223252">${title}</text>` : '',
        '</svg>',
    ].join('\n');
}

export function sheetSvg(entries, { cols = 6, cell = 200 } = {}) {
    const rows = Math.ceil(entries.length / cols);
    const cells = entries.map(({ model, title }, i) => modelSvg(model, { size: cell, title })
        .replace('<svg ', `<svg x="${(i % cols) * cell}" y="${Math.floor(i / cols) * cell}" `));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}">\n${cells.join('\n')}\n</svg>`;
}

const modelOf = (it) => ({ pts: it.trace, pts2: it.trace2, dot: it.dot, bar: it.bar });

async function main(argv) {
    const arg = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
    const deckArg = arg('deck') ?? 'all';
    const only = arg('only')?.split(',');
    const out = arg('out') ?? join(tmpdir(), 'trace-sheet');
    const points = argv.includes('--points');
    await mkdir(out, { recursive: true });
    const root = fileURLToPath(new URL('..', import.meta.url));
    for (const deck of deckArg === 'all' ? ['letters', 'numbers'] : [deckArg]) {
        const items = JSON.parse(await readFile(join(root, 'assets', 'gs', 'decks', `${deck}.json`), 'utf8')).items
            .filter(it => it.trace && (!only || only.includes(it.id)));
        for (const it of items) await writeFile(join(out, `${deck}-${it.id}.svg`), modelSvg(modelOf(it), { points, title: it.id }));
        if (!only) await writeFile(join(out, `sheet-${deck}.svg`), sheetSvg(items.map(it => ({ model: modelOf(it), title: it.id }))));
        console.log(`${deck}: ${items.length} model(s) → ${out}`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
