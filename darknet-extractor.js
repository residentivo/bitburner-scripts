/**
 * darknet-extractor.js — Darknet resource extraction (single-run)
 *
 * Runs once per invocation on a darknet server:
 *  1. Free blocked RAM with ns.dnet.memoryReallocation()
 *  2. Loot .cache files with ns.dnet.openCache()
 *  3. Detect .exe files (STORM_SEED.exe etc) and report them
 *  4. Run phishing attack with ns.dnet.phishingAttack()
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
        const cacheFiles = ns.ls(host, '.cache')
        for (const file of cacheFiles) {
            try {
                await ns.dnet.openCache(file)
                ns.print(`[extractor] looted ${file}`)
            } catch (e) {
                ns.print(`[extractor] openCache ${file} error: ${e}`)
            }
        }
        if (cacheFiles.length === 0) ns.print('[extractor] no .cache files')
    } catch (e) {
        ns.print(`[extractor] ls error: ${e}`)
    }

    // 3. Detect .exe files (mysterious executables)
    try {
        const exeFiles = ns.ls(host, '.exe')
        for (const file of exeFiles) {
            if (file.includes('STORM_SEED')) {
                // STORM_SEED.exe found — DO NOT auto-execute, it's dangerous
                // It causes a webstorm that deletes/moves servers in the darknet
                ns.print(`[extractor] ⚠️ FOUND ${file} — use ns.dnet.unleashStormSeed() to execute (DANGEROUS)`)
            } else if (file.includes('DarkscapeNavigator')) {
                ns.print(`[extractor] 📍 FOUND ${file} — darknet navigator`)
            } else {
                ns.print(`[extractor] 📦 FOUND ${file} — unknown executable`)
            }
        }
        if (exeFiles.length === 0) ns.print('[extractor] no .exe files')
    } catch (e) {
        ns.print(`[extractor] exe scan error: ${e}`)
    }

    // 4. Phishing
    try {
        const result = await ns.dnet.phishingAttack()
        ns.print(`[extractor] phishing: ${JSON.stringify(result)}`)
    } catch (e) {
        ns.print(`[extractor] phishing: ${e}`)
    }

    ns.print('[extractor] DONE')
}
