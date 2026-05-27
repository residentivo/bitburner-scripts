/**
 * darknet.js - Darknet exploration and exploitation script
 *
 * Explores the darknet by:
 *  1. Purchasing DarkscapeNavigator.exe (done via terminal: buy DarkscapeNavigator.exe)
 *  2. Probing nearby darknet servers with ns.dnet.probe()
 *  3. Authenticating to servers by cracking passwords
 *  4. Spreading itself to authenticated servers to expand reach
 *  5. Looting .cache files and running phishing attacks for money/exp
 *  6. Freeing blocked RAM with ns.dnet.memoryReallocation()
 *
 * Password persistence: discovered passwords are saved to /Temp/darknet-passwords.txt
 * so they survive script restarts and can be shared across instances.
 *
 * Based on the Bitburner v3 Darkweb Network documentation.
 */

// --- Inline helpers (self-contained, no import needed) ---

function pathJoin(...parts) {
    return parts.filter(p => p).join('/')
}

function checkNsInstance(ns, fnName) {
    if (!ns) throw new Error(`ns is required for ${fnName}`)
    return ns
}

function disableLogs(ns, listOfLogs) {
    ['disableLog'].concat(...listOfLogs).forEach(log => checkNsInstance(ns, 'disableLogs').disableLog(log))
}

function getFilePath(file) {
    return pathJoin('', file)
}

// --- Configuration ---
const passwordsFile = '/Temp/darknet-passwords.txt'
const probeInterval = 5000          // How often to probe for new servers (ms)
const memoryReallocTicks = 5        // Number of memoryReallocation calls per server

// --- Globals ---
let _ns = null
let _pid = 0
let passwords = {} // { hostname: password }

const argsSchema = [
    ['verbose', false],     // Enable verbose logging (tprint)
    ['tail', false],        // Open a tail window
]
let options

// Check if this script instance is still alive (not killed by another process)
function isAlive() {
    if (!_ns) return false
    try {
        // ns.self() returns null if script is dead/killed
        return _ns.self() !== null
    } catch (_) {
        return false
    }
}

// Local log helper: write to log file (safe, no concurrency issues), optionally tprint for important
const logFile = '/Temp/darknet-log.txt'
function log(msg, important, toastStyle) {
    if (_ns) {
        try { _ns.write(logFile, _ns.getHostname() + ' [' + new Date().toISOString().substring(11, 19) + '] ' + msg + '\n', 'a') } catch (_) {}
        if (important || (options && options.verbose)) {
            try { _ns.tprint(msg) } catch (_) {}
        }
        if (toastStyle) {
            try { _ns.toast(msg, toastStyle) } catch (_) {}
        }
    }
}

// --- Helpers ---

function loadPasswords(ns) {
    const data = ns.read(passwordsFile)
    if (data && data.length > 0) {
        try {
            passwords = JSON.parse(data)
        } catch {
            passwords = {}
        }
    }
}

function savePasswords(ns) {
    ns.write(passwordsFile, JSON.stringify(passwords), 'w')
}

// Map modelId to known default passwords or empty string.
// Extend this map as you discover new server types.
const knownPasswordStrategies = {
    'ZeroLogon': () => '',
    // Add more strategies as discovered, e.g.:
    // 'Specter': () => 'password123',
    // 'Ethereal': () => tryCommonPasswords(hostname),
}

function getPasswordHint(ns, details) {
    if (!details || !details.passwordHint) return ''
    return details.passwordHint
}

// Try to guess password for a server based on hints and known strategies.
// Returns { password, whether it was already known } or null if no guess.
function tryDeterminePassword(ns, hostname, details, safeLog) {
    if (passwords[hostname]) {
        return { password: passwords[hostname], known: true }
    }
    if (details.modelId && knownPasswordStrategies[details.modelId]) {
        const pw = knownPasswordStrategies[details.modelId](ns, hostname, details)
        return { password: pw, known: false }
    }
    const hint = getPasswordHint(ns, details)
    if (hint && safeLog) {
        safeLog('Password hint for ' + hostname + ': "' + hint + '"', true)
    }
    return null
}

// Extract more clues from server logs via heartbleed
async function getServerLogs(ns, hostname, safeLog) {
    let result = null
    let errorStr = null
    try {
        result = await ns.dnet.heartbleed(hostname, { peek: true })
    } catch (e) {
        errorStr = String(e)
    }
    // Do all NS calls AFTER all awaits are resolved
    if (errorStr) {
        if (safeLog) { safeLog('heartbleed failed for ' + hostname + ': ' + errorStr) }
        return null
    }
    if (result && result.logs) {
        return result.logs
    }
    return null
}

