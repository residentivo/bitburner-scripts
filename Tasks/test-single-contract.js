/**
 * test-single-contract.js - Test a single contract to debug solver output
 *
 * Usage: run /Tasks/test-single-contract.js
 */

import { findAnswer } from '/Tasks/contractor.js.solver.js';

export async function main(ns) {
    const targetServer = "4sigma";
    const targetFile = "contract-MlxLkh.cct";

    ns.tprint("=== SINGLE CONTRACT DEBUG ===");

    const type = ns.codingcontract.getContractType(targetFile, targetServer);
    const data = ns.codingcontract.getData(targetFile, targetServer);
    ns.tprint("Type: " + type);
    ns.tprint("Data: " + data.toString());

    // Solve it
    const contractObj = { type, data, contract: targetFile, hostname: targetServer };
    const answer = findAnswer(contractObj, ns);
    ns.tprint("Answer (string): " + answer);
    ns.tprint("Answer type: " + typeof answer);

    // Try 1: submit as string (what solver returns)
    ns.tprint("--- Test 1: submit string ---");
    const r1 = ns.codingcontract.attempt(answer, targetFile, targetServer, { returnReward: true });
    ns.tprint("Result: '" + r1 + "' Success: " + (r1 ? "YES" : "NO"));

    // Only continue if first attempt failed
    if (!r1) {
        // Try 2: submit as BigInt
        ns.tprint("--- Test 2: submit BigInt ---");
        try {
            const bigAnswer = BigInt(answer);
            const r2 = ns.codingcontract.attempt(bigAnswer, targetFile, targetServer, { returnReward: true });
            ns.tprint("Result: '" + r2 + "' Success: " + (r2 ? "YES" : "NO"));
        } catch (e) {
            ns.tprint("BigInt conversion failed: " + e);
        }

        // Try 3: submit as number
        ns.tprint("--- Test 3: submit number ---");
        try {
            const numAnswer = Number(answer);
            ns.tprint("Number: " + numAnswer);
            const r3 = ns.codingcontract.attempt(numAnswer, targetFile, targetServer, { returnReward: true });
            ns.tprint("Result: '" + r3 + "' Success: " + (r3 ? "YES" : "NO"));
        } catch (e) {
            ns.tprint("Number conversion failed: " + e);
        }
    }
}
