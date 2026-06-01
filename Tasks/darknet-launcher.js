/**
 * darknet-launcher.js — Starts darknet.js on darknet servers.
 *
 * Run periodically from daemon.js. Connects to darkweb, then starts
 * darknet.js directly on the darkweb server. The explorer script
 * spreads itself to other darknet servers automatically.
 */

export async function main(ns) {
    const disabledFlag = '/Temp/dnet-disabled.txt'

    // Check if dnet API is available
    try {
        ns.dnet.probe()
    } catch {
        // Try connecting to darkweb
        try {
            ns.singularity.connect('darkweb')
            await ns.sleep(500)
        } catch (e) {
            ns.write(disabledFlag, 'no darknet access', 'w')
            return
        }
        try {
            ns.dnet.probe()
        } catch (e) {
            ns.write(disabledFlag, 'no darknet access', 'w')
            return
        }
    }

    try { ns.rm(disabledFlag) } catch (_) {}

    // Start darknet.js on darkweb (it will self-spread to other servers)
    const script = 'darknet.js'
    const target = 'darkweb'

    try {
        // Copy script to darkweb if not there
        if (!ns.fileExists(script, target)) {
            await ns.scp(script, target)
        }

        // Kill existing instances on darkweb (fresh start)
        for (const p of ns.ps(target)) {
            if (p.filename === script) ns.kill(p.pid, target)
        }
        await ns.sleep(100)

        // Check free RAM on darkweb
        const freeRam = ns.getServerMaxRam(target) - ns.getServerUsedRam(target)
        const scriptRam = ns.getScriptRam(script, target)
        if (freeRam < scriptRam) {
            ns.tprint('Not enough RAM on ' + target + ' for ' + script)
            return
        }

        const pid = ns.exec(script, target, 1)
        if (pid) {
            ns.tprint('Launched ' + script + ' on ' + target + ' (pid ' + pid + ')')
        } else {
            ns.tprint('Failed to launch ' + script + ' on ' + target)
        }
    } catch (e) {
        ns.tprint('Error launching darknet: ' + String(e))
    }
}
