/**
 * darknet.js — Darknet helper
 * Frees RAM, runs extractor, probes neighbors, auths and spawns.
 * All dnet API calls are awaited to prevent concurrency errors.
 */

const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR_NAME = 'darknet-extractor.js'

const commonPasswords = ['password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest']

const commonByLength = {
    3: ['cat', 'dog', 'foo', 'bar', '123', 'pwd'],
    4: ['pass', 'test', 'root', 'user', 'abcd', '1234', 'hack', 'open'],
    5: ['admin', 'qwert', 'abcde', '12345', 'hello', 'world', 'sword', 'blade'],
    6: ['123456', 'qwerty', 'secret', 'abcdef', 'letme1', 'access', 'oracle'],
    7: ['letmein', 'abcdefg', '1234567', 'testing', 'changeme'],
    8: ['password', 'trustno1', 'sunshine', 'iloveyou', '12345678'],
}

function log(ns, msg) {
    ns.print(`[darknet] ${msg}`)
}

function solvePassword(hint, hintData) {
    if (!hint) return null
    const h = hint.toLowerCase()

    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(\w+)/i)
    if (keyMatch) return keyMatch[1]

    const romanMatch = hint.match(/value of the number ['"]?([IVXLCDM]+)['"]?/i)
    if (romanMatch) {
        const roman = romanMatch[1].toUpperCase()
        const rv = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
        let num = 0
        for (let i = 0; i < roman.length; i++) {
            const val = rv[roman[i]] || 0
            const next = (i + 1 < roman.length) ? (rv[roman[i + 1]] || 0) : 0
            num += (val < next) ? -val : val
        }
        return String(num)
    }

    if (h.includes('default') || h.includes('factory')) return '__MULTI__'

    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        if (commonByLength[len]) return '__BUFFER__' + len
    }

    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 3) return extracted
        }
        return '123456'
    }

    return null
}

async function tryAuth(ns, hostname, password) {
    const result = await ns.dnet.authenticate(hostname, password)
    return result.success
}

async function authenticateServer(ns, hostname) {
    let details
    try {
        details = await ns.dnet.getServerDetails(hostname)
    } catch { return false }

    if (!details.isOnline) return false
    if (!details.isConnectedToCurrentServer) return false
    if (details.hasSession) return true

    const hint = details.passwordHint || ''
    const hintData = details.data || ''

    const solved = solvePassword(hint, hintData)
    if (!solved) return false

    let candidates
    if (solved.startsWith('__MULTI__')) candidates = commonPasswords
    else if (solved.startsWith('__BUFFER__')) candidates = commonByLength[parseInt(solved.replace('__BUFFER__', ''))] || []
    else candidates = [solved]

    for (const pw of candidates) {
        if (await tryAuth(ns, hostname, pw)) return true
    }

    return false
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    log(ns, `START pid=${ns.pid}`)

    // Kill duplicates
    for (const p of ns.ps(host)) {
        if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) {
            ns.kill(p.pid)
        }
    }

    // Free RAM — single call with long delay after
    try {
        await ns.dnet.memoryReallocation()
        log(ns, 'memoryReallocation 1/1 done')
    } catch (e) {
        log(ns, `memoryReallocation error: ${e}`)
    }

    // Small delay before next dnet call
    await ns.asleep(100)

    // Ensure extractor is running
    try {
        if (!ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)) {
            const ePid = ns.exec(EXTRACTOR_NAME, host, 1)
            log(ns, `spawned extractor pid=${ePid}`)
        }
    } catch (e) {
        log(ns, `extractor error: ${e}`)
    }

    await ns.asleep(100)

    // Probe neighbors
    let nearby
    try {
        nearby = await ns.dnet.probe()
        log(ns, `probe: ${JSON.stringify(nearby)}`)
    } catch (e) {
        log(ns, `probe error: ${e}`)
        return
    }

    if (!nearby || nearby.length === 0) {
        log(ns, 'no neighbors')
        return
    }

    // Auth + spawn on each neighbor
    let spawned = 0
    for (const neighbor of nearby) {
        if (neighbor === 'home' || neighbor === host) continue

        // Skip if already running
        try {
            if (ns.ps(neighbor).some(p => p.filename === SCRIPT_NAME)) continue
        } catch { }

        log(ns, `auth ${neighbor}...`)
        const authed = await authenticateServer(ns, neighbor)
        if (!authed) {
            log(ns, `auth FAIL ${neighbor}`)
            continue
        }
        log(ns, `auth OK ${neighbor}`)

        try {
            await ns.scp(SCRIPT_NAME, neighbor)
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            if (pid) {
                spawned++
                log(ns, `spawned ${neighbor} pid=${pid}`)
            }
        } catch (e) {
            log(ns, `spawn error ${neighbor}: ${e}`)
        }

        try {
            await ns.scp(EXTRACTOR_NAME, neighbor)
            if (!ns.ps(neighbor).some(p => p.filename === EXTRACTOR_NAME)) {
                ns.exec(EXTRACTOR_NAME, neighbor, 1)
            }
        } catch { }

        // Delay between operations on different servers
        await ns.asleep(500)
    }

    log(ns, `DONE: ${spawned}/${nearby.length} spawned`)
}

export function autocomplete(data) {
    return ["--tail"]
}
