/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js.
 */

export async function main(ns) {
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'
    const LOG_FILE = '/Temp/darknet-launcher-log.txt'

    function log(msg) {
        const line = `[${new Date().toISOString()}] ${msg}`
        ns.tprint(line)
        try {
            let existing = ''
            try { existing = ns.read(LOG_FILE) || '' } catch { }
            ns.write(LOG_FILE, existing + line + '\n')
        } catch { }
    }

    log(`=== LAUNCHER START pid=${ns.pid} ===`)

    // Check dnet API access
    try {
        ns.dnet.probe()
        log(`dnet.probe() OK`)
    } catch (e) {
        log(`dnet.probe() failed: ${e}`)
        return
    }

    // Get targets: darkweb + all probed neighbors
    let targets
    try {
        const probed = ns.dnet.probe()
        log(`probe() returned: ${JSON.stringify(probed)}`)
        // Include darkweb and all probed servers
        const allTargets = new Set(['darkweb', ...(probed || [])])
        targets = [...allTargets]
        log(`targets: ${JSON.stringify(targets)}`)
    } catch (e) {
        log(`probe failed: ${e}`)
        return
    }

    for (const target of targets) {
        log(`--- target: ${target} ---`)

        // Copy scripts to target
        try {
            await ns.scp(script, target)
            await ns.scp(ext, target)
            log(`SCP OK to ${target}`)
        } catch (e) {
            log(`SCP ERROR to ${target}: ${e}`)
            continue
        }

        // Check if already running
        try {
            const procs = ns.ps(target)
            const running = procs.filter(p => p.filename === script)
            if (running.length > 0) {
                log(`${script} already running on ${target} (${running.map(p => p.pid).join(',')})`)
                continue
            }
        } catch (e) {
            log(`ps ERROR on ${target}: ${e}`)
        }

        // Spawn darknet.js on target
        try {
            const pid = ns.exec(script, target, 1)
            if (pid) {
                await ns.asleep(10)
                // Verify it's still alive
                const alive = ns.ps(target).some(p => p.pid === pid)
                log(`Spawned ${script} on ${target} pid=${pid} alive=${alive}`)
            } else {
                log(`exec returned 0 on ${target}`)
            }
        } catch (e) {
            log(`exec ERROR on ${target}: ${e}`)
        }
    }

    log(`=== LAUNCHER END ===`)
}
