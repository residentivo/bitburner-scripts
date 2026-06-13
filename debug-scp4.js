/**
 * debug-scp4.js — Testa exatamente o que o daemon faz: scp de home + fileExists remoto
 * Uso: run debug-scp4.js <hostname>
 */

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');

    const target = ns.args[0] || 'foodnstuff';
    const home = 'home';
    const file = '/Remote/weak-target.js';

    ns.tprint(`=== EXACT DAEMON SIMULATION ===`);

    // Exactly what daemon does: check if file exists on target
    ns.tprint(`1. ns.fileExists('${file}', '${home}'): ${ns.fileExists(file, home)}`);
    ns.tprint(`2. ns.fileExists('${file}', '${target}'): ${ns.fileExists(file, target)}`);

    // scp with 3 args (daemon style)
    ns.tprint(`3. ns.scp('${file}', '${target}', '${home}'): ${ns.scp(file, target, home)}`);

    // Check again — this time connect to target first
    await ns.singularity.connect(target);
    ns.tprint(`4. After connect to target, ns.fileExists('${file}'): ${ns.fileExists(file)}`);

    // Check from home perspective
    await ns.singularity.connect(home);
    ns.tprint(`5. From home, ns.fileExists('${file}', '${target}'): ${ns.fileExists(file, target)}`);

    // Check ns.ls on target
    await ns.singularity.connect(target);
    const ls = ns.ls('').filter(f => f.includes('weak'));
    ns.tprint(`6. ns.ls on target matching 'weak': ${JSON.stringify(ls)}`);

    // Cleanup
    if (ns.fileExists(file)) {
        ns.rm(file);
        ns.tprint('7. Cleaned up');
    }

    await ns.singularity.connect(home);
    ns.tprint('=== DONE ===');
}
