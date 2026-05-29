/**
 * debug-contract.js — debug failing contracts (read-only, no attempts consumed)
 * Usage: run debug-contract.js
 */

function solveHamming(input) {
  // input is a binary string e.g. "0110000010010000"
  let b = input.split("").map(Number);
  let len = b.length;

  // Extended Hamming code: positions are 1-indexed
  // Position 0 is the global parity bit (if present)
  // Positions that are powers of 2 are parity bits
  // Other positions are data bits
  // The length should be 2^r for some r (extended Hamming)

  // Compute syndrome bits
  let numParity = Math.round(Math.log2(len));
  let syndrome = 0;

  for (let pi = 0; pi < numParity; pi++) {
    let parityPos = 1 << pi;
    let par = 0;
    for (let j = 1; j <= len; j++) {
      if ((j & parityPos) !== 0) {
        par ^= b[j - 1];
      }
    }
    syndrome |= (par << pi);
  }

  // syndrome = position of single-bit error (0 = no error)
  if (syndrome > 0 && syndrome <= len) {
    b[syndrome - 1] ^= 1;
  }

  // Extract data bits (non-power-of-2 positions)
  let result = 0;
  for (let pos = 1; pos <= len; pos++) {
    if ((pos & (pos - 1)) !== 0) { // Not a power of 2
      result = (result << 1) | b[pos - 1];
    }
  }

  return { syndrome, result, len, numParity };
}

function solveLZ(input) {
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
        let r = solveHamming(cdata);
        ns.tprint(`HAMMING ${srv} | ${cct} | tries=${tries} | len=${r.len} parityBits=${r.numParity}`);
        ns.tprint(`  input: ${cdata}`);
        ns.tprint(`  syndrome=${r.syndrome} result=${r.result}`);
      }

      if (ctype === "Compression III: LZ Compression") {
        let cdata = ns.codingcontract.getData(cct, srv);
        r = solveLZ(cdata);
        ns.tprint(`LZCOMP ${srv} | ${cct} | tries=${tries} | in=${r.inputLen} enc=${r.encodedLen}`);
        ns.tprint(`  input(50):  ${cdata.substring(0, 50)}`);
        ns.tprint(`  encoded(50): ${r.encoded.substring(0, 50)}`);
      }
    }
  }
}
