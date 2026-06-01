/**
 * darknet-launcher.js — Starts darknet.js on darkweb.
 * Run periodically from daemon.js. Only starts if not already running.
 */

export async function main(ns) {
    const disabledFlag = '/Temp/dnet-disabled.txt'
    const script = 'darknet.js'
    const target = 'darkweb'

    // Check dnet API access
    try { ns.dnet.probe() } catch {
        try {
            ns.singularity.connect('darkweb')
            await ns.sleep(500)
        } catch { return }
        try { ns.dnet.probe() } catch { return }
    }
    try { ns.rm(disabledFlag) } catch (_) {}

    // Check if darknet.js is already running on darkweb
    try {
        const running = ns.ps(target).some(p => p.filename === script)
        if (running) return // Already running, nothing to do
    } catch { return }

    // Not running — copy script and start it
    try {
        if (!ns.fileExists(script, target)) await ns.scp(script, target)
        ns.exec(script, target, 1)
    } catch { }
}
