/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js.
 */

export async function main(ns) {
    const disabledFlag = '/Temp/dnet-disabled.txt'
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'
    const lockFile = '/Temp/dnet-running.txt'
    const LOCK_TIMEOUT = 120000 // 2 minutes

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
            // Check lock file with timestamp
            if (ns.fileExists(lockFile, target)) {
                try {
                    const content = ns.read(lockFile, target)
                    const lockTime = parseInt(content) || 0
                    if (Date.now() - lockTime < LOCK_TIMEOUT) {
                        // Lock is still valid, skip
                        continue
                    }
                    // Lock expired, will respawn
                } catch { }
            }
        } catch { continue }

        try {
            // Delete old script file on target before copying fresh version
            try { ns.rm(script, target) } catch (_) {}
            await ns.scp(script, target)

            // Delete extractor too
            try { ns.rm(ext, target) } catch (_) {}
            await ns.scp(ext, target)

            // Write lock with current timestamp BEFORE spawning
            try { ns.write(lockFile, String(Date.now()), target) } catch { }

            const pid = ns.exec(script, target, 1)
            if (pid) {
                ns.tprint(`darknet-launcher: spawned ${script} on ${target} (pid=${pid})`)
            }
        } catch (e) {
            ns.tprint(`darknet-launcher: ERROR on ${target}: ${e}`)
        }
    }
}
