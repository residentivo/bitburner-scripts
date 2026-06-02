/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js. Spawns on any nearby that isn't already running.
 */

export async function main(ns) {
    const disabledFlag = '/Temp/dnet-disabled.txt'
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'

    // Check dnet API access
    try { ns.dnet.probe() } catch {
        try {
            ns.singularity.connect('darkweb')
            await ns.sleep(500)
        } catch { return }
        try { ns.dnet.probe() } catch { return }
    }
    try { ns.rm(disabledFlag) } catch (_) {}

    // Get targets: darkweb + all probed neighbors
    let targets
    try {
        const probed = ns.dnet.probe()
        targets = ['darkweb', ...probed]
    } catch { return }

    for (const target of targets) {
        try {
            // Skip if already running
            if (ns.ps(target).some(p => p.filename === script)) {
                // Kill old instance to force fresh run with latest script
                for (const p of ns.ps(target)) {
                    if (p.filename === script) ns.kill(p.pid, target)
                }
            }
        } catch { continue }

        try {
            // Delete old script version and copy fresh one
            try { ns.rm(script, target) } catch (_) {}
            await ns.scp(script, target)

            // Also copy extractor
            try { ns.rm(ext, target) } catch (_) {}
            await ns.scp(ext, target)

            const pid = ns.exec(script, target, 1)
            if (pid) {
                ns.tprint(`darknet-launcher: spawned ${script} on ${target} (pid=${pid})`)
            }
        } catch (e) {
            ns.tprint(`darknet-launcher: ERROR on ${target}: ${e}`)
        }
    }
}
