/**
 * test-single-contract.js - Deep debug: re-read contract data and verify
 */

export async function main(ns) {
    const targetServer = "4sigma";
    const targetFile = "contract-MlxLkh.cct";

    ns.tprint("=== DEEP CONTRACT DEBUG ===");

    // Get all contract info
    const type = ns.codingcontract.getContractType(targetFile, targetServer);
    const data = ns.codingcontract.getData(targetFile, targetServer);
    const tries = ns.codingcontract.getNumTriesRemaining(targetFile, targetServer);

    ns.tprint("Type: " + type);
    ns.tprint("Data type: " + typeof data);
    ns.tprint("Data value: " + data);
    ns.tprint("Tries remaining: " + tries);

    // Re-read data multiple times (maybe it changes?)
    for (let i = 0; i < 3; i++) {
        await ns.sleep(100);
        const d = ns.codingcontract.getData(targetFile, targetServer);
        ns.tprint("Read #" + (i+1) + ": " + d);
    }

    // Compute sqrt manually with verification
    const n = BigInt(data);
    ns.tprint("n = " + n.toString());

    // Binary search sqrt
    var lo = 1n, hi = n;
    while (lo <= hi) {
        var mid = (lo + hi) / 2n;
        if (mid * mid === n) { lo = mid; break; }
        if (mid * mid < n) lo = mid + 1n;
        else hi = mid - 1n;
    }
    const sqrtN = hi;
    ns.tprint("sqrt(n) = " + sqrtN.toString());
    ns.tprint("sqrt(n)^2 = " + (sqrtN * sqrtN).toString());
    ns.tprint("(sqrt(n)+1)^2 = " + ((sqrtN + 1n) * (sqrtN + 1n)).toString());
    ns.tprint("sqrt(n)^2 <= n: " + (sqrtN * sqrtN <= n));
    ns.tprint("n < (sqrt(n)+1)^2: " + (n < (sqrtN + 1n) * (sqrtN + 1n)));

    // Check if n is a perfect square
    const isPerfect = sqrtN * sqrtN === n;
    ns.tprint("Perfect square: " + isPerfect);

    // Also try Newton's method
    var x = n;
    var y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
    }
    ns.tprint("Newton sqrt: " + x.toString());
    ns.tprint("Newton^2 = " + (x * x).toString());

    // Check the description for format hints
    const desc = ns.codingcontract.getDescription(targetFile, targetServer);
    ns.tprint("=== DESCRIPTION ===");
    ns.tprint(desc.substring(0, 500));
}
