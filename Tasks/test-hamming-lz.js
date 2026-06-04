// Test script for Hamming and LZ Compression solvers
// Run with: node test-hamming-lz.js

// ===== HammingCodes: Integer to Encoded Binary =====
function hammingEncode(n) {
  let bits = n.toString(2).split('').reverse().map(v => parseInt(v));
  let k = bits.length;
  let enc = [0];
  for (let i = 1; k > 0; i++) {
    if ((i & (i - 1)) !== 0) enc[i] = bits[--k];
    else enc[i] = 0;
  }
  let pn = 0;
  for (let i = 0; i < enc.length; i++) if (enc[i]) pn ^= i;
  let pa = pn.toString(2).split('').reverse().map(v => parseInt(v));
  for (let i = 0; i < pa.length; i++) enc[Math.pow(2, i)] = pa[i] ? 1 : 0;
  pn = 0;
  for (let i = 0; i < enc.length; i++) if (enc[i]) pn++;
  enc[0] = pn % 2 === 0 ? 0 : 1;
  return enc.join('');
}

// ===== HammingCodes: Encoded Binary to Integer (contractor.js version) =====
function hammingDecode_contractor(input) {
  let enc = input.split('').map(v => parseInt(v));
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
  return parseInt(dataBits.join(''), 2);
}

// ===== HammingCodes: Encoded Binary to Integer (debug version - correct) =====
function hammingDecode_debug(input) {
  let b = input.split('').map(Number);
  let len = b.length;
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
  if (syndrome > 0 && syndrome <= len) {
    b[syndrome - 1] ^= 1;
  }
  let result = 0;
  for (let pos = 1; pos <= len; pos++) {
    if ((pos & (pos - 1)) !== 0) {
      result = (result << 1) | b[pos - 1];
    }
  }
  return result;
}

// ===== HammingCodes: Encoded Binary to Integer (solver-mini version) =====
function hammingDecode_mini(input) {
  var enc = input.split('').map(function(v) { return parseInt(v); });
  var m = 0, n = enc.length;
  while (Math.pow(2, m) < m + n + 1) m++;
  var pn = 0;
  for (var i = 0; i < n; i++) {
    var expected = 0;
    for (var j = 0; j < m; j++)
      if (i & (1 << j)) expected ^= enc[Math.pow(2, j)];
    if (enc[i] !== expected) pn ^= i;
  }
  if (pn !== 0 && pn < n) enc[pn] = 1 - enc[pn];
  var dataBits = [];
  for (var i = 1; i < n; i++)
    if ((i & (i - 1)) !== 0) dataBits.push(enc[i]);
  dataBits.reverse();
  return parseInt(dataBits.join(''), 2);
}

// Test Hamming
console.log("=== HammingCodes Tests ===");
for (let testVal = 1; testVal <= 200; testVal++) {
  let encoded = hammingEncode(testVal);
  let decoded_contractor = hammingDecode_contractor(encoded);
  let decoded_debug = hammingDecode_debug(encoded);
  let decoded_mini = hammingDecode_mini(encoded);
  
  if (decoded_contractor !== testVal || decoded_debug !== testVal || decoded_mini !== testVal) {
    console.log(`FAIL: testVal=${testVal}, encoded=${encoded}`);
    console.log(`  contractor: ${decoded_contractor}, debug: ${decoded_debug}, mini: ${decoded_mini}`);
    if (decoded_contractor !== testVal) console.log(`  -> contractor.js is WRONG`);
    if (decoded_debug !== testVal) console.log(`  -> debug is WRONG`);
    if (decoded_mini !== testVal) console.log(`  -> solver-mini.js is WRONG`);
  }
}

// Test with corrupted bit (what the contract actually sends)
console.log("\n=== HammingCodes with single-bit errors ===");
let failCount = 0;
for (let testVal = 1; testVal <= 200; testVal++) {
  let encoded = hammingEncode(testVal);
  let encArr = encoded.split('').map(Number);
  
  // Flip a single bit (position 1 through length-1)
  for (let flipPos = 1; flipPos < encArr.length; flipPos++) {
    let corrupted = encArr.slice();
    corrupted[flipPos] = 1 - corrupted[flipPos];
    let corruptedStr = corrupted.join('');
    
    let decoded_contractor = hammingDecode_contractor(corruptedStr);
    let decoded_debug = hammingDecode_debug(corruptedStr);
    
    if (decoded_contractor !== testVal) {
      if (failCount < 10) {
        console.log(`FAIL (corrupted): testVal=${testVal}, flipPos=${flipPos}, encoded=${encoded}, corrupted=${corruptedStr}`);
        console.log(`  contractor: ${decoded_contractor}, debug: ${decoded_debug}`);
      }
      failCount++;
    }
  }
}
console.log(`Total Hamming corrupted-bit failures: ${failCount}`);

