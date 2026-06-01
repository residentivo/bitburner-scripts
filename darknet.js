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

// --- Inline helpers (self-contained, no import needed) ---

function checkNsInstance(ns, fnName) {
    if (!ns) throw new Error(`ns is required for ${fnName}`)
    return ns
}

function disableLogs(ns, listOfLogs) {
    ['disableLog'].concat(...listOfLogs).forEach(log => checkNsInstance(ns, 'disableLogs').disableLog(log))
}

// --- Configuration ---
const probeInterval = 5000
const passwordsFile = '/Temp/darknet-passwords.txt'

// --- Globals ---
let _ns = null
let _pid = 0
let passwords = {}

const argsSchema = [
    ['verbose', false],
    ['tail', false],
]
let options

const logFile = '/Temp/darknet-log.txt'
function log(msg, important, toastStyle) {
    if (_ns) {
        try { _ns.write(logFile, _ns.getHostname() + ' [' + new Date().toISOString().substring(11, 19) + '] ' + msg + '\n', 'a') } catch (_) {}
        if (important || (options && options.verbose)) { try { _ns.tprint(msg) } catch (_) {} }
        if (toastStyle) { try { _ns.toast(msg, toastStyle) } catch (_) {} }
    }
}

function loadPasswords(ns) {
    const data = ns.read(passwordsFile)
    if (data && data.length > 0) {
        try { passwords = JSON.parse(data) } catch { passwords = {} }
    }
}

function savePasswords(ns) {
    ns.write(passwordsFile, JSON.stringify(passwords), 'w')
}

// --- Authentication ---

const knownPasswordStrategies = {
    'ZeroLogon': () => '',
}

async function serverSolver(ns, hostname) {
    let details
    try { details = ns.dnet.getServerDetails(hostname) } catch {
        return false
    }

    if (!details.isConnectedToCurrentServer || !details.isOnline) return false
    if (details.hasSession) return true

    // Determine password
    let password = null
    if (passwords[hostname]) {
        password = passwords[hostname]
    } else if (details.modelId && knownPasswordStrategies[details.modelId]) {
        password = knownPasswordStrategies[details.modelId]()
    }

    if (password === null) {
        // Try to get logs for debugging
        try {
            const logs = await ns.dnet.heartbleed(hostname, { peek: true })
            if (logs && logs.logs) {
                log('Server logs for ' + hostname + ': ' + JSON.stringify(logs.logs).substring(0, 200))
            }
        } catch (_) {}
        log('No password strategy for ' + hostname + ' (model: ' + details.modelId + ')')
        return false
    }

    // Authenticate
    try {
        const result = await ns.dnet.authenticate(hostname, password)
        if (result.success) {
            passwords[hostname] = password
            try { savePasswords(ns) } catch (_) {}
            log('Authenticated to ' + hostname, true)
            return true
        } else {
            if (passwords[hostname] === password) {
                delete passwords[hostname]
                try { savePasswords(ns) } catch (_) {}
            }
            log('Failed to authenticate to ' + hostname + ' with password "' + password + '"')
            return false
        }
    } catch (e) {
        log('Error authenticating to ' + hostname + ': ' + String(e))
        return false
    }
}

// --- Main Loop ---

/** @param {NS} ns */
export async function main(ns) {
    _ns = ns
    _pid = ns.pid || 0
    options = ns.flags(argsSchema)

    // Kill other instances of this script on same server
    try {
        const hostname = ns.getHostname()
        for (const p of ns.ps(hostname)) {
            if (p.filename === ns.getScriptName() && p.pid !== _pid) ns.kill(p.pid)
        }
    } catch (_) {}

    disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'scan', 'asleep', 'exec', 'scp', 'ls'])

    // Verify dnet API is available
    try {
        ns.dnet.probe()
    } catch (e) {
        ns.tprint('ERROR: ns.dnet API not available on ' + ns.getHostname() + ': ' + String(e))
        ns.tprint('This script must run directly on a darknet server.')
        return
    }

    loadPasswords(ns)

    let loopCount = 0
    while (true) {
        try {
            loopCount++

            // Get nearby darknet servers from current position
            let nearby
            try { nearby = ns.dnet.probe() } catch (e) {
                if (loopCount <= 3) log('probe() failed: ' + String(e))
                await ns.sleep(probeInterval)
                continue
            }

            if (!nearby || nearby.length === 0) {
                if (loopCount <= 5) log('No nearby darknet servers found on ' + ns.getHostname())
                await ns.sleep(probeInterval)
                continue
            }

            let didSomething = false

            for (const hostname of nearby) {
                // Authenticate
                const authed = await serverSolver(ns, hostname)
                if (!authed) continue

                // Copy and run this script (explorer)
                const myName = ns.getScriptName()
                try {
                    const exists = ns.fileExists(myName, hostname)
                    if (!exists) {
                        await ns.scp(myName, hostname)
                    }
                    // Kill old instances on target to prevent buildup
                    for (const p of ns.ps(hostname)) {
                        if (p.filename === myName) ns.kill(p.pid, hostname)
                    }
                    const pid = ns.exec(myName, hostname, 1)
                    if (pid) {
                        log('Spread explorer to ' + hostname + ' (pid ' + pid + ')', true)
                        didSomething = true
                    }
                } catch (e) {
                    log('Error spreading explorer to ' + hostname + ': ' + String(e))
                }

                // Copy and run extractor
                try {
                    const extractor = 'darknet-extractor.js'
                    const extExists = ns.fileExists(extractor, hostname)
                    if (!extExists) {
                        await ns.scp(extractor, hostname)
                    }
                    // Only start if not already running
                    const procs = ns.ps(hostname)
                    const extRunning = procs.some(p => p.filename === extractor)
                    if (!extRunning) {
                        const pid = ns.exec(extractor, hostname, 1)
                        if (pid) {
                            log('Started extractor on ' + hostname + ' (pid ' + pid + ')', true)
                            didSomething = true
                        }
                    }
                } catch (e) {
                    log('Error spreading extractor to ' + hostname + ': ' + String(e))
                }
            }

            // If nothing happened, wait before probing again
            if (!didSomething) {
                await ns.sleep(probeInterval)
            }
        } catch (e) {
            if (loopCount <= 3 || loopCount % 10 === 0) {
                log('ERROR in loop #' + loopCount + ': ' + String(e))
            }
        }
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
