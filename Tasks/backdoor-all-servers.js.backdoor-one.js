/** @param {NS} ns **/
export async function main(ns) {
    // Guard: singularity may not be available in all bitnodes
    if (!ns.singularity || typeof ns.singularity.installBackdoor !== 'function') {
        ns.tprint('SKIP: Singularity API (SF4) not available. Cannot backdoor.');
        return;
    }
    let target = ns.args.length > 0 ? ns.args[0] : '(unspecified server)';
    try {
        await ns.singularity.installBackdoor();
        ns.toast(`Backdoored ${target}`, 'success');
    }
    catch (err) {
        ns.tprint(`Error while running backdoor (intended for ${target}): ${String(err)}`);
        throw (err);
    }
}
