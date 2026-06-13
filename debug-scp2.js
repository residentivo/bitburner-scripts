/**
 * debug-scp2.js — Testa ambas as ordens de argumentos do scp
 * Uso: run debug-scp2.js <hostname>
 */

const SCRIPTS = ['/Remote/weak-target.js'];

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

    const target = ns.args[0] || 'foodnstuff';
    const home = 'home';

    ns.tprint(`=== SCP ORDER TEST: ${home} -> ${target} ===`);

    // Test 1: scp(files, destination, source) — documented order
    ns.tprint('');
    ns.tprint('--- Test 1: scp(file, destination=target, source=home) ---');
    try {
        const r1 = await ns.scp('/Remote/weak-target.js', target, home);
        ns.tprint(`  Result: ${r1}`);
        const exists1 = ns.fileExists('/Remote/weak-target.js', target);
        ns.tprint(`  File exists on target: ${exists1}`);
        if (exists1) ns.rm('/Remote/weak-target.js', target);
    } catch (e) {
        ns.tprint(`  ERROR: ${String(e)}`);
    }

    // Test 2: scp(files, source, destination) — reversed
    ns.tprint('');
    ns.tprint('--- Test 2: scp(file, source=home, destination=target) ---');
    try {
        const r2 = await ns.scp('/Remote/weak-target.js', home, target);
        ns.tprint(`  Result: ${r2}`);
        const exists2 = ns.fileExists('/Remote/weak-target.js', target);
        ns.tprint(`  File exists on target: ${exists2}`);
        if (exists2) ns.rm('/Remote/weak-target.js', target);
    } catch (e) {
        ns.tprint(`  ERROR: ${String(e)}`);
    }

    // Test 3: scp(files, destination) — 2 args, source=current server
    ns.tprint('');
    ns.tprint('--- Test 3: scp(file, destination=target) — 2 args ---');
    try {
        const r3 = await ns.scp('/Remote/weak-target.js', target);
        ns.tprint(`  Result: ${r3}`);
        const exists3 = ns.fileExists('/Remote/weak-target.js', target);
        ns.tprint(`  File exists on target: ${exists3}`);
        if (exists3) ns.rm('/Remote/weak-target.js', target);
    } catch (e) {
        ns.tprint(`  ERROR: ${String(e)}`);
    }

    // Test 4: scp with array
    ns.tprint('');
    ns.tprint('--- Test 4: scp([file], destination=target, source=home) array ---');
    try {
        const r4 = await ns.scp(['/Remote/weak-target.js'], target, home);
        ns.tprint(`  Result: ${r4}`);
        const exists4 = ns.fileExists('/Remote/weak-target.js', target);
        ns.tprint(`  File exists on target: ${exists4}`);
        if (exists4) ns.rm('/Remote/weak-target.js', target);
    } catch (e) {
        ns.tprint(`  ERROR: ${String(e)}`);
    }

    // Test 5: scp with array, reversed
    ns.tprint('');
    ns.tprint('--- Test 5: scp([file], source=home, destination=target) array reversed ---');
    try {
        const r5 = await ns.scp(['/Remote/weak-target.js'], home, target);
        ns.tprint(`  Result: ${r5}`);
        const exists5 = ns.fileExists('/Remote/weak-target.js', target);
        ns.tprint(`  File exists on target: ${exists5}`);
        if (exists5) ns.rm('/Remote/weak-target.js', target);
    } catch (e) {
        ns.tprint(`  ERROR: ${String(e)}`);
    }

    ns.tprint('');
    ns.tprint('=== DONE ===');
}
