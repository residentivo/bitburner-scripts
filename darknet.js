/**
 * darknet.js — Minimal darknet helper
 * Loop: ensures extractor runs + frees RAM periodically.
 * No sleep to avoid Bitburner remote server issues.
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

    let cycles = 0
    while (true) {
        cycles++

        // Ensure extractor is running
        if (!ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)) {
            try {
                ns.exec(EXTRACTOR_NAME, host, 1)
                ns.print(`[darknet] spawned extractor`)
            } catch { }
        }

        // Free RAM
        if (cycles % 5 === 0) {
            try {
                for (let i = 0; i < 5; i++) {
                    try { ns.dnet.memoryReallocation() } catch { break }
                }
            } catch { }
        }
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
