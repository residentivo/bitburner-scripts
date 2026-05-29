/**
 * test-sqrt.js - Verify BigInt square root solver correctness
 */

export async function main(ns) {
    // Test with known values first
    function sqrt(n) {
        if (typeof n === 'number') n = BigInt(n);
        if (n < 0n) return null;
        if (n < 2n) return n.toString();
        var lo = 1n, hi = n;
        while (lo <= hi) {
            var mid = (lo + hi) / 2n;
            var midSq = mid * mid;
            if (midSq === n) return mid.toString();
            if (midSq < n) lo = mid + 1n;
            else hi = mid - 1n;
        }
        return hi.toString();
    }

    // Known test cases
    const tests = [
        [0n, "0"],
        [1n, "1"],
        [4n, "2"],
        [9n, "3"],
        [10n, "3"],       // floor(sqrt(10)) = 3
        [15n, "3"],       // floor(sqrt(15)) = 3
        [16n, "4"],
        [100n, "10"],
        [99n, "9"],       // floor(sqrt(99)) = 9
        [101n, "10"],     // floor(sqrt(101)) = 10
        [1000000n, "1000"],
    ];

    let allOk = true;
    for (const [input, expected] of tests) {
        const result = sqrt(input);
        const ok = result === expected;
        if (!ok) {
            ns.tprint("FAIL: sqrt(" + input + ") = " + result + " (expected " + expected + ")");
            allOk = false;
        }
    }
    if (allOk) ns.tprint("All basic tests passed!");

    // Test with a big number
    const bigInput = 256058544131099091344423134726168187723116458701021445244055375882650456059001089250307865066345790386380747025291648023046211064010967687389809812968677494760314719062669807017723628099325015757928919n;
    const answer = sqrt(bigInput);
    ns.tprint("Big sqrt answer: " + answer);

    // Verify: answer^2 <= bigInput < (answer+1)^2
    const a = BigInt(answer);
    const aSq = a * a;
    const a1Sq = (a + 1n) * (a + 1n);
    const check1 = aSq <= bigInput;
    const check2 = bigInput < a1Sq;
    ns.tprint("a^2 <= n: " + check1);
    ns.tprint("n < (a+1)^2: " + check2);
    ns.tprint("Correct: " + (check1 && check2));
}
