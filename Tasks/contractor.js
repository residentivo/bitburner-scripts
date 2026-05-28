import { getFilePath, getNsDataThroughFile, disableLogs, scanAllServers } from '../helpers.js'
const scriptSolver = getFilePath("/Tasks/contractor.js.solver.js");

/** @param {NS} ns **/
export async function main(ns) {
    disableLogs(ns, ["scan", "run", "isRunning"]);
    ns.print("Getting server list...");
    const servers = scanAllServers(ns);
    ns.print(`Got ${servers.length} servers. Searching for contracts on each...`);
    const contractsDb = servers.map(hostname => ({ hostname, contracts: ns.ls(hostname, '.cct') }))
        .filter(o => o.contracts.length > 0)
        .map(o => o.contracts.map(contract => ({ contract, hostname: o.hostname }))).flat();
    if (contractsDb.length == 0)
        return ns.print("Found no contracts to solve.");

    ns.print(`Found ${contractsDb.length} contracts. Gathering types and data...`);

    // Get all types in one shot (this works reliably)
    let contractsDictCommand = command => `Object.fromEntries(${JSON.stringify(contractsDb)}.map(c => [c.contract, ${command}]))`;
    let dictContractTypes = await getNsDataThroughFile(ns, contractsDictCommand('ns.codingcontract.getContractType(c.contract, c.hostname)'), '/Temp/contract-types.txt');

    // Get data per-contract to avoid one failure breaking everything
    // Each temp script gets contract name and hostname as ns.args[0] and ns.args[1]
    const getDataCommand = `JSON.stringify(ns.codingcontract.getData(ns.args[0], ns.args[1]), (k, v) => typeof v === 'bigint' ? '__BIGINT__' + v.toString() : v)`;
    let dictContractData = {};
    for (const c of contractsDb) {
        try {
            const safeName = c.contract.replace(/[^a-zA-Z0-9]/g, '_');
            const raw = await getNsDataThroughFile(ns, getDataCommand, `/Temp/contract-data-${safeName}.txt`, [c.contract, c.hostname]);
            if (raw !== undefined && raw !== null && raw !== "" && raw !== "undefined" && raw !== "null") {
                dictContractData[c.contract] = raw;
            } else {
                ns.tprint(`WARN: getData returned "${raw}" for ${c.contract} on ${c.hostname}`);
            }
        } catch (e) {
            ns.tprint(`WARN: getData exception for ${c.contract} on ${c.hostname}: ${e}`);
        }
    }

    // Parse data into contracts
    let dataCount = 0;
    contractsDb.forEach(c => {
        c.type = dictContractTypes[c.contract];
        const raw = dictContractData[c.contract];
        if (raw) {
            try { c.data = JSON.parse(raw, (k, v) => typeof v === 'string' && v.startsWith('__BIGINT__') ? BigInt(v.slice(10)) : v); }
            catch (e) {
                ns.tprint(`WARN: Failed to parse data for ${c.contract} (${c.type}): ${e}. Raw: ${raw.substring(0, 200)}`);
                try { c.data = JSON.parse(raw); } catch (e2) { ns.tprint(`WARN: Fallback parse also failed: ${e2}`); }
            }
        }
        if (c.data !== undefined && c.data !== null) {
            dataCount++;
        } else {
            ns.tprint(`WARN: No data for ${c.contract} (${c.type})`);
        }
    });

    ns.tprint(`${dataCount}/${contractsDb.length} contracts have data.`);
    if (dataCount == 0)
        return ns.tprint("ERROR: No contract data available. Aborting.");

    // Filter contracts with data first
    const allContracts = contractsDb.filter(c => c.data !== undefined && c.data !== null);

    // Summary log: list contract types and servers (data truncated for readability)
    allContracts.forEach(c => {
        var dataStr;
        if (typeof c.data === 'bigint') dataStr = '__BIGINT__(' + c.data.toString().substring(0, 20) + '...)';
        else if (typeof c.data === 'string' && c.data.length > 40) dataStr = JSON.stringify(c.data.substring(0, 40)) + '...';
        else dataStr = JSON.stringify(c.data);
        ns.tprint(`  ${c.contract} @ ${c.hostname}: ${c.type} | data=${dataStr}`);
    });

    // Build payload and split into batches to avoid ns.run arg size limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < allContracts.length; i += BATCH_SIZE) {
        batches.push(allContracts.slice(i, i + BATCH_SIZE));
    }
    ns.tprint(`Sending ${dataCount} contracts to solver in ${batches.length} batches of up to ${BATCH_SIZE}...`);
    for (let bi = 0; bi < batches.length; bi++) {
        const payload = JSON.stringify(batches[bi], (k, v) => typeof v === 'bigint' ? '__BIGINT__' + v.toString() : v);
        ns.tprint(`Batch ${bi + 1}/${batches.length}: ${batches[bi].length} contracts, payload ${payload.length} chars`);
        const pid = ns.run(scriptSolver, 1, payload);
        if (!pid) {
            ns.tprint(`ERROR: Failed to spawn solver for batch ${bi + 1}`);
        }
        await ns.sleep(200); // Stagger spawns to avoid RAM contention
    }
}
