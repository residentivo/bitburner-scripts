/**
 * Darknet RAM Cleaner
 * Periodically frees RAM on a darknet server by killing all non-protected scripts.
 * Requires authentication via ns.dnet API for darknet servers.
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
    while (true) {
        try {
            // Step 1: Probe the host to get available services
            const services = await ns.dnet.probe(darknetHost);
            // Optional: ns.tprint(`Probe result for ${darknetHost}: ${JSON.stringify(services)}`);
            
            // Step 2: Get server details (optional but part of auth sequence)
            const serverDetails = await ns.dnet.getServerDetails(darknetHost);
            // Optional: ns.tprint(`Server details: ${JSON.stringify(serverDetails)}`);
            
            // Step 3: Solve password for authentication
            const password = await ns.dnet.solvePassword(darknetHost);
            // Be careful logging passwords; maybe just log length or success
            ns.tprint(`Password solved for ${darknetHost} (length: ${password.length})`);
            
            // Step 4: Authenticate
            const authSuccess = await ns.dnet.authenticate(darknetHost, password);
            if (!authSuccess) {
                throw new Error(`Authentication failed for ${darknetHost}`);
            }
            ns.tprint(`Authenticated to ${darknetHost}`);
            
            // Step 5: Get running processes on the darknet server (use ns.dnet.ps to avoid crash)
            const processes = await ns.dnet.ps(darknetHost);
            // ns.tprint(`Found ${processes.length} processes on ${darknetHost}`);
            
            if (processes.length === 0) {
                // ns.tprint(`No scripts running on ${darknetHost}.`); // Commented to reduce logs per user preference
                // Still perform memory reallocation? Possibly not needed if no processes.
                // But we'll do it anyway as per "once per script".
                await ns.dnet.memoryReallocation();
                await ns.asleep(intervalSeconds * 1000);
                continue;
            }
            
            let killedCount = 0;
            for (const proc of processes) {
                // Check if this script should be protected
                if (protectList.length > 0 && protectList.includes(proc.filename)) {
                    continue;
                }
                
                // Attempt to kill the process
                try {
                    const killed = await ns.kill(proc.filename, darknetHost, ...proc.args);
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
                // ns.tprint(`No non-protected scripts to kill on ${darknetHost}.`); // Commented to reduce logs
            }
            
            // Step 6: Free blocked RAM (once per script iteration)
            await ns.dnet.memoryReallocation();
            
        } catch (error) {
            ns.tprint(`Error in darknetRAMCleaner for ${darknetHost}: ${error.message}`);
            // Wait before retrying to avoid spamming errors
            await ns.asleep(intervalSeconds * 1000);
            continue;
        }
        
        // Wait for next interval
        await ns.asleep(intervalSeconds * 1000);
    }
}