/**
 * darknet.js — Darknet helper (safe single-run)
 * Frees RAM, runs extractor, probes neighbors, auths and spawns.
 * All dnet API calls are awaited to prevent concurrency errors.
 * No ns.asleep() — crashes on darkweb.
 * No ns.ps() on remote servers — can crash game.
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
    if (!hint) return []
    const h = hint.toLowerCase()

    // Direct extraction: "key is X", "password is X", "pin is X", "it's set to X"
    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(\w+)/i)
    if (keyMatch) return [keyMatch[1]]

    // Roman numeral
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
        return [String(num)]
    }

    // Default / factory → try all common passwords
    if (h.includes('default') || h.includes('factory')) return commonPasswords

    // Buffer length → try passwords of that length
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        if (commonByLength[len]) return commonByLength[len]
    }

    // Numbers / captcha
    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 3) return [extracted]
        }
        return ['123456']
    }

    return []
}

async function tryAuth(ns, hostname, password) {
    const result = await ns.dnet.authenticate(hostname, password)
    return result.success
}

async function authenticateServer(ns, hostname) {
    let details
    try {
        details = await ns.dnet.getServerDetails(hostname)
    } catch (e) {
        log(ns, `getServerDetails error: ${e}`)
        return false
    }

    if (!details.isOnline) {
        log(ns, `${hostname} offline`)
        return false
    }
    if (!details.isConnectedToCurrentServer) {
        log(ns, `${hostname} not connected`)
        return false
    }
    if (details.hasSession) {
        log(ns, `${hostname} already has session`)
        return true
    }

    const hint = details.passwordHint || ''
    const hintData = details.data || ''
    log(ns, `${hostname} hint: ${JSON.stringify(hint)}`)

    const solved = solvePassword(hint, hintData)
    if (solved.length === 0) {
        log(ns, `${hostname} could not solve hint`)
        return false
    }

    log(ns, `${hostname} candidates: ${JSON.stringify(solved)}`)

    for (const pw of solved) {
        try {
            const ok = await tryAuth(ns, hostname, pw)
            if (ok) {
                log(ns, `${hostname} auth OK with '${pw}'`)
                return true
            }
            log(ns, `${hostname} auth FAIL '${pw}'`)
        } catch (e) {
            log(ns, `${hostname} auth error '${pw}': ${e}`)
        }
    }

    return false
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    log(ns, `START pid=${ns.pid} on ${host}`)

    // Kill duplicates on local server only
    for (const p of ns.ps(host)) {
        if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) {
            ns.kill(p.pid)
            log(ns, `killed duplicate pid=${p.pid}`)
        }
    }

    // Free RAM - single call, no loop
    try {
        await ns.dnet.memoryReallocation()
        log(ns, 'memoryReallocation done')
    } catch (e) {
        log(ns, `memoryReallocation error: ${e}`)
    }

    // Ensure extractor is running (local only)
    try {
        if (!ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)) {
            const ePid = ns.exec(EXTRACTOR_NAME, host, 1)
            log(ns, `spawned extractor pid=${ePid}`)
        }
    } catch (e) {
        log(ns, `extractor error: ${e}`)
    }

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

        // Skip ns.ps() on remote — can crash game. Just try scp/exec and handle errors.

        log(ns, `--- processing ${neighbor} ---`)

        // Authenticate
        let authed
        try {
            authed = await authenticateServer(ns, neighbor)
        } catch (e) {
            log(ns, `authenticate throw ${neighbor}: ${e}`)
            continue
        }

        if (!authed) {
            log(ns, `auth FAIL ${neighbor}`)
            continue
        }

        // Copy darknet.js
        try {
            await ns.scp(SCRIPT_NAME, neighbor)
            log(ns, `scp ${SCRIPT_NAME} OK`)
        } catch (e) {
            log(ns, `scp ${SCRIPT_NAME} error: ${e}`)
            continue
        }

        // Copy extractor
        try {
            await ns.scp(EXTRACTOR_NAME, neighbor)
            log(ns, `scp ${EXTRACTOR_NAME} OK`)
        } catch (e) {
            log(ns, `scp ${EXTRACTOR_NAME} error: ${e}`)
        }

        // Exec darknet.js
        try {
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            if (pid) {
                spawned++
                log(ns, `spawned ${neighbor} pid=${pid}`)
            } else {
                log(ns, `exec returned pid=0 for ${neighbor}`)
            }
        } catch (e) {
            log(ns, `exec error ${neighbor}: ${e}`)
        }

        // Exec extractor
        try {
            const eid = ns.exec(EXTRACTOR_NAME, neighbor, 1)
            if (eid) {
                log(ns, `spawned extractor on ${neighbor} pid=${eid}`)
            }
        } catch (e) {
            // non-critical
        }
    }

    log(ns, `DONE: ${spawned}/${nearby.length} spawned`)
}

export function autocomplete(data) {
    return ["--tail"]
}
