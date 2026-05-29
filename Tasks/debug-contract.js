/**
 * debug-contract.js — debug failing contracts (read-only, no attempts consumed)
 * Usage: run debug-contract.js
 */

function solveProblem(type, input) {
  if (type === "HammingCodes: Encoded Binary to Integer") {
    let bits = input.split("").map(Number);
    let len = bits.length;
    let err = 0;
    for (let p = 1; p <= len; p *= 2) {
      let par = 0;
      for (let j = p; j <= len; j++) {
        if ((j & p) !== 0) par ^= bits[j - 1];
      }
      err += par * p;
    }
    // Without correction
    let resultNoFix = 0;
    for (let d = 3; d <= len; d++) {
      if ((d & (d - 1)) !== 0) resultNoFix = (resultNoFix << 1) | bits[d - 1];
    }
    // With correction
    if (err > 0 && err <= len) bits[err - 1] ^= 1;
    let resultFixed = 0;
    for (let d = 3; d <= len; d++) {
      if ((d & (d - 1)) !== 0) resultFixed = (resultFixed << 1) | bits[d - 1];
    }
    return { err, resultNoFix, resultFixed, len };
  }

  if (type === "Compression III: LZ Compression") {
    let n = input.length;
    let encoded = "";
    let litBuf = [];
    let pos = 0;

    function flushLit() {
      let f = 0;
      while (f < litBuf.length) {
        let chunk = Math.min(litBuf.length - f, 9);
        encoded += chunk + litBuf.slice(f, f + chunk).join("");
        f += chunk;
      }
      litBuf = [];
    }

    while (pos < n) {
      let bestOff = 0, bestLen = 0;
      for (let sp = 0; sp < pos; sp++) {
        let ml = 0;
        while (pos + ml < n && input[pos + ml] === input[sp + ml] && ml < 9) ml++;
        if (ml > bestLen) { bestLen = ml; bestOff = pos - sp; }
      }
      if (bestLen > 3) {
        flushLit();
        encoded += bestOff + "0" + bestLen;
        pos += bestLen;
      } else {
        litBuf.push(input[pos]);
        if (litBuf.length >= 9) flushLit();
        pos++;
      }
    }
    flushLit();
    return { encoded, inputLen: n, encodedLen: encoded.length };
  }

  return null;
}

/** @param {NS} ns */
export async function main(ns) {
  let allServers = new Set(["home"]);
  let queue = ["home"];
  while (queue.length > 0) {
    let host = queue.pop();
    for (let n of ns.scan(host)) {
      if (!allServers.has(n)) { allServers.add(n); queue.push(n); }
    }
  }

  for (let srv of allServers) {
    for (let cct of ns.ls(srv, ".cct")) {
      let ctype = ns.codingcontract.getContractType(cct, srv);
      let tries = ns.codingcontract.getNumTriesRemaining(cct, srv);

      if (ctype === "HammingCodes: Encoded Binary to Integer") {
        let cdata = ns.codingcontract.getData(cct, srv);
        let r = solveProblem(ctype, cdata);
        let dataPreview = cdata.length > 40 ? cdata.substring(0, 40) + "..." : cdata;
        ns.tprint(`HAMMING ${srv} | ${cct} | tries=${tries} | len=${r.len}`);
        ns.tprint(`  input: ${dataPreview}`);
        ns.tprint(`  errPos=${r.err} noFix=${r.resultNoFix} fixed=${r.resultFixed}`);
      }

      if (ctype === "Compression III: LZ Compression") {
        let cdata = ns.codingcontract.getData(cct, srv);
        let r = solveProblem(ctype, cdata);
        ns.tprint(`LZCOMP ${srv} | ${cct} | tries=${tries} | inLen=${r.inputLen} encLen=${r.encodedLen}`);
        ns.tprint(`  input(40): ${cdata.substring(0, 40)}`);
        ns.tprint(`  encoded(40): ${r.encoded.substring(0, 40)}`);
      }
    }
  }
}
