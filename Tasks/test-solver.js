/**
 * test-solver.js - Test contractor solver on all contracts
 *
 * 1. Lists all contracts (like list-contracts.js)
 * 2. For each contract, asks the solver to generate an answer
 * 3. Submits the answer and reports success/failure
 *
 * Usage: run /Tasks/test-solver.js
 */

import { findAnswer } from '/Tasks/contractor.js.solver.js';

export async function main(ns) {
    ns.tprint("=== SOLVER TEST ===");

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

    let ok = 0, fail = 0, skip = 0, err = 0;
    const results = [];

    for (const server of [...allServers].sort()) {
        let contracts;
        try {
            contracts = ns.ls(server, ".cct");
        } catch (_) { continue; }

        for (const contract of contracts) {
            let type, data;
            try {
                type = ns.codingcontract.getContractType(contract, server);
                data = ns.codingcontract.getData(contract, server);
            } catch (e) {
                results.push(`  ERROR | ${server} | ${contract} | read: ${String(e).substring(0, 60)}`);
                err++;
                continue;
            }

            // Build contract object for the solver
            const contractObj = { type, data, contract, hostname: server };

            try {
                const answer = findAnswer(contractObj, ns);

                if (answer === undefined || answer === null) {
                    results.push(`  SKIP  | ${server} | ${type} | no answer`);
                    skip++;
                    continue;
                }

                // Submit the answer
                const result = ns.codingcontract.attempt(answer, contract, server, { returnReward: true });
                if (result && result !== "") {
                    results.push(`  OK    | ${server} | ${type} | ${result.trim().split("\n")[0]}`);
                    ok++;
                } else {
                    results.push(`  FAIL  | ${server} | ${type} | rejected`);
                    fail++;
                }
            } catch (e) {
                results.push(`  ERROR | ${server} | ${type} | ${String(e).substring(0, 80)}`);
                err++;
            }
        }
    }

    // Print results
    for (const r of results) ns.tprint(r);
    ns.tprint(`=== RESULTS: ${ok} solved, ${fail} failed, ${skip} skipped, ${err} errors ===`);
}
