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
let passwords = {} // { hostname: password }

const argsSchema = [
    ['verbose', false],     // Enable verbose logging (tprint)
    ['tail', false],        // Open a tail window
]
let options

// Local log helper: always prints to ns.print (visible in tail), optionally also tprint/toast
function log(msg, important, toastStyle) {
    if (_ns) {
        _ns.print(msg)
        if (important || (options && options.verbose)) {
            _ns.tprint(msg)
        }
        if (toastStyle) {
            _ns.toast(msg, toastStyle)
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
function tryDeterminePassword(ns, hostname, details) {
    // If we already know this server's password, use it
    if (passwords[hostname]) {
        return { password: passwords[hostname], known: true }
    }

    // If we have a known strategy for this modelId, use it
    if (details.modelId && knownPasswordStrategies[details.modelId]) {
        const pw = knownPasswordStrategies[details.modelId](ns, hostname, details)
        return { password: pw, known: false }
    }

    // Check the password hint for clues
    const hint = getPasswordHint(ns, details)
    if (hint) {
        log(`Password hint for ${hostname}: "${hint}"`, true)
    }

    // Cannot determine password
    return null
}

// Extract more clues from server logs via heartbleed
async function getServerLogs(ns, hostname) {
    try {
        const result = await ns.dnet.heartbleed(hostname, { peek: true })
        if (result && result.logs) {
            return result.logs
        }
    } catch (e) {
        log(`heartbleed failed for ${hostname}: ${String(e)}`)
    }
    return null
}

// --- Core Logic ---

/**
 * Attempt to authenticate with a darknet server.
 * Returns true if authentication was successful.
 */
async function tryAuthenticate(ns, hostname) {
    // Check if we already have a session
    let details
    try {
        details = ns.dnet.getServerDetails(hostname)
    } catch {
        log(`Cannot get details for ${hostname} (not connected or offline)`)
        return false
    }

    if (!details.isOnline) {
        log(`${hostname} is offline, skipping`)
        return false
    }

    if (!details.isConnectedToCurrentServer) {
        log(`${hostname} is not connected to current server, skipping`)
        return false
    }

    if (details.hasSession) {
        log(`Already authenticated to ${hostname}`)
        return true
    }

    // Try to determine the password
    const pwGuess = tryDeterminePassword(ns, hostname, details)
    if (!pwGuess) {
        log(`No password strategy for ${hostname} (model: ${details.modelId})`)
        // Try heartbleed to get more clues
        const logs = await getServerLogs(ns, hostname)
        if (logs) {
            log(`Server logs for ${hostname}: ${JSON.stringify(logs).substring(0, 200)}`)
        }
        return false
    }

    // Attempt authentication
    try {
        const result = await ns.dnet.authenticate(hostname, pwGuess.password)
        if (result.success) {
            log(`SUCCESS: Authenticated to ${hostname}${pwGuess.known ? ' (known password)' : ' (new password: "' + pwGuess.password + '")'}`, true, 'success')
            // Save the password for future use
            passwords[hostname] = pwGuess.password
            savePasswords(ns)
            return true
        } else {
            log(`Failed to authenticate to ${hostname} with password "${pwGuess.password}"`)
            // Remove stale password if it failed
            if (passwords[hostname] === pwGuess.password) {
                delete passwords[hostname]
                savePasswords(ns)
            }
            return false
        }
    } catch (e) {
        log(`Error authenticating to ${hostname}: ${String(e)}`)
        return false
    }
}

/**
 * Spread this script to a target server.
 */
async function spreadToServer(ns, hostname) {
    const scriptName = ns.getScriptName()
    try {
        // Check if script already exists on target
        const exists = ns.fileExists(scriptName, hostname)
        if (!exists) {
            // Copy script to target
            const copied = await ns.scp(scriptName, hostname)
            if (!copied) {
                log(`Failed to scp ${scriptName} to ${hostname}`, true, 'error')
                return false
            }
            log(`Copied ${scriptName} to ${hostname}`)
        }

        // Check if already running
        const processes = ns.ps(hostname)
        if (processes.some(p => p.filename === scriptName)) {
            log(`${scriptName} already running on ${hostname}`)
            return true
        }

        // Get free RAM on target
        const maxRam = ns.getServerMaxRam(hostname)
        const usedRam = ns.getServerUsedRam(hostname)
        const freeRam = maxRam - usedRam
        const scriptRam = ns.getScriptRam(scriptName)
        const scriptRamOnTarget = ns.getScriptRam(scriptName, hostname)

        log(`${hostname} RAM: ${freeRam.toFixed(1)}GB free / ${maxRam.toFixed(1)}GB total`)
        log(`${scriptName} RAM: ${scriptRam.toFixed(1)}GB (home) / ${scriptRamOnTarget.toFixed(1)}GB (${hostname})`)
        log(`fileExists(${scriptName}, ${hostname}): ${exists}`)
        log(`processes on ${hostname}: ${processes.length}`)
        for (const p of processes) {
            log(`  pid=${p.pid} file=${p.filename} ram=${p.threads * (ns.getScriptRam(p.filename) || 0).toFixed(1)}GB`)
        }

        if (freeRam < scriptRamOnTarget) {
            log(`Not enough RAM on ${hostname} to run ${scriptName} (need ${scriptRamOnTarget.toFixed(1)}GB, have ${freeRam.toFixed(1)}GB free)`)
            return false
        }

        // Try spawning with 1 thread first (safest)
        const pid = ns.exec(scriptName, hostname, 1, ...ns.args)
        if (pid === 0) {
            // If exec failed, try killing any existing instance and retrying
            log(`exec returned 0 on ${hostname}, attempting killall and retry...`)
            try { ns.killall(hostname) } catch (_) {}
            await ns.sleep(200)
            const pid2 = ns.exec(scriptName, hostname, 1, ...ns.args)
            if (pid2 === 0) {
                log(`Failed to exec ${scriptName} on ${hostname} after killall (ns.exec returned 0 twice)`, true, 'error')
                return false
            }
            log(`Spreading ${scriptName} to ${hostname} (pid ${pid2}) after killall`, true)
            return true
        }

        log(`Spreading ${scriptName} to ${hostname} (pid ${pid})`, true)
        return true
    } catch (e) {
        log(`Error spreading to ${hostname}: ${String(e)}`)
        return false
    }
}

/**
 * Main exploration loop for a single server.
 */
async function exploreFromServer(ns) {
    const currentServer = ns.getHostname()

    // Probe for nearby darknet servers
    let nearby
    try {
        nearby = ns.dnet.probe()
    } catch (e) {
        log(`probe() failed on ${currentServer}: ${String(e)}`)
        return
    }

    if (!nearby || nearby.length === 0) {
        log(`No darknet servers connected to ${currentServer}`)
        return
    }

    log(`${currentServer}: Found ${nearby.length} nearby darknet server(s): ${nearby.join(', ')}`)

    for (const hostname of nearby) {
        // Try to authenticate
        const authed = await tryAuthenticate(ns, hostname)
        if (!authed) continue

        // Spread this script to the new server
        await spreadToServer(ns, hostname)
    }
}

// --- Entry Point ---

export function autocomplete(data, args) {
    data.flags(argsSchema)
    return []
}

/** @param {NS} ns */
export async function main(ns) {
    _ns = ns
    options = ns.flags(argsSchema)

    // Immediate visible confirmation that script started
    ns.tprint('*** DARKNET EXPLORER started on ' + ns.getHostname() + ' ***')

    if (options.tail) {
        ns.tail()
    }

    disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'scan', 'asleep', 'exec', 'scp'])

    // Always-visible startup banner
    ns.print('========================================')
    ns.print('  DARKNET EXPLORER - Starting up...')
    ns.print('========================================')

    // Check if we have access to the darknet API
    try {
        ns.dnet.probe()
    } catch {
        ns.tprint('ERROR: ns.dnet API not available. Purchase DarkscapeNavigator.exe first (buy DarkscapeNavigator.exe in terminal with TOR router).')
        return
    }

    // Load previously discovered passwords
    loadPasswords(ns)
    ns.print(`Loaded ${Object.keys(passwords).length} known password(s)`)
    ns.print(`Starting darknet exploration on ${ns.getHostname()}...`)

    // On each server we run: free memory, loot cache, phishing, then explore
    await prepareServer(ns)

    // Main loop
    let loopCount = 0
    while (true) {
        try {
            loopCount++
            if (loopCount % 12 === 0) { // Every ~60 seconds (12 * 5s)
                ns.print(`[Darknet] Loop #${loopCount} - exploring from ${ns.getHostname()}...`)
            }
            await exploreFromServer(ns)
        } catch (e) {
            ns.print(`ERROR in main loop: ${String(e)}`)
        }
        await ns.sleep(probeInterval)
    }
}

/**
 * On-server preparation: free RAM, loot cache, run phishing.
 * Called once when script starts on a new darknet server.
 */
async function prepareServer(ns) {
    const hostname = ns.getHostname()

    // Skip darknet-specific APIs if not on a darknet server (e.g. running from home)
    if (hostname === 'home' || !hostname.startsWith('darknet-')) {
        log(`Skipping darknet preparation on ${hostname} (not a darknet server)`)
        return
    }

    log(`Preparing darknet server ${hostname}...`)

    // Free blocked RAM (must run locally on this server)
    for (let i = 0; i < memoryReallocTicks; i++) {
        try {
            ns.dnet.memoryReallocation()
        } catch (e) {
            log(`memoryReallocation tick ${i} failed: ${String(e)}`)
            break
        }
        await ns.sleep(100)
    }

    // Loot .cache files (must run locally)
    try {
        const files = ns.ls(hostname, '.cache')
        for (const file of files) {
            try {
                const result = ns.dnet.openCache(file)
                log(`Opened ${file} on ${hostname}: ${JSON.stringify(result)}`, true, 'success')
            } catch (e) {
                log(`Failed to open ${file}: ${String(e)}`)
            }
        }
    } catch (e) {
        log(`Cache looting failed: ${String(e)}`)
    }

    // Run phishing for money/charisma
    try {
        const result = await ns.dnet.phishingAttack()
        if (result) {
            log(`Phishing on ${hostname}: ${JSON.stringify(result)}`, true)
        }
    } catch (e) {
        log(`Phishing failed: ${String(e)}`)
    }
}