// --- Core Logic ---

/**
 * Attempt to authenticate with a darknet server.
 * Returns true if authentication was successful.
 */
async function tryAuthenticate(ns, hostname) {
    // Buffer all log messages and flush AFTER all awaits to avoid concurrency errors
    const buf = []
    function q(msg, imp) { buf.push({ msg, imp }) }
    function flush() { for (const e of buf) log(e.msg, e.imp) }

    // Check if we already have a session
    let details
    try {
        details = ns.dnet.getServerDetails(hostname)
    } catch {
        q('Cannot get details for ' + hostname + ' (not connected or offline)')
        flush(); return false
    }

    if (!details.isOnline) { q(hostname + ' is offline, skipping'); flush(); return false }
    if (!details.isConnectedToCurrentServer) { q(hostname + ' is not connected to current server, skipping'); flush(); return false }
    if (details.hasSession) { q('Already authenticated to ' + hostname); flush(); return true }

    // Try to determine the password
    const pwGuess = tryDeterminePassword(ns, hostname, details, q)
    if (!pwGuess) {
        q('No password strategy for ' + hostname + ' (model: ' + details.modelId + ')')
        const srvLogs = await getServerLogs(ns, hostname, q)
        if (srvLogs) { q('Server logs for ' + hostname + ': ' + JSON.stringify(srvLogs).substring(0, 200)) }
        flush(); return false
    }

    // Attempt authentication — await first, then log
    let authRes = null, authErr = null
    try { authRes = await ns.dnet.authenticate(hostname, pwGuess.password) } catch (e) { authErr = String(e) }

    if (authErr) {
        q('Error authenticating to ' + hostname + ': ' + authErr)
        flush(); return false
    }
    if (authRes && authRes.success) {
        q('SUCCESS: Authenticated to ' + hostname + (pwGuess.known ? ' (known password)' : ' (new password)'), true)
        passwords[hostname] = pwGuess.password
        try { savePasswords(ns) } catch (_) {}
        flush(); return true
    } else {
        q('Failed to authenticate to ' + hostname + ' with password "' + pwGuess.password + '"')
        if (passwords[hostname] === pwGuess.password) { delete passwords[hostname]; try { savePasswords(ns) } catch (_) {} }
        flush(); return false
    }
}

/**
 * Spread this script to a target server.
 */
async function spreadToServer(ns, hostname) {
    const scriptName = ns.getScriptName()
    try {
        // Copy script to target if not already there
        const exists = ns.fileExists(scriptName, hostname)
        if (!exists) {
            const copied = await ns.scp(scriptName, hostname)
            if (!copied) {
                log('Failed to scp ' + scriptName + ' to ' + hostname, true, 'error')
                return false
            }
            log('Copied ' + scriptName + ' to ' + hostname)
        }

        // Kill all processes on target to free RAM before spawning
        try { ns.killall(hostname) } catch (_) {}
        await ns.sleep(100)

        // Get free RAM on target
        const maxRam = ns.getServerMaxRam(hostname)
        const usedRam = ns.getServerUsedRam(hostname)
        const freeRam = maxRam - usedRam
        const scriptRamOnTarget = ns.getScriptRam(scriptName, hostname)

        log(hostname + ' RAM: ' + freeRam.toFixed(1) + 'GB free / ' + maxRam.toFixed(1) + 'GB total, script needs ' + scriptRamOnTarget.toFixed(1) + 'GB')

        if (freeRam < scriptRamOnTarget) {
            log('Not enough RAM on ' + hostname + ' to run ' + scriptName + ' after killall')
            return false
        }

        // Spawn with 1 thread
        const pid = ns.exec(scriptName, hostname, 1, ...ns.args)
        if (pid === 0) {
            log('Failed to exec ' + scriptName + ' on ' + hostname + ' (ns.exec returned 0)', true, 'error')
            return false
        }

        log('Spreading ' + scriptName + ' to ' + hostname + ' (pid ' + pid + ')', true)
        return true
    } catch (e) {
        log('Error spreading to ' + hostname + ': ' + String(e))
        return false
    }
}

/**
 * Main exploration loop for a single server.
 */
