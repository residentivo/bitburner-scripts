/**
 * contractor.js — scan all servers for coding contracts, solve and submit
 * Bitburner v3.0.1 compatible — zero external imports
 */

function solveProblem(type, input) {
  // === Compression I: RLE Compression ===
  if (type === "Compression I: RLE Compression") {
    let result = "";
    let i = 0;
    while (i < input.length) {
      let ch = input[i];
      let count = 1;
      while (i + count < input.length && input[i + count] === ch && count < 9) {
        count++;
      }
      result += count + ch;
      i += count;
    }
    return result;
  }

  // === Compression III: LZ Compression ===
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
      let bestOff = 0;
      let bestLen = 0;
      for (let sp = 0; sp < pos; sp++) {
        let ml = 0;
        while (pos + ml < n && input[pos + ml] === input[sp + ml] && ml < 9) {
          ml++;
        }
        if (ml > bestLen) {
          bestLen = ml;
          bestOff = pos - sp;
        }
      }
      if (bestLen >= 4) {
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
    return encoded;
  }

  // === Array Jumping Game II ===
  if (type === "Array Jumping Game II") {
    let nums = input;
    let jumps = 0;
    let curEnd = 0;
    let reach = 0;
    for (let i = 0; i < nums.length - 1; i++) {
      reach = Math.max(reach, i + nums[i]);
      if (i === curEnd) {
        jumps++;
        curEnd = reach;
        if (curEnd <= i) return 0;
      }
    }
    return jumps;
  }

  // === Square Root ===
  if (type === "Square Root") {
    let n = input;
    if (n < 0n) return 0n;
    if (n === 0n || n === 1n) return n;
    let lo = 1n, hi = n;
    while (lo <= hi) {
      let mid = (lo + hi) / 2n;
      let sq = mid * mid;
      if (sq === n) return mid;
      if (sq < n) lo = mid + 1n;
      else hi = mid - 1n;
    }
    // hi = floor, lo = ceil
    let floorDist = n - hi * hi;
    let ceilDist = lo * lo - n;
    return floorDist <= ceilDist ? hi : lo;
  }

  // === Largest Rectangle in a Matrix ===
  if (type === "Largest Rectangle in a Matrix") {
    let grid = input;
    if (!grid || grid.length === 0 || grid[0].length === 0) return 0;
    let rows = grid.length;
    let cols = grid[0].length;
    let heights = new Array(cols).fill(0);
    let best = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        heights[c] = grid[r][c] === 1 ? heights[c] + 1 : 0;
      }
      let stack = [];
      for (let h = 0; h <= cols; h++) {
        let ch = h < cols ? heights[h] : 0;
        while (stack.length > 0 && heights[stack[stack.length - 1]] > ch) {
          let top = stack.pop();
          let height = heights[top];
          let width = stack.length === 0 ? h : h - stack[stack.length - 1] - 1;
          best = Math.max(best, height * width);
        }
        stack.push(h);
      }
    }
    return best;
  }

  // === HammingCodes: Encoded Binary to Integer ===
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
    if (err > 0 && err <= len) bits[err - 1] ^= 1;
    let result = 0;
    for (let d = 3; d <= len; d++) {
      if ((d & (d - 1)) !== 0) {
        result = (result << 1) | bits[d - 1];
      }
    }
    return result;
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
      if (!allServers.has(n)) {
        allServers.add(n);
        queue.push(n);
      }
    }
  }

  let total = 0, solved = 0, failed = 0;

  for (let srv of allServers) {
    for (let cct of ns.ls(srv, ".cct")) {
      let ctype = ns.codingcontract.getContractType(cct, srv);
      let cdata = ns.codingcontract.getData(cct, srv);
      let answer = solveProblem(ctype, cdata);
      if (answer === null) {
        ns.tprint(`SKIP ${srv} | ${cct} | ${ctype}`);
        total++;
        continue;
      }
      let res = ns.codingcontract.attempt(answer, cct, srv);
      total++;
      if (res) {
        ns.tprint(`SOLVED ${srv} | ${cct} | ${ctype} | ${res}`);
        solved++;
      } else {
        ns.tprint(`FAILED ${srv} | ${cct} | ${ctype}`);
        failed++;
      }
    }
  }

  ns.tprint(`Done. Total: ${total}, Solved: ${solved}, Failed: ${failed}`);
}
