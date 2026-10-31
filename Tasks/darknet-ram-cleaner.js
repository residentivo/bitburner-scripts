/**
 * Darknet RAM Cleaner
 * Periodically frees RAM on a darknet server by killing all non-protected scripts.
 * Intended to run from home against "darkweb" (always authenticated, directly connected).
 * 
 * Usage: run darknetRAMCleaner.js <darknetHost> [intervalSeconds] [--protect script1 script2 ...]
 * 
 * Example: run darknetRAMCleaner.js darkweb 300 --protect darknet.js helper.js
 * 
 * @param {NS} ns
 **/
export async function main(ns) {
    // Disable logging for performance (as per user preference)
    ns.disableLog("ALL");

    // Single-instance guard: exit if another copy of this script is already running on this host (regardless of args)
    const myName = ns.getScriptName();
    const otherInstance = ns.ps(ns.getHostname()).find(p => p.filename === myName && p.pid !== ns.pid);
    if (otherInstance) {
        ns.print(`Already running (PID: ${otherInstance.pid}). Exiting.`);
        return;
    }

    // Parse arguments
    const args = ns.args.map(String);
    
    // Host is optional: if the first arg is a flag (e.g. daemon.js passes "--interval 300"), default to "darkweb"
    const hasHostArg = args.length > 0 && !args[0].startsWith("--");
    const darknetHost = hasHostArg ? args[0] : "darkweb";
    let intervalSeconds = 300; // default 5 minutes
    const protectList = [];
    
    // Parse optional arguments
    let i = hasHostArg ? 1 : 0;
    while (i < args.length) {
        if (args[i] === "--interval") {
            if (i + 1 < args.length && !isNaN(args[i + 1])) intervalSeconds = parseFloat(args[i + 1]);
            i += 2;
        } else if (args[i] === "--protect") {
            i++;
            while (i < args.length && !args[i].startsWith("--")) {
                protectList.push(args[i]);
                i++;
            }
        } else if (!isNaN(args[i])) {
            intervalSeconds = parseFloat(args[i]);
            i++;
        } else {
            // Unknown argument, skip
            i++;
        }
    }
    
    ns.tprint(`Starting Darknet RAM Cleaner for host: ${darknetHost}`);
    ns.tprint(`Interval: ${intervalSeconds} seconds`);
    if (protectList.length > 0) {
        ns.tprint(`Protecting scripts: ${protectList.join(", ")}`);
    } else {
        ns.tprint("No scripts protected - will kill all scripts on the darknet server.");
    }
    
    // Main loop
    // Note: "darkweb" is always treated as authenticated and is directly connected to home,
    // so no password/authenticate step is needed when running from home.
    while (true) {
        try {
            // Step 1: Kill non-protected scripts on the darknet server (regular ns.ps works on any host)
            const processes = ns.ps(darknetHost);
            let killedCount = 0;
            for (const proc of processes) {
                if (proc.pid === ns.pid || protectList.includes(proc.filename)) continue;
                if (ns.kill(proc.pid)) {
                    killedCount++;
                } else {
                    ns.tprint(`Failed to kill ${proc.filename} on ${darknetHost} (PID: ${proc.pid})`);
                }
            }
            if (killedCount > 0) {
                ns.tprint(`Killed ${killedCount} scripts on ${darknetHost}.`);
            }

            // Step 2: Free RAM blocked by the server owner (only if there is any)
            if (ns.dnet.getBlockedRam(darknetHost) > 0) {
                const result = await ns.dnet.memoryReallocation(darknetHost);
                if (!result.success) {
                    ns.tprint(`memoryReallocation failed on ${darknetHost}: ${result.message}`);
                }
            }
        } catch (error) {
            // ns errors are often thrown as plain strings, so error.message may be undefined
            ns.tprint(`Error in darknetRAMCleaner for ${darknetHost}: ${error?.message ?? error}`);
        }

        // Wait for next interval
        await ns.asleep(intervalSeconds * 1000);
    }
}
