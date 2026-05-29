/**
 * test-single-contract.js - Test submitting the correct answer
 */

export async function main(ns) {
    const targetServer = "4sigma";
    const targetFile = "contract-MlxLkh.cct";
    const correctAnswer = "16001829399512391106487654851923863598148325129907224558983740239726882674142332884176095616681568323";

    ns.tprint("=== SUBMITTING CORRECT ANSWER ===");
    ns.tprint("Answer: " + correctAnswer);
    ns.tprint("Answer length: " + correctAnswer.length);
    ns.tprint("Answer type: " + typeof correctAnswer);

    // Try as string
    ns.tprint("--- Submit as string ---");
    const r1 = ns.codingcontract.attempt(correctAnswer, targetFile, targetServer, { returnReward: true });
    ns.tprint("Result: '" + r1 + "'");
    ns.tprint("Success: " + (r1 && r1 !== "" ? "YES" : "NO"));

    // Check tries remaining
    const tries = ns.codingcontract.getNumTriesRemaining(targetFile, targetServer);
    ns.tprint("Tries remaining: " + tries);
}
