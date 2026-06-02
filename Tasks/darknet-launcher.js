/**
 * darknet-launcher.js — Spawns darknet.js + extractor on darkweb.
 * Run periodically from daemon.js (every 60s).
 */

export async function main(ns) {
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'
    const target = 'darkweb'

    try {
        await ns.scp(script, target)
        await ns.scp(ext, target)
        const pid = ns.exec(script, target, 1)
        ns.print(`launcher: spawned pid=${pid}`)
    } catch (e) {
        ns.print(`launcher: ${e}`)
    }
}

export function autocomplete(data) {
    return data.scripts
}
