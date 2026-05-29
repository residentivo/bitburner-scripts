/**
 * tor-manager.js - Buy the TOR router ASAP
 *
 * Runs every 25 seconds (via daemon periodicScripts) until:
 * 1. TOR is purchased
 * 2. darkweb appears in home neighbors
 *
 * Once TOR is bought, this script self-terminates.
 * Bitburner v3.0.1+ only.
 */
export async function main(ns) {
    const interval = 3000;

    // Check if darkweb is already visible
    const hasDarkweb = () => ns.scan("home").includes("darkweb");

    if (hasDarkweb()) {
        ns.print("darkweb already available, tor-manager exiting.");
        return;
    }

    ns.print("Attempting to purchase TOR...");
    try {
        const result = ns.singularity.purchaseTor();
        ns.print(`purchaseTor() returned: ${result}`);
    } catch (e) {
        ns.print("Failed to purchase Tor: " + String(e));
        return;
    }

    // Wait for darkweb to appear (can take a few game ticks)
    ns.print("Waiting for darkweb to appear...");
    for (let i = 0; i < 15; i++) {
        await ns.sleep(500);
        if (hasDarkweb()) {
            ns.toast("TOR purchased! darkweb is now available.", "success");
            ns.print("darkweb appeared after " + ((i + 1) * 500) + "ms!");
            return;
        }
    }

    ns.print("darkweb not visible yet. Will retry next cycle.");
}
