/**
 * test-sqrt-round.js - Test if nearest integer means round() not floor()
 */

export async function main(ns) {
    // The contract data
    const n = 256058544131099091344423134726168187723116458701021445244055375882650456059001089250307865066345790386380747025291648023046211064010967687389809812968677494760314719062669807017723628099325015757928919n;

    // floor(sqrt(n))
    var lo = 1n, hi = n;
    while (lo <= hi) {
        var mid = (lo + hi) / 2n;
        if (mid * mid === n) { lo = mid; break; }
        if (mid * mid < n) lo = mid + 1n;
        else hi = mid - 1n;
    }
    const floorSqrt = hi;

    // For round(sqrt(n)): check if n is closer to floor^2 or (floor+1)^2
    const floorSq = floorSqrt * floorSqrt;
    const ceilSq = (floorSqrt + 1n) * (floorSqrt + 1n);
    const distToFloor = n - floorSq;
    const distToCeil = ceilSq - n;

    ns.tprint("floor(sqrt(n)) = " + floorSqrt.toString());
    ns.tprint("(floor+1)       = " + (floorSqrt + 1n).toString());
    ns.tprint("dist to floor^2 = " + distToFloor.toString());
    ns.tprint("dist to ceil^2  = " + distToCeil.toString());

    let roundSqrt;
    if (distToFloor <= distToCeil) {
        roundSqrt = floorSqrt;
        ns.tprint("round(sqrt(n))  = floor = " + roundSqrt.toString());
    } else {
        roundSqrt = floorSqrt + 1n;
        ns.tprint("round(sqrt(n))  = ceil  = " + roundSqrt.toString());
    }

    // They should be the same since n is not a perfect square
    // but floor is closer to n than ceil
    ns.tprint("");
    ns.tprint("floor answer: " + floorSqrt.toString());
    ns.tprint("round answer: " + roundSqrt.toString());

    if (floorSqrt.toString() === roundSqrt.toString()) {
        ns.tprint("SAME ANSWER - round vs floor doesn't matter for this number");
        ns.tprint("The issue must be something else...");
    } else {
        ns.tprint("DIFFERENT! Try submitting: " + roundSqrt.toString());
    }

    // Also check: maybe the issue is that we need to submit without quoting
    // Let's verify the exact bytes of the answer
    ns.tprint("");
    ns.tprint("Answer length: " + floorSqrt.toString().length);
    ns.tprint("Answer has non-digit chars: " + /[^0-9]/.test(floorSqrt.toString()));
}
