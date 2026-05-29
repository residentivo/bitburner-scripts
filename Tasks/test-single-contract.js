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

    // Solve it
    const contractObj = { type, data, contract: targetFile, hostname: targetServer };
    const answer = findAnswer(contractObj, ns);
    ns.tprint("Answer (string): " + answer);
    ns.tprint("Answer length: " + answer.length);

    // Try 1: submit BigInt (convert string to BigInt first)
    ns.tprint("--- Test 1: submit BigInt ---");
    try {
        const bigAnswer = BigInt(answer);
        ns.tprint("BigInt created: " + bigAnswer.toString().substring(0, 50) + "...");
        const r1 = ns.codingcontract.attempt(bigAnswer, targetFile, targetServer, { returnReward: true });
        ns.tprint("Result: '" + r1 + "' Success: " + (r1 ? "YES" : "NO"));
        if (r1) { ns.tprint("=== DONE ==="); return; }
    } catch (e) {
        ns.tprint("BigInt submit error: " + String(e).substring(0, 120));
    }

    // Try 2: submit as object {type: "BigInt", value: ...}
    ns.tprint("--- Test 2: submit object ---");
    try {
        const r2 = ns.codingcontract.attempt({ value: answer }, targetFile, targetServer, { returnReward: true });
        ns.tprint("Result: '" + r2 + "' Success: " + (r2 ? "YES" : "NO"));
        if (r2) { ns.tprint("=== DONE ==="); return; }
    } catch (e) {
        ns.tprint("Object submit error: " + String(e).substring(0, 120));
    }

    // Try 3: Check what the contracts API expects
    ns.tprint("--- Test 3: check contract description ---");
    try {
        const desc = ns.codingcontract.getDescription(targetFile, targetServer);
        ns.tprint("Description (first 300): " + desc.substring(0, 300));
    } catch (e) {
        ns.tprint("getDescription error: " + String(e));
    }

    // Try 4: Check contract numTries
    try {
        const tries = ns.codingcontract.getNumTriesRemaining(targetFile, targetServer);
        ns.tprint("Tries remaining: " + tries);
    } catch (e) {
        ns.tprint("getNumTries error: " + String(e));
    }

    ns.tprint("=== DONE ===");
}