// Test with large integers (potential parseInt overflow)
console.log("\n=== HammingCodes with large integers (overflow test) ===");
for (let testVal of [1000, 5000, 10000, 50000, 100000, 200000, 500000, 999999]) {
  let encoded = hammingEncode(testVal);
  let decoded_contractor = hammingDecode_contractor(encoded);
  let decoded_debug = hammingDecode_debug(encoded);
  let match = decoded_contractor === testVal && decoded_debug === testVal;
  console.log(`testVal=${testVal}: contractor=${decoded_contractor}, debug=${decoded_debug}, match=${match}`);
  if (!match) {
    console.log(`  Encoded length: ${encoded.length}, data bits: ${encoded.length - Math.round(Math.log2(encoded.length)) - 1}`);
    // Check if parseInt would overflow
    let dataBits = [];
    let enc = encoded.split('').map(Number);
    for (let i = 1; i < enc.length; i++)
      if ((i & (i - 1)) !== 0) dataBits.push(enc[i]);
    dataBits.reverse();
    let binaryStr = dataBits.join('');
    console.log(`  Binary string length: ${binaryStr.length}, parseInt result: ${parseInt(binaryStr, 2)}, expected: ${testVal}`);
    if (binaryStr.length > 30) {
      console.log(`  *** OVERFLOW: binary string has ${binaryStr.length} bits, exceeds JS safe integer range (~53 bits) ***`);
    }
  }
}

// ===== LZ Compression Tests =====
console.log("\n\n=== LZ Compression Tests ===");

// LZ Compress (contractor.js version - threshold >= 4)
function lzCompress_contractor(input) {
  if (!input || input.length === 0) return "";
  let compressed = "";
  let pos = 0;
  while (pos < input.length) {
    let bestOff = 0, bestLen = 0;
    let window = "";
    let ti = 0, ci = 0;
    while (ci < compressed.length) {
      let lc = compressed.charCodeAt(ci) - 0x30;
      if (lc <= 0 || lc > 9) break;
      window += compressed.substring(ci + 1, ci + 1 + lc);
      ci += 1 + lc;
      if (ci >= compressed.length) break;
      let bl = compressed.charCodeAt(ci) - 0x30;
      if (bl < 0 || bl > 9) break;
      if (bl === 0) { ci++; continue; }
      if (ci + 1 >= compressed.length) break;
      let bo = compressed.charCodeAt(ci + 1) - 0x30;
      for (let j = 0; j < bl; j++) window += window[window.length - bo];
      ci += 2;
    }
    for (let off = 1; off <= Math.min(9, window.length); off++) {
      let fl = 0;
      while (fl < 9 && pos + fl < input.length) {
        let si = window.length - off + (fl % off);
        if (si < 0 || si >= window.length) break;
        if (input[pos + fl] === window[si]) fl++;
        else break;
      }
      if (fl > bestLen) { bestLen = fl; bestOff = off; }
    }
    if (bestLen >= 4) {
      compressed += "0" + String(bestLen) + String(bestOff);
      pos += bestLen;
    } else {
      let litLen = 1;
      while (pos + litLen < input.length && litLen < 9) {
        let testDec = window + input.substring(pos, pos + litLen);
        let foundBL = 0;
        for (let off = 1; off <= Math.min(9, testDec.length); off++) {
          let fl = 0;
          while (fl < 9 && pos + litLen + fl < input.length) {
            let si = testDec.length - off + (fl % off);
            if (si < 0 || si >= testDec.length) break;
            if (input[pos + litLen + fl] === testDec[si]) fl++;
            else break;
          }
          if (fl > foundBL) foundBL = fl;
        }
        if (foundBL >= 4) break;
        litLen++;
      }
      compressed += String(litLen) + input.substring(pos, pos + litLen);
      pos += litLen;
    }
  }
  return compressed;
}

