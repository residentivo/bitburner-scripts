/**
 * contractor.js - In-process coding contract solver for Bitburner v3
 * Periodically scans all servers for coding contracts and solves them inline.
 * No external spawn needed — all solver functions are imported.
 */

import { getFilePath, getNsDataThroughFile, disableLogs, scanAllServers } from '../helpers.js';
import { findAnswer } from './solver-functions.js';

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

    // Get all types in one shot
    let contractsDictCommand = command => `Object.fromEntries(${JSON.stringify(contractsDb)}.map(c => [c.contract, ${command}]))`;
    let dictContractTypes = await getNsDataThroughFile(ns, contractsDictCommand('ns.codingcontract.getContractType(c.contract, c.hostname)'), '/Temp/contract-types.txt');

    // Get data per-contract
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

    // Filter contracts with data
    const allContracts = contractsDb.filter(c => c.data !== undefined && c.data !== null);

    // Summary log
    allContracts.forEach(c => {
        var dataStr;
        if (typeof c.data === 'bigint') dataStr = '__BIGINT__(' + c.data.toString().substring(0, 20) + '...)';
        else if (typeof c.data === 'string' && c.data.length > 40) dataStr = JSON.stringify(c.data.substring(0, 40)) + '...';
        else dataStr = JSON.stringify(c.data);
        ns.tprint(`  ${c.contract} @ ${c.hostname}: ${c.type} | data=${dataStr}`);
    });

    // Solve all contracts in-process
    ns.tprint(`Solving ${dataCount} contracts in-process...`);
    let totalSolved = 0, totalFailed = 0, totalSkipped = 0;
    for (const c of allContracts) {
        const answer = findAnswer(c);
        if (answer == null) { totalSkipped++; continue; }
        try {
            const ok = ns.codingcontract.attempt(answer, c.contract, c.hostname, { returnReward: true });
            if (ok) {
                totalSolved++;
                ns.tprint(`  SOLVED: ${c.contract} on ${c.hostname} (${c.type})`);
            } else {
                totalFailed++;
                ns.tprint(`  WRONG:  ${c.contract} on ${c.hostname} (${c.type}) -> ${JSON.stringify(answer).substring(0,60)}`);
            }
        } catch (e) {
            totalFailed++;
            ns.tprint(`  ERROR:  ${c.contract}: ${e.toString().substring(0,60)}`);
        }
        await ns.sleep(10);
    }
    ns.tprint(`Done: ${totalSolved} solved, ${totalFailed} wrong, ${totalSkipped} skipped`);
}
