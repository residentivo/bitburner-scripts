/**
 * darknet-extractor.js — Darknet resource extraction
 *
 * Runs on each darknet server to extract resources:
 *  1. Free blocked RAM with ns.dnet.memoryReallocation()
 *  2. Loot .cache files with ns.dnet.openCache()
 *  3. Run phishing attacks with ns.dnet.phishingAttack()
 *
 * Loops forever with no sleep — runs as fast as possible.
 */

function disableLogs(ns, listOfLogs) {
    listOfLogs.forEach(log => ns.disableLog(log))
}

/** @param {NS} ns */
export async function main(ns) {
    disableLogs(ns, ['getServerUsedRam', 'exec', 'scp', 'ls'])

    const host = ns.getHostname()

    // Check dnet API
    try { ns.dnet.probe() } catch { return }

    while (true) {
        // 1. Free blocked RAM
        for (let i = 0; i < 5; i++) {
            try { ns.dnet.memoryReallocation() } catch { break }
        }

        // 2. Loot .cache files
        try {
            for (const file of ns.ls(host, '.cache')) {
                try { ns.dnet.openCache(file) } catch { }
            }
        } catch { }

        // 3. Phishing
        try { await ns.dnet.phishingAttack() } catch { }
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
