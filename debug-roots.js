/**
 * debug-roots.js — Verifica quais servers estão rooted e hackeáveis
 * Uso: run debug-roots.js
 */

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

    const home = 'home';
    const myHack = ns.getHackingLevel();

    // Scan all
    const all = new Set();
    const q = [home];
    const seen = new Set([home]);
    while (q.length > 0) {
        const h = q.shift();
        for (const p of ns.scan(h)) {
            all.add(p);
            if (!seen.has(p)) { seen.add(p); q.push(p); }
        }
    }

    const targets = [...all]
        .filter(s => s !== home && !s.startsWith('hacknet-') && !s.startsWith('daemon'))
        .sort((a, b) => ns.getServerRequiredHackingLevel(a) - ns.getServerRequiredHackingLevel(b));

    let rooted = 0, hackable = 0, both = 0;

    ns.tprint(`Hack Level: ${myHack} | Total: ${targets.length}`);
    ns.tprint('');

    for (const s of targets) {
        const req = ns.getServerRequiredHackingLevel(s);
        const isRooted = ns.hasRootAccess(s);
        const canHack = req <= myHack;
        const maxMoney = ns.getServerMaxMoney(s);

        if (isRooted) rooted++;
        if (canHack) hackable++;
        if (isRooted && canHack) {
            both++;
            ns.tprint(`  OK  ${s.padEnd(28)} req=${String(req).padStart(3)} money=${ns.format.number(maxMoney).padStart(12)} sec=${ns.getServerSecurityLevel(s).toFixed(1)}/${ns.getServerMinSecurityLevel(s).toFixed(1)}`);
        }
    }

    ns.tprint('');
    ns.tprint(`Rooted: ${rooted} | Hackable: ${hackable} | Both: ${both}`);

    // Check if hack tools exist on home
    ns.tprint('');
    ns.tprint('Home scripts:');
    for (const f of ['/Remote/weak-target.js', '/Remote/grow-target.js', '/Remote/hack-target.js']) {
        ns.tprint(`  ${ns.fileExists(f, home) ? 'Y' : 'N'} ${f}`);
    }

    // Check home RAM
    ns.tprint('');
    ns.tprint(`Home RAM: ${ns.format.ram(ns.getServerMaxRam(home))} total, ${ns.format.ram(ns.getServerUsedRam(home))} used, ${ns.format.ram(ns.getServerMaxRam(home) - ns.getServerUsedRam(home))} free`);
}
