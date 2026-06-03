/**
 * darknet.js — Darknet helper (crash-safe, auto-propagate)
 * Auths neighbors, copies itself + darknet-ram.js, and spawns on each.
 * Each neighbor then probes and auths ITS neighbors (depth 2+).
 * hasSession check prevents re-auth loops.
 */

const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR = 'darknet-extractor.js'

const commonPasswords = [
    '', 'password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest',
    'root', 'toor', 'daemon', 'sys', 'adm', 'bin', 'superuser', 'operator',
    'server', 'system', 'changeit', 'changeme', 'mysql', 'postgres', 'oracle',
    'cisco', 'public', 'private', 'blank', 'none', 'null',
    'pass123', 'admin123', 'root123', 'abc123', 'passw0rd',
    'web', 'www', 'ftp', 'ssh', 'telnet',
    'open', 'login', 'unlock', 'access', 'secret',
    'test', 'user', 'demo', 'temp', 'backup',
]

const mountainPasswords = [
    '8848', '8849', '8848.86', '29029', '29032', '29035',
    'everest', 'EVEREST', 'Everest',
    'sagarmatha', 'Sagarmatha', 'SAGARMATHA',
    'chomolungma', 'Chomolungma', 'CHOMOLUNGMA',
    'summit', 'SUMMIT', 'Summit',
    'peak', 'PEAK', 'Peak',
    'top', 'TOP', 'Top',
    'ascend', 'ASCEND', 'Ascend',
    'mountain', 'MOUNTAIN', 'Mountain',
    'climb', 'CLIMB', 'Climb',
    'high', 'HIGH', 'High',
    'highest', 'HIGHEST', 'Highest',
    'basecamp', 'Basecamp', 'BASECAMP',
    'hillary', 'Hillary', 'HILLARY',
    'nepal', 'Nepal', 'NEPAL',
    'tibet', 'Tibet', 'TIBET',
    '8848m', '29029ft',
]