async function exploreFromServer(ns) {
    const currentServer = ns.getHostname()
    const buf = []
    function q(msg) { buf.push(msg) }

    // Probe for nearby darknet servers
    let nearby
    try {
        nearby = ns.dnet.probe()
    } catch (e) {
        q('probe() failed on ' + currentServer + ': ' + String(e))
        for (const m of buf) try { ns.write(logFile, ns.getHostname() + ' ' + m + '\n', 'a') } catch (_) {}
        return
    }

    if (!nearby || nearby.length === 0) {
        q('No darknet servers connected to ' + currentServer)
        for (const m of buf) try { ns.write(logFile, ns.getHostname() + ' ' + m + '\n', 'a') } catch (_) {}
        return
    }

    q(currentServer + ': Found ' + nearby.length + ' nearby darknet server(s): ' + nearby.join(', '))

    for (const hostname of nearby) {
        const authed = await tryAuthenticate(ns, hostname)
        if (!authed) continue
        await spreadToServer(ns, hostname)
    }

    // Flush all logs after all awaits complete
    for (const m of buf) try { ns.write(logFile, ns.getHostname() + ' ' + m + '\n', 'a') } catch (_) {}
}

// --- Entry Point ---

export function autocomplete(data, args) {
    data.flags(argsSchema)
    return []
}

/** @param {NS} ns */
export async function main(ns) {
    _ns = ns
    _pid = ns.pid || 0
    options = ns.flags(argsSchema)

    // Kill any other instances of this script on the same server
    const scriptName = ns.getHostname() + ':' + ns.getScriptName()
    try {
        const processes = ns.ps(ns.getHostname())
        for (const p of processes) {
            if (p.filename === ns.getScriptName() && p.pid !== _pid) {
                ns.kill(p.pid)
            }
        }
    } catch (_) {}

    ns.tprint('*** DARKNET EXPLORER started on ' + ns.getHostname() + ' (pid ' + _pid + ') ***')

    if (options.tail) ns.tail()

    disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'scan', 'asleep', 'exec', 'scp'])

    try { ns.write(logFile, ns.getHostname() + ' DARKNET started pid=' + _pid + '\n', 'w') } catch (_) {}

    // Check darknet API access
    try { ns.dnet.probe() } catch {
        ns.tprint('ERROR: ns.dnet API not available.')
        return
    }

    loadPasswords(ns)

    await prepareServer(ns)

    // Main loop - exit cleanly if killed
    let loopCount = 0
    while (isAlive()) {
        try {
            loopCount++
            if (loopCount % 12 === 0) {
                try { ns.write(logFile, ns.getHostname() + ' Loop #' + loopCount + '\n', 'a') } catch (_) {}
            }
            await exploreFromServer(ns)
        } catch (e) {
            try { ns.write(logFile, ns.getHostname() + ' ERROR: ' + String(e) + '\n', 'a') } catch (_) {}
        }
        await ns.sleep(probeInterval)
    }

    try { ns.write(logFile, ns.getHostname() + ' DARKNET exiting pid=' + _pid + '\n', 'a') } catch (_) {}
}

/**
 * On-server preparation: free RAM, loot cache, run phishing.
 * Called once when script starts on a new darknet server.
 */
async function prepareServer(ns) {
    const hostname = ns.getHostname()
    const buf = []
    function q(msg) { buf.push(msg) }
    function flush() { for (const m of buf) try { ns.write(logFile, hostname + ' ' + m + '\n', 'a') } catch (_) {} }

    // Prepare any darknet-related server (darkweb or darknet-*)
    const isDarknetServer = hostname === 'darkweb' || hostname.startsWith('darknet-')
    if (!isDarknetServer) {
        q('Skipping darknet preparation on ' + hostname + ' (not a darknet server)')
        flush(); return
    }

    q('Preparing darknet server ' + hostname + '...')

    // Free blocked RAM
    for (let i = 0; i < memoryReallocTicks; i++) {
        let err = null
        try { ns.dnet.memoryReallocation() } catch (e) { err = String(e) }
        if (err) { q('memoryReallocation tick ' + i + ' failed: ' + err); break }
        await ns.sleep(100)
    }

    // Loot .cache files
    let files = []
    try { files = ns.ls(hostname, '.cache') } catch (_) {}
    for (const file of files) {
        let result = null, err = null
        try { result = ns.dnet.openCache(file) } catch (e) { err = String(e) }
        if (err) { q('Failed to open ' + file + ': ' + err) }
        else if (result) { q('Opened ' + file + ' on ' + hostname + ': ' + JSON.stringify(result)) }
    }

    // Run phishing
    let phishResult = null, phishErr = null
    try { phishResult = await ns.dnet.phishingAttack() } catch (e) { phishErr = String(e) }
    if (phishErr) { q('Phishing failed: ' + phishErr) }
    else if (phishResult) { q('Phishing on ' + hostname + ': ' + JSON.stringify(phishResult)) }

    flush()
}
