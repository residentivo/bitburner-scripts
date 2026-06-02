/**
 * darknet-daemon.js — Minimal daemon for darknet operations.
 * Handles: tor purchase, darknet.js + extractor launch, spread to neighbors.
 * Lightweight version without hacking batch system.
 */

export async function main(ns) {
    ns.disableLog('getServerUsedRam')
    ns.disableLog('exec')
    ns.disableLog('scp')
    ns.disableLog('ls')
    ns.disableLog('scan')

    const host = 'home'
    const darknetScript = 'darknet.js'
    const extractorScript = 'darknet-extractor.js'
    const torManager = '/Tasks/tor-manager.js'

    // Main loop
    let cycles = 0
    while (true) {
        cycles++
        ns.print(`[dnet-daemon] cycle ${cycles}`)

        // Step 1: Ensure darkweb exists (buy TOR if needed)
        try {
            const darkwebReady = ns.scan(host).includes('darkweb')
            if (!darkwebReady && ns.getServerMoneyAvailable(host) >= 200000) {
                const torPid = ns.exec(torManager, host, 1)
                ns.print(`[dnet-daemon] started tor-manager pid=${torPid}`)
                await ns.asleep(2000)
            }
        } catch (e) {
            ns.print(`[dnet-daemon] tor error: ${e}`)
        }

        // Step 2: Ensure darknet.js runs on darkweb
        try {
            if (ns.scan(host).includes('darkweb')) {
                await ns.scp(darknetScript, 'darkweb')
                await ns.scp(extractorScript, 'darkweb')

                const alreadyRunning = ns.ps('darkweb').some(p => p.filename === darknetScript)
                if (!alreadyRunning) {
                    const pid = ns.exec(darknetScript, 'darkweb', 1)
                    ns.print(`[dnet-daemon] spawned ${darknetScript} on darkweb pid=${pid}`)
                }
            }
        } catch (e) {
            ns.print(`[dnet-daemon] darknet spawn error: ${e}`)
        }

        // Step 3: Probe darknet neighbors
        try {
            ns.singularity.connect('darkweb')
            const neighbors = ns.dnet.probe()
            ns.print(`[dnet-daemon] darkweb neighbors: ${JSON.stringify(neighbors)}`)

            // For each neighbor without session, try to auth and spawn
            for (const neighbor of (neighbors || [])) {
                if (neighbor === 'home' || neighbor === 'darkweb') continue

                try {
                    const details = ns.dnet.getServerDetails(neighbor)
                    if (details.hasSession) {
                        // Already authed, just ensure scripts are running
                        await ns.scp(darknetScript, neighbor)
                        await ns.scp(extractorScript, neighbor)
                        if (!ns.ps(neighbor).some(p => p.filename === darknetScript)) {
                            ns.exec(darknetScript, neighbor, 1)
                        }
                        if (!ns.ps(neighbor).some(p => p.filename === extractorScript)) {
                            ns.exec(extractorScript, neighbor, 1)
                        }
                    }
                } catch (e) {
                    ns.print(`[dnet-daemon] neighbor ${neighbor} error: ${e}`)
                }
            }
        } catch (e) {
            ns.print(`[dnet-daemon] probe error: ${e}`)
        }

        // Wait before next cycle
        await ns.asleep(30000)
    }
}

export function autocomplete(data) {
    return data.scripts
}
