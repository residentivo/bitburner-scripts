/**
 * debug-lz.js — test LZ Compression III solver against a specific contract
 * Usage: run debug-lz.js [hostname] [contract]
 */

function solveLZ(input) {
    if (!input || input.length === 0) return "";
    var compressed = "", decoded = "", pos = 0;
    while (pos < input.length) {
        var litChars = "", backLenFound = 0, backOffFound = 0;
        while (pos + litChars.length < input.length) {
            var testDecoded = decoded + litChars;
            var bestBL = 0, bestBO = 0;
            var matchStart = pos + litChars.length;
            if (litChars.length > 0) {
                for (var off = 1; off <= Math.min(9, testDecoded.length); off++) {
                    var fl = 0;
                    while (fl < 9 && matchStart + fl < input.length) {
                        var srcIdx = testDecoded.length - off + (fl % off);
                        if (srcIdx < 0 || srcIdx >= testDecoded.length) break;
                        if (input[matchStart + fl] === testDecoded[srcIdx]) fl++;
                        else break;
                    }
                    if (fl > bestBL) { bestBL = fl; bestBO = off; }
                }
            }
            if (bestBL >= 3) { backLenFound = bestBL; backOffFound = bestBO; break; }
            if (litChars.length >= 9) break;
            litChars += input[pos + litChars.length];
        }
        if (litChars.length === 0) litChars = input[pos];
        pos += litChars.length;
        decoded += litChars;
        compressed += String(litChars.length) + litChars;
        if (pos >= input.length) break;
        if (backLenFound >= 3) {
            var backref = '';
            for (var j = 0; j < backLenFound; j++)
                backref += decoded[decoded.length - backOffFound + (j % backOffFound)];
            compressed += String(backLenFound) + String(backOffFound);
            decoded += backref;
            pos += backLenFound;
        } else {
            compressed += '0';
        }
    }
    return { compressed, decoded };
}

function lzDecompress(compressed) {
    var p = '', i = 0;
    while (i < compressed.length) {
        var ll = compressed.charCodeAt(i) - 0x30;
        if (ll < 0 || ll > 9 || i + 1 + ll > compressed.length) return null;
        p += compressed.substring(i + 1, i + 1 + ll);
        i += 1 + ll;
        if (i >= compressed.length) break;
        var bl = compressed.charCodeAt(i) - 0x30;
        if (bl < 0 || bl > 9) return null;
        if (bl === 0) { i++; continue; }
        if (i + 1 >= compressed.length) return null;
        var bo = compressed.charCodeAt(i + 1) - 0x30;
        if (bo < 1 || bo > 9) return null;
        if (bo > p.length) return null;
        for (var j = 0; j < bl; j++) p += p[p.length - bo];
        i += 2;
    }
    return p;
}

/** @param {NS} ns */
export async function main(ns) {
    var targetHost = ns.args[0] || "I.I.I.I";
    var targetContract = ns.args[1] || "contract-u4z7pX.cct";

    var cdata = ns.codingcontract.getData(targetContract, targetHost);
    var ctype = ns.codingcontract.getContractType(targetContract, targetHost);
    var tries = ns.codingcontract.getNumTriesRemaining(targetContract, targetHost);

    ns.tprint(`=== Debug LZ: ${targetHost} | ${targetContract} ===`);
    ns.tprint(`Type: ${ctype}`);
    ns.tprint(`Tries remaining: ${tries}`);
    ns.tprint(`Input length: ${cdata.length}`);
    ns.tprint(`Input (first 100): ${cdata.substring(0, 100)}`);

    var result = solveLZ(cdata);
    var compressed = result.compressed;
    var decoded = result.decoded;

    ns.tprint(`Compressed length: ${compressed.length}`);
    ns.tprint(`Decoded length: ${decoded.length}`);
    ns.tprint(`Match original: ${decoded === cdata}`);
    ns.tprint(`Compressed (first 100): ${compressed.substring(0, 100)}`);

    // Also try decompressing our output
    var reDecoded = lzDecompress(compressed);
    ns.tprint(`Re-decompressed match: ${reDecoded === cdata}`);

    // Try submitting
    ns.tprint(`Submitting answer...`);
    var res = ns.codingcontract.attempt(compressed, targetContract, targetHost);
    ns.tprint(`Result: ${res || 'FAILED'}`);
}
