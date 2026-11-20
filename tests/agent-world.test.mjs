import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, parseLayout, TILE } from '../assets/agent/levels.js';
import {
    PLAYER, ROBOT, stepPlayer, solidsOf, sees, stepRobot, caught, near, createRobot, cellCenter, opaqueWith,
} from '../assets/agent/world.js';

const DT = 1 / 60;
const run = (player, input, seconds, solids) => {
    let p = player;
    for (let t = 0; t < seconds; t += DT) p = stepPlayer(p, input, DT, solids);
    return p;
};
const standing = (x, z, y = 0) => ({ x, y, z, vy: 0, grounded: true });
const box = (x, z, w, d, h) => ({ x, z, w, d, h });

describe('stepPlayer', () => {
    test('stepPlayer_WalksIntoWall_StopsAndSlides', () => {
        const wall = box(5, 0, 2, 20, 3);
        const p = run(standing(0, 0), { dx: Math.SQRT1_2, dz: Math.SQRT1_2 }, 2, [wall]);
        assert.ok(p.x <= 4 - PLAYER.radius + 1e-6, `x ${p.x}`);
        assert.ok(p.z > 5, `z ${p.z}`);
    });
    test('stepPlayer_StepOf30cm_Climbs', () => {
        const p = run(standing(0, 0), { dx: 1, dz: 0 }, 1, [box(3, 0, 4, 4, 0.3)]);
        assert.ok(p.x > 2, `x ${p.x}`);
        assert.ok(Math.abs(p.y - 0.3) < 1e-9);
    });
    test('stepPlayer_BoxOf1m_NeedsAJump', () => {
        const crate = box(3, 0, 2, 2, 1);
        const walked = run(standing(0, 0), { dx: 1, dz: 0 }, 1, [crate]);
        assert.ok(walked.x < 2 && walked.y === 0);
        let p = walked;
        p = stepPlayer(p, { dx: 1, dz: 0, jump: true }, DT, [crate]);
        p = run(p, { dx: 1, dz: 0 }, 0.2, [crate]);
        p = run(p, { dx: 0, dz: 0 }, 0.5, [crate]);
        assert.ok(Math.abs(p.y - 1) < 1e-9, `y ${p.y}`);
        assert.ok(p.grounded);
    });
    test('stepPlayer_LeavesAnEdge_FallsAndLands', () => {
        const table = box(0, 0, 2, 2, 1);
        let p = { x: 0, y: 1, z: 0, vy: 0, grounded: true };
        p = run(p, { dx: 1, dz: 0 }, 0.4, [table]);
        assert.ok(p.x > 1.4 && p.y < 1, `x ${p.x} y ${p.y}`);
        p = run(p, { dx: 0, dz: 0 }, 1, [table]);
        assert.equal(p.y, 0);
        assert.ok(p.grounded);
    });
    test('stepPlayer_JumpInTheOpen_RisesAndComesBack', () => {
        let p = stepPlayer(standing(0, 0), { jump: true }, DT, []);
        assert.ok(p.y > 0 && !p.grounded);
        let max = p.y;
        for (let i = 0; i < 120; i++) { p = stepPlayer(p, {}, DT, []); max = Math.max(max, p.y); }
        assert.ok(Math.abs(max - PLAYER.jump) < 0.15, `max ${max}`);
        assert.equal(p.y, 0);
    });
});

