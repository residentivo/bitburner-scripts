/** @param {NS} ns 
 * the purpose of tor-manager is to buy the TOR router ASAP
 * so that another script can buy the port breakers. This script
 * dies a natural death once tor is bought.
 * Bitburner v3.0.1+ only. **/
export async function main(ns) {
    const interval = 2000;

    var keepRunning = ns.args.length > 0 && ns.args[0] == "-c";
    if (!keepRunning)
        ns.print(`tor-manager will run once. Run with argument "-c" to run continuously.`)

    let hasTor = () => ns.scan("home").includes("darkweb");
    if (hasTor())
        return ns.print('Player already has Tor');
    do {
        if (hasTor()) {
            ns.toast(`Purchased the Tor router!`, 'success');
            break;
        }
        try {
            ns.singularity.purchaseTor();
        } catch (e) {
            ns.print('Failed to purchase Tor: ' + String(e));
        }
        if (keepRunning)
            await ns.sleep(interval);
    }
    while (keepRunning);
}
