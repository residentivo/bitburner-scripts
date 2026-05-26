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

import {
    formatMoney, formatNumberShort, formatDuration, formatRam,
    disableLogs, log as logHelper, getFilePath, hashCode,
    getNsDataThroughFile, runCommand, waitForProcessToComplete_Custom,
    getFnIsAliveViaNsPs, autoRetry
} from './helpers.js'

// --- Configuration ---
const passwordsFile = '/Temp/darknet-passwords.txt'
const probeInterval = 5000          // How often to probe for new servers (ms)
const authThreads = 1               // Threads for authenticate calls (more = faster but costlier)
const maxAuthAttemptsPerServer = 50 // Max password guesses per server per cycle before moving on
const phishingMinRam = 4            // Minimum free RAM on a server before running phishing
const memoryReallocTicks = 5        // Number of memoryReallocation calls per server

// --- Globals ---
let _ns = null
let log = (...args) => {}
let passwords = {} // { hostname: password }

const argsSchema = [
    ['verbose', false],     // Enable verbose logging
    ['tail', false],        // Open a tail window
]
let options

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
        // Copy script to target
        const copied = await ns.scp(scriptName, hostname)
        if (!copied) {
            log(`Failed to copy ${scriptName} to ${hostname}`)
            return false
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

        if (freeRam < scriptRam) {
            log(`Not enough RAM on ${hostname} to run ${scriptName} (need ${scriptRam}GB, have ${freeRam}GB free)`)
            return false
        }

        const threads = Math.max(1, Math.floor(freeRam / scriptRam))
        const pid = ns.exec(scriptName, hostname, threads, ...ns.args)
        if (pid === 0) {
            log(`Failed to exec ${scriptName} on ${hostname}`)
            return false
        }

        log(`Spreading ${scriptName} to ${hostname} (${threads} threads)`, true)
        return true
    } catch (e) {
        log(`Error spreading to ${hostname}: ${String(e)}`)
        return false
    }
}

/**
 * Free blocked RAM on a darknet server using memoryReallocation.
 */
async function freeMemory(ns, hostname) {
    try {
        for (let i = 0; i < memoryReallocTicks; i++) {
            ns.dnet.memoryReallocation(hostname)
            await ns.asleep(100)
        }
        log(`Freed memory on ${hostname}`)
    } catch (e) {
        log(`memoryReallocation failed on ${hostname}: ${String(e)}`)
    }
}

/**
 * Open any .cache files found on the server.
 */
async function lootCacheFiles(ns, hostname) {
    try {
        const files = ns.ls(hostname, '.cache')
        for (const file of files) {
            try {
                const result = ns.dnet.openCache(file)
                log(`Opened ${file} on ${hostname}: ${JSON.stringify(result)}`, true, 'success')
            } catch (e) {
                log(`Failed to open ${file} on ${hostname}: ${String(e)}`)
            }
        }
    } catch (e) {
        log(`Error listing cache files on ${hostname}: ${String(e)}`)
    }
}

/**
 * Run phishing attacks on a darknet server for money and .cache files.
 */
async function runPhishing(ns, hostname) {
    try {
        const maxRam = ns.getServerMaxRam(hostname)
        const usedRam = ns.getServerUsedRam(hostname)
        const freeRam = maxRam - usedRam

        if (freeRam < phishingMinRam) return

        // Each phishing call uses ~1GB RAM
        const threads = Math.max(1, Math.floor(freeRam / 1))
        for (let i = 0; i < threads; i++) {
            ns.dnet.phishingAttack()
        }
        log(`Running ${threads} phishing threads on ${hostname}`)
    } catch (e) {
        log(`Phishing failed on ${hostname}: ${String(e)}`)
    }
}

/**
 * Connect to a session on a remote darknet server (for scp/exec at distance).
 */
async function connectToSession(ns, hostname) {
    if (passwords[hostname]) {
        try {
            ns.dnet.connectToSession(hostname, passwords[hostname])
        } catch (e) {
            // Non-fatal: some servers may not support this
        }
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

        // Connect session for remote operations
        await connectToSession(ns, hostname)

        // Free blocked RAM
        await freeMemory(ns, hostname)

        // Loot cache files
        await lootCacheFiles(ns, hostname)

        // Spread this script to the new server
        await spreadToServer(ns, hostname)

        // Run phishing for money/exp
        await runPhishing(ns, hostname)
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
    log = (...args) => logHelper(_ns, ...args)

    disableLogs(ns, ['getServerMaxRam', 'getServerUsedRam', 'scan', 'asleep', 'exec', 'scp'])

    if (options.tail) {
        ns.tail()
    }

    // Check if we have access to the darknet API
    try {
        ns.dnet.probe()
    } catch {
        log('ERROR: ns.dnet API not available. Purchase DarkscapeNavigator.exe first (buy DarkscapeNavigator.exe in terminal with TOR router).', true, 'error')
        return
    }

    // Load previously discovered passwords
    loadPasswords(ns)
    log(`Loaded ${Object.keys(passwords).length} known password(s)`)

    log(`Starting darknet exploration on ${ns.getHostname()}...`, true)

    // Main loop
    while (true) {
        try {
            await exploreFromServer(ns)
        } catch (e) {
            log(`ERROR in main loop: ${String(e)}`, true, 'error')
        }
        await ns.sleep(probeInterval)
    }
}
