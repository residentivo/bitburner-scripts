/**
 * kill-all-daemons.js — Mata todos os daemon.js RODANDO (em qualquer servidor) e roda um novo na home
 * Uso: run kill-all-daemons.js
 */

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

    // Scan all servers
    const all = new Set();
    const q = ['home'];
    const seen = new Set(['home']);
    while (q.length > 0) {
        const h = q.shift();
        for (const p of ns.scan(h)) {
            all.add(p);
            if (!seen.has(p)) { seen.add(p); q.push(p); }
        }
    }

    let killed = 0;
    for (const s of all) {
        const procs = ns.ps(s).filter(p => p.filename === 'daemon.js');
        for (const p of procs) {
            ns.kill(p.pid, s);
            ns.tprint(`Killed daemon.js PID ${p.pid} on ${s}`);
            killed++;
        }
    }

    ns.tprint(`Total killed: ${killed}`);

    // Start daemon on home with 1 thread
    const pid = ns.exec('daemon.js', 'home', 1);
    if (pid > 0) {
        ns.tprint(`Started daemon.js on home PID ${pid}`);
    } else {
        ns.tprint('ERROR: Failed to start daemon.js on home');
    }
}
