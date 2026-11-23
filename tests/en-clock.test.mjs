import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseClock, handAngles, pointAt, clockModel } from '../assets/en/clock.js';
import { flattenLesson, expandCards } from '../assets/en/decks/index.js';
import { generateLesson } from '../assets/en/lesson-generators.js';

describe('parseClock', () => {
    test('parseClock_HoursAndMinutes_ReturnsThem', () => {
        assert.deepEqual(parseClock('4:10'), { h: 4, m: 10 });
        assert.deepEqual(parseClock('12:55'), { h: 12, m: 55 });
    });
    test('parseClock_NotATime_ReturnsNull', () => {
        for (const t of ['7:30 le matin', 'jeudi', '4h10', '25:00', '4:61', '', null]) assert.equal(parseClock(t), null, String(t));
    });
});

describe('handAngles', () => {
    test('handAngles_OClock_MinuteHandOnTwelve', () => {
        assert.deepEqual(handAngles({ h: 3, m: 0 }), { hour: 90, minute: 0 });
    });
    test('handAngles_HalfPast_HourHandHalfWayToTheNextHour', () => {
        assert.deepEqual(handAngles({ h: 9, m: 30 }), { hour: 285, minute: 180 });
    });
    test('handAngles_TwelveAndAfternoon_SameAsTheTwelveHourClock', () => {
        assert.deepEqual(handAngles({ h: 12, m: 55 }), handAngles({ h: 0, m: 55 }));
        assert.deepEqual(handAngles({ h: 15, m: 0 }), handAngles({ h: 3, m: 0 }));
    });
});

describe('clockModel', () => {
    test('pointAt_ThreeOClockAndSix_RightAndBottomOfTheCentre', () => {
        assert.deepEqual(pointAt(90, 10), { x: 60, y: 50 });
        assert.deepEqual(pointAt(180, 10), { x: 50, y: 60 });
    });
    test('clockModel_TwelveNumbersSixtyTicksTwelveMajor', () => {
        const m = clockModel({ h: 4, m: 10 });
        assert.deepEqual(m.numbers.map(n => n.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        assert.equal(m.ticks.length, 60);
        assert.equal(m.ticks.filter(t => t.major).length, 12);
    });
    test('clockModel_QuarterTo_MinuteHandOnNineHourHandNearTheNextHour', () => {
        const m = clockModel({ h: 10, m: 45 });
        assert.deepEqual(m.minute, pointAt(270, 32));
        assert.ok(m.minute.x < 50 && Math.abs(m.minute.y - 50) < 0.01);
        assert.deepEqual(m.hour, pointAt(322.5, 21)); // three quarters of the way from 10 to 11
    });
});

const lesson = JSON.parse(await readFile(new URL('../assets/en/decks/what-time-is-it.json', import.meta.url), 'utf8'));
const decks = flattenLesson(lesson);
const cards = expandCards(decks);

describe('clock lessons', () => {
    test('flattenLesson_ClockGroup_KeepsTheFlagOnItsDeckOnly', () => {
        assert.equal(decks.find(d => d.id === 'what-time-is-it-times').clock, true);
        assert.equal(decks.find(d => d.id === 'what-time-is-it-am-pm').clock, undefined);
    });
    test('clockGroups_EveryCue_IsATime', () => {
        for (const d of decks.filter(x => x.clock)) for (const it of d.items) assert.ok(parseClock(it.cue), `${d.id}/${it.id}`);
    });
    test('generateLesson_ClockDeck_CarriesTheClockExceptInDictation', () => {
        const c = cards.find(x => x.id === 'what-time-is-it-times/t0410#write');
        assert.equal(generateLesson(c, { format: 'type', cards }).clock, '4:10');
        assert.equal(generateLesson(c, { format: 'pick', cards, rng: () => 0.5 }).clock, '4:10');
        assert.equal(generateLesson(c, { format: 'hear', cards }).clock, undefined);
        const other = cards.find(x => x.id === 'what-time-is-it-am-pm/pm-1500#write');
        assert.equal(generateLesson(other, { format: 'type', cards }).clock, undefined);
    });
});
