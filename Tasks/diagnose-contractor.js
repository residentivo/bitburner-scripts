/**
 * diagnose-contractor.js - Diagnose contractor.js exec issues
 * Run this manually in-game to debug problems
 */
/** @param {NS} ns **/
export async function main(ns) {
    const target = "/Tasks/contractor.js";
    const host = "home";
    
    // Check 1: Does the file exist?
    const files = ns.ls(host, ".js");
    const exists = files.includes(target);
    ns.tprint(`[DIAG] contractor.js exists on ${host}: ${exists}`);
    
    if (!exists) {
        ns.tprint(`[DIAG] Files in /Tasks/: ${ns.ls(host, 'contractor').join(', ')}`);
        return ns.tprint("[DIAG] contractor.js not found - pull or copy it first!");
    }
    
    // Check 2: Can we read it?
    try {
        const content = ns.read(target);
        ns.tprint(`[DIAG] File readable, length: ${content.length} chars`);
    } catch (e) {
        return ns.tprint(`[DIAG] Cannot read: ${e}`);
    }
    
    // Check 3: What does ns.isRunning say?
    ns.tprint(`[DIAG] isRunning: ${ns.isRunning(target, host)}`);
    
    // Check 4: Try to exec with 1 thread
    ns.tprint(`[DIAG] Attempting ns.exec with 1 thread...`);
    const pid1 = ns.exec(target, host, 1);
    ns.tprint(`[DIAG] ns.exec result: ${pid1}`);
    
    // Check 5: Try ns.run
    if (pid1 === 0) {
        ns.tprint(`[DIAG] ns.exec failed, trying ns.run...`);
        const ran = ns.run(target, 1);
        ns.tprint(`[DIAG] ns.run result: ${ran}`);
    }
    
    // Check 6: Try exec with more threads
    if (pid1 === 0) {
        ns.tprint(`[DIAG] Trying ns.exec with more threads...`);
        const maxRam = ns.getServerMaxRam(host);
        const usedRam = ns.getServerUsedRam(host);
        const freeRam = maxRam - usedRam;
        ns.tprint(`[DIAG] RAM: max=${maxRam} used=${usedRam} free=${freeRam}`);
    }
    
    // Check 7: Try a simple inline script via ns.exec
    ns.tprint(`[DIAG] Testing inline exec...`);
    const inlinePid = ns.exec("/Tasks/contractor-test.js", host, 1);
    ns.tprint(`[DIAG] Inline test result: ${inlinePid}`);
}
