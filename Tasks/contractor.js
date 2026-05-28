import { getFilePath, getNsDataThroughFile, disableLogs, scanAllServers } from '../helpers.js'
const scriptSolver = getFilePath("/Tasks/contractor.js.solver.js");

/** @param {NS} ns **/
export async function main(ns) {
    disableLogs(ns, ["scan"]);
    ns.print("Getting server list...");
    const servers = scanAllServers(ns);
    ns.print(`Got ${servers.length} servers. Searching for contracts on each...`);
    // Retrieve all contracts and convert them to objects with the required information to solve
    const contractsDb = servers.map(hostname => ({ hostname, contracts: ns.ls(hostname, '.cct') }))
        .filter(o => o.contracts.length > 0)
        .map(o => o.contracts.map(contract => ({ contract, hostname: o.hostname }))).flat();
    if (contractsDb.length == 0)
        return ns.print("Found no contracts to solve.");

    // Spawn temporary scripts to gather the remainder of contract data required for solving
    ns.print(`Found ${contractsDb.length} contracts to solve. Gathering contract data via separate scripts..."`);
    let contractsDictCommand = command => `Object.fromEntries(${JSON.stringify(contractsDb)}.map(c => [c.contract, ${command}]))`;
    let dictContractTypes = await getNsDataThroughFile(ns, contractsDictCommand('ns.codingcontract.getContractType(c.contract, c.hostname)'), '/Temp/contract-types.txt');
    let dictContractData = await getNsDataThroughFile(ns, `JSON.stringify(Object.fromEntries(${JSON.stringify(contractsDb)}.map(c => [c.contract, ns.codingcontract.getData(c.contract, c.hostname)])), (k, v) => typeof v === 'bigint' ? '__BIGINT__' + v.toString() : v)`, '/Temp/contract-data.txt');
    contractsDb.forEach(c => {
        c.type = dictContractTypes[c.contract];
        const raw = dictContractData[c.contract];
        if (raw && raw !== "undefined" && raw !== "") {
            try { c.data = JSON.parse(raw, (k, v) => typeof v === 'string' && v.startsWith('__BIGINT__') ? BigInt(v.slice(10)) : v); }
            catch (e) {
                ns.tprint(`WARN: Failed to parse contract data for ${c.contract} (${c.type}): ${e}. Raw: ${raw.substring(0, 200)}`);
                try { c.data = JSON.parse(raw); } catch (e2) { ns.tprint(`WARN: Fallback parse also failed for ${c.contract}: ${e2}`); }
            }
        }
    });

    // Let this script die to free up ram, and start up a new script (after a delay) that will solve all these contracts using the minimum ram footprint of 11.6 GB
    ns.run(getFilePath('/Tasks/run-with-delay.js'), 1, scriptSolver, 1, JSON.stringify(contractsDb));
}