/**
 * darknet-extractor.js — Darknet resource extraction
 *
 * Runs on each darknet server to extract resources:
 *  1. Free blocked RAM with ns.dnet.memoryReallocation()
 *  2. Loot .cache files with ns.dnet.openCache()
 *  3. Run phishing attacks with ns.dnet.phishingAttack()
 *
 * This script runs continuously on each darknet server.
 * The explorer script spreads this to new servers automatically.
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
const memoryReallocTicks = 5
const extractInterval = 30000   // Run extraction every 30 seconds

// --- Globals ---
let _ns = null
let _pid = 0

const argsSchema = [
    ['verbose', false],
    ['tail', false],
]
let options

function isAlive() {
    if (!_ns) return false
    try { return _ns.self() !== null } catch (_) { return false }
}

const logFile = '/Temp/darknet-extract-log.txt'
function log(msg, important, toastStyle) {
    if (_ns) {
        try { _ns.write(logFile, _ns.getHostname() + ' [' + new Date().toISOString().substring(11, 19) + '] ' + msg + '\n', 'a') } catch (_) {}
        if (important || (options && options.verbose)) { try { _ns.tprint(msg) } catch (_) {} }
        if (toastStyle) { try { _ns.toast(msg, toastStyle) } catch (_) {} }
    }
}

/**
 * Extract resources from a darknet server.
 * Called once per loop iteration.
 */
async function extractFromServer(ns) {
    const hostname = ns.getHostname()
    const isDarknetServer = hostname === 'darkweb' || hostname.startsWith('darknet-')
    if (!isDarknetServer) return

    const buf = []
    function q(msg) { buf.push(msg) }
    function flush() { for (const m of buf) try { ns.write(logFile, hostname + ' ' + m + '\n', 'a') } catch (_) {} }

    // 1. Free blocked RAM
    for (let i = 0; i < memoryReallocTicks; i++) {
        let err = null
        try { ns.dnet.memoryReallocation() } catch (e) { err = String(e) }
        if (err) { q('memoryReallocation tick ' + i + ' failed: ' + err); break }
        await ns.sleep(100)
    }

    // 2. Loot .cache files
    let files = []
    try { files = ns.ls(hostname, '.cache') } catch (_) {}
    for (const file of files) {
        let result = null, err = null
        try { result = ns.dnet.openCache(file) } catch (e) { err = String(e) }
        if (err) { q('Failed to open ' + file + ': ' + err) }
        else if (result) { q('Opened ' + file + ': ' + JSON.stringify(result).substring(0, 200)) }
    }

    // 3. Phishing attack
    let phishResult = null, phishErr = null
    try { phishResult = await ns.dnet.phishingAttack() } catch (e) { phishErr = String(e) }
    if (phishErr) { q('Phishing failed: ' + phishErr) }
    else if (phishResult) { q('Phishing: ' + JSON.stringify(phishResult).substring(0, 200)) }

    flush()
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

    const hostname = ns.getHostname()
    ns.tprint('*** DARKNET EXTRACTOR started on ' + hostname + ' (pid ' + _pid + ') ***')
    if (options.tail) ns.tail()
    disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'scan', 'asleep', 'exec', 'scp', 'ls'])

    // Check darknet API access (verify we're on a darknet server)
    if (hostname !== 'darkweb' && !hostname.startsWith('darknet-')) {
        ns.tprint('ERROR: Not a darknet server (' + hostname + '). Extractor only runs on darknet servers.')
        return
    }

    try {
        ns.dnet.probe() // Verify dnet is available
    } catch (e) {
        ns.tprint('ERROR: ns.dnet API not available on ' + hostname + ': ' + String(e))
        return
    }

    // Main loop - continuous extraction
    let loopCount = 0
    while (isAlive()) {
        try {
            loopCount++
            await extractFromServer(ns)
        } catch (e) {
            try { ns.write(logFile, hostname + ' ERROR: ' + String(e) + '\n', 'a') } catch (_) {}
        }
        await ns.sleep(extractInterval)
    }

    try { ns.write(logFile, hostname + ' DARKNET EXTRACTOR exiting pid=' + _pid + '\n', 'a') } catch (_) {}
}
