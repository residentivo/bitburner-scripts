/**
 * darknet.js — Probe-only version for debugging
 */

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    ns.print(`[darknet] START pid=${ns.pid} on ${host}`)

    // Kill duplicates
    try {
        for (const p of ns.ps(host)) {
            if (p.filename === ns.getScriptName() && p.pid !== ns.pid) {
                ns.kill(p.pid)
            }
        }
    } catch { }

    // Free RAM
    try {
        for (let i = 0; i < 5; i++) {
            try { ns.dnet.memoryReallocation() } catch { break }
        }
        ns.print(`[darknet] memoryReallocation done`)
    } catch { }

    // Ensure extractor is running
    try {
        if (!ns.ps(host).some(p => p.filename === 'darknet-extractor.js')) {
            const ePid = ns.exec('darknet-extractor.js', host, 1)
            ns.print(`[darknet] spawned extractor pid=${ePid}`)
        }
    } catch (e) {
        ns.print(`[darknet] extractor error: ${e}`)
    }

    // Probe and log neighbors
    try {
        const nearby = ns.dnet.probe()
        ns.print(`[darknet] probe: ${JSON.stringify(nearby)}`)

        for (const neighbor of (nearby || [])) {
            try {
                const d = ns.dnet.getServerDetails(neighbor)
                ns.print(`[darknet] ${neighbor}: online=${d.isOnline} connected=${d.isConnectedToCurrentServer} session=${d.hasSession}`)
            } catch (e) {
                ns.print(`[darknet] ${neighbor} details error: ${e}`)
            }
        }
    } catch (e) {
        ns.print(`[darknet] probe error: ${e}`)
    }

    ns.print(`[darknet] DONE`)
}

export function autocomplete(data) {
    return ["--tail"]
}
