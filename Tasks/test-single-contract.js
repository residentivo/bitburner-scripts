/**
 * test-single-contract.js - Test a single contract to debug solver output
 *
 * Usage: run /Tasks/test-single-contract.js
 */

import { findAnswer } from '/Tasks/contractor.js.solver.js';

export async function main(ns) {
    // Pick a specific contract to debug
    const targetServer = "4sigma";
    const targetFile = "contract-MlxLkh.cct";

    ns.tprint("=== SINGLE CONTRACT DEBUG ===");
    ns.tprint(`Server: ${targetServer}`);
    ns.tprint(`Contract: ${targetFile}`);

    // Get contract info
    const type = ns.codingcontract.getContractType(targetFile, targetServer);
    const data = ns.codingcontract.getData(targetFile, targetServer);
    ns.tprint(`Type: ${type}`);
    ns.tprint(`Data: ${JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v).substring(0, 500)}`);

    // Solve it
    const contractObj = { type, data, contract: targetFile, hostname: targetServer };
    const answer = findAnswer(contractObj, ns);
    ns.tprint(`Answer: ${JSON.stringify(answer, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    ns.tprint(`Answer type: ${typeof answer}`);

    // Try to submit
    ns.tprint("Submitting answer...");
    const result = ns.codingcontract.attempt(answer, targetFile, targetServer, { returnReward: true });
    ns.tprint(`Result: "${result}"`);
    ns.tprint(`Result type: ${typeof result}`);
    ns.tprint(`Result is empty: ${result === ""}`);
    ns.tprint(`Result is falsy: ${!result}`);
}
