/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js.
 * 
 * Uses a lock file to prevent re-running while darknet is active.
 * The lock is invalidated if no darknet.js is actually running on the targets.
 */

const LOCK_FILE = '/Temp/darknet-launcher.lock'
const LOCK_TTL = 120000 // 2 minutes

export async function main(ns) {
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'

    // Check lock file — if it exists and is recent, skip
    if (ns.fileExists(LOCK_FILE)) {
        try {
            const lockContent = ns.read(LOCK_FILE)
            const lockData = JSON.parse(lockContent)
            const age = Date.now() - lockData.ts
            if (age < LOCK_TTL) {
                // Lock is still valid, but verify darknet.js is actually running
                const targets = lockData.targets || []
                let anyRunning = false
                for (const t of targets) {
                    try {
                        if (ns.ps(t).some(p => p.filename === script)) {
                            anyRunning = true
                            break
                        }
                    } catch { }
                }
                if (anyRunning) {
                    ns.print('darknet-launcher: lock active, skipping')
                    return
                }
            }
        } catch { }
    }

    // Check dnet API access
    let probed
    try {
        ns.dnet.probe()
        probed = ns.dnet.probe()
    } catch (e) {
        ns.print(`darknet-launcher: dnet API error: ${e}`)
        return
    }

    const targets = ['darkweb', ...(probed || [])].filter(t => t !== 'home')
    const spawned = []

    for (const target of targets) {
        // Skip if already running
        try {
            if (ns.ps(target).some(p => p.filename === script)) {
                spawned.push(target)
                continue
            }
        } catch {
            continue
        }

        try {
            await ns.scp(script, target)
            await ns.scp(ext, target)
            const pid = ns.exec(script, target, 1)
            if (pid) {
                spawned.push(target)
                ns.print(`darknet-launcher: spawned ${target} pid=${pid}`)
            }
        } catch (e) {
            ns.print(`darknet-launcher: error on ${target}: ${e}`)
        }
    }

    // Write lock with timestamp and target list
    try {
        ns.write(LOCK_FILE, JSON.stringify({ ts: Date.now(), targets: spawned }), 'w')
    } catch { }

    ns.print(`darknet-launcher: done, spawned/maintaining ${spawned.length} targets`)
}

export function autocomplete(data) {
    return data.scripts
}
