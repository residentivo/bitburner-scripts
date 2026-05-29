/**
 * check-darkweb.js - Diagnostic tool
 *
 * Scans all servers and reports:
 * 1. Whether "darkweb" appears in the server list
 * 2. Total number of servers found
 * 3. Any server with "dark" in the name
 * 4. Home server RAM info
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

    // Full list
    ns.tprint(`All servers: ${serverList.join(", ")}`);

    // Check TOR purchase status
    const homeMoney = ns.getServerMoneyAvailable("home");
    ns.tprint(`Home money: ${ns.nFormat(homeMoney, "$0.00a")}`);

    // Check if darknet.js script exists
    const darknetExists = ns.fileExists("/darknet.js", "home");
    ns.tprint(`/darknet.js exists on home: ${darknetExists}`);

    // Check RAM
    const maxRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    ns.tprint(`Home RAM: ${maxRam}GB total, ${usedRam}GB used, ${(maxRam - usedRam).toFixed(1)}GB free`);

    ns.tprint("=== END DIAGNOSTIC ===");
}
