/**
 * check-darkweb.js - Diagnostic tool
 *
 * Scans all servers and reports:
 * 1. Whether "darkweb" appears in the server list
 * 2. Total number of servers found
 * 3. Any server with "dark" in the name
 * 4. Home server RAM info
 * 5. Attempts to purchase TOR if not present
 */

export async function main(ns) {
    ns.tprint("=== DARKWEB DIAGNOSTIC ===");

    // Scan all servers recursively
    const allServers = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const current = queue.shift();
        if (allServers.has(current)) continue;
        allServers.add(current);
        const neighbors = ns.scan(current);
        for (const n of neighbors) {
            if (!allServers.has(n)) queue.push(n);
        }
    }

    const serverList = [...allServers].sort();
    ns.tprint(`Total servers found: ${serverList.length}`);

    // Check for darkweb
    const hasDarkweb = allServers.has("darkweb");
    ns.tprint(`darkweb in list: ${hasDarkweb}`);

    // Find any server with "dark" in name
    const darkServers = serverList.filter(s => s.toLowerCase().includes("dark"));
    ns.tprint(`Servers with "dark" in name: ${darkServers.length > 0 ? darkServers.join(", ") : "(none)"}`);

    // Check if darknet.js script exists
    const darknetExists = ns.fileExists("/darknet.js", "home");
    ns.tprint(`/darknet.js exists on home: ${darknetExists}`);

    // Check RAM
    const maxRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    ns.tprint(`Home RAM: ${maxRam}GB total, ${usedRam}GB used, ${(maxRam - usedRam).toFixed(1)}GB free`);

    // Check home neighbors (where darkweb would appear)
    const homeNeighbors = ns.scan("home");
    ns.tprint(`Home neighbors: ${homeNeighbors.join(", ")}`);

    // Attempt to purchase TOR if not present
    if (!hasDarkweb) {
        ns.tprint("Attempting to purchase TOR...");
        try {
            // Try the v3 API
            const result = ns.singularity.purchaseTor();
            ns.tprint(`purchaseTor() returned: ${JSON.stringify(result)}`);
        } catch (e) {
            ns.tprint(`purchaseTor() error: ${String(e)}`);
            // Try alternative method
            try {
                ns.tprint("Trying terminal buy command...");
                // Can't run terminal buy from NS script directly
                ns.tprint("NOTE: You may need to manually run 'buy -a' in terminal");
            } catch (e2) {
                ns.tprint(`Alternative also failed: ${String(e2)}`);
            }
        }
        // Re-check after purchase attempt
        const newNeighbors = ns.scan("home");
        const nowHasDarkweb = newNeighbors.includes("darkweb");
        ns.tprint(`After purchase attempt - darkweb in neighbors: ${nowHasDarkweb}`);
        if (nowHasDarkweb) {
            ns.tprint("SUCCESS: TOR purchased! darkweb is now available.");
        } else {
            ns.tprint("TOR not purchased yet. You may need to run 'buy -a' in terminal.");
        }
    } else {
        ns.tprint("darkweb is already available. darknet.js should have been launched by daemon.");
        // Check if darknet.js is running
        const darknetRunning = ns.ps("home").some(p => p.filename === "/darknet.js");
        ns.tprint(`darknet.js running on home: ${darknetRunning}`);
    }

    ns.tprint("=== END DIAGNOSTIC ===");
}
