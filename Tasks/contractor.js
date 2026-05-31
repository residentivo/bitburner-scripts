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
    if (!input || input.length === 0) return "";
    let compressed = "", decoded = "", pos = 0;
    while (pos < input.length) {
      let litChars = "", backLenFound = 0, backOffFound = 0;
      while (pos + litChars.length < input.length) {
        let testDec = decoded + litChars, bestBL = 0, bestBO = 0;
        let matchStart = pos + litChars.length;
        if (litChars.length > 0) {
          for (let off = 1; off <= Math.min(9, testDec.length); off++) {
            let fl = 0;
            while (fl < 9 && matchStart + fl < input.length) {
              let si = testDec.length - off + (fl % off);
              if (si < 0 || si >= testDec.length) break;
              if (input[matchStart + fl] === testDec[si]) fl++;
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
        let backref = "";
        for (let j = 0; j < backLenFound; j++)
          backref += decoded[decoded.length - backOffFound + (j % backOffFound)];
        compressed += String(backLenFound) + String(backOffFound);
        decoded += backref;
        pos += backLenFound;
      } else {
        compressed += "0";
      }
    }
    return compressed;
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
    // input can be:
    //   - 2D array of numbers
    //   - [rows, cols, ...flatData]
    //   - JSON string (parse it)
    let grid = input;
    if (typeof grid === "string") {
      try { grid = JSON.parse(grid); } catch(e) { return null; }
    }
    let rows, cols;
    if (grid.length > 0 && Array.isArray(grid[0])) {
      rows = grid.length;
      cols = grid[0].length;
    } else if (grid.length >= 2 && typeof grid[0] === "number" && typeof grid[1] === "number") {
      rows = grid[0];
      cols = grid[1];
      let flat = grid.slice(2);
      grid = [];
      for (let r = 0; r < rows; r++) {
        grid.push(flat.slice(r * cols, (r + 1) * cols));
      }
    } else {
      return null;
    }
    if (rows === 0 || cols === 0) return null;

    // For each unique value, run histogram-based largest rectangle
    const allVals = new Set();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        allVals.add(grid[r][c]);

    // Track best rectangle: area + coordinates
    let bestArea = 0;
    let bestCoords = null;

    for (let val of allVals) {
      let heights = new Array(cols).fill(0);
      let startRow = new Array(cols).fill(0); // track starting row for each height
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] === val) {
            heights[c] = heights[c] + 1;
          } else {
            heights[c] = 0;
          }
        }
        // Stack-based largest rectangle in histogram, tracking coordinates
        let stack = [];
        for (let h = 0; h <= cols; h++) {
          let ch = h < cols ? heights[h] : 0;
          while (stack.length > 0 && heights[stack[stack.length - 1]] > ch) {
            let top = stack.pop();
            let height = heights[top];
            let width = stack.length === 0 ? h : h - stack[stack.length - 1] - 1;
            let area = height * width;
            if (area > bestArea) {
              bestArea = area;
              let c1 = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
              let c2 = h - 1;
              let r2 = r;
              let r1 = r - height + 1;
              bestCoords = [[r1, c1], [r2, c2]];
            }
          }
          stack.push(h);
        }
      }
    }

    // v3 format: coordinates as [[r1,c1],[r2,c2]] array
    // Based on reference: convertAnswer parses array string → return [[r1,c1],[r2,c2]]
    if (bestCoords) return bestCoords;
    return null;
  }

  // === HammingCodes: Encoded Binary to Integer ===
  if (type === "HammingCodes: Encoded Binary to Integer") {
    let enc = input.split("").map(v => parseInt(v));
    let m = 0, n2 = enc.length;
    while (Math.pow(2, m) < m + n2 + 1) m++;
    let pn = 0;
    for (let i = 0; i < n2; i++) {
      let expected = 0;
      for (let j = 0; j < m; j++)
        if (i & (1 << j)) expected ^= enc[Math.pow(2, j)];
      if (enc[i] !== expected) pn ^= i;
    }
    if (pn !== 0 && pn < n2) enc[pn] = 1 - enc[pn];
    let dataBits = [];
    for (let i = 1; i < n2; i++)
      if ((i & (i - 1)) !== 0) dataBits.push(enc[i]);
    dataBits.reverse();
    return parseInt(dataBits.join(""), 2);
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
