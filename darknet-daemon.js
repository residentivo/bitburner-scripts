/**
 * darknet-daemon.js — Lightweight daemon for darknet operations.
 * Ensures darknet.js is running on all accessible darknet servers.
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
    const lockFile = '/Temp/darknet-daemon.lock.txt'

    // Main loop
    while (true) {
        // Prevent overlapping runs
        if (ns.fileExists(lockFile)) {
            await ns.asleep(5000)
            continue
        }
        try { ns.write(lockFile, String(Date.now()), 'w') } catch { }

        try {
            // Step 1: Ensure darkweb exists (buy TOR if needed)
            if (!ns.serverExists('darkweb') && ns.getServerMoneyAvailable(host) >= 200000) {
                ns.exec(torManager, host, 1)
                await ns.asleep(3000)
            }

            // Step 2: Ensure darknet.js + extractor run on darkweb
            if (ns.serverExists('darkweb')) {
                // Copy scripts
                await ns.scp(darknetScript, 'darkweb')
                await ns.scp(extractorScript, 'darkweb')

                // Spawn darknet.js if not already running
                if (!ns.ps('darkweb').some(p => p.filename === darknetScript)) {
                    const pid = ns.exec(darknetScript, 'darkweb', 1)
                    ns.print(`[dnet-daemon] spawned darknet.js pid=${pid}`)
                }

                // Spawn extractor if not already running
                if (!ns.ps('darkweb').some(p => p.filename === extractorScript)) {
                    const ePid = ns.exec(extractorScript, 'darkweb', 1)
                    ns.print(`[dnet-daemon] spawned extractor pid=${ePid}`)
                }
            }
        } catch (e) {
            ns.print(`[dnet-daemon] error: ${e}`)
        }

        // Release lock
        try { ns.rm(lockFile) } catch { }

        // Wait 30 seconds
        await ns.asleep(30000)
    }
}

export function autocomplete(data) {
    return data.scripts
}
