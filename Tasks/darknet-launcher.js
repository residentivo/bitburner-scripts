/**
 * darknet-launcher.js — Starts darknet.js on darkweb.
 * Run periodically from daemon.js.
 * 
 * Ensures exactly one darknet.js runs on darkweb at a time.
 * Kills old instances before spawning new ones.
 */

export async function main(ns) {
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'
    const target = 'darkweb'

    try {
        // Kill old darknet.js instances on target
        for (const p of ns.ps(target)) {
            if (p.filename === script) {
                ns.kill(p.pid, target)
                ns.print(`launcher: killed old pid=${p.pid} on ${target}`)
            }
        }

        // Copy scripts
        await ns.scp(script, target)
        await ns.scp(ext, target)

        // Spawn fresh instance
        const pid = ns.exec(script, target, 1)
        ns.print(`launcher: spawned ${target} pid=${pid}`)
    } catch (e) {
        ns.print(`launcher: error: ${e}`)
    }
}

export function autocomplete(data) {
    return data.scripts
}
