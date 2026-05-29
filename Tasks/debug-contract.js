/**
 * debug-contract.js — debug failing contracts
 */

function solveProblem(type, input) {
  if (type === "Compression I: RLE Compression") {
    let result = "";
    let i = 0;
    while (i < input.length) {
      let ch = input[i];
      let count = 1;
      while (i + count < input.length && input[i + count] === ch && count < 9) count++;
      result += count + ch;
      i += count;
    }
    return result;
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
      let bestOff = 0;
      let bestLen = 0;
      for (let sp = 0; sp < pos; sp++) {
        let ml = 0;
        while (pos + ml < n && input[pos + ml] === input[sp + ml] && ml < 9) ml++;
        if (ml > bestLen) {
          bestLen = ml;
          bestOff = pos - sp;
        }
      }
      // Use backref only if it strictly saves tokens: 3 tokens for backref
      // vs bestLen tokens for literals. But need to account for flush overhead too
      if (bestLen > 3) { // strictly better: 3 backref tokens < bestLen literal tokens
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

  if (type === "Array Jumping Game II") {
    let nums = input, jumps = 0, curEnd = 0, reach = 0;
    for (let i = 0; i < nums.length - 1; i++) {
      reach = Math.max(reach, i + nums[i]);
      if (i === curEnd) { jumps++; curEnd = reach; if (curEnd <= i) return 0; }
    }
    return jumps;
  }

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
    let floorDist = n - hi * hi, ceilDist = lo * lo - n;
    return floorDist <= ceilDist ? hi : lo;
  }

  if (type === "Largest Rectangle in a Matrix") {
    let grid = input;
    if (!grid || grid.length === 0) return 0;
    let rows = grid.length, cols = grid[0].length;
    let heights = new Array(cols).fill(0), best = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) heights[c] = grid[r][c] === 1 ? heights[c] + 1 : 0;
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

// Also provide a decoder to verify roundtrip
function decodeLZ(encoded) {
  let output = "";
  let i = 0;
  while (i < encoded.length) {
    if (encoded[i] === '0') {
      // backref: offset + "0" + length
      let offset = parseInt(encoded[i - 1]);
      let length = parseInt(encoded[i + 1]);
      let srcPos = output.length - offset;
      for (let k = 0; k < length; k++) {
        output += output[srcPos + k];
      }
      i += 2;
    } else if (parseInt(encoded[i]) >= 1 && parseInt(encoded[i]) <= 9) {
      // literal count + chars
      let count = parseInt(encoded[i]);
      let str = encoded.substring(i + 1, i + 1 + count);
      output += str;
      i += 1 + count;
    } else {
      i++;
    }
  }
  return output;
}

/** @param {NS} ns */
export async function main(ns) {
  let targets = [
    { srv: "foodnstuff", file: "contract-LdFuwj.cct" },
    { srv: "silver-helix", file: "contract-M4gZKF.cct" },
    { srv: "netlink", file: "contract-sOQCNt.cct" },
    { srv: "computek", file: "contract-joj41q.cct" },
    { srv: "zb-institute", file: "contract-eWbM8x.cct" },
  ];

  for (let t of targets) {
    let ctype = ns.codingcontract.getContractType(t.file, t.srv);
    let cdata = ns.codingcontract.getData(t.file, t.srv);
    let answer = solveProblem(ctype, cdata);

    ns.tprint(`=== ${t.srv} | ${t.file} | ${ctype} ===`);

    if (ctype === "HammingCodes: Encoded Binary to Integer") {
      ns.tprint(`Input (first 80): ${cdata.substring(0, 80)}...`);
      ns.tprint(`Input length: ${cdata.length}`);
      ns.tprint(`Answer: ${answer} (type: ${typeof answer})`);
    } else if (ctype === "Compression III: LZ Compression") {
      ns.tprint(`Input (first 80): ${cdata.substring(0, 80)}...`);
      ns.tprint(`Input length: ${cdata.length}`);
      ns.tprint(`Encoded (first 80): ${answer.substring(0, 80)}...`);
      ns.tprint(`Encoded length: ${answer.length}`);
      // Verify roundtrip
      let decoded = decodeLZ(answer);
      ns.tprint(`Decoded length: ${decoded.length}`);
      ns.tprint(`Roundtrip OK: ${decoded === cdata}`);
    }
  }
}