const extendedPasswords = [
    ...commonPasswords,
    'dragon', 'monkey', 'shadow', 'sunshine', 'princess', 'football',
    'baseball', 'trustno1', 'iloveyou', 'welcome', 'hello', 'charlie', 'donald',
    'god', 'love', 'master',
    ...mountainPasswords,
]

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

    // Direct extraction: "key is X", "password is X", "pin is X", "it's set to X"
    // Also: "The PIN is X", "password: X", "key: X"
    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(?:is\s+)?(\w+)/i)
    if (keyMatch && keyMatch[1]) {
        const val = keyMatch[1].toLowerCase()
        if (!['is', 'the', 'a', 'an', 'not', 'still', 'empty', 'to', 'set'].includes(val)) {
            return [keyMatch[1]]
        }
    }

    // "PIN: X" or "PIN X" format (no "is" between)
    const pinDirect = hint.match(/pin\s*[:=]?\s*(\d+)/i)
    if (pinDirect && pinDirect[1]) return [pinDirect[1]]

    // "There is no password" → empty password or common
    if (h.includes('no password') || h.includes('there is no')) return ['', ...commonPasswords]

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

    // Default / factory / never changed / still the same / no password / didn't set → try empty + common
    if (h.includes('default') || h.includes('factory') || h.includes('never changed') ||
        h.includes("didn't change") || h.includes("didn't set") || h.includes("did i set") ||
        h.includes('still') || h.includes('original') || h.includes('no password') ||
        h.includes('not set'))
        return ['', ...commonPasswords]

    // Buffer length → try passwords of that length
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        if (commonByLength[len]) return commonByLength[len]
    }

    // "Remember to use X" / "use X" → number/password in hint (not "type the numbers" captcha)
    if (!h.includes('prove you are human') && !h.includes('captcha')) {
        const useMatch = hint.match(/(?:use|enter|input)\s+(\w+)/i)
        if (useMatch && useMatch[1]) return [useMatch[1]]
    }

    // Base conversion: "base N number X in base 10" or "base N, X"
    const baseMatch = hint.match(/base\s+(\d+)\s+number\s+(\d+)/i)
    if (baseMatch) {
        const base = parseInt(baseMatch[1])
        const num = baseMatch[2]
        let result = 0
        for (let i = 0; i < num.length; i++) {
            result = result * base + parseInt(num[i])
        }
        return [String(result)]
    }

    // "the password is ... in base 10" with data like "8,326" → data has base,number
    if (h.includes('base 10') && hintData) {
        const parts = hintData.split(',').map(s => s.trim())
        if (parts.length === 2) {
            const base = parseInt(parts[0])
            const num = parts[1]
            if (base > 1 && num.length > 0) {
                let result = 0
                for (let i = 0; i < num.length; i++) {
                    result = result * base + parseInt(num[i])
                }
                return [String(result)]
            }
        }
    }

    // Range: "number between X and Y" or "number from X to Y"
    const rangeMatch = hint.match(/between\s+(\d+)\s+and\s+(\d+)/i) ||
                       hint.match(/from\s+(\d+)\s+to\s+(\d+)/i)
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1])
        const hi = parseInt(rangeMatch[2])
        if (hi - lo <= 50) {
            const candidates = []
            for (let i = lo; i <= hi; i++) candidates.push(String(i))
            return candidates
        }
        return ['0', '1', '5', '10'] // fallback for large ranges
    }

    // "PIN is empty" / "password is empty" → try empty string
    if (h.includes('empty') && (h.includes('pin') || h.includes('password'))) return ['', ...commonPasswords]

    // Numbers / captcha
    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 1) return [extracted]
        }
        return ['123456']
    }

    // Riddles / vague hints → try extended passwords
    if (h.includes('master') || h.includes('riddle') || h.includes('true'))
        return extendedPasswords

    // Mountain riddle → prioritize mountain passwords
    if (h.includes('ascend') || h.includes('mountain') || h.includes('highest'))
        return [...new Set([...mountainPasswords, ...extendedPasswords])]

    // Hints that are just symbols/emoji — try stripped + extended passwords
    if (hint && !h.match(/[a-z]{3,}/)) {
        const stripped = hint.replace(/[^a-zA-Z0-9!@#$%^&*_\-+=]/g, '')
        const candidates = [...new Set([stripped, '', ...extendedPasswords])]
        return candidates
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
            log(ns, `${neighbor} already has session, skip`)
            continue
        } else {
            // Step B: solve + auth
            const hint = details.passwordHint || ''
            const data = details.data || ''
            log(ns, `${neighbor} hint: "${hint}" data: "${data}"`)
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

        // Step C: scp darknet.js + darknet-ram.js + extractor to neighbor
        try {
            await ns.scp(SCRIPT_NAME, neighbor)
            await ns.scp('darknet-ram.js', neighbor)
            await ns.scp(EXTRACTOR, neighbor)
            log(ns, `${neighbor} scp OK`)
        } catch (e) {
            log(ns, `${neighbor} scp error: ${e}`)
            fails++
            continue
        }

        // Step D: exec darknet.js on neighbor (propagate to its neighbors)
        try {
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            if (pid) {
                spawned++
                log(ns, `${neighbor} darknet pid=${pid} (propagating)`)
            } else {
                log(ns, `${neighbor} darknet pid=0`)
                fails++
            }
        } catch (e) {
            log(ns, `${neighbor} darknet error: ${e}`)
            fails++
        }
    }

    // Step E: run extractor on THIS server (loot local resources)
    try {
        const pid = ns.exec(EXTRACTOR, host, 1)
        if (pid) log(ns, `local extractor pid=${pid}`)
    } catch (e) {
        log(ns, `local extractor error: ${e}`)
    }

    log(ns, `DONE: ${spawned} spawned, ${fails} failed, ${peers.length} total`)
}

export function autocomplete(data) {
    return ["--tail"]
}
