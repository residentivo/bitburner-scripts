/**
 * check-darkweb.js - Diagnostic tool + TOR purchase + darknet launcher
 *
 * 1. Scans all servers and checks for darkweb
 * 2. If not present, attempts to purchase TOR
 * 3. Waits and re-checks for darkweb
 * 4. If darkweb appears, launches darknet.js
 */

export async function main(ns) {
    ns.tprint("=== DARKWEB DIAGNOSTIC ===");

    // Helper: scan all servers
    function scanAll() {
        const allServers = new Set();
        const queue = ["home"];
        while (queue.length > 0) {
            const current = queue.shift();
            if (allServers.has(current)) continue;
            allServers.add(current);
            try {
                const neighbors = ns.scan(current);
                for (const n of neighbors) {
                    if (!allServers.has(n)) queue.push(n);
                }
            } catch (_) {}
        }
        return allServers;
    }

    // Helper: check if darkweb is accessible
    function hasDarkweb() {
        return ns.scan("home").includes("darkweb");
    }

    let servers = scanAll();
    ns.tprint(`Total servers found: ${servers.size}`);
    ns.tprint(`darkweb in list: ${servers.has("darkweb")}`);

    if (!hasDarkweb()) {
        ns.tprint("Attempting to purchase TOR...");
        try {
            const result = ns.singularity.purchaseTor();
            ns.tprint(`purchaseTor() returned: ${result}`);
        } catch (e) {
            ns.tprint(`purchaseTor() error: ${String(e)}`);
            ns.tprint("Try manually: buy -a  (in terminal)");
            return ns.tprint("=== END DIAGNOSTIC ===");
        }

        // Wait for darkweb to appear (can take a few game ticks)
        ns.tprint("Waiting for darkweb to appear...");
        for (let i = 0; i < 10; i++) {
            await ns.sleep(500);
            if (hasDarkweb()) {
                ns.tprint(`darkweb appeared after ${(i + 1) * 500}ms!`);
                break;
            }
        }

        if (!hasDarkweb()) {
            ns.tprint("darkweb still not visible after 5 seconds.");
            ns.tprint("The TOR may need a game tick. Try running this script again.");
            return ns.tprint("=== END DIAGNOSTIC ===");
        }
    }

    // Darkweb is available - check/launch darknet.js
    ns.tprint("darkweb is available! Checking darknet.js...");
    const darknetScript = "/darknet.js";
    const darknetExists = ns.fileExists(darknetScript, "home");
    ns.tprint(`${darknetScript} exists: ${darknetExists}`);

    if (!darknetExists) {
        ns.tprint("ERROR: darknet.js not found on home!");
        return ns.tprint("=== END DIAGNOSTIC ===");
    }

    // Check if already running
    const alreadyRunning = ns.ps("home").some(p => p.filename === darknetScript);
    ns.tprint(`darknet.js already running: ${alreadyRunning}`);

    if (!alreadyRunning) {
        const scriptRam = ns.getScriptRam(darknetScript, "home");
        const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        ns.tprint(`RAM: need ${scriptRam.toFixed(1)}GB, have ${freeRam.toFixed(1)}GB free`);

        if (freeRam < scriptRam) {
            ns.tprint("ERROR: Not enough RAM to launch darknet.js!");
            return ns.tprint("=== END DIAGNOSTIC ===");
        }

        const pid = ns.exec(darknetScript, "home", 1);
        if (pid) {
            ns.tprint(`Launched darknet.js (PID: ${pid})`);
        } else {
            ns.tprint("ERROR: ns.exec returned 0 - failed to launch darknet.js");
        }
    }

    ns.tprint("=== END DIAGNOSTIC ===");
}
