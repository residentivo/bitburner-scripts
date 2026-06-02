/**
 * darknet.js — Lightweight darknet spreader
 *
 * Runs on every darknet server. Each instance:
 *  1. Frees RAM on the current server
 *  2. Ensures extractor is running locally
 *  3. Probes neighbors, authenticates via hint solver
 *  4. Copies itself + extractor to authenticated neighbors, spawns both
 *  5. Terminates after one spread cycle (relies on launcher for re-runs if needed)
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
    try {
        const result = await ns.dnet.authenticate(hostname, password)
        return result.success
    } catch { return false }
}

async function authenticateServer(ns, hostname) {
    let details
    try {
        details = ns.dnet.getServerDetails(hostname)
    } catch { return false }

    if (!details.isOnline) return false
    if (!details.isConnectedToCurrentServer) return false
    if (details.hasSession) return true

    const hint = details.passwordHint || ''
    const hintData = details.data || ''

    const solved = solvePassword(hint, hintData)
    if (!solved) {
        log(ns, `No password solution for ${hostname}, hint="${hint}"`)
        return false
    }

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
    try {
        for (const p of ns.ps(host)) {
            if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) {
                ns.kill(p.pid)
                log(ns, `Killed duplicate pid=${p.pid}`)
            }
        }
    } catch { }

    // Ensure extractor is running locally
    try {
        if (!ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)) {
            const ePid = ns.exec(EXTRACTOR_NAME, host, 1)
            log(ns, `Spawned extractor pid=${ePid}`)
        }
    } catch (e) {
        log(ns, `Extractor error: ${e}`)
    }

    // Free RAM
    try {
        for (let i = 0; i < 5; i++) {
            try { ns.dnet.memoryReallocation() } catch { break }
        }
    } catch { }

    // Probe neighbors
    let nearby
    try {
        nearby = ns.dnet.probe()
        log(ns, `probe: ${JSON.stringify(nearby)}`)
    } catch (e) {
        log(ns, `probe error: ${e}`)
        return
    }

    if (!nearby || nearby.length === 0) {
        log(ns, 'No neighbors')
        return
    }

    // Auth + spawn on each neighbor
    let spawned = 0
    for (const neighbor of nearby) {
        if (neighbor === 'home' || neighbor === host) continue

        // Skip if already has darknet.js running
        try {
            if (ns.ps(neighbor).some(p => p.filename === SCRIPT_NAME)) {
                log(ns, `${neighbor}: already has darknet.js`)
                continue
            }
        } catch { }

        // Authenticate
        log(ns, `auth ${neighbor}...`)
        const authed = await authenticateServer(ns, neighbor)
        if (!authed) {
            log(ns, `auth FAILED ${neighbor}`)
            continue
        }
        log(ns, `auth OK ${neighbor}`)

        // Spawn darknet.js + extractor
        try {
            await ns.scp(SCRIPT_NAME, neighbor)
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            if (pid) {
                spawned++
                log(ns, `spawned ${neighbor} pid=${pid}`)
            } else {
                log(ns, `exec 0 on ${neighbor}`)
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
    }

    log(ns, `Done: ${spawned}/${nearby.length} spawned`)
}

export function autocomplete(data) {
    return ["--tail"]
}