describe('mission room', () => {
    const parsed = parseLayout(LAYOUTS.infiltration[0]);
    test('solidsOf_ClosedAndOpenLocks_DoorsOnlyWhileClosed', () => {
        const closed = solidsOf(parsed).filter(b => b.kind === 'door').length;
        const open = solidsOf(parsed, new Set([0, 1, 2])).filter(b => b.kind === 'door').length;
        assert.deepEqual([closed, open], [10, 7]);
        const crate = solidsOf(parsed).find(b => b.kind === 'crate');
        assert.deepEqual([crate.h, crate.w], [1, TILE]);
    });
    test('sees_CrateBetween_ReturnsFalse', () => {
        // Row 3 of the serpentine: crate at (15, 3); robot at (17, 3) looking west, player at (13, 3), then at (13, 1).
        const robot = { ...cellCenter({ x: 17, y: 3 }), dir: Math.PI };
        assert.equal(sees(robot, cellCenter({ x: 13, y: 3 }), parsed.opaque), false);
        assert.equal(sees(robot, cellCenter({ x: 13, y: 1 }), parsed.opaque), true);
    });
    test('sees_BehindTheRobot_ReturnsFalse', () => {
        const robot = { ...cellCenter({ x: 15, y: 2 }), dir: 0 };
        assert.equal(sees(robot, cellCenter({ x: 13, y: 2 }), parsed.opaque), false);
        assert.equal(sees(robot, cellCenter({ x: 17, y: 2 }), parsed.opaque), true);
    });
    test('sees_TooFar_ReturnsFalse', () => {
        const robot = { x: 0, z: 0, dir: 0 };
        assert.equal(sees(robot, { x: ROBOT.range + 0.5, z: 0 }, () => false), false);
    });
    test('sees_ClosedDoorBetween_ReturnsFalse', () => {
        const robot = { ...cellCenter({ x: 8, y: 2 }), dir: Math.PI };
        const player = cellCenter({ x: 4, y: 2 });
        assert.equal(sees(robot, player, opaqueWith(parsed)), false);
        assert.equal(sees(robot, player, opaqueWith(parsed, new Set([0]))), true);
    });
    const facing = () => ({ ...createRobot([[13, 2], [17, 2]]), dir: 0 });
    const target = { ...cellCenter({ x: 16, y: 2 }), y: 0 };
    test('stepRobot_PlayerInSightFor0s6_StartsChasing', () => {
        let r = facing();
        for (let i = 0; i < 30; i++) r = stepRobot(r, target, DT, parsed);
        assert.equal(r.mode, 'alert');
        for (let i = 0; i < 8; i++) r = stepRobot(r, target, DT, parsed);
        assert.equal(r.mode, 'chase');
    });
    test('stepRobot_NoSightFor3s_GoesBackToPatrol', () => {
        let r = { ...facing(), mode: 'chase', lastSeen: target };
        const hidden = { ...cellCenter({ x: 3, y: 2 }), y: 0 }; // behind closed door 0
        for (let t = 0; t < 2.9; t += DT) r = stepRobot(r, hidden, DT, parsed);
        assert.equal(r.mode, 'chase');
        for (let t = 0; t < 0.2; t += DT) r = stepRobot(r, hidden, DT, parsed);
        assert.equal(r.mode, 'patrol');
    });
    test('stepRobot_Patrol_WalksItsPathAndStaysOnFloor', () => {
        let r = createRobot(parsed.patrols[0]);
        const start = { x: r.x, z: r.z };
        for (let t = 0; t < 2; t += DT) r = stepRobot(r, null, DT, parsed);
        assert.ok(!near(r, start, 1));
        assert.equal(parsed.solid(Math.floor(r.x / TILE), Math.floor(r.z / TILE)), false);
    });
    test('stepRobot_Frozen_DoesNotMove', () => {
        let r = { ...facing(), frozenS: 2 };
        for (let i = 0; i < 60; i++) r = stepRobot(r, target, DT, parsed);
        assert.deepEqual([r.x, r.z, r.mode], [facing().x, facing().z, 'patrol']);
        assert.ok(Math.abs(r.frozenS - 1) < 1e-6);
    });
    test('caught_CloseEnough_ReturnsTrue', () => {
        const r = facing();
        assert.equal(caught(r, { x: r.x + 0.5, z: r.z, y: 0 }), true);
        assert.equal(caught(r, { x: r.x + 1.5, z: r.z, y: 0 }), false);
        assert.equal(caught({ ...r, frozenS: 1 }, { x: r.x, z: r.z, y: 0 }), false);
    });
});
