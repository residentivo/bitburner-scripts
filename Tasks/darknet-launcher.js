/**
 * darknet-launcher.js — Conecta ao darkweb e inicia darknet.js + darknet-extractor.js
 *
 * Este script é executado pelo daemon no home, conecta ao darkweb,
 * e inicia os scripts de exploração e extração diretamente no servidor darkweb.
 */

/** @param {NS} ns */
export async function main(ns) {
    // Check if dnet is available
    try {
        ns.dnet.probe();
    } catch {
        // Try to connect to darkweb
        try {
            if (!ns.singularity) {
                ns.tprint('ERROR: ns.singularity not available');
                return;
            }
            ns.tprint('INFO: Connecting to darkweb...');
            ns.singularity.connect('darkweb');
            await ns.sleep(1000);

            // Verify dnet is now available
            try {
                ns.dnet.probe();
                ns.tprint('SUCCESS: Connected to darkweb!');
            } catch {
                ns.tprint('ERROR: dnet still not available after connect. Need to buy DarkscapeNavigator.exe first.');
                return;
            }
        } catch (e) {
            ns.tprint('ERROR: Failed to connect to darkweb: ' + String(e));
            return;
        }
    }

    const darknetServers = ['darkweb'];

    // Probe for all reachable darknet servers
    try {
        const nearby = ns.dnet.probe();
        if (nearby) {
            for (const s of nearby) {
                if (!darknetServers.includes(s)) darknetServers.push(s);
            }
        }
    } catch (_) {}

    ns.tprint('INFO: Found ' + darknetServers.length + ' darknet server(s): ' + darknetServers.join(', '));

    for (const server of darknetServers) {
        // Copy and run darknet.js (explorer) on each darknet server
        const explorerScript = '/darknet.js';
        const extractorScript = '/darknet-extractor.js';

        // Copy scripts to target
        try {
            if (!ns.fileExists(explorerScript, server)) {
                await ns.scp(explorerScript, server);
                ns.tprint('Copied ' + explorerScript + ' to ' + server);
            }
            if (!ns.fileExists(extractorScript, server)) {
                await ns.scp(extractorScript, server);
                ns.tprint('Copied ' + extractorScript + ' to ' + server);
            }
        } catch (e) {
            ns.tprint('ERROR copying to ' + server + ': ' + String(e));
            continue;
        }

        // Kill existing instances
        try {
            const procs = ns.ps(server);
            for (const p of procs) {
                if (p.filename === explorerScript || p.filename === extractorScript) {
                    ns.kill(p.pid, server);
                }
            }
        } catch (_) {}
        await ns.sleep(200);

        // Check RAM
        const freeRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        const explorerRam = ns.getScriptRam(explorerScript, server);
        const extractorRam = ns.getScriptRam(extractorScript, server);
        const needed = explorerRam + extractorRam;

        if (freeRam < needed) {
            ns.tprint('WARN: ' + server + ' needs ' + needed.toFixed(1) + 'GB but only has ' + freeRam.toFixed(1) + 'GB free. Skipping extraction.');
            // At least run explorer
            if (freeRam >= explorerRam) {
                const pid = ns.exec(explorerScript, server, 1);
                ns.tprint(pid ? 'Started explorer on ' + server + ' (pid ' + pid + ')' : 'Failed to start explorer on ' + server);
            }
            continue;
        }

        // Start both scripts
        const pid1 = ns.exec(explorerScript, server, 1);
        ns.tprint(pid1 ? 'Started explorer on ' + server + ' (pid ' + pid1 + ')' : 'Failed to start explorer on ' + server);

        await ns.sleep(100);

        const pid2 = ns.exec(extractorScript, server, 1);
        ns.tprint(pid2 ? 'Started extractor on ' + server + ' (pid ' + pid2 + ')' : 'Failed to start extractor on ' + server);
    }

    ns.tprint('INFO: Darknet launcher done.');
}
