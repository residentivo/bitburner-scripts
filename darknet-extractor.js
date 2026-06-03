/**
 * darknet-extractor.js — Darknet resource extraction (single-run)
 *
 * Runs once per invocation on a darknet server:
 *  1. Free blocked RAM with ns.dnet.memoryReallocation()
 *  2. Loot .cache files with ns.dnet.openCache()
 *  3. Run phishing attack with ns.dnet.phishingAttack()
 *
 * No loops, no while(true) — safe for darknet servers.
 */
export async function main(ns) {
    const host = ns.getHostname()
    ns.print(`[extractor] START on ${host}`)

    // 1. Free blocked RAM
    try {
        await ns.dnet.memoryReallocation()
        ns.print('[extractor] memoryReallocation OK')
    } catch (e) {
        ns.print(`[extractor] memoryReallocation: ${e}`)
    }

    // 2. Loot .cache files
    try {
        const files = ns.ls(host, '.cache')
        for (const file of files) {
            try {
                await ns.dnet.openCache(file)
                ns.print(`[extractor] looted ${file}`)
            } catch { }
        }
        if (files.length === 0) ns.print('[extractor] no .cache files')
    } catch (e) {
        ns.print(`[extractor] ls error: ${e}`)
    }

    // 3. Phishing
    try {
        const result = await ns.dnet.phishingAttack()
        ns.print(`[extractor] phishing: ${JSON.stringify(result)}`)
    } catch (e) {
        ns.print(`[extractor] phishing: ${e}`)
    }

    ns.print('[extractor] DONE')
}
