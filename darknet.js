/**
 * darknet-explorer.js — Darknet discovery and expansion
 *
 * Probes nearby darknet servers, authenticates by cracking passwords,
 * and spreads to newly discovered servers to expand reach.
 *
 * Runs on each darknet server to continuously discover new servers.
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

// --- Configuration ---
const passwordsFile = '/Temp/darknet-passwords.txt'
const probeInterval = 5000

// --- Globals ---
let _ns = null
let _pid = 0
let passwords = {}

const argsSchema = [
    ['verbose', false],
    ['tail', false],
]
let options

function isAlive() {
    if (!_ns) return false
    try { return _ns.self() !== null } catch (_) { return false }
}

const logFile = '/Temp/darknet-explorer-log.txt'
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

const knownPasswordStrategies = {
    'ZeroLogon': () => '',
}

function getPasswordHint(ns, details) {
    if (!details || !details.passwordHint) return ''
    return details.passwordHint
}

function tryDeterminePassword(ns, hostname, details, safeLog) {
    if (passwords[hostname]) return { password: passwords[hostname], known: true }
    if (details.modelId && knownPasswordStrategies[details.modelId]) {
        const pw = knownPasswordStrategies[details.modelId](ns, hostname, details)
        return { password: pw, known: false }
    }
    const hint = getPasswordHint(ns, details)
    if (hint && safeLog) safeLog('Password hint for ' + hostname + ': "' + hint + '"', true)
    return null
}

async function getServerLogs(ns, hostname, safeLog) {
    let result = null, errorStr = null
    try { result = await ns.dnet.heartbleed(hostname, { peek: true }) } catch (e) { errorStr = String(e) }
    if (errorStr) { if (safeLog) safeLog('heartbleed failed for ' + hostname + ': ' + errorStr); return null }
    if (result && result.logs) return result.logs
    return null
}

async function tryAuthenticate(ns, hostname) {
    const buf = []
    function q(msg, imp) { buf.push({ msg, imp }) }
    function flush() { for (const e of buf) log(e.msg, e.imp) }

    let details
    try { details = ns.dnet.getServerDetails(hostname) } catch {
        q('Cannot get details for ' + hostname + ' (not connected or offline)')
        flush(); return false
    }

    if (!details.isOnline) { q(hostname + ' is offline, skipping'); flush(); return false }
    if (!details.isConnectedToCurrentServer) { q(hostname + ' is not connected to current server, skipping'); flush(); return false }
    if (details.hasSession) { q('Already authenticated to ' + hostname); flush(); return true }

    const pwGuess = tryDeterminePassword(ns, hostname, details, q)
    if (!pwGuess) {
        q('No password strategy for ' + hostname + ' (model: ' + details.modelId + ')')
        const srvLogs = await getServerLogs(ns, hostname, q)
        if (srvLogs) q('Server logs for ' + hostname + ': ' + JSON.stringify(srvLogs).substring(0, 200))
        flush(); return false
    }

    let authRes = null, authErr = null
    try { authRes = await ns.dnet.authenticate(hostname, pwGuess.password) } catch (e) { authErr = String(e) }

    if (authErr) { q('Error authenticating to ' + hostname + ': ' + authErr); flush(); return false }
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
 * Spread a script to a target server.
 * @param {string} scriptName - Script to spread
 */
