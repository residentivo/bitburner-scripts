/**
 * check-darkweb.js - Diagnostic tool + TOR purchase + darknet launcher
 */

export async function main(ns) {
    ns.tprint("=== DARKWEB DIAGNOSTIC ===");

    // Check if darkweb is accessible
    function hasDarkweb() {
        return ns.scan("home").includes("darkweb");
    }

    // Scan all servers
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

    const hasDarkwebNow = hasDarkweb();
    ns.tprint("darkweb visible: " + hasDarkwebNow);

    if (!hasDarkwebNow) {
        // Check if we can call purchaseTor at all
        ns.tprint("Checking purchaseTor availability...");
        try {
            // In v3, purchaseTor() returns false if already owned, true if purchased
            // But it may also throw if conditions not met
            const result = ns.singularity.purchaseTor();
            ns.tprint("purchaseTor() returned: " + result);
            ns.tprint("Type: " + typeof result);
        } catch (e) {
            ns.tprint("purchaseTor() threw: " + String(e));
        }

        // Check home server for darkweb in neighbors after a short wait
        ns.tprint("Waiting 2 seconds and re-checking...");
        await ns.sleep(2000);
        ns.tprint("darkweb visible after wait: " + hasDarkweb());

        // Maybe darkweb is accessible but not as a direct neighbor?
        // In some BN configurations, darkweb might be deeper in the network
        const allServers = scanAll();
        ns.tprint("Total servers scanned: " + allServers.size);
        const darkInAll = allServers.has("darkweb");
        ns.tprint("darkweb in full scan: " + darkInAll);

        // Check if there's a "darkweb" process or file
        const homeProcs = ns.ps("home").filter(p => p.filename.includes("dark"));
        ns.tprint("Dark-related processes on home: " + (homeProcs.length > 0 ? homeProcs.map(p => p.filename).join(", ") : "none"));

        // Check if we have singularity API available
        try {
            const player = ns.getPlayer();
            ns.tprint("Player hasSingularity: " + (player ? "yes (getPlayer works)" : "no"));
        } catch (e) {
            ns.tprint("getPlayer error: " + String(e));
        }

        ns.tprint("");
        ns.tprint("DIAGNOSIS: purchaseTor() returns true but darkweb doesn't appear.");
        ns.tprint("This usually means TOR is already owned but darkweb hasn't spawned yet.");
        ns.tprint("Try: save and reload the game, or check if darkweb appears after a bitnode restart.");
    } else {
        ns.tprint("darkweb IS available!");
        // Launch darknet.js
        const darknetScript = "/darknet.js";
        const alreadyRunning = ns.ps("home").some(p => p.filename === darknetScript);
        if (alreadyRunning) {
            ns.tprint("darknet.js is already running.");
        } else {
            const pid = ns.exec(darknetScript, "home", 1);
            ns.tprint("Launched darknet.js with PID: " + pid);
        }
    }

    ns.tprint("=== END DIAGNOSTIC ===");
}
