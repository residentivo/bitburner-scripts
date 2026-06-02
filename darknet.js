/**
 * darknet.js — Minimal darknet helper (single-run)
 * Frees RAM and runs extractor. Returns immediately.
 * The launcher re-runs this periodically via the daemon.
 */

const EXTRACTOR_NAME = 'darknet-extractor.js'

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()

    // Kill duplicates
    try {
        for (const p of ns.ps(host)) {
            if (p.filename === ns.getScriptName() && p.pid !== ns.pid) {
                ns.kill(p.pid)
            }
        }
    } catch { }

    // Ensure extractor is running
    try {
        if (!ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)) {
            ns.exec(EXTRACTOR_NAME, host, 1)
        }
    } catch { }

    // Free RAM
    try {
        for (let i = 0; i < 5; i++) {
            try { ns.dnet.memoryReallocation() } catch { break }
        }
    } catch { }
}

export function autocomplete(data) {
    return ["--tail"]
}
