/**
 * darknet.js — Lightweight darknet spreader
 *
 * Runs on every darknet server. Each instance:
 *  1. Frees RAM on the current server
 *  2. Probes neighbors, authenticates via hint solver
 *  3. Copies itself + extractor to authenticated neighbors, spawns both
 *
 * Launched by darknet-launcher.js on darkweb, then self-propagates.
 */

const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR_NAME = 'darknet-extractor.js'

// --- Password hint solver ---

const commonPasswords = ['password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest']

const commonByLength = {
    3: ['cat', 'dog', 'foo', 'bar', '123', 'pwd'],
    4: ['pass', 'test', 'root', 'user', 'abcd', '1234', 'hack', 'open'],
    5: ['admin', 'qwert', 'abcde', '12345', 'hello', 'world', 'sword', 'blade'],
    6: ['123456', 'qwerty', 'secret', 'abcdef', 'letme1', 'access', 'oracle'],
    7: ['letmein', 'abcdefg', '1234567', 'testing', 'changeme'],
    8: ['password', 'trustno1', 'sunshine', 'iloveyou', '12345678'],
}

function solvePassword(hint, hintData) {
    if (!hint) return null
    const h = hint.toLowerCase()

    // "The key/secret/password/PIN is X" / "It's set to X"
    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(\w+)/i)
    if (keyMatch) return keyMatch[1]

    // "The password is the value of the number 'ROMAN'"
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

    // "default" / "factory settings"
    if (h.includes('default') || h.includes('factory')) {
        return '__MULTI__' // signal to try all common passwords
    }

    // "Warning: password buffer is N bytes"
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const candidates = commonByLength[len]
        if (candidates) return '__BUFFER__' + len // signal to try all candidates
    }

    // CAPTCHA — extract digits from hintData
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
    try { details = ns.dnet.getServerDetails(hostname) } catch {
        ns.tprint(`[DNET] ${hostname}: getServerDetails FAILED`)
        return false
    }

    if (!details.isOnline) {
        ns.tprint(`[DNET] ${hostname}: OFFLINE`)
        return false
    }

    if (!details.isConnectedToCurrentServer) {
        ns.tprint(`[DNET] ${hostname}: NOT CONNECTED`)
        return false
    }

    if (details.hasSession) {
        ns.tprint(`[DNET] ${hostname}: already has session`)
        return true
    }

    const hint = details.passwordHint || ''
    const hintData = details.data || ''

    ns.tprint(`[DNET] ${hostname}: hint="${hint}" hintData="${hintData}" modelId="${details.modelId}"`)

    const solved = solvePassword(hint, hintData)

    if (!solved) {
        ns.tprint(`[DNET] ${hostname}: NO PASSWORD SOLVED from hint`)
        return false
    }

    // Determine candidate list
    let candidates
    if (solved.startsWith('__MULTI__')) {
        candidates = commonPasswords
    } else if (solved.startsWith('__BUFFER__')) {
        const len = parseInt(solved.replace('__BUFFER__', ''))
        candidates = commonByLength[len] || []
    } else {
        candidates = [solved]
    }

    for (const pw of candidates) {
        ns.tprint(`[DNET] ${hostname}: trying "${pw}"...`)
        if (await tryAuth(ns, hostname, pw)) {
            ns.tprint(`[DNET] ${hostname}: SUCCESS with "${pw}"`)
            return true
        }
    }

    ns.tprint(`[DNET] ${hostname}: ALL ${candidates.length} passwords FAILED`)
    return false
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('getServerUsedRam')
    ns.disableLog('exec')
    ns.disableLog('scp')
    ns.disableLog('ls')
    ns.disableLog('probe')
    ns.disableLog('getServerDetails')

    const host = ns.getHostname()
    ns.tprint(`[DNET] START on ${host}`)

    // 1. Free RAM on this server
    for (let i = 0; i < 5; i++) {
        try { ns.dnet.memoryReallocation() } catch { break }
    }

    // 2. Kill other instances of this script on this server
    for (const p of ns.ps(host)) {
        if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) ns.kill(p.pid)
    }

    // 3. Probe for neighbors
    let nearby
    try {
        ns.dnet.probe()
        nearby = ns.dnet.probe()
    } catch (e) {
        ns.tprint(`[DNET] ${host}: probe FAILED: ${e}`)
        return
    }

    if (!nearby || nearby.length === 0) {
        ns.tprint(`[DNET] ${host}: NO NEIGHBORS`)
        return
    }

    ns.tprint(`[DNET] ${host}: ${nearby.length} neighbors: ${nearby.join(', ')}`)

    // 4. For each neighbor: authenticate, copy scripts, spawn
    for (const neighbor of nearby) {
        const authed = await authenticateServer(ns, neighbor)
        if (!authed) continue

        // Copy and spawn darknet.js on neighbor
        try {
            if (!ns.fileExists(SCRIPT_NAME, neighbor)) {
                ns.tprint(`[DNET] copying ${SCRIPT_NAME} to ${neighbor}`)
                await ns.scp(SCRIPT_NAME, neighbor)
            }
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            if (pid) {
                ns.tprint(`[DNET] spawned ${SCRIPT_NAME} on ${neighbor} (pid=${pid})`)
            } else {
                ns.tprint(`[DNET] FAILED to spawn ${SCRIPT_NAME} on ${neighbor}`)
            }
        } catch (e) {
            ns.tprint(`[DNET] ERROR spawning darknet.js on ${neighbor}: ${e}`)
        }

        // Copy and spawn extractor on neighbor
        try {
            if (!ns.fileExists(EXTRACTOR_NAME, neighbor)) {
                ns.tprint(`[DNET] copying ${EXTRACTOR_NAME} to ${neighbor}`)
                await ns.scp(EXTRACTOR_NAME, neighbor)
            }
            const running = ns.ps(neighbor).some(p => p.filename === EXTRACTOR_NAME)
            if (!running) {
                const pid = ns.exec(EXTRACTOR_NAME, neighbor, 1)
                if (pid) {
                    ns.tprint(`[DNET] spawned ${EXTRACTOR_NAME} on ${neighbor} (pid=${pid})`)
                } else {
                    ns.tprint(`[DNET] FAILED to spawn ${EXTRACTOR_NAME} on ${neighbor}`)
                }
            }
        } catch (e) {
            ns.tprint(`[DNET] ERROR spawning extractor on ${neighbor}: ${e}`)
        }
    }

    ns.tprint(`[DNET] DONE on ${host}`)
}

export function autocomplete(data) {
    return ["--tail"]
}
