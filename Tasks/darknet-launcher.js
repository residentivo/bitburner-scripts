/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js.
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
            // Check if already running on target
            const running = ns.ps(target).some(p => p.filename === script)
            if (running) {
                ns.tprint(`darknet-launcher: ${script} already running on ${target}, skipping`)
                continue
            }
        } catch { continue }

        try {
            // Delete old script file on target before copying fresh version
            try { ns.rm(script, target) } catch (_) {}
            await ns.scp(script, target)

            // Delete extractor too
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
