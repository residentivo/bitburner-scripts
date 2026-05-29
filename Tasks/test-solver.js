/**
 * test-solver.js - Test contractor solver on all contracts
 *
 * 1. Lists all contracts (like list-contracts.js)
 * 2. For each contract, asks the solver to generate an answer
 * 3. Submits the answer and reports success/failure
 *
 * Usage: run /Tasks/test-solver.js
 */

// Import the solver (embedded in contractor.js.solver.js)
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

    let ok = 0, fail = 0, err = 0;
    const results = [];

    for (const server of [...allServers].sort()) {
        let contracts;
        try {
            contracts = ns.ls(server, ".cct");
        } catch (_) { continue; }

        for (const contract of contracts) {
            let type;
            try {
                type = ns.codingcontract.getContractType(contract, server);
            } catch (_) { type = "unknown"; }

            // Try to get the contract data and solve it
            try {
                const data = ns.codingcontract.getData(contract, server);
                const answer = await findAnswer(ns, type, data, () => {}, server, contract);

                if (answer === undefined || answer === null) {
                    results.push(`  SKIP  | ${server} | ${type} | solver returned null/undefined`);
                    fail++;
                    continue;
                }

                // Submit the answer
                const result = ns.codingcontract.attempt(answer, contract, server, { returnReward: true });
                if (result && result !== "") {
                    results.push(`  OK    | ${server} | ${type} | reward: ${result.trim().split("\n")[0]}`);
                    ok++;
                } else {
                    results.push(`  FAIL  | ${server} | ${type} | answer rejected`);
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
    ns.tprint(`=== RESULTS: ${ok} solved, ${fail} failed, ${err} errors ===`);
}
