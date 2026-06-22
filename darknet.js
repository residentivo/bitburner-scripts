/**
 * darknet.js — Darknet propagator (loop mode, lightweight)
 * Loops every 500ms:
 *   - Check if already running (skip spawn if so)
 *   - Free RAM (memoryReallocation)
 *   - Probe neighbors
 *   - For each neighbor without session: spawn darknet-auth.js <neighbor>
 *   - For each neighbor already running: skip
 *   - Run extractor locally
 * 
 * Auth is delegated to darknet-auth.js which runs independently
 * per-server to avoid tick timeouts from brute-force loops.
 */

const SCRIPT_NAME = 'darknet.js'
const AUTH_SCRIPT = 'darknet-auth.js'
const EXTRACTOR = 'darknet-extractor.js'

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()

    ns.disableLog('ALL')

    // Dedup: if another instance is already running, exit
    const myPid = ns.pid
    const others = ns.ps(host).filter(p => p.filename === SCRIPT_NAME && p.pid !== myPid)
    if (others.length > 0) return

    ns.print(`[dnet] STARTING darknet.js on ${host} (pid=${myPid})`)

    // Test if ns.dnet is available on this server
    try {
        const testBlocked = await ns.dnet.getBlockedRam(host)
        ns.print(`[dnet] ns.dnet API available on ${host}, blockedRam=${testBlocked}`)
    } catch (e) {
        ns.print(`[dnet] ERROR: ns.dnet API NOT available on ${host}: ${e}`)
        return
    }

    while (true) {
        // Step 0: Free RAM (only if blocked > 0)
        try {
            const blocked = await ns.dnet.getBlockedRam(host)
            if (blocked > 0) await ns.dnet.memoryReallocation()
        } catch (e) { /* ignore */ }

        // Step 1: Probe
        let peers
        try {
            peers = await ns.dnet.probe()
        } catch (e) {
            ns.print(`[dnet] PROBE ERROR: ${e}`)
            await ns.asleep(500)
            continue
        }

        if (!peers || peers.length === 0) {
            await ns.asleep(500)
            continue
        }

        ns.print(`[dnet] PROBE: found ${peers.length} peers: ${peers.join(', ')}`)

        for (const neighbor of peers) {
            if (neighbor === 'home' || neighbor === host) continue

            ns.print(`[dnet] Processing neighbor: ${neighbor}`)

            // Step A: get details
            let details
            try {
                details = await ns.dnet.getServerDetails(neighbor)
            } catch (e) {
                ns.print(`[dnet] ${neighbor} getServerDetails ERROR: ${e}`)
                continue
            }

            ns.print(`[dnet] ${neighbor} details: online=${details.isOnline} connected=${details.isConnectedToCurrentServer} hasSession=${details.hasSession} hint="${details.passwordHint}"`)

            if (!details.isOnline || !details.isConnectedToCurrentServer) {
                ns.print(`[dnet] ${neighbor} SKIPPED (offline or not connected)`)
                continue
            }

            // Step B: Check if darknet-auth.js is already running for this neighbor
            const neighborProcs = ns.ps(neighbor)
            const authRunning = neighborProcs.some(p => p.filename === AUTH_SCRIPT)
            const dnetRunning = neighborProcs.some(p => p.filename === SCRIPT_NAME)

            if (authRunning) {
                ns.print(`[dnet] ${neighbor} auth already running`)
            }

            // Step C: ALWAYS scp scripts to neighbor
            try {
                const scp1 = await ns.scp(SCRIPT_NAME, neighbor, host)
                const scp2 = await ns.scp('darknet-ram.js', neighbor, host)
                const scp3 = await ns.scp(EXTRACTOR, neighbor, host)
                ns.print(`[dnet] ${neighbor} SCP: darknet.js=${scp1} ram.js=${scp2} extractor=${scp3}`)
            } catch (e) {
                ns.print(`[dnet] ${neighbor} SCP ERROR: ${e}`)
            }

            // Step D: If no session and auth not already running, spawn darknet-auth.js
            if (!details.hasSession && !authRunning) {
                try {
                    const authRam = ns.getScriptRam(AUTH_SCRIPT, host)
                    const freeRam = ns.getServerMaxRam(neighbor) - ns.getServerUsedRam(neighbor)
                    const maxThreads = Math.max(1, Math.floor(freeRam / authRam))
                    const threads = Math.min(maxThreads, 1)
                    const pid = ns.exec(AUTH_SCRIPT, neighbor, threads, neighbor)
                    ns.print(`[dnet] ${neighbor} SPAWN auth: pid=${pid} scriptRam=${authRam} freeRam=${freeRam}`)
                    if (pid === 0) {
                        ns.print(`[dnet] ${neighbor} SPAWN FAILED: ns.exec returned 0`)
                    }
                } catch (e) {
                    ns.print(`[dnet] ${neighbor} SPAWN ERROR: ${e}`)
                }
            }

            // Step E: If darknet.js not running on neighbor, spawn it
            if (!dnetRunning) {
                try {
                    const scriptRam = ns.getScriptRam(SCRIPT_NAME, host)
                    const freeRam = ns.getServerMaxRam(neighbor) - ns.getServerUsedRam(neighbor)
                    const maxThreads = Math.max(1, Math.floor(freeRam / scriptRam))
                    const threads = Math.min(maxThreads, 1)
                    const pid = ns.exec(SCRIPT_NAME, neighbor, threads)
                    ns.print(`[dnet] ${neighbor} SPAWN darknet: pid=${pid}`)
                    if (pid === 0) {
                        ns.print(`[dnet] ${neighbor} SPAWN FAILED: ns.exec returned 0`)
                    }
                } catch (e) {
                    ns.print(`[dnet] ${neighbor} SPAWN ERROR: ${e}`)
                }
            } else {
                ns.print(`[dnet] ${neighbor} already running darknet.js`)
            }

            // Step F: Run extractor on neighbor
            const extractorRunning = neighborProcs.some(p => p.filename === EXTRACTOR)
            if (!extractorRunning) {
                try {
                    const extPid = ns.exec(EXTRACTOR, neighbor, 1)
                    ns.print(`[dnet] ${neighbor} EXTRACTOR exec: pid=${extPid}`)
                } catch (e) {
                    ns.print(`[dnet] ${neighbor} EXTRACTOR ERROR: ${e}`)
                }
            }
        }

        // Step G: Run extractor on THIS server
        const localProcs = ns.ps(host)
        const extractorRunning = localProcs.some(p => p.filename === EXTRACTOR)
        if (!extractorRunning) {
            const extPid = ns.exec(EXTRACTOR, host, 1)
            ns.print(`[dnet] ${host} EXTRACTOR exec: pid=${extPid}`)
        } else {
            ns.print(`[dnet] ${host} EXTRACTOR already running`)
        }

        await ns.asleep(500)
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
