/**
 * darknet-launcher.js — Starts darknet.js on darkweb and its neighbors.
 * Run periodically from daemon.js.
 */

export async function main(ns) {
    const script = 'darknet.js'
    const ext = 'darknet-extractor.js'
    const lockFile = '/Temp/dnet-running.txt'
    const LOG_FILE = '/Temp/darknet-launcher-log.txt'
    const LOCK_TIMEOUT = 120000 // 2 minutes

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
        log(`dnet.probe() failed: ${e}, trying connect darkweb...`)
        try {
            ns.singularity.connect('darkweb')
            log(`Connected to darkweb`)
        } catch (e2) {
            log(`Cannot connect to darkweb: ${e2}`)
            return
        }
        try {
            ns.dnet.probe()
            log(`dnet.probe() OK after connect`)
        } catch (e3) {
            log(`dnet.probe() still failed: ${e3}`)
            return
        }
    }

    // Get targets: darkweb + all probed neighbors (deduped, no 'home')
    let targets
    try {
        const probed = ns.dnet.probe()
        log(`probe() returned: ${JSON.stringify(probed)}`)
        const allTargets = new Set(['darkweb', ...probed])
        allTargets.delete('home')
        targets = [...allTargets]
        log(`targets: ${JSON.stringify(targets)}`)
    } catch (e) {
        log(`ERROR probe failed: ${e}`)
        return
    }

    for (const target of targets) {
        log(`--- Processing target: ${target} ---`)
        try {
            const procs = ns.ps(target)
            log(`Processes on ${target}: ${procs.map(p => p.filename + ':' + p.pid).join(', ')}`)
            const alreadyRunning = procs.some(p => p.filename === script)
            if (alreadyRunning) {
                log(`${script} already running on ${target}, skipping`)
                try { ns.write(lockFile, String(Date.now()), target) } catch { }
                continue
            }
        } catch (e) {
            log(`ERROR checking processes on ${target}: ${e}`)
            continue
        }

        try {
            for (const p of ns.ps(target)) {
                if (p.filename === ext) {
                    ns.kill(p.pid, target)
                    log(`Killed old extractor pid=${p.pid} on ${target}`)
                }
            }
        } catch (e) {
            log(`ERROR killing processes on ${target}: ${e}`)
        }

        try {
            log(`SCP ${script} -> ${target}...`)
            await ns.scp(script, target)
            log(`SCP ${ext} -> ${target}...`)
            await ns.scp(ext, target)

            try { ns.write(lockFile, String(Date.now()), target) } catch { }

            log(`exec ${script} on ${target} (1 thread)...`)
            const pid = ns.exec(script, target, 1)
            log(`exec returned pid=${pid}`)

            if (pid) {
                await ns.asleep(5)
                const stillRunning = ns.ps(target).some(p => p.pid === pid)
                log(`stillRunning check: ${stillRunning}`)
                if (!stillRunning) {
                    log(`PID ${pid} died on ${target}, retrying...`)
                    await ns.asleep(50)
                    const pid2 = ns.exec(script, target, 1)
                    log(`retry exec returned pid=${pid2}`)
                    if (pid2) await ns.asleep(5)
                }
                log(`SUCCESS spawned ${script} on ${target}`)
            } else {
                log(`exec returned 0 on ${target} (no RAM?)`)
            }
        } catch (e) {
            log(`ERROR on ${target}: ${e}`)
        }
    }

    log(`=== LAUNCHER END ===`)
}
