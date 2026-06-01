/**
 * darknet.js — Lightweight darknet spreader
 *
 * Runs on every darknet server. Each instance:
 *  1. Frees RAM on the current server
 *  2. Connects to all reachable darknet neighbors
 *  3. Copies itself to each neighbor and spawns there
 *  4. Copies darknet-extractor.js and spawns it
 *
 * Launched by darknet-launcher.js on darkweb, then self-propagates.
 */

const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR_NAME = 'darknet-extractor.js'
const PASSWORDS_FILE = '/Temp/darknet-passwords.txt'

// --- Password hint solver (stateless, no disk I/O per attempt) ---

const commonPasswords = ['password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest']

const commonByLength = {
    3: ['cat', 'dog', 'foo', 'bar', '123', 'pwd'],
    4: ['pass', 'test', 'root', 'user', 'abcd', '1234', 'hack', 'open'],
    5: ['admin', 'qwert', 'abcde', '12345', 'hello', 'world', 'sword', 'blade'],
    6: ['123456', 'qwerty', 'secret', 'abcdef', 'letme1', 'access', 'oracle'],
    7: ['letmein', 'abcdefg', '1234567', 'testing', 'changeme'],
    8: ['password', 'trustno1', 'sunshine', 'iloveyou', '12345678'],
}

const knownCaptchas = {}

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
        return commonPasswords[0] // try first one; auth loop will iterate if needed
    }

    // "Warning: password buffer is N bytes"
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const candidates = commonByLength[len]
        return candidates ? candidates[0] : null
    }

    // CAPTCHA — extract digits from hintData
    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 3) return extracted
        }
        return '123456' // fallback
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
    try { details = ns.dnet.getServerDetails(hostname) } catch { return false }
    if (!details.isConnectedToCurrentServer || !details.isOnline) return false
    if (details.hasSession) return true

    // Try cached password first
    const cached = ns.read(PASSWORDS_FILE)
    if (cached) {
        try {
            const pw = JSON.parse(cached)[hostname]
            if (pw && await tryAuth(ns, hostname, pw)) return true
        } catch { }
    }

    // Solve from hint
    const hint = details.passwordHint
    const hintData = details.data
    const solved = solvePassword(hint, hintData)

    ns.tprint(`[DNET] ${hostname}: hint="${hint}" data="${hintData}" solved="${solved}"`)

    if (solved) {
        // For "default" hint, we only got the first candidate — try all
        const candidates = (hint && hint.toLowerCase().includes('default')) ? commonPasswords : [solved]
        for (const pw of candidates) {
            if (await tryAuth(ns, hostname, pw)) {
                // Save to cache
                let cache = {}
                try { cache = JSON.parse(ns.read(PASSWORDS_FILE)) } catch { }
                cache[hostname] = pw
                try { ns.write(PASSWORDS_FILE, JSON.stringify(cache), 'w') } catch { }
                return true
            }
        }
    }

    return false
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('getServerUsedRam')
    ns.disableLog('asleep')
    ns.disableLog('exec')
    ns.disableLog('scp')
    ns.disableLog('ls')
    ns.disableLog('probe')
    ns.disableLog('getServerDetails')

    const host = ns.getHostname()

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
    } catch { return }

    if (!nearby || nearby.length === 0) return

    // 4. For each neighbor: authenticate, copy scripts, spawn
    for (const neighbor of nearby) {
        const authed = await authenticateServer(ns, neighbor)
        if (!authed) {
            ns.tprint(`[DNET] FAIL auth: ${neighbor}`)
            continue
        }
        ns.tprint(`[DNET] OK auth: ${neighbor} — spawning darknet.js + extractor`)

        // Copy and spawn darknet.js
        try {
            if (!ns.fileExists(SCRIPT_NAME, neighbor)) await ns.scp(SCRIPT_NAME, neighbor)
            ns.exec(SCRIPT_NAME, neighbor, 1)
        } catch { }

        // Copy and spawn extractor
        try {
            if (!ns.fileExists(EXTRACTOR_NAME, neighbor)) await ns.scp(EXTRACTOR_NAME, neighbor)
            const running = ns.ps(neighbor).some(p => p.filename === EXTRACTOR_NAME)
            if (!running) ns.exec(EXTRACTOR_NAME, neighbor, 1)
        } catch { }
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
