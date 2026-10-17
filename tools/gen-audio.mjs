// tools/gen-audio.mjs — record one mp3 per GS cue into assets/audio/gs/ and write manifest.json.
// node tools/gen-audio.mjs [--voice Thomas] [--engine say|openai] [--rate 150] [--bitrate 32k]
//                          [--only key,key] [--force] [--prune] [--jobs 6]
// Idempotent: a clip is (re)recorded only when it is missing or its recipe (text sent to the engine, voice,
// engine, rate, bitrate) changed; recipes live in sources.json next to the clips. See tools/README.md.
import { readFile, writeFile, mkdir, access, rm, mkdtemp, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandCards, DECK_FILES } from '../assets/gs/decks/index.js';
import { collectCues, clipPath, sayInput } from './cues.mjs';

const run = promisify(execFile);
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : (i++, next);
}
const engine = args.engine ?? 'say';
if (!['say', 'openai'].includes(engine)) throw new Error(`--engine say|openai, got ${engine}`);
if (engine === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('--engine openai needs OPENAI_API_KEY');
const voice = args.voice ?? (engine === 'say' ? 'Thomas' : 'coral');
const rate = Number(args.rate ?? 150); // words per minute (say only): slower than the 175 default, for a 5-year-old
// 32 kbps mono 22 kHz: the full track at 64 kbps weighed ~11 MB (572 clips, ~23 min of speech).
const bitrate = String(args.bitrate ?? '32k');
const jobs = args.jobs !== true && Number.isInteger(Number(args.jobs)) && Number(args.jobs) >= 1 ? Number(args.jobs) : 6; // bare --jobs → 6
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'assets', 'audio', 'gs');
const exists = (p) => access(p).then(() => true, () => false);

const decks = await Promise.all(DECK_FILES.map(async n => JSON.parse(await readFile(join(ROOT, 'assets', 'gs', 'decks', `${n}.json`), 'utf8'))));
const cues = collectCues(expandCards(decks, { firstName: '' })); // first-name cues stay device TTS at runtime

const ffmpeg = await run('which', ['ffmpeg']).then(r => r.stdout.trim(), () => null)
    ?? (await exists('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : null);
if (!ffmpeg) throw new Error('ffmpeg is required (brew install ffmpeg)');

const sourcesFile = join(OUT, 'sources.json');
const sources = await readFile(sourcesFile, 'utf8').then(JSON.parse, () => ({}));
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.08';
const recipe = (text) => ({ input: engine === 'say' ? sayInput(text) : text, engine, voice, ...(engine === 'say' ? { rate } : {}), bitrate, trim: true });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writeSources = () => writeFile(sourcesFile, `${JSON.stringify(Object.fromEntries(Object.keys(sources).sort().map(k => [k, sources[k]])), null, 1)}\n`);

const tmp = await mkdtemp(join(tmpdir(), 'gs-audio-')); // .aiff never lands in the repo
async function record(key, r) {
    const mp3 = join(OUT, ...clipPath(key).split('/'));
    await mkdir(dirname(mp3), { recursive: true });
    const raw = join(tmp, `${key}.${engine === 'say' ? 'aiff' : 'mp3'}`);
    if (engine === 'say') {
        await run('say', ['-v', voice, '-r', String(rate), '-o', raw, r.input]);
    } else {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: r.input, response_format: 'mp3',
                instructions: 'Voix douce et très articulée, pour un enfant de cinq ans, en français de France. Les sons répétés (fff, sss, chchch) sont des sons prolongés, jamais des lettres épelées.' }),
        });
        if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`);
        await writeFile(raw, Buffer.from(await res.arrayBuffer()));
    }
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', raw, '-map_metadata', '-1', '-af', TRIM, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', bitrate, mp3]);
    await rm(raw, { force: true });
}

const todo = [];
for (const [key, text] of cues) {
    if (only && !only.has(key)) continue;
    // A human recording is marked { "manual": true, "text": <cue text it says> } in sources.json:
    // never overwritten, unless named with --only + --force.
    if (sources[key]?.manual && !(only && args.force)) continue;
    const r = recipe(text);
    const mp3 = join(OUT, ...clipPath(key).split('/'));
    if (args.force || !same(sources[key], r) || !(await exists(mp3))) todo.push([key, r]);
}
let done = 0;
try {
    // allSettled: a failing worker must not let the cleanup below delete tmp/ while the others still record into it.
    let failed = false;
    const results = await Promise.allSettled(Array.from({ length: jobs }, async () => {
        while (todo.length && !failed) {
            const [key, r] = todo.shift();
            try { await record(key, r); } catch (err) { failed = true; throw err; }
            sources[key] = r;
            console.log(`[${++done}] ${key}`);
        }
    }));
    const firstError = results.find(x => x.status === 'rejected');
    if (firstError) throw firstError.reason;
} finally {
    await rm(tmp, { recursive: true, force: true });
    await writeSources(); // keep the recipes of the clips recorded before a failure
}

// Clips on disk that no cue asks for any more (a renamed key, a removed deck item).
async function walk(dir) {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...await walk(p));
        else if (e.name.endsWith('.mp3')) out.push(relative(OUT, p).split(sep).join('/').replace(/\.mp3$/, '').replaceAll('/', '.'));
    }
    return out;
}
const orphans = (await walk(OUT)).filter(k => !cues.has(k));
for (const k of orphans) {
    if (args.prune) { await rm(join(OUT, ...clipPath(k).split('/'))); delete sources[k]; console.log('pruned', k); }
    else console.warn(`orphan clip ${k} (not a cue any more; --prune deletes it)`);
}
for (const k of Object.keys(sources)) if (!cues.has(k)) delete sources[k];

const manifest = [];
for (const key of cues.keys()) if (await exists(join(OUT, ...clipPath(key).split('/')))) manifest.push(key);
manifest.sort();
const lines = (arr) => `[\n${arr.map(x => `  ${JSON.stringify(x)}`).join(',\n')}\n]\n`;
await writeFile(join(OUT, 'manifest.json'), lines(manifest));
await writeSources();
const missing = [...cues.keys()].filter(k => !manifest.includes(k));
console.log(`${done} recorded, ${manifest.length} clips in manifest${missing.length ? `, ${missing.length} cues without a clip` : ''}`);

// A manual clip says the text it was recorded for: if the cue text changed since, the clip is stale.
const staleManual = [...cues].filter(([k, text]) => sources[k]?.manual && sources[k].text !== text);
for (const [k, text] of staleManual) {
    console.error(`STALE manual clip ${k}: recorded for ${JSON.stringify(sources[k].text)}, cue now says ${JSON.stringify(text)}.`
        + ' Re-record it and update its "text" in sources.json, or drop the entry so the TTS clip is regenerated.');
}
if (staleManual.length) process.exitCode = 1;
