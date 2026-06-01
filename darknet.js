/**
 * darknet.js — Darknet explorer and spreader
 *
 * Spreads itself to all reachable darknet servers, authenticates,
 * and deploys the extractor on each. Runs continuously on every
 * darknet server it reaches.
 *
 * Launched by darknet-launcher.js which connects to darkweb and
 * starts this script directly on darknet servers.
 */

function disableLogs(ns, listOfLogs) {
    listOfLogs.forEach(log => ns.disableLog(log))
}

const probeInterval = 5000
const passwordsFile = '/Temp/darknet-passwords.txt'
let passwords = {}

function loadPasswords(ns) {
    const data = ns.read(passwordsFile)
    if (data) try { passwords = JSON.parse(data) } catch { passwords = {} }
}

function savePasswords(ns) {
    ns.write(passwordsFile, JSON.stringify(passwords), 'w')
}

const knownPasswordStrategies = {
    'ZeroLogon': () => '',
    'ReCAPTCHA': null, // handled specially — requires reading numbers from UI or hint
}

// Common passwords for "default" hint
const commonPasswords = ['password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest']

// Common passwords by length (for "password buffer is N bytes" hint)
const commonByLength = {
    3: ['cat', 'dog', 'foo', 'bar', '123', 'pwd'],
    4: ['pass', 'test', 'root', 'user', 'abcd', '1234', 'hack', 'open'],
    5: ['admin', 'qwert', 'abcde', '12345', 'hello', 'world', 'sword', 'blade'],
    6: ['123456', 'qwerty', 'secret', 'abcdef', 'letme1', 'access', 'oracle'],
    7: ['letmein', 'abcdefg', '1234567', 'testing', 'changeme'],
    8: ['password', 'trustno1', 'sunshine', 'iloveyou', '12345678'],
}

// Known CAPTCHA answers by hostname (populated manually or via heartbleed logs)
const knownCaptchas = {}

async function tryPasswordFromHint(ns, hostname, hint, modelId) {
    if (!hint) return null
    const hintLower = hint.toLowerCase()

    // "The key is X" / "The secret is X" / "password is X" hint — extract directly
    const keyMatch = hint.match(/(?:key|secret|password) is\s+(\w+)/i)
    if (keyMatch) {
        const pw = keyMatch[1]
        try {
            const result = await ns.dnet.authenticate(hostname, pw)
            if (result.success) return pw
        } catch { }
    }

    // "default" hint — try common passwords
    if (hintLower.includes('default')) {
        for (const pw of commonPasswords) {
            try {
                const result = await ns.dnet.authenticate(hostname, pw)
                if (result.success) return pw
            } catch { }
        }
    }

    // "Warning: password buffer is N bytes" — try common passwords of that length
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const candidates = commonByLength[len] || []
        for (const pw of candidates) {
            try {
                const result = await ns.dnet.authenticate(hostname, pw)
                if (result.success) return pw
            } catch { }
        }
    }

    // "numbers to prove you are human" / CAPTCHA hint
    if (hintLower.includes('numbers') || hintLower.includes('prove you are human') || hintLower.includes('captcha')) {
        // Try cached answer first
        if (knownCaptchas[hostname]) {
            return knownCaptchas[hostname]
        }

        // Try to read captcha answer from server logs via heartbleed
        try {
            const logs = await ns.dnet.heartbleed(hostname, { peek: true })
            if (logs && logs.logs) {
                // Look for numeric patterns in logs (captcha answer is usually a number)
                for (const entry of logs.logs) {
                    const msg = typeof entry === 'string' ? entry : JSON.stringify(entry)
                    const numbers = msg.match(/\b\d{4,}\b/g)
                    if (numbers) {
                        for (const num of numbers) {
                            try {
                                const result = await ns.dnet.authenticate(hostname, num)
                                if (result.success()) {
                                    knownCaptchas[hostname] = num
                                    return num
                                }
                            } catch { }
                        }
                    }
                }
            }
        } catch { }

        // ReCAPTCHA model — password is typically a 5-6 digit number
        // Try common patterns: sequential numbers, repeated digits, etc.
        const commonCaptchas = [
            '123456', '12345678', '111111', '000000', '654321',
            '123123', '112233', '121212', '123321', '999999',
            '100000', '500000', '999999', '111222', '333333',
            '444444', '555555', '666666', '777777', '888888',
        ]
        for (const pw of commonCaptchas) {
            try {
                const result = await ns.dnet.authenticate(hostname, pw)
                if (result.success) {
                    knownCaptchas[hostname] = pw
                    return pw
                }
            } catch { }
        }
    }

    return null
}

async function serverSolver(ns, hostname) {
    let details
    try { details = ns.dnet.getServerDetails(hostname) } catch { return false }

    if (!details.isConnectedToCurrentServer || !details.isOnline) return false
    if (details.hasSession) return true

    let password = null

    // 1. Try known password from cache
    if (passwords[hostname]) {
        password = passwords[hostname]
    }
    // 2. Try model-specific strategy
    else if (details.modelId && knownPasswordStrategies[details.modelId]) {
        password = knownPasswordStrategies[details.modelId]()
    }
    // 3. Try password hint
    else if (details.passwordHint) {
        password = await tryPasswordFromHint(ns, hostname, details.passwordHint, details.modelId)
    }

    if (password === null) return false

    try {
        const result = await ns.dnet.authenticate(hostname, password)
        if (result.success) {
            passwords[hostname] = password
            try { savePasswords(ns) } catch (_) {}
            return true
        }
        return false
    } catch { return false }
}

/** @param {NS} ns */
export async function main(ns) {
    disableLogs(ns, ['getServerUsedRam', 'asleep', 'exec', 'scp', 'ls', 'probe', 'getServerDetails'])

    try { ns.dnet.probe() } catch (e) {
        ns.tprint('ERROR: ns.dnet API not available on ' + ns.getHostname())
        return
    }

    loadPasswords(ns)

    // Kill other instances
    const myName = ns.getScriptName()
    const myHost = ns.getHostname()
    for (const p of ns.ps(myHost)) {
        if (p.filename === myName && p.pid !== ns.pid) ns.kill(p.pid)
    }

    while (true) {
        let nearby
        try { nearby = ns.dnet.probe() } catch {
            await ns.sleep(probeInterval)
            continue
        }

        if (!nearby || nearby.length === 0) {
            await ns.sleep(probeInterval)
            continue
        }

        let didSomething = false

        for (const hostname of nearby) {
            const authed = await serverSolver(ns, hostname)
            if (!authed) continue

            // Spread explorer
            try {
                const exists = ns.fileExists(myName, hostname)
                if (!exists) await ns.scp(myName, hostname)
                for (const p of ns.ps(hostname)) {
                    if (p.filename === myName) ns.kill(p.pid, hostname)
                }
                const pid = ns.exec(myName, hostname, 1)
                if (pid) didSomething = true
            } catch { }

            // Spread extractor
            try {
                const ext = 'darknet-extractor.js'
                if (!ns.fileExists(ext, hostname)) await ns.scp(ext, hostname)
                const running = ns.ps(hostname).some(p => p.filename === ext)
                if (!running) {
                    const pid = ns.exec(ext, hostname, 1)
                    if (pid) didSomething = true
                }
            } catch { }
        }

        if (!didSomething) await ns.sleep(probeInterval)
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
