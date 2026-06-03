/**
 * darknet.js — Darknet helper (crash-safe, per-neighbor isolation)
 * Each neighbor is fully processed before moving to the next.
 * Only copies darknet-test1.js (lightweight) to neighbors.
 */

const SCRIPT_NAME = 'darknet.js'

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
    ns.print(`[dnet] ${msg}`)
}

function solvePassword(hint, hintData) {
    if (!hint) return []
    const h = hint.toLowerCase()

    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(\w+)/i)
    if (keyMatch) return [keyMatch[1]]

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

    if (h.includes('default') || h.includes('factory')) return commonPasswords

    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        if (commonByLength[len]) return commonByLength[len]
    }

    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 3) return [extracted]
        }
        return ['123456']
    }

    return []
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    log(ns, `START on ${host}`)

    // Kill local duplicates
    for (const p of ns.ps(host)) {
        if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) {
            ns.kill(p.pid)
        }
    }

    // Free RAM on this server
    try {
        await ns.dnet.memoryReallocation()
        log(ns, 'memoryReallocation done')
    } catch (e) {
        log(ns, `memoryReallocation: ${e}`)
    }

    // Probe
    let peers
    try {
        peers = await ns.dnet.probe()
        log(ns, `probe: ${JSON.stringify(peers)}`)
    } catch (e) {
        log(ns, `probe error: ${e}`)
        return
    }

    if (!peers || peers.length === 0) {
        log(ns, 'no peers')
        return
    }

    let spawned = 0
    let fails = 0

    for (const neighbor of peers) {
        if (neighbor === 'home' || neighbor === host) continue

        log(ns, `--- ${neighbor} ---`)

        // Step A: get details
        let details
        try {
            details = await ns.dnet.getServerDetails(neighbor)
        } catch (e) {
            log(ns, `${neighbor} getServerDetails error: ${e}`)
            fails++
            continue
        }

        if (!details.isOnline || !details.isConnectedToCurrentServer) {
            log(ns, `${neighbor} unreachable`)
            fails++
            continue
        }

        if (details.hasSession) {
            log(ns, `${neighbor} already has session`)
        } else {
            // Step B: solve + auth
            const hint = details.passwordHint || ''
            const data = details.data || ''
            const candidates = solvePassword(hint, data)

            if (candidates.length === 0) {
                log(ns, `${neighbor} hint unsolved: "${hint}"`)
                fails++
                continue
            }

            let authed = false
            for (const pw of candidates) {
                try {
                    const r = await ns.dnet.authenticate(neighbor, pw)
                    if (r.success) {
                        log(ns, `${neighbor} auth OK '${pw}'`)
                        authed = true
                        break
                    }
                    log(ns, `${neighbor} auth fail '${pw}'`)
                } catch (e) {
                    log(ns, `${neighbor} auth error '${pw}': ${e}`)
                }
            }

            if (!authed) {
                log(ns, `${neighbor} ALL AUTH FAILED`)
                fails++
                continue
            }
        }

        // Step C: scp darknet-test1.js (lightweight)
        try {
            await ns.scp('darknet-test1.js', neighbor)
            log(ns, `${neighbor} scp OK`)
        } catch (e) {
            log(ns, `${neighbor} scp error: ${e}`)
            fails++
            continue
        }

        // Step D: exec
        try {
            const pid = ns.exec('darknet-test1.js', neighbor, 1)
            if (pid) {
                spawned++
                log(ns, `${neighbor} exec pid=${pid}`)
            } else {
                log(ns, `${neighbor} exec pid=0`)
                fails++
            }
        } catch (e) {
            log(ns, `${neighbor} exec error: ${e}`)
            fails++
        }
    }

    log(ns, `DONE: ${spawned} spawned, ${fails} failed, ${peers.length} total`)
}

export function autocomplete(data) {
    return ["--tail"]
}
