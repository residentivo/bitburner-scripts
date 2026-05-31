/**
 * darknet-launcher.js — Ensures darknet explorer and extractor run on darknet servers.
 *
 * Run periodically from daemon.js. Connects to darkweb, discovers darknet servers,
 * and ensures darknet.js (explorer) and darknet-extractor.js are running on each.
 */

export async function main(ns) {
    const DEBUG = true;
    const logFile = '/Temp/darknet-launcher-log.txt';

    function log(msg) {
        const line = '[' + new Date().toISOString().substring(11, 19) + '] ' + msg;
        try { ns.write(logFile, line + '\n', 'a'); } catch (_) {}
        if (DEBUG) try { ns.tprint('[LAUNCHER] ' + msg); } catch (_) {}
    }

    // Check if dnet API is available (we might already be on darknet server)
    let dnetAvailable = false;
    try {
        ns.dnet.probe();
        dnetAvailable = true;
        log('dnet API available');
    } catch {
        // Try connecting to darkweb
        log('dnet not available, connecting to darkweb...');
        try {
            ns.singularity.connect('darkweb');
            await ns.sleep(500);
            ns.dnet.probe();
            dnetAvailable = true;
            log('dnet API available after connect');
        } catch (e) {
            log('Cannot access darknet: ' + String(e));
            try { ns.write('/Temp/dnet-disabled.txt', 'no access', 'w'); } catch (_) {}
            return;
        }
    }

    try { ns.rm('/Temp/dnet-disabled.txt'); } catch (_) {}

    // Discover darknet servers by BFS from darkweb
    const visited = new Set(['home']);
    const darknetServers = [];
    const queue = [];

    // Start from darkweb neighbors
    try {
        const darkwebNeighbors = ns.scan('darkweb');
        for (const n of darkwebNeighbors) {
            if (!visited.has(n)) queue.push(n);
        }
    } catch (e) {
        log('Cannot scan darkweb: ' + String(e));
        return;
    }

    // Also check if darkweb itself is a darknet server
    try {
        const details = ns.dnet.getServerDetails('darkweb');
        if (details) {
            darknetServers.push('darkweb');
            log('darkweb is a darknet server');
        }
    } catch (_) {}

    // BFS to find all darknet servers
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);

        try {
            const details = ns.dnet.getServerDetails(current);
            if (details) {
                darknetServers.push(current);
                log('Found darknet server: ' + current);

                const neighbors = ns.scan(current);
                for (const n of neighbors) {
                    if (!visited.has(n)) queue.push(n);
                }
            }
        } catch {
            // Not a darknet server, scan neighbors anyway
            try {
                const neighbors = ns.scan(current);
                for (const n of neighbors) {
                    if (!visited.has(n)) queue.push(n);
                }
            } catch (_) {}
        }
    }

    if (darknetServers.length === 0) {
        log('No darknet servers found');
        return;
    }

    log('Managing ' + darknetServers.length + ' darknet servers');

    const scripts = ['darknet.js', 'darknet-extractor.js'];

    for (const server of darknetServers) {
        for (const script of scripts) {
            try {
                // Check if script is already running on this server
                const procs = ns.ps(server);
                const running = procs.some(p => p.filename === script);

                if (running) {
                    log(script + ' already running on ' + server);
                    continue;
                }

                // Copy script to server if not there
                if (!ns.fileExists(script, server)) {
                    const copied = await ns.scp(script, server);
                    if (!copied) {
                        log('FAILED to copy ' + script + ' to ' + server);
                        continue;
                    }
                    log('Copied ' + script + ' to ' + server);
                }

                // Check free RAM
                const freeRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
                const scriptRam = ns.getScriptRam(script, server);

                if (freeRam < scriptRam) {
                    log('Not enough RAM on ' + server + ' for ' + script);
                    continue;
                }

                // Start script
                const pid = ns.exec(script, server, 1);
                if (pid === 0) {
                    log('FAILED to start ' + script + ' on ' + server);
                } else {
                    log('Started ' + script + ' on ' + server + ' (pid ' + pid + ')');
                }
            } catch (e) {
                log('Error managing ' + script + ' on ' + server + ': ' + String(e));
            }
        }
    }

    log('Done. Next check in ~60s.');
}
