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
    ns.disableLog('getServerUsedRam')
    ns.disableLog('exec')
    ns.disableLog('scp')
    ns.disableLog('ls')
    ns.disableLog('read')
    ns.disableLog('write')

    const host = ns.getHostname()
    safeLog(ns, `=== MINIMAL START pid=${ns.pid} on ${host} ===`)

    // Test 1: basic API check
    safeLog(ns, `ns.dnet exists: ${typeof ns.dnet}`)
    safeLog(ns, `ns.dnet.probe exists: ${typeof ns.dnet?.probe}`)

    // Test 2: probe
    try {
        const result = ns.dnet.probe()
        safeLog(ns, `probe() returned: ${JSON.stringify(result)} (type: ${typeof result})`)
        safeLog(ns, `probe() length: ${result?.length}`)
    } catch (e) {
        safeLog(ns, `probe() ERROR: ${e}`)
    }

    // Test 3: getServerDetails for each probed server
    try {
        const probed = ns.dnet.probe()
        for (const s of (probed || [])) {
            try {
                const d = ns.dnet.getServerDetails(s)
                safeLog(ns, `getServerDetails(${s}): isOnline=${d.isOnline} isConnected=${d.isConnectedToCurrentServer} hasSession=${d.hasSession}`)
            } catch (e) {
                safeLog(ns, `getServerDetails(${s}) ERROR: ${e}`)
            }
        }
    } catch (e) {
        safeLog(ns, `loop ERROR: ${e}`)
    }

    // Test 4: check if we can stay alive (loop)
    safeLog(ns, 'Starting loop...')
    let iterations = 0
    while (iterations < 5) {
        iterations++
        safeLog(ns, `Iteration ${iterations}`)
        try {
            ns.dnet.memoryReallocation()
            safeLog(ns, `  memoryReallocation OK`)
        } catch (e) {
            safeLog(ns, `  memoryReallocation ERROR: ${e}`)
        }
        try {
            const p = ns.dnet.probe()
            safeLog(ns, `  probe OK: ${JSON.stringify(p)}`)
        } catch (e) {
            safeLog(ns, `  probe ERROR: ${e}`)
        }
    }

    safeLog(ns, `=== MINIMAL DONE ===`)
}
