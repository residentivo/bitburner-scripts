/**
 * darknet-launcher.js — Starts darknet.js on darkweb.
 * Run periodically from daemon.js.
 * 
 * Simple: just ensure darknet.js + extractor are running on darkweb.
 */

const LOCK_FILE = '/Temp/darknet-launcher.lock.txt'
const LOCK_TTL = 60000 // 1 minute

export async function main(ns) {
    // Check lock
    if (ns.fileExists(LOCK_FILE)) {
        try {
            const lock = JSON.parse(ns.read(LOCK_FILE))
            if (Date.now() - lock.ts < LOCK_TTL) {
                ns.print('darknet-launcher: locked, skipping')
                return
            }
        } catch { }
    }

    const targets = ['darkweb']
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'

    for (const target of targets) {
        try {
            // Check if already running
            if (ns.ps(target).some(p => p.filename === script)) {
                ns.print(`darknet-launcher: ${script} already on ${target}`)
                continue
            }

            // Copy and spawn
            await ns.scp(script, target)
            await ns.scp(ext, target)

            const pid = ns.exec(script, target, 1)
            ns.print(`darknet-launcher: spawned ${target} pid=${pid}`)
        } catch (e) {
            ns.print(`darknet-launcher: error ${target}: ${e}`)
        }
    }

    // Write lock
    try {
        ns.write(LOCK_FILE, JSON.stringify({ ts: Date.now() }), 'w')
    } catch { }
}

export function autocomplete(data) {
    return data.scripts
}
