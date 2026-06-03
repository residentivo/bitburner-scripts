/**
 * darknet-minimal.js — Minimal test to check darknet API on darkweb
 */

const LOG_FILE = '/Temp/darknet-minimal-log.txt'

function safeLog(ns, msg) {
    const line = `[${new Date().toISOString()}] ${msg}`
    ns.print(line)
    try {
        let existing = ''
        try { existing = ns.read(LOG_FILE) || '' } catch { }
        ns.write(LOG_FILE, existing + line + '\n')
    } catch { }
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    safeLog(ns, `=== START pid=${ns.pid} on ${host} ===`)

    // Kill duplicates
    for (const p of ns.ps(host)) {
        if (p.filename === ns.getScriptName() && p.pid !== ns.pid) {
            ns.kill(p.pid)
            safeLog(ns, `Killed duplicate pid=${p.pid}`)
        }
    }

    // Test APIs
    safeLog(ns, `ns.dnet type: ${typeof ns.dnet}`)
    safeLog(ns, `ns.dnet.probe type: ${typeof ns.dnet?.probe}`)

    const probed = ns.dnet.probe()
    safeLog(ns, `probe(): ${JSON.stringify(probed)}`)

    for (const s of (probed || [])) {
        try {
            const d = ns.dnet.getServerDetails(s)
            safeLog(ns, `getServerDetails(${s}): online=${d.isOnline} connected=${d.isConnectedToCurrentServer} session=${d.hasSession}`)
        } catch (e) {
            safeLog(ns, `getServerDetails(${s}) ERROR: ${e}`)
        }
    }

    // Test extractor spawn
    const ext = 'darknet-extractor.js'
    const hasExt = ns.ps(host).some(p => p.filename === ext)
    safeLog(ns, `extractor running: ${hasExt}`)
    if (!hasExt) {
        try {
            await ns.scp(ext, host)
            const ePid = ns.exec(ext, host, 1)
            safeLog(ns, `spawned extractor pid=${ePid}`)
        } catch (e) {
            safeLog(ns, `extractor spawn ERROR: ${e}`)
        }
    }

    // Stay alive - loop forever
    safeLog(ns, 'Entering main loop (5 iterations)...')
    for (let i = 1; i <= 5; i++) {
        try {
            ns.dnet.memoryReallocation()
            safeLog(ns, `[${i}] memoryReallocation OK`)
        } catch (e) {
            safeLog(ns, `[${i}] memoryReallocation ERROR: ${e}`)
        }
        try {
            const p = ns.dnet.probe()
            safeLog(ns, `[${i}] probe OK: ${JSON.stringify(p)}`)
        } catch (e) {
            safeLog(ns, `[${i}] probe ERROR: ${e}`)
        }
    }

    safeLog(ns, `=== DONE on ${host} ===`)
}
