/**
 * darknet-extractor.js — Darknet resource extraction
 *
 * Runs on each darknet server to extract resources:
 *  1. Free blocked RAM with ns.dnet.memoryReallocation()
 *  2. Loot .cache files with ns.dnet.openCache()
 *  3. Run phishing attacks with ns.dnet.phishingAttack()
 */

const extractInterval = 30000

function disableLogs(ns, listOfLogs) {
    listOfLogs.forEach(log => ns.disableLog(log))
}

async function extractFromServer(ns) {
    const hostname = ns.getHostname()
    if (hostname !== 'darkweb' && !hostname.startsWith('darknet-')) return

    // 1. Free blocked RAM
    for (let i = 0; i < 5; i++) {
        try { ns.dnet.memoryReallocation() } catch { break }
        await ns.sleep(100)
    }

    // 2. Loot .cache files
    try {
        for (const file of ns.ls(hostname, '.cache')) {
            try { ns.dnet.openCache(file) } catch { }
        }
    } catch { }

    // 3. Phishing attack
    try { await ns.dnet.phishingAttack() } catch { }
}

/** @param {NS} ns */
export async function main(ns) {
    disableLogs(ns, ['getServerUsedRam', 'asleep', 'exec', 'scp', 'ls'])

    try { ns.dnet.probe() } catch (e) {
        ns.tprint('ERROR: ns.dnet API not available on ' + ns.getHostname())
        return
    }

    // Kill other instances
    const myName = ns.getScriptName()
    const myHost = ns.getHostname()
    for (const p of ns.ps(myHost)) {
        if (p.filename === myName && p.pid !== ns.pid) ns.kill(p.pid)
    }

    while (true) {
        try { await extractFromServer(ns) } catch { }
        await ns.sleep(extractInterval)
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
