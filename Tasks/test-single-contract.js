/**
 * test-single-contract.js - Test round vs floor sqrt on depleted contract
 * WARNING: This will use the last remaining try on 4sigma contract-MlxLkh.cct
 */

export async function main(ns) {
    const server = "4sigma";
    const file = "contract-MlxLkh.cct";
    const answer = "16001829399512391106487654851923863598148325129907224558983740239726882674142332884176095616681568323";

    ns.tprint("=== LAST TRY: floor(sqrt(n)) ===");
    ns.tprint("Submitting: " + answer);
    const r = ns.codingcontract.attempt(answer, file, server, { returnReward: true });
    ns.tprint("Result: '" + r + "' Success: " + (r && r !== "" ? "YES" : "NO"));

    if (!r) {
        ns.tprint("FAILED. The answer appears correct mathematically.");
        ns.tprint("Possible issues:");
        ns.tprint("1. Contract data changed between reads");
        ns.tprint("2. The 'nearest integer' means round(), not floor()");
        ns.tprint("3. The contract solver has a bug for this specific number");
    }
}
