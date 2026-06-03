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
    ns.print(`[extractor] START on ${host} (loop mode)`)

    // Dedup: if another instance is already running, exit
    const myPid = ns.pid
    const others = ns.ps(host).filter(p => p.filename === EXTRACTOR_NAME && p.pid !== myPid)
    if (others.length > 0) {
        ns.print(`[extractor] another instance already running (pid ${others[0].pid}), exiting`)
        return
    }

    while (true) {
        // 1. Free blocked RAM
        try {
            await ns.dnet.memoryReallocation()
        } catch (e) { /* ignore */ }

        // 2. Loot .cache files
        try {
            const cacheFiles = ns.ls(host, '.cache')
            for (const file of cacheFiles) {
                try {
                    await ns.dnet.openCache(file)
                    ns.print(`[extractor] looted ${file}`)
                } catch (e) { /* try next */ }
            }
        } catch (e) { /* ignore */ }

        // 3. Detect .exe files
        try {
            const exeFiles = ns.ls(host, '.exe')
            for (const file of exeFiles) {
                if (file.includes('STORM_SEED')) {
                    ns.print(`[extractor] ⚠️ FOUND ${file} — DANGEROUS, will NOT auto-execute`)
                } else if (file.includes('DarkscapeNavigator')) {
                    ns.print(`[extractor] 📍 FOUND ${file} — darknet navigator`)
                } else {
                    ns.print(`[extractor] 📦 FOUND ${file}`)
                }
            }
        } catch (e) { /* ignore */ }

        // 4. Phishing
        try {
            await ns.dnet.phishingAttack()
        } catch (e) { /* ignore */ }

        await ns.asleep(1000)
    }
}
