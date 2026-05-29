/**
 * list-contracts.js - Scan all servers and list coding contracts
 *
 * Recursively scans every server and reports:
 * - Server name
 * - Number of contracts found
 * - Contract filename and type
 */

export async function main(ns) {
    ns.tprint("=== CODING CONTRACT SCANNER ===");

    // Scan all servers recursively
    const allServers = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const current = queue.shift();
        if (allServers.has(current)) continue;
        allServers.add(current);
        try {
            const neighbors = ns.scan(current);
            for (const n of neighbors) {
                if (!allServers.has(n)) queue.push(n);
            }
        } catch (_) {}
    }

    const serverList = [...allServers].sort();
    let totalContracts = 0;
    let serversWithContracts = 0;

    for (const server of serverList) {
        try {
            const contracts = ns.ls(server, ".cct");
            if (contracts.length > 0) {
                serversWithContracts++;
                totalContracts += contracts.length;
                for (const contract of contracts) {
                    let type = "unknown";
                    try {
                        type = ns.codingcontract.getContractType(contract, server);
                    } catch (_) {}
                    ns.tprint(`  ${server} | ${contract} | ${type}`);
                }
            }
        } catch (_) {
            // Skip servers we can't access
        }
    }

    ns.tprint(`=== SUMMARY: ${totalContracts} contracts on ${serversWithContracts} servers (scanned ${serverList.length} total) ===`);
}
