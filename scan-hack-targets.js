/**
 * scan-hack-targets.js — Diagnóstico: lista servers hackeáveis e status de scripts
 * Uso: run scan-hack-targets.js
 * Output: /Temp/scan-hack-targets.txt (sobrescrito a cada run)
 */

const HACK_TOOLS = ['/Remote/weak-target.js', '/Remote/grow-target.js', '/Remote/hack-target.js'];
const OUT_FILE = '/Temp/scan-hack-targets.txt';

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

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
        // Check which hack tools are present on the target server
        const files = HACK_TOOLS.filter(t => ns.fileExists(t, s));
        const hasAllTools = HACK_TOOLS.every(t => ns.fileExists(t, s));
        const hasAnyTool = files.length > 0;

        let status;
        if (!rooted) status = 'NO-ROOT';
        else if (!canHack) status = 'LOW-HACK';
        else if (hasAllTools) status = 'READY';
        else if (hasAnyTool) status = 'PARTIAL';
        else status = 'NO-SCRIPTS';

        rows.push({
            name: s,
            reqHack,
            canHack: canHack ? 'Y' : 'N',
            rooted: rooted ? 'Y' : 'N',
            maxMoney,
            curMoney,
            minSec: minSec.toFixed(1),
            curSec: curSec.toFixed(1),
            ram,
            files: files.length,
            hasAllTools: hasAllTools ? 'Y' : 'N',
            status,
        });
    }

    // Build output
    const out = [];
    const line = (s) => out.push(s);

    line('================================================================================');
    line(`SCAN HACK TARGETS | Hack Level: ${myHack} | Total servers: ${targets.length} | ${new Date().toISOString()}`);
    line('================================================================================');

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

        line('');
        line(`--- ${status} (${group.length} servers) ---`);
        line(`${'Server'.padEnd(28)} ${'ReqHack'.padStart(7)} ${'Hack'.padStart(4)} ${'Root'.padStart(4)} ${'MaxMoney'.padStart(12)} ${'CurMoney'.padStart(12)} ${'MinSec'.padStart(7)} ${'CurSec'.padStart(7)} ${'RAM'.padStart(8)} ${'Files'.padStart(5)} ${'All'.padStart(3)}`);
        line('-'.repeat(110));

        for (const r of group) {
            line(
                `${r.name.padEnd(28)} ${String(r.reqHack).padStart(7)} ${r.canHack.padStart(4)} ${r.rooted.padStart(4)} ${ns.format.number(r.maxMoney).padStart(12)} ${ns.format.number(r.curMoney).padStart(12)} ${r.minSec.padStart(7)} ${r.curSec.padStart(7)} ${ns.format.ram(r.ram).padStart(8)} ${String(r.files).padStart(5)} ${r.hasAllTools.padStart(3)}`
            );
        }
    }

    // Summary
    const ready = (groups['READY'] || []).length;
    const noScripts = (groups['NO-SCRIPTS'] || []).length;
    const partial = (groups['PARTIAL'] || []).length;
    const lowHack = (groups['LOW-HACK'] || []).length;
    const noRoot = (groups['NO-ROOT'] || []).length;
    const hackable = rows.filter(r => r.rooted === 'Y' && r.canHack === 'Y').length;

    line('');
    line('================================================================================');
    line('SUMMARY:');
    line(`  Total servers:           ${targets.length}`);
    line(`  Hackable (rooted+level): ${hackable}`);
    line(`  READY (all tools):       ${ready}`);
    line(`  NO-SCRIPTS (need copy):  ${noScripts}`);
    line(`  PARTIAL (some files):    ${partial}`);
    line(`  LOW-HACK (need level):   ${lowHack}`);
    line(`  NO-ROOT (need crack):    ${noRoot}`);
    line('================================================================================');

    // Daemon servers
    line('');
    line('--- DAEMON SERVERS (purchased) ---');
    const daemons = [...allServers].filter(s => s.startsWith('daemon')).sort();
    if (daemons.length === 0) {
        line('  (none found)');
    } else {
        line(`${'Server'.padEnd(20)} ${'MaxRam'.padStart(8)} ${'UsedRam'.padStart(8)} ${'FreeRam'.padStart(8)} ${'Root'.padStart(4)} ${'Weak'.padStart(5)} ${'Grow'.padStart(5)} ${'Hack'.padStart(5)}`);
        line('-'.repeat(65));
        for (const s of daemons) {
            const maxR = ns.getServerMaxRam(s);
            const usedR = ns.getServerUsedRam(s);
            const freeR = maxR - usedR;
            const rooted = ns.hasRootAccess(s) ? 'Y' : 'N';
            const w = ns.fileExists('/Remote/weak-target.js', s) ? 'Y' : 'N';
            const g = ns.fileExists('/Remote/grow-target.js', s) ? 'Y' : 'N';
            const h = ns.fileExists('/Remote/hack-target.js', s) ? 'Y' : 'N';
            line(`${s.padEnd(20)} ${ns.format.ram(maxR).padStart(8)} ${ns.format.ram(usedR).padStart(8)} ${ns.format.ram(freeR).padStart(8)} ${rooted.padStart(4)} ${w.padStart(5)} ${g.padStart(5)} ${h.padStart(5)}`);
        }
    }

    // Home
    line('');
    line('--- HOME SERVER ---');
    const homeMax = ns.getServerMaxRam(home);
    const homeUsed = ns.getServerUsedRam(home);
    line(`  Max RAM:  ${ns.format.ram(homeMax)}`);
    line(`  Used RAM: ${ns.format.ram(homeUsed)}`);
    line(`  Free RAM: ${ns.format.ram(homeMax - homeUsed)}`);
    line('  Scripts on home:');
    for (const f of HACK_TOOLS) {
        line(`    ${ns.fileExists(f, home) ? 'Y' : 'N'} ${f}`);
    }
    line('================================================================================');

    // Write file
    ns.write(OUT_FILE, out.join('\n'), 'w');
    ns.tprint(`Wrote report to ${OUT_FILE} — open with: cat ${OUT_FILE}`);
}
