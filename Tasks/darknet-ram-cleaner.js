/**
 * Darknet RAM Cleaner
 * Periodically frees RAM on a darknet server by killing all non-protected scripts.
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
    
    // Parse arguments
    const args = ns.args;
    if (args.length < 1) {
        ns.tprint("Usage: run darknetRAMCleaner.js <darknetHost> [intervalSeconds] [--protect script1 script2 ...]");
        return;
    }
    
    const darknetHost = args[0];
    let intervalSeconds = 300; // default 5 minutes
    const protectList = [];
    
    // Parse optional arguments
    let i = 1;
    while (i < args.length) {
        if (args[i] === "--protect") {
            i++;
            while (i < args.length && args[i].startsWith("--") === false) {
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
    while (true) {
        try {
            // Check if host is a darknet server
            const server = await ns.dnet.getServer(darknetHost);
            if (!server) {
                ns.tprint(`Error: ${darknetHost} is not a valid darknet server or not accessible.`);
                await ns.sleep(intervalSeconds * 1000);
                continue;
            }
            
            // Get running scripts on the darknet server
            const running = await ns.dnet.ps(darknetHost);
            
            if (running.length === 0) {
                // ns.tprint(`No scripts running on ${darknetHost}.`);
                await ns.sleep(intervalSeconds * 1000);
                continue;
            }
            
            let killedCount = 0;
            for (const proc of running) {
                // Check if this script should be protected
                if (protectList.length > 0 && protectList.includes(proc.filename)) {
                    continue;
                }
                
                // Attempt to kill the process
                try {
                    const killed = await ns.dnet.kill(proc.filename, darknetHost, ...proc.args);
                    if (killed) {
                        killedCount++;
                        ns.tprint(`Killed ${proc.filename} on ${darknetHost} (PID: ${proc.pid})`);
                    } else {
                        ns.tprint(`Failed to kill ${proc.filename} on ${darknetHost}`);
                    }
                } catch (killError) {
                    ns.tprint(`Error killing ${proc.filename}: ${killError.message}`);
                }
            }
            
            if (killedCount > 0) {
                ns.tprint(`Killed ${killedCount} scripts on ${darknetHost}.`);
            } else {
                // ns.tprint(`No non-protected scripts to kill on ${darknetHost}.`);
            }
            
            // Wait for next interval
            await ns.sleep(intervalSeconds * 1000);
        } catch (error) {
            ns.tprint(`Error in darknetRAMCleaner: ${error.message}`);
            await ns.sleep(intervalSeconds * 1000); // Wait before retrying
        }
    }
}