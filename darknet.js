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
}

async function serverSolver(ns, hostname) {
    let details
    try { details = ns.dnet.getServerDetails(hostname) } catch { return false }

    if (!details.isConnectedToCurrentServer || !details.isOnline) return false
    if (details.hasSession) return true

    let password = null
    if (passwords[hostname]) {
        password = passwords[hostname]
    } else if (details.modelId && knownPasswordStrategies[details.modelId]) {
        password = knownPasswordStrategies[details.modelId]()
    }

    if (password === null) return false

    try {
        const result = await ns.dnet.authenticate(hostname, password)
        if (result.success) {
            passwords[hostname] = password
            try { savePasswords(ns) } catch (_) {}
            return true
        }
        if (passwords[hostname] === password) {
            delete passwords[hostname]
            try { savePasswords(ns) } catch (_) {}
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
