/**
 * debug-scp3.js — Testa scp com conexão direta via singularity
 * Uso: run debug-scp3.js <hostname>
 */

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

    const target = ns.args[0] || 'foodnstuff';
    const home = 'home';

    ns.tprint(`=== SCP CONNECT TEST: ${home} -> ${target} ===`);

    // Check if we can connect directly
    ns.tprint(`Connected to home: ${ns.singularity.getCurrentServer()}`);

    // Try connecting to target
    try {
        await ns.singularity.connect(target);
        ns.tprint(`Connected to: ${ns.singularity.getCurrentServer()}`);
    } catch (e) {
        ns.tprint(`Cannot connect to ${target}: ${String(e)}`);
        return;
    }

    // scp while connected to target
    ns.tprint('');
    ns.tprint('--- scp while connected to target ---');
    try {
        // Copy FROM home TO target (we're connected to target)
        const r = await ns.scp('/Remote/weak-target.js', home);
        ns.tprint(`Result: ${r}`);
        const exists = ns.fileExists('/Remote/weak-target.js');
        ns.tprint(`File exists on current server (${target}): ${exists}`);
    } catch (e) {
        ns.tprint(`ERROR: ${String(e)}`);
    }

    // Connect back to home
    await ns.singularity.connect(home);
    ns.tprint(`Back to: ${ns.singularity.getCurrentServer()}`);

    // scp while connected to home
    ns.tprint('');
    ns.tprint('--- scp while connected to home ---');
    try {
        const r = await ns.scp('/Remote/weak-target.js', target);
        ns.tprint(`Result: ${r}`);
    } catch (e) {
        ns.tprint(`ERROR: ${String(e)}`);
    }

    // Now check if file exists on target by connecting to it
    await ns.singularity.connect(target);
    const exists = ns.fileExists('/Remote/weak-target.js');
    ns.tprint(`File exists on target after scp from home: ${exists}`);

    // Cleanup
    if (exists) {
        ns.rm('/Remote/weak-target.js');
        ns.tprint('Cleaned up test file');
    }

    await ns.singularity.connect(home);
    ns.tprint('');
    ns.tprint('=== DONE ===');
}
