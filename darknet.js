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
const LOG_PORT = 10

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

function log(ns, msg) {
    // Write to port for external reading
    const port = ns.getPortHandle(LOG_PORT)
    port.write(`[${ns.getHostname()}] ${msg}`)
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
    } catch (e) {
        log(ns, `getServerDetails FAILED: ${e}`)
        return false
    }

    if (!details.isOnline) { log(ns, `${hostname}: OFFLINE`); return false }
    if (!details.isConnectedToCurrentServer) { log(ns, `${hostname}: NOT CONNECTED`); return false }
    if (details.hasSession) { log(ns, `${hostname}: already has session`); return true }

    const hint = details.passwordHint || ''
    const hintData = details.data || ''
    log(ns, `${hostname}: hint="${hint}" hintData="${hintData}" model="${details.modelId}"`)

    const solved = solvePassword(hint, hintData)
    log(ns, `${hostname}: solved="${solved}"`)

    if (!solved) { log(ns, `${hostname}: NO PASSWORD SOLVED`); return false }

    let candidates
    if (solved.startsWith('__MULTI__')) candidates = commonPasswords
    else if (solved.startsWith('__BUFFER__')) candidates = commonByLength[parseInt(solved.replace('__BUFFER__', ''))] || []
    else candidates = [solved]

    for (const pw of candidates) {
        log(ns, `${hostname}: trying "${pw}"`)
        if (await tryAuth(ns, hostname, pw)) {
            log(ns, `${hostname}: SUCCESS with "${pw}"`)
            return true
        }
    }

    log(ns, `${hostname}: ALL ${candidates.length} FAILED`)
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
    log(ns, `START`)

    for (let i = 0; i < 5; i++) {
        try { ns.dnet.memoryReallocation() } catch { break }
    }

    for (const p of ns.ps(host)) {
        if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) ns.kill(p.pid)
    }

    let nearby
    try {
        ns.dnet.probe()
        nearby = ns.dnet.probe()
    } catch (e) {
        log(ns, `probe FAILED: ${e}`)
        return
    }

    if (!nearby || nearby.length === 0) { log(ns, `NO NEIGHBORS`); return }

    log(ns, `${nearby.length} neighbors: ${nearby.join(', ')}`)

    for (const neighbor of nearby) {
        const authed = await authenticateServer(ns, neighbor)
        if (!authed) continue

        try {
            if (!ns.fileExists(SCRIPT_NAME, neighbor)) await ns.scp(SCRIPT_NAME, neighbor)
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            log(ns, `spawned darknet.js on ${neighbor} pid=${pid}`)
        } catch (e) {
            log(ns, `ERROR darknet.js on ${neighbor}: ${e}`)
        }

        try {
            if (!ns.fileExists(EXTRACTOR_NAME, neighbor)) await ns.scp(EXTRACTOR_NAME, neighbor)
            if (!ns.ps(neighbor).some(p => p.filename === EXTRACTOR_NAME)) {
                const pid = ns.exec(EXTRACTOR_NAME, neighbor, 1)
                log(ns, `spawned extractor on ${neighbor} pid=${pid}`)
            }
        } catch (e) {
            log(ns, `ERROR extractor on ${neighbor}: ${e}`)
        }
    }

    log(ns, `DONE`)
}

export function autocomplete(data) {
    return ["--tail"]
}
