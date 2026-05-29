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
    ns.tprint("Data type: " + typeof data);
    ns.tprint("Is array: " + Array.isArray(data));

    // Safe stringify that handles BigInt at any depth
    function safeStringify(val) {
        if (typeof val === 'bigint') return val.toString() + 'n';
        if (Array.isArray(val)) return '[' + val.map(safeStringify).join(', ') + ']';
        if (val && typeof val === 'object') {
            return '{' + Object.entries(val).map(([k,v]) => k + ': ' + safeStringify(v)).join(', ') + '}';
        }
        return String(val);
    }

    ns.tprint("Data: " + safeStringify(data).substring(0, 500));

    // Solve it
    const contractObj = { type, data, contract: targetFile, hostname: targetServer };
    const answer = findAnswer(contractObj, ns);
    ns.tprint("Answer: " + safeStringify(answer));
    ns.tprint("Answer type: " + typeof answer);

    // Try to submit
    ns.tprint("Submitting...");
    const result = ns.codingcontract.attempt(answer, targetFile, targetServer, { returnReward: true });
    ns.tprint("Result: '" + result + "'");
    ns.tprint("Success: " + (result && result !== "" ? "YES" : "NO"));
}
