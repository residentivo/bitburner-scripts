/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js. Spawns on any nearby that isn't already running.
 */

export async function main(ns) {
    const disabledFlag = '/Temp/dnet-disabled.txt'
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'
    const targets = ['darkweb', ...ns.dnet.probe()]

    // Check dnet API access
    try { ns.dnet.probe() } catch {
        try {
            ns.singularity.connect('darkweb')
            await ns.sleep(500)
        } catch { return }
        try { ns.dnet.probe() } catch { return }
    }
    try { ns.rm(disabledFlag) } catch (_) {}

    for (const target of targets) {
        try {
            // Skip if already running
            if (ns.ps(target).some(p => p.filename === script)) continue
        } catch { continue }

        try {
            if (!ns.fileExists(script, target)) await ns.scp(script, target)
            if (!ns.fileExists(ext, target)) await ns.scp(ext, target)
            ns.exec(script, target, 1)
        } catch { }
    }
}
