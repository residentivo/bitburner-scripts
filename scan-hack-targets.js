/**
 * scan-hack-targets.js — Diagnóstico: lista servers hackeáveis e status de scripts
 * Uso: run scan-hack-targets.js
 */

const HACK_TOOLS = ['/Remote/weak-target.js', '/Remote/grow-target.js', '/Remote/hack-target.js'];

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');
    ns.clearLog();

    const home = 'home';
    const myHack = ns.getHackingLevel();
    const allServers = new Set();
    const queue = [home];
    const scanned = new Set([home]);

    // Scan all servers
    while (queue.length > 0) {
        const host = queue.shift();
        const peers = ns.scan(host);
        for (const p of peers) {
            allServers.add(p);
            if (!scanned.has(p)) {
                scanned.add(p);
                queue.push(p);
            }
        }
    }

    // Filter: not home, not hacknet, not daemon-*
    const targets = [...allServers]
        .filter(s => s !== home && !s.startsWith('hacknet-') && !s.startsWith('daemon'))
        .sort((a, b) => ns.getServerRequiredHackingLevel(a) - ns.getServerRequiredHackingLevel(b));

    const rows = [];

    for (const s of targets) {
        const reqHack = ns.getServerRequiredHackingLevel(s);
        const rooted = ns.hasRootAccess(s);
        const canHack = reqHack <= myHack;
        const maxMoney = ns.getServerMaxMoney(s);
        const curMoney = ns.getServerMoneyAvailable(s);
        const minSec = ns.getServerMinSecurityLevel(s);
        const curSec = ns.getServerSecurityLevel(s);
        const ram = ns.getServerMaxRam(s);

        // Check which hack tools are present
        const files = ns.ls(s).filter(f => HACK_TOOLS.includes(f));
        const hasAllTools = HACK_TOOLS.every(t => files.includes(t));
        const hasAnyTool = files.length > 0;

        // Status
        let status;
        if (!rooted) status = 'NO-ROOT';
        else if (!canHack) status = 'LOW-HACK';
        else if (hasAllTools) status = 'READY';
        else if (hasAnyTool) status = 'PARTIAL';
        else status = 'NO-SCRIPTS';

        rows.push({
            name: s,
            reqHack,
            myHack,
            canHack: canHack ? '✓' : '✗',
            rooted: rooted ? '✓' : '✗',
            maxMoney,
            curMoney,
            minSec: minSec.toFixed(1),
            curSec: curSec.toFixed(1),
            ram,
            files: files.length,
            hasAllTools: hasAllTools ? '✓' : '✗',
            status,
        });
    }

    // Print header
    ns.tprint('='.repeat(140));
    ns.tprint(`SCAN HACK TARGETS | Hack Level: ${myHack} | Total servers: ${targets.length}`);
    ns.tprint('='.repeat(140));

    // Group by status
    const groups = {};
    for (const r of rows) {
        if (!groups[r.status]) groups[r.status] = [];
        groups[r.status].push(r);
    }

    const statusOrder = ['READY', 'NO-SCRIPTS', 'PARTIAL', 'LOW-HACK', 'NO-ROOT'];

    for (const status of statusOrder) {
        const group = groups[status];
        if (!group || group.length === 0) continue;

        ns.tprint('');
        ns.tprint(`--- ${status} (${group.length} servers) ---`);
        ns.tprint(
            `${'Server'.padEnd(25)} ${'ReqHack'.padStart(7)} ${'CanHack'.padStart(7)} ${'Rooted'.padStart(7)} ${'MaxMoney'.padStart(12)} ${'CurMoney'.padStart(12)} ${'MinSec'.padStart(7)} ${'CurSec'.padStart(7)} ${'RAM'.padStart(8)} ${'Files'.padStart(5)} ${'AllTools'.padStart(8)}`
        );
        ns.tprint('-'.repeat(120));

        for (const r of group) {
            ns.tprint(
                `${r.name.padEnd(25)} ${String(r.reqHack).padStart(7)} ${r.canHack.padStart(7)} ${r.rooted.padStart(7)} ${ns.formatNumber(r.maxMoney).padStart(12)} ${ns.formatNumber(r.curMoney).padStart(12)} ${r.minSec.padStart(7)} ${r.curSec.padStart(7)} ${ns.formatRam(r.ram).padStart(8)} ${String(r.files).padStart(5)} ${r.hasAllTools.padStart(8)}`
            );
        }
    }

    // Summary
    const ready = (groups['READY'] || []).length;
    const noScripts = (groups['NO-SCRIPTS'] || []).length;
    const partial = (groups['PARTIAL'] || []).length;
    const lowHack = (groups['LOW-HACK'] || []).length;
    const noRoot = (groups['NO-ROOT'] || []).length;
    const hackable = rows.filter(r => r.rooted === '✓' && r.canHack === '✓').length;

    ns.tprint('');
    ns.tprint('='.repeat(140));
    ns.tprint(`SUMMARY:`);
    ns.tprint(`  Total servers:      ${targets.length}`);
    ns.tprint(`  Hackable (rooted+level): ${hackable}`);
    ns.tprint(`  READY (all tools):  ${ready}`);
    ns.tprint(`  NO-SCRIPTS (need copy): ${noScripts}`);
    ns.tprint(`  PARTIAL (some files): ${partial}`);
    ns.tprint(`  LOW-HACK (need level): ${lowHack}`);
    ns.tprint(`  NO-ROOT (need crack):  ${noRoot}`);
    ns.tprint('='.repeat(140));

    // Also check daemon servers
    ns.tprint('');
    ns.tprint('--- DAEMON SERVERS (purchased) ---');
    const daemons = [...allServers].filter(s => s.startsWith('daemon')).sort();
    if (daemons.length === 0) {
        ns.tprint('  (none found)');
    } else {
        ns.tprint(
            `${'Server'.padEnd(20)} ${'MaxRam'.padStart(8)} ${'UsedRam'.padStart(8)} ${'FreeRam'.padStart(8)} ${'Rooted'.padStart(7)} ${'Weak'.padStart(5)} ${'Grow'.padStart(5)} ${'Hack'.padStart(5)}`
        );
        ns.tprint('-'.repeat(70));
        for (const s of daemons) {
            const maxR = ns.getServerMaxRam(s);
            const usedR = ns.getServerUsedRam(s);
            const freeR = maxR - usedR;
            const rooted = ns.hasRootAccess(s) ? '✓' : '✗';
            const hasWeak = ns.fileExists('/Remote/weak-target.js', s) ? '✓' : '✗';
            const hasGrow = ns.fileExists('/Remote/grow-target.js', s) ? '✓' : '✗';
            const hasHack = ns.fileExists('/Remote/hack-target.js', s) ? '✓' : '✗';
            ns.tprint(
                `${s.padEnd(20)} ${ns.formatRam(maxR).padStart(8)} ${ns.formatRam(usedR).padStart(8)} ${ns.formatRam(freeR).padStart(8)} ${rooted.padStart(7)} ${hasWeak.padStart(5)} ${hasGrow.padStart(5)} ${hasHack.padStart(5)}`
            );
        }
    }

    // Check home
    ns.tprint('');
    ns.tprint('--- HOME SERVER ---');
    const homeMax = ns.getServerMaxRam(home);
    const homeUsed = ns.getServerUsedRam(home);
    ns.tprint(`  Max RAM:  ${ns.formatRam(homeMax)}`);
    ns.tprint(`  Used RAM: ${ns.formatRam(homeUsed)}`);
    ns.tprint(`  Free RAM: ${ns.formatRam(homeMax - homeUsed)}`);
    ns.tprint(`  Scripts on home:`);
    for (const f of HACK_TOOLS) {
        const exists = ns.fileExists(f, home) ? '✓' : '✗';
        ns.tprint(`    ${exists} ${f}`);
    }
}
