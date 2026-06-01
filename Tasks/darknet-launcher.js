/**
 * darknet-launcher.js — Starts darknet.js on darkweb.
 * Run periodically from daemon.js.
 */

export async function main(ns) {
    const disabledFlag = '/Temp/dnet-disabled.txt'

    try { ns.dnet.probe() } catch {
        try {
            ns.singularity.connect('darkweb')
            await ns.sleep(500)
        } catch { return }
        try { ns.dnet.probe() } catch { return }
    }

    try { ns.rm(disabledFlag) } catch (_) {}

    const script = 'darknet.js'
    const target = 'darkweb'

    try {
        if (!ns.fileExists(script, target)) await ns.scp(script, target)
        for (const p of ns.ps(target)) {
            if (p.filename === script) ns.kill(p.pid, target)
        }
        await ns.sleep(100)
        ns.exec(script, target, 1)
    } catch { }
}