async function spreadScriptToServer(ns, scriptName, hostname) {
    try {
        const exists = ns.fileExists(scriptName, hostname)
        if (!exists) {
            const copied = await ns.scp(scriptName, hostname)
            if (!copied) { log('Failed to scp ' + scriptName + ' to ' + hostname, true, 'error'); return false }
            log('Copied ' + scriptName + ' to ' + hostname)
        }

        // Kill existing instances of the same script on target
        try {
            const procs = ns.ps(hostname)
            for (const p of procs) {
                if (p.filename === scriptName) ns.kill(p.pid, hostname)
            }
        } catch (_) {}
        await ns.sleep(100)

        const freeRam = ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname)
        const scriptRam = ns.getScriptRam(scriptName, hostname)

        if (freeRam < scriptRam) {
            log('Not enough RAM on ' + hostname + ' for ' + scriptName + ' (need ' + scriptRam.toFixed(1) + 'GB, have ' + freeRam.toFixed(1) + 'GB)')
            return false
        }

        const pid = ns.exec(scriptName, hostname, 1)
        if (pid === 0) { log('Failed to exec ' + scriptName + ' on ' + hostname, true, 'error'); return false }
        log('Spreading ' + scriptName + ' to ' + hostname + ' (pid ' + pid + ')', true)
        return true
    } catch (e) {
        log('Error spreading ' + scriptName + ' to ' + hostname + ': ' + String(e))
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

    let nearby
    try { nearby = ns.dnet.probe() } catch (e) {
        q('probe() failed on ' + currentServer + ': ' + String(e))
        for (const m of buf) try { ns.write(logFile, currentServer + ' ' + m + '\n', 'a') } catch (_) {}
        return
    }

    if (!nearby || nearby.length === 0) {
        q('No darknet servers connected to ' + currentServer)
        for (const m of buf) try { ns.write(logFile, currentServer + ' ' + m + '\n', 'a') } catch (_) {}
        return
    }

    q(currentServer + ': Found ' + nearby.length + ' nearby darknet server(s): ' + nearby.join(', '))

    const myName = ns.getScriptName()
    log('DEBUG: myName=' + myName + ' hostname=' + ns.getHostname())

    for (const hostname of nearby) {
        const authed = await tryAuthenticate(ns, hostname)
        if (!authed) continue

        log('DEBUG: authenticated to ' + hostname + ', spreading...')

        // Spread explorer
        const spread1 = await spreadScriptToServer(ns, myName, hostname)
        log('DEBUG: spread explorer to ' + hostname + ' = ' + spread1)

        // Spread extractor — use full path
        const extractorPath = '/darknet-extractor.js'
        // First copy extractor to home if not there
        if (!ns.fileExists(extractorPath, 'home')) {
            try { await ns.scp(extractorPath, 'home') } catch (_) {}
        }
        const spread2 = await spreadScriptToServer(ns, extractorPath, hostname)
        log('DEBUG: spread extractor to ' + hostname + ' = ' + spread2)
    }

    for (const m of buf) try { ns.write(logFile, currentServer + ' ' + m + '\n', 'a') } catch (_) {}
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

    // Kill other instances of this script on same server
    try {
        const processes = ns.ps(ns.getHostname())
        for (const p of processes) {
            if (p.filename === ns.getScriptName() && p.pid !== _pid) ns.kill(p.pid)
        }
    } catch (_) {}

    ns.tprint('*** DARKNET EXPLORER started on ' + ns.getHostname() + ' (pid ' + _pid + ') ***')
    if (options.tail) ns.tail()
    disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'scan', 'asleep', 'exec', 'scp'])

    // Check darknet API access
    const disabledFlag = '/Temp/darknet-disabled.txt'
    try {
        ns.dnet.probe()
    } catch {
        ns.tprint('INFO: ns.dnet API not available. Trying to connect to darkweb...')
        try {
            ns.singularity.connect('darkweb')
            await ns.sleep(500)
            ns.dnet.probe()
            ns.tprint('SUCCESS: Connected to darkweb!')
        } catch (connectErr) {
            ns.tprint('ERROR: Cannot access darknet. Need to: 1) buy DarkscapeNavigator.exe, 2) connect darkweb')
            try { ns.write(disabledFlag, 'no darknet access', 'w') } catch (_) {}
            return
        }
    }
    try { ns.rm(disabledFlag) } catch (_) {}

    loadPasswords(ns)

    // Main loop
    let loopCount = 0
    while (isAlive()) {
        try {
            loopCount++
            if (loopCount % 12 === 0) {
                try { ns.write(logFile, ns.getHostname() + ' Loop #' + loopCount + '\n', 'a') } catch (_) {}
            }
            // DEBUG: log every loop
            log('DEBUG LOOP #' + loopCount + ' on ' + ns.getHostname())
            await exploreFromServer(ns)
        } catch (e) {
            log('ERROR in loop: ' + String(e))
            try { ns.write(logFile, ns.getHostname() + ' ERROR: ' + String(e) + '\n', 'a') } catch (_) {}
        }
        await ns.sleep(probeInterval)
    }

    try { ns.write(logFile, ns.getHostname() + ' DARKNET EXPLORER exiting pid=' + _pid + '\n', 'a') } catch (_) {}
}
