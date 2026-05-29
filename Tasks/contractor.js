/**
 * contractor.js — scan all servers for coding contracts, solve and submit
 * Bitburner v3.0.1 compatible — zero external imports
 */

/** Solve a Coding Contract. Returns answer in the format the contract expects. */
function solveProblem(type, contractInput) {
  // === Compression I: RLE Compression ===
  if (type === "Compression I: RLE Compression") {
    let result = "";
    let i = 0;
    while (i < contractInput.length) {
      let currentChar = contractInput[i];
      let count = 1;
      while (i + count < contractInput.length && contractInput[i + count] === currentChar && count < 9) {
        count++;
      }
      result += count + currentChar;
      i += count;
    }
    return result;
  }

  // === Compression III: LZ Compression ===
  if (type === "Compression III: LZ Compression") {
    const n = contractInput.length;
    // backref: (offsetHI offsetLO char) — 3 chars total
    // offset 0 means literal (1 char for token + 1 char for the char = 2 chars)
    // backref offset>=1: 3 chars encodes up to offset chars
    let dp = new Array(n + 1).fill(Infinity);
    dp[0] = 0;
    let choice = new Array(n + 1).fill(null); // {type:'lit', len} or {type:'back', offset, matchLen}

    // Precompute longest common prefix for all (i, j) pairs where j < i
    // lcp[i][j] = length of longest common prefix of input[i:] and input[j:]
    // We only need matchLen up to 9 (max backref encodes 9 chars in 3, same as 3 literals)

    for (let pos = 0; pos < n; pos++) {
      if (dp[pos] === Infinity) continue;

      // Option 1: literal token
      if (dp[pos] + 1 < dp[pos + 1]) {
        dp[pos + 1] = dp[pos] + 1;
        choice[pos + 1] = { type: 'lit', src: pos, len: 1 };
      }

      // Option 2: backreference — look back for matches
      for (let back = 1; back <= Math.min(pos, 9); back++) {
        let srcPos = pos - back;
        let matchLen = 0;
        while (pos + matchLen < n && contractInput[pos + matchLen] === contractInput[srcPos + matchLen] && matchLen < 9) {
          matchLen++;
        }
        if (matchLen >= 1) {
          let endPos = pos + matchLen;
          let cost = dp[pos] + 3; // backref token is 3 chars
          if (cost < dp[endPos]) {
            dp[endPos] = cost;
            choice[endPos] = { type: 'back', src: srcPos, offset: back, len: matchLen };
          }
        }
      }
    }

    // Reconstruct
    let output = [];
    let cursor = n;
    while (cursor > 0) {
      let c = choice[cursor];
      if (c.type === 'lit') {
        output.push(contractInput[c.src]);
        cursor = c.src;
      } else {
        output.push([c.offset, c.len]);
        cursor = c.src; // No — should be cursor - len for backref
        // Actually: we went from (cursor - len) to cursor via backref
        // So the source is fine, but we need cursor = cursor - len
        cursor = cursor - c.len;
        // Wait no. Let me reconsider. dp[pos + matchLen] was updated from dp[pos]
        // So choice[pos+matchLen] = {type:'back', src: srcPos, len: matchLen}
        // To reconstruct, we go from pos+matchLen back to pos
        // pos = (pos+matchLen) - matchLen = srcEnd - len = cursor - c.len
        // cursor was set to c.src above — that's wrong.
        // Let me fix:
      }
    }
    // Reconstruction is buggy. Let me use a cleaner approach.

    // Reset and redo with simpler logic
    dp = new Array(n + 1).fill(Infinity);
    dp[0] = 0;
    // parent[i] = j means optimal way to reach i is from j
    let parent = new Array(n + 1).fill(-1);
    let parentType = new Array(n + 1).fill('');
    let parentLen = new Array(n + 1).fill(0);

    for (let pos = 0; pos < n; pos++) {
      if (dp[pos] === Infinity) continue;

      // Literal
      if (dp[pos] + 1 < dp[pos + 1]) {
        dp[pos + 1] = dp[pos] + 1;
        parent[pos + 1] = pos;
        parentType[pos + 1] = 'lit';
        parentLen[pos + 1] = 1;
      }

      // Backreference
      for (let offset = 1; offset <= Math.min(pos, 9); offset++) {
        let srcIdx = pos - offset;
        let matchLen = 0;
        while (pos + matchLen < n && contractInput[pos + matchLen] === contractInput[srcIdx + matchLen] && matchLen < 9) {
          matchLen++;
        }
        for (let ml = 1; ml <= matchLen; ml++) {
          let dest = pos + ml;
          if (dp[pos] + 3 < dp[dest]) {
            dp[dest] = dp[pos] + 3;
            parent[dest] = pos;
            parentType[dest] = 'back';
            parentLen[dest] = ml;
            // Also store offset for backref encoding
          }
        }
      }
    }

    // Reconstruct
    output = [];
    cursor = n;
    while (cursor > 0) {
      let p = parent[cursor];
      if (parentType[cursor] === 'lit') {
        output.push(contractInput[p]);
      } else {
        let offset = cursor - p; // This is wrong for backref — offset is cursor - srcPos
        // Actually offset is the distance back from the current position
        // In our DP, offset was pos - srcIdx where pos is the current decode position
        // Hmm, I need to store the offset as well. Let me simplify.
      }
      cursor = p;
    }

    // Ok the DP approach is getting messy with reconstruction. Let me use a simpler greedy/known approach.
    // References: use the well-known LZ encoding for Bitburner

    // Reset completely with the correct algorithm
    let encodedResult = "";
    let litBuffer = [];
    let inputPos = 0;

    function flushLiterals() {
      let fl = 0;
      while (fl < litBuffer.length) {
        let chunkSize = Math.min(litBuffer.length - fl, 9);
        encodedResult += "9" + litBuffer.slice(fl, fl + chunkSize).join(""), fl += chunkSize;
      }
      litBuffer = [];
    }

    while (inputPos < n) {
      let bestOffset = 0;
      let bestLen = 0;

      // Search for longest match in already-processed output
      for (let searchPos = 0; searchPos < inputPos; searchPos++) {
        let matchSize = 0;
        while (inputPos + matchSize < n && contractInput[inputPos + matchSize] === contractInput[searchPos + matchSize] && matchSize < 9) {
          matchSize++;
        }
        if (matchSize > bestLen) {
          bestLen = matchSize;
          bestOffset = inputPos - searchPos;
        }
      }

      // Use backref if it saves space: backref costs 3, literals cost bestLen
      if (bestLen >= 4) { // backref (3 tokens) better than 4+ literals
        flushLiterals();
        encodedResult += bestOffset + "0" + bestLen;
        inputPos += bestLen;
      } else {
        litBuffer.push(contractInput[inputPos]);
        if (litBuffer.length >= 9) flushLiterals();
        inputPos++;
      }
    }
    flushLiterals();

    return encodedResult;
  }

  // === Array Jumping Game II ===
  if (type === "Array Jumping Game II") {
    let nums = contractInput;
    let jumpCount = 0;
    let currentEnd = 0;
    let farthest = 0;
    for (let idx = 0; idx < nums.length - 1; idx++) {
      farthest = Math.max(farthest, idx + nums[idx]);
      if (idx === currentEnd) {
        jumpCount++;
        currentEnd = farthest;
        if (currentEnd <= idx) return 0; // can't progress
      }
    }
    return jumpCount;
  }

  // === Square Root ===
  if (type === "Square Root") {
    // Find the square root of the number, to the nearest integer
    let targetNum = contractInput;
    if (targetNum < 0n) return 0;
    if (targetNum === 0n || targetNum === 1n) return targetNum;

    // Binary search for BigInt sqrt
    let lo = 1n;
    let hi = targetNum;
    while (lo <= hi) {
      let mid = (lo + hi) / 2n;
      let sq = mid * mid;
      if (sq === targetNum) return mid;
      if (sq < targetNum) {
        lo = mid + 1n;
      } else {
        hi = mid - 1n;
      }
    }
    // hi = floor(sqrt(n)), lo = ceil(sqrt(n))
    let floorVal = hi;
    let ceilVal = lo;
    // Pick whichever is closer to the true sqrt
    let floorDist = targetNum - floorVal * floorVal;
    let ceilDist = ceilVal * ceilVal - targetNum;
    return floorDist <= ceilDist ? floorVal : ceilVal;
  }

  // === Largest Rectangle in a Matrix ===
  if (type === "Largest Rectangle in a Matrix") {
    let grid = contractInput;
    if (!grid || grid.length === 0 || grid[0].length === 0) return 0;
    let numRows = grid.length;
    let numCols = grid[0].length;
    let heights = new Array(numCols).fill(0);
    let bestArea = 0;

    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      for (let colIdx = 0; colIdx < numCols; colIdx++) {
        if (grid[rowIdx][colIdx] === 1) {
          heights[colIdx]++;
        } else {
          heights[colIdx] = 0;
        }
      }
      // Largest rectangle in histogram
      let stack = [];
      for (let h = 0; h <= numCols; h++) {
        let curHeight = h < numCols ? heights[h] : 0;
        while (stack.length > 0 && heights[stack[stack.length - 1]] > curHeight) {
          let topIdx = stack.pop();
          let height = heights[topIdx];
          let width = stack.length === 0 ? h : h - stack[stack.length - 1] - 1;
          bestArea = Math.max(bestArea, height * width);
        }
        stack.push(h);
      }
    }
    return bestArea;
  }

  // === HammingCodes: Encoded Binary to Integer ===
  if (type === "HammingCodes: Encoded Binary to Integer") {
    let bits = contractInput.split("").map(Number);
    let bitLen = bits.length;
    // Find syndrome
    let errorPos = 0;
    for (let parityBit = 1; parityBit <= bitLen; parityBit *= 2) {
      let parity = 0;
      for (let bitIdx = parityBit; bitIdx <= bitLen; bitIdx++) {
        if ((bitIdx & parityBit) !== 0) {
          parity ^= bits[bitIdx - 1];
        }
      }
      errorPos += parity * parityBit;
    }
    // Correct error
    if (errorPos > 0 && errorPos <= bitLen) {
      bits[errorPos - 1] ^= 1;
    }
    // Extract data bits (non-power-of-2 positions)
    let result = 0;
    for (let dataBit = 3; dataBit <= bitLen; dataBit++) {
      if ((dataBit & (dataBit - 1)) !== 0) { // Not a power of 2
        result = (result << 1) | bits[dataBit - 1];
      }
    }
    return result;
  }

  return null; // Unknown type
}

