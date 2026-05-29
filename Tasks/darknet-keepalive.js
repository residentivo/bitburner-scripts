/**
 * darknet-keepalive.js - Periodic darknet maintenance
 *
 * Runs every 30 seconds to:
 * 1. Ensure darknet.js is running (restart if crashed or killed)
 * 2. Force a fresh probe cycle to discover new darknet servers
 *
 * This is a lightweight watchdog - the heavy lifting is done by darknet.js.
 */

export async function main(ns) {
    const darknetScript = "/darknet.js";

    // Check if darknet.js is already running (on home or any server)
    const isRunning = ns.isRunning(darknetScript, "home") ||
        ns.ps("home").some(p => p.filename === darknetScript);

    if (!isRunning) {
        // Check if we have enough RAM to spawn it
        const scriptRam = ns.getScriptRam(darknetScript, "home");
        const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        if (freeRam >= scriptRam) {
            const pid = ns.exec(darknetScript, "home", 1);
            if (pid) {
                ns.tprint(`darknet-keepalive: Started darknet.js (pid=${pid})`);
            } else {
                ns.tprint(`darknet-keepalive: Failed to spawn darknet.js (need ${scriptRam.toFixed(1)}GB, have ${freeRam.toFixed(1)}GB free)`);
            }
        } else {
            ns.print(`darknet-keepalive: Not enough RAM to spawn darknet.js (need ${scriptRam.toFixed(1)}GB, have ${freeRam.toFixed(1)}GB free)`);
        }
    } else {
        // darknet.js is running - do a quick probe to refresh the darknet map
        try {
            if (ns.dnet) {
                ns.dnet.probe();
                ns.print("darknet-keepalive: Probe OK");
            }
        } catch (e) {
            // dnet API not available or error - darknet.js will handle it
        }
    }
}
