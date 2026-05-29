/**
 * test-single-contract.js - Test with a fresh contract, comparing submit methods
 *
 * Usage: run /Tasks/test-single-contract.js
 * IMPORTANT: Only tests contracts with 3 tries remaining to not waste attempts
 */

import { findAnswer } from '/Tasks/contractor.js.solver.js';

export async function main(ns) {
    ns.tprint("=== FRESH CONTRACT TEST ===");

    // Scan all servers for contracts
    const allServers = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const current = queue.shift();
        if (allServers.has(current)) continue;
        allServers.add(current);
        try {
            for (const n of ns.scan(current)) {
                if (!allServers.has(n)) queue.push(n);
            }
        } catch (_) {}
    }

    // Find a contract with full tries (3) that has a solver
    for (const server of [...allServers].sort()) {
        let contracts;
        try { contracts = ns.ls(server, ".cct"); } catch (_) { continue; }

        for (const c of contracts) {
            const tries = ns.codingcontract.getNumTriesRemaining(c, server);
            if (tries !== 3) continue; // Only test fresh contracts

            const type = ns.codingcontract.getContractType(c, server);
            const data = ns.codingcontract.getData(c, server);

            const contractObj = { type, data, contract: c, hostname: server };
            const answer = findAnswer(contractObj, ns);
            if (!answer) continue;

            ns.tprint("Testing: " + server + " | " + c + " | " + type);

            // Submit as string
            const result = ns.codingcontract.attempt(answer, c, server, { returnReward: true });
            if (result && result !== "") {
                ns.tprint("  -> SUCCESS with string! Reward: " + result.trim().split("\n")[0]);
            } else {
                ns.tprint("  -> FAILED with string (tries left: " + ns.codingcontract.getNumTriesRemaining(c, server) + ")");
            }
            return; // Only test one contract
        }
    }

    ns.tprint("No suitable fresh contract found.");
}