// LZ Compress (solver-functions.js / solver-mini.js version - threshold >= 3)
function lzCompress_solver(input) {
  if (!input || input.length === 0) return '';
  var compressed = '', decoded = '', pos = 0;
  while (pos < input.length) {
    var litChars = '', backLenFound = 0, backOffFound = 0;
    while (pos + litChars.length < input.length) {
      var testDec = decoded + litChars, bestBL = 0, bestBO = 0, matchStart = pos + litChars.length;
      if (litChars.length > 0) {
        for (var off = 1; off <= Math.min(9, testDec.length); off++) {
          var fl = 0;
          while (fl < 9 && matchStart + fl < input.length) {
            var si = testDec.length - off + (fl % off);
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
      var backref = '';
      for (var j = 0; j < backLenFound; j++) backref += decoded[decoded.length - backOffFound + (j % backOffFound)];
      compressed += String(backLenFound) + String(backOffFound);
      decoded += backref;
      pos += backLenFound;
    } else compressed += '0';
  }
  return compressed;
}

// LZ Decompress (for verification)
function lzDecompress(input) {
  let p = '', i = 0;
  while (i < input.length) {
    let ll = input.charCodeAt(i) - 0x30;
    if (ll < 0 || ll > 9 || i + 1 + ll > input.length) return null;
    p += input.substring(i + 1, i + 1 + ll);
    i += 1 + ll;
    if (i >= input.length) break;
    let bl = input.charCodeAt(i) - 0x30;
    if (bl < 0 || bl > 9) return null;
    if (bl === 0) { i++; continue; }
    if (i + 1 >= input.length) return null;
    let bo = input.charCodeAt(i + 1) - 0x30;
    if (bo < 1 || bo > 9) return null;
    if (bo > p.length) return null;
    for (let j = 0; j < bl; j++) p += p[p.length - bo];
    i += 2;
  }
  return p;
}

// Test cases
const testCases = [
  "abcabcabcabc",
  "aaaaaaaaaaaaaa",
  "abababababab",
  "the quick brown fox jumps over the lazy dog",
  "abcabcabc",
  "aabbaabbaabbaabb",
  "ABABABABABABABAB",
  "mississippi",
  "hello hello hello",
  "aabbccaabbcc",
];

for (const tc of testCases) {
  let enc_solver = lzCompress_solver(tc);
  let enc_contractor = lzCompress_contractor(tc);
  let dec_solver = lzDecompress(enc_solver);
  let dec_contractor = lzDecompress(enc_contractor);
  
  let solverOk = dec_solver === tc;
  let contractorOk = dec_contractor === tc;
  let same = enc_solver === enc_contractor;
  
  if (!solverOk || !contractorOk || !same) {
    console.log(`Input: "${tc.substring(0, 40)}..."`);
    console.log(`  solver (>=3): ${enc_solver} -> decompress: ${dec_solver === tc ? 'OK' : 'FAIL: ' + dec_solver}`);
    console.log(`  contractor (>=4): ${enc_contractor} -> decompress: ${dec_contractor === tc ? 'OK' : 'FAIL: ' + dec_contractor}`);
    if (enc_solver !== enc_contractor) {
      console.log(`  DIFFERENT encodings! solver is shorter by ${enc_contractor.length - enc_solver.length} chars`);
    }
  }
}

// Test that both round-trip correctly
console.log("\n=== LZ Round-trip verification ===");
let lzSolverFails = 0, lzContractorFails = 0;
for (const tc of testCases) {
  let enc_solver = lzCompress_solver(tc);
  let enc_contractor = lzCompress_contractor(tc);
  let dec_solver = lzDecompress(enc_solver);
  let dec_contractor = lzDecompress(enc_contractor);
  if (dec_solver !== tc) lzSolverFails++;
  if (dec_contractor !== tc) lzContractorFails++;
}
console.log(`Solver (>=3) round-trip failures: ${lzSolverFails}/${testCases.length}`);
console.log(`Contractor (>=4) round-trip failures: ${lzContractorFails}/${testCases.length}`);

// Additional: verify that Bitburner's official threshold is >= 3 by checking
// what the Bitburner source actually uses
console.log("\n=== Critical: What threshold does Bitburner expect? ===");
// Test with a string where >=3 and >=4 produce DIFFERENT valid encodings
const criticalTest = "abcabc";
let enc3 = lzCompress_solver(criticalTest);
let enc4 = lzCompress_contractor(criticalTest);
console.log(`Input: "${criticalTest}"`);
console.log(`  With >=3 threshold: "${enc3}" -> decompress: "${lzDecompress(enc3)}"`);
console.log(`  With >=4 threshold: "${enc4}" -> decompress: "${lzDecompress(enc4)}"`);
console.log(`  Note: >=3 gives shorter encoding (${enc3.length} vs ${enc4.length} chars)`);