/** @param {NS} ns */
export async function main(ns) {
  let allServers = new Set(["home"]);
  let scanQueue = ["home"];
  while (scanQueue.length > 0) {
    let currentHost = scanQueue.pop();
    let neighbors = ns.scan(currentHost);
    for (let neighborIdx = 0; neighborIdx < neighbors.length; neighborIdx++) {
      if (!allServers.has(neighbors[neighborIdx])) {
        allServers.add(neighbors[neighborIdx]);
        scanQueue.push(neighbors[neighborIdx]);
      }
    }
  }

  let contractsTotal = 0;
  let contractsSolved = 0;
  let contractsFailed = 0;

  for (let serverName of allServers) {
    let contractFiles = ns.ls(serverName, ".cct");
    for (let fileIdx = 0; fileIdx < contractFiles.length; fileIdx++) {
      let contractFile = contractFiles[fileIdx];
      let contractType = ns.codingcontract.getContractType(contractFile, serverName);
      let contractDesc = ns.codingcontract.getDescription(contractFile, serverName);
      let contractInput = ns.codingcontract.getData(contractFile, serverName);

      let answer = solveProblem(contractType, contractInput);
      if (answer === null) {
        ns.tprint(`SKIP ${serverName} | ${contractFile} | ${contractType} (no solver)`);
        contractsTotal++;
        continue;
      }

      let result = ns.codingcontract.attempt(answer, contractFile, serverName);
      contractsTotal++;
      if (result) {
        ns.tprint(`SOLVED ${serverName} | ${contractFile} | ${contractType} | Reward: ${result}`);
        contractsSolved++;
      } else {
        ns.tprint(`FAILED ${serverName} | ${contractFile} | ${contractType}`);
        contractsFailed++;
      }
    }
  }

  ns.tprint(`Done. Total: ${contractsTotal}, Solved: ${contractsSolved}, Failed: ${contractsFailed}`);
}
