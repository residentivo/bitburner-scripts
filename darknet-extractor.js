/**
 * darknet-extractor.js — Darknet resource extraction (loop mode)
 * Loops every 1s:
 *   1. Free blocked RAM with ns.dnet.memoryReallocation()
 *   2. Loot .cache files with ns.dnet.openCache()
 *   3. Detect .exe files (STORM_SEED.exe etc) and report them
 *   4. Run phishing attack with ns.dnet.phishingAttack()
 */

const EXTRACTOR_NAME = 'darknet-extractor.js'

export async function main(ns) {
    const host = ns.getHostname()

    ns.disableLog('ALL')

    // Dedup
    const myPid = ns.pid
    const others = ns.ps(host).filter(p => p.filename === EXTRACTOR_NAME && p.pid !== myPid)
    if (others.length > 0) return

    // Test if ns.dnet is available
    try {
        await ns.dnet.getBlockedRam(host)
    } catch (e) {
        ns.print(`[extractor] ERROR: ns.dnet API NOT available on ${host}: ${e}`)
        return
    }

    ns.print(`[extractor] STARTING on ${host} (pid=${myPid})`)

    while (true) {
        // 1. Free blocked RAM (only if blocked > 0)
        try {
            const blocked = await ns.dnet.getBlockedRam(host)
            if (blocked > 0) {
                await ns.dnet.memoryReallocation()
            }
        } catch (e) { /* ignore */ }

        // 2. Loot .cache files
        try {
            const cacheFiles = ns.ls(host, '.cache')
            for (const file of cacheFiles) {
                try { await ns.dnet.openCache(file) } catch (e) { /* try next */ }
            }
        } catch (e) { /* ignore */ }

        // 3. Detect .exe files — silent, no spam
        // (only log once per file, but we skip logging to keep tail clean)

        // 4. Phishing
        try { await ns.dnet.phishingAttack() } catch (e) { /* ignore */ }

        await ns.asleep(1000)
    }
}
