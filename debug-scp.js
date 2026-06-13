/**
 * debug-scp.js — Testa scp de scripts para um server específico
 * Uso: run debug-scp.js <hostname>
 */

const SCRIPTS = ['/Remote/weak-target.js', '/Remote/grow-target.js', '/Remote/hack-target.js'];

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

    const target = ns.args[0];
    if (!target) {
        ns.tprint('Uso: run debug-scp.js <hostname>');
        return;
    }

    const home = 'home';

    ns.tprint(`=== SCP DEBUG: home -> ${target} ===`);
    ns.tprint(`Home free RAM: ${ns.format.ram(ns.getServerMaxRam(home) - ns.getServerUsedRam(home))}`);
    ns.tprint(`Target: ${target} | Rooted: ${ns.hasRootAccess(target)} | RAM: ${ns.format.ram(ns.getServerMaxRam(target))}`);

    // Check source files exist on home
    ns.tprint('');
    ns.tprint('--- Source files on home ---');
    for (const f of SCRIPTS) {
        const exists = ns.fileExists(f, home);
        ns.tprint(`  ${exists ? 'Y' : 'N'} ${f}`);
    }

    // Check existing files on target
    ns.tprint('');
    ns.tprint('--- Target files BEFORE scp ---');
    const before = ns.ls(target).filter(f => SCRIPTS.includes(f));
    for (const f of SCRIPTS) {
        ns.tprint(`  ${before.includes(f) ? 'Y' : 'N'} ${f}`);
    }

    // Try direct scp (no getNsDataThroughFile)
    ns.tprint('');
    ns.tprint('--- Running direct ns.scp ---');
    for (const f of SCRIPTS) {
        if (!ns.fileExists(f, home)) {
            ns.tprint(`  SKIP ${f} — not found on home`);
            continue;
        }
        try {
            // v3 API: scp(files, destination, source)
            const result = await ns.scp(f, target, home);
            ns.tprint(`  ${result ? 'OK' : 'FAIL'} scp(${f}, ${target}, ${home})`);
        } catch (e) {
            ns.tprint(`  ERROR scp(${f}): ${String(e)}`);
        }
    }

    // Check files on target after
    ns.tprint('');
    ns.tprint('--- Target files AFTER direct scp ---');
    const after = ns.ls(target).filter(f => SCRIPTS.includes(f));
    for (const f of SCRIPTS) {
        ns.tprint(`  ${after.includes(f) ? 'Y' : 'N'} ${f}`);
    }

    // If direct scp worked, also try exec
    if (SCRIPTS.every(f => after.includes(f))) {
        ns.tprint('');
        ns.tprint('--- Testing exec ---');
        for (const f of SCRIPTS) {
            try {
                const pid = ns.exec(f, target, 1);
                ns.tprint(`  ${pid > 0 ? 'OK' : 'FAIL'} exec(${f}) pid=${pid}`);
                if (pid > 0) ns.kill(pid);
            } catch (e) {
                ns.tprint(`  ERROR exec(${f}): ${String(e)}`);
            }
        }
        ns.tprint('');
        ns.tprint('=== SCP + EXEC OK ===');
    } else {
        ns.tprint('');
        ns.tprint('=== SCP FAILED — scripts not copied ===');
    }
}
