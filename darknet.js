/**
 * darknet.js — Single-purpose darknet helper
 * 
 * When run, it:
 *  1. Frees RAM and runs memoryReallocation
 *  2. Ensures darknet-extractor.js is running
 *  3. Does NOT spawn other darknet.js instances (the launcher handles that)
 */

const EXTRACTOR_NAME = 'darknet-extractor.js'

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
        if (!ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)) {
            const ePid = ns.exec(EXTRACTOR_NAME, host, 1)
            ns.print(`[darknet] Spawned extractor pid=${ePid}`)
        } else {
            ns.print(`[darknet] Extractor already running`)
        }
    } catch (e) {
        ns.print(`[darknet] Extractor error: ${e}`)
    }

    // Probe and log what we see (for debugging)
    try {
        const nearby = ns.dnet.probe()
        ns.print(`[darknet] Neighbors: ${JSON.stringify(nearby)}`)
    } catch (e) {
        ns.print(`[darknet] Probe error: ${e}`)
    }

    ns.print(`[darknet] DONE`)
}

export function autocomplete(data) {
    return ["--tail"]
}
