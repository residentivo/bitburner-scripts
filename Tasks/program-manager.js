/** @param {NS} ns 
 * the purpose of the program-manager is to buy all the programs
 * from the darkweb we can afford so we don't have to do it manually
 * or write them ourselves. Like tor-manager, this script dies a natural death
 * once all programs are bought. **/
export async function main(ns) {
    const programNames = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
    const darknetProgram = "DarkscapeNavigator.exe";
    const darknetDisabledFlag = "/Temp/darknet-disabled.txt";
    const interval = 2000;

    const keepRunning = ns.args.length > 0 && ns.args[0] == "-c";
    if (!keepRunning)
        ns.print(`program-manager will run once. Run with argument "-c" to run continuously.`)

    do {
        let foundMissingProgram = false;

        // Buy standard programs
        for (const prog of programNames) {
            if (!ns.fileExists(prog, "home") && ns.singularity.purchaseProgram(prog))
                ns.toast(`Purchased ${prog}`, 'success');
            else if (keepRunning)
                foundMissingProgram = true;
        }

        // Buy darknet program if not already owned
        if (!ns.fileExists(darknetProgram, "home")) {
            // DarkscapeNavigator.exe is bought via terminal "buy" command
            try {
                const bought = ns.singularity.purchaseProgram(darknetProgram);
                if (bought && ns.fileExists(darknetProgram, "home")) {
                    ns.tprint(`Purchased ${darknetProgram}`, true);
                    try { ns.rm(darknetDisabledFlag); } catch (_) {}
                }
            } catch (_) {}
        } else {
            // Program exists — make sure disabled flag is cleared
            try { ns.rm(darknetDisabledFlag); } catch (_) {}
        }

        if (keepRunning && foundMissingProgram)
            await ns.sleep(interval);
    } while (keepRunning && foundMissingProgram);
}