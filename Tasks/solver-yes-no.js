/**
 * solver-yes-no.js — Interactive yes/yesn't solver for Bitburner coding contracts v3
 *
 * For contracts where ns.codingcontract.attempt() returns a comma-separated
 * "yes"/"yesn't" string indicating which positions of your answer are correct.
 *
 * Example: attempt "12345" → "yes,yes,yes,yesn't,yesn't"
 *   → positions 0,1,2 are correct (digits 1,2,3)
 *   → positions 3,4 are wrong (digits 4,5 need to change)
 *
 * Strategy: brute-force each position 0-9 left to right.
 * When attempt returns all "yes", we have the answer.
 *
 * Integration in contractor.js solveProblem():
 *
 *   if (type === "Some Interactive Contract") {
 *     return solveYesNoInteractive(ns, cct, srv, cdata);
 *   }
 *
 * Or use the attempt wrapper:
 *   let answer = solveYesNoInteractive(ns, contract, hostname, expectedLength);
 */

/**
 * Full interactive solver — handles the entire attempt loop.
 *
 * @param {NS} ns
 * @param {string} contract - contract filename (.cct)
 * @param {string} hostname - server hostname
 * @param {number} numDigits - expected number of digit positions
 * @returns {string|null} the solved answer, or null on failure
 */
export async function solveYesNoInteractive(ns, contract, hostname, numDigits) {
  const digits = new Array(numDigits).fill(0);
  let pos = 0;

  while (pos < numDigits) {
    let found = false;
    for (let d = 0; d <= 9; d++) {
      digits[pos] = d;
      const attempt = digits.join('');
      const result = ns.codingcontract.attempt(attempt, contract, hostname);

      // Success — no "yesn't" means all positions correct
      if (result && typeof result === 'string' && !result.includes("yesn't") && !result.includes('yesnt')) {
        ns.tprint(`SOLVER-YesNo: SOLVED → ${attempt} (${result})`);
        return attempt;
      }

      // Parse feedback
      if (result && typeof result === 'string' && (result.includes('yes') || result.includes("yesn't"))) {
        const parts = result.split(',');
        if (parts[pos].trim() === 'yes') {
          pos++;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      ns.tprint(`SOLVER-YesNo: stuck at position ${pos}`);
      return null;
    }
  }

  return digits.join('');
}

/**
 * Array-element variant — for contracts where answer is a comma-separated
 * array of numbers and each element gets yes/yesn't feedback.
 *
 * @param {NS} ns
 * @param {string} contract - contract filename
 * @param {string} hostname - server hostname
 * @param {number} numElements - number of elements in answer array
 * @param {number} maxVal - max value per element (default 999)
 * @returns {string|null} comma-separated answer or null
 */
export async function solveYesNoArray(ns, contract, hostname, numElements, maxVal = 999) {
  const answer = new Array(numElements).fill(0);
  let pos = 0;

  while (pos < numElements) {
    let found = false;
    for (let v = 0; v <= maxVal; v++) {
      answer[pos] = v;
      const attempt = answer.join(',');
      const result = ns.codingcontract.attempt(attempt, contract, hostname);

      if (result && typeof result === 'string' && !result.includes("yesn't") && !result.includes('yesnt')) {
        ns.tprint(`SOLVER-YesNoArray: SOLVED → ${attempt} (${result})`);
        return attempt;
      }

      if (result && typeof result === 'string' && (result.includes('yes') || result.includes("yesn't"))) {
        const parts = result.split(',');
        if (parts[pos].trim() === 'yes') {
          pos++;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      ns.tprint(`SOLVER-YesNoArray: stuck at position ${pos}`);
      return null;
    }
  }

  return answer.join(',');
}

/**
 * Auto-detect variant — tries to figure out the answer length automatically
 * by submitting "0", "00", "000", ... until getting yes/yesn't feedback.
 *
 * @param {NS} ns
 * @param {string} contract - contract filename
 * @param {string} hostname - server hostname
 * @param {boolean} isArray - true if answer is comma-separated array (not digits)
 * @returns {string|null}
 */
export async function solveYesNoAuto(ns, contract, hostname, isArray = false) {
  let numDigits = 0;

  // Detect length: try "0", "00", "000", ...
  for (let len = 1; len <= 50; len++) {
    const test = isArray
      ? Array(len).fill(0).join(',')
      : '0'.repeat(len);
    const result = ns.codingcontract.attempt(test, contract, hostname);
    if (result && typeof result === 'string' && (result.includes('yes') || result.includes("yesn't"))) {
      numDigits = result.split(',').length;
      break;
    }
  }

  if (numDigits === 0) {
    ns.tprint('SOLVER-YesNoAuto: could not detect answer length');
    return null;
  }

  ns.tprint(`SOLVER-YesNoAuto: detected ${numDigits} positions`);

  if (isArray) {
    return solveYesNoArray(ns, contract, hostname, numDigits);
  }
  return solveYesNoInteractive(ns, contract, hostname, numDigits);
}
