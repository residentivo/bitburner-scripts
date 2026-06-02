/**
 * darknet.js — Lightweight darknet spreader
 *
 * Runs on every darknet server. Each instance:
 *  1. Frees RAM on the current server
 *  2. Probes neighbors, authenticates via hint solver
 *  3. Copies itself + extractor to authenticated neighbors, spawns both
 *  4. Loops forever, re-probing periodically
 */

const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR_NAME = 'darknet-extractor.js'
const LOG_FILE = '/Temp/darknet-log.txt'

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
    const line = `[${new Date().toISOString()}] [${ns.getHostname()}] ${msg}`
    ns.print(line)
    try { ns.write(LOG_FILE, line + '\n', 'a') } catch { }
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
    ns.disableLog('getServerUsedRam')
    ns.disableLog('exec')
    ns.disableLog('scp')
    ns.disableLog('ls')
    ns.disableLog('read')
    ns.disableLog('write')

    const host = ns.getHostname()
    log(ns, `=== START pid=${ns.pid} ===`)

    // 1. Free RAM
    for (let i = 0; i < 5; i++) {
        try { ns.dnet.memoryReallocation() } catch { break }
    }

    // 2. Kill duplicates of ourselves
    for (const p of ns.ps(host)) {
        if (p.filename === SCRIPT_NAME && p.pid !== ns.pid) ns.kill(p.pid)
    }

    // 3. Ensure extractor is running on this server
    const hasExtractor = ns.ps(host).some(p => p.filename === EXTRACTOR_NAME)
    if (!hasExtractor) {
        try {
            await ns.scp(EXTRACTOR_NAME, host)
            const ePid = ns.exec(EXTRACTOR_NAME, host, 1)
            log(ns, `Spawned extractor pid=${ePid}`)
        } catch (e) {
            log(ns, `ERROR spawning extractor: ${e}`)
        }
    }

    // 4. Probe neighbors
    let nearby
    try {
        nearby = ns.dnet.probe()
        log(ns, `probe() returned: ${JSON.stringify(nearby)}`)
    } catch (e) {
        log(ns, `ERROR probe() failed: ${e}`)
        return
    }

    if (!nearby || nearby.length === 0) {
        log(ns, `No neighbors found, nothing to spread to`)
        return
    }

    // 5. Auth + spawn on each neighbor
    let spawned = 0
    for (const neighbor of nearby) {
        if (neighbor === 'home' || neighbor === host) {
            log(ns, `Skipping ${neighbor} (self/home)`)
            continue
        }

        // Skip if already running darknet.js there
        try {
            const d = ns.dnet.getServerDetails(neighbor)
            if (d.hasSession && ns.ps(neighbor).some(p => p.filename === SCRIPT_NAME)) {
                log(ns, `${neighbor} already has ${SCRIPT_NAME}, skipping`)
                continue
            }
        } catch (e) {
            log(ns, `ERROR checking ${neighbor}: ${e}`)
        }

        log(ns, `Trying auth on ${neighbor}...`)
        const authed = await authenticateServer(ns, neighbor)
        if (!authed) {
            log(ns, `Auth FAILED on ${neighbor}`)
            continue
        }
        log(ns, `Auth SUCCESS on ${neighbor}!`)

        try {
            await ns.scp(SCRIPT_NAME, neighbor)
            const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
            if (pid) {
                spawned++
                log(ns, `Spawned ${SCRIPT_NAME} on ${neighbor} pid=${pid}`)
            } else {
                log(ns, `exec returned 0 on ${neighbor}`)
            }
        } catch (e) {
            log(ns, `ERROR spawning on ${neighbor}: ${e}`)
        }

        try {
            await ns.scp(EXTRACTOR_NAME, neighbor)
            if (!ns.ps(neighbor).some(p => p.filename === EXTRACTOR_NAME)) {
                ns.exec(EXTRACTOR_NAME, neighbor, 1)
            }
        } catch (e) {
            log(ns, `ERROR spawning extractor on ${neighbor}: ${e}`)
        }
    }

    log(ns, `=== DONE. Spawned on ${spawned}/${nearby.length} neighbors ===`)
}

export function autocomplete(data) {
    return ["--tail"]
}
