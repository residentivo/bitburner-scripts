// This contract solver has the bare-minimum footprint of 1.6 GB (base) + 10 GB (ns.codingcontract.attempt)
// It reads contract data from a temp file (path passed as arg) to avoid ns.run arg size limits.
/** @param {NS} ns **/
export async function main(ns) {
    if (ns.args.length < 1)
        ns.tprint('Contractor solver was incorrectly invoked without arguments.')
    // Read batch from temp file
    const batchFile = ns.args[0];
    const raw = ns.read(batchFile);
    if (!raw || raw === '') {
        ns.tprint(`ERROR: Could not read batch file: ${batchFile}`)
        return;
    }
    var contractsDb = JSON.parse(raw, (k, v) => typeof v === 'string' && v.startsWith('__BIGINT__') ? BigInt(v.slice(10)) : v);
    for (const contractInfo of contractsDb) {
        const answer = findAnswer(contractInfo, ns)
        if (answer != null) {
            const solvingResult = ns.codingcontract.attempt(answer, contractInfo.contract, contractInfo.hostname, { returnReward: true })
            if (solvingResult) {
                ns.toast(`Solved ${contractInfo.contract} on ${contractInfo.hostname}`, 'success');
                ns.tprint(`Solved ${contractInfo.contract} on ${contractInfo.hostname}. Reward: ${solvingResult}`)
            } else {
                ns.tprint(`Wrong answer for ${contractInfo.contract} on ${contractInfo.hostname}: ${JSON.stringify(answer)}`)
            }
        } else {
            ns.tprint(`Unable to find the answer for: ${JSON.stringify(contractInfo)}`)
        }
        await ns.sleep(10)
    }
}

function findAnswer(contract, ns) {
    if (!contract || !contract.type) {
        if (ns) ns.tprint('WARN: Skipping contract ' + (contract ? contract.contract : 'unknown') + ' - missing type');
        return null;
    }
    if (contract.data === undefined || contract.data === null) {
        if (ns) ns.tprint('WARN: Skipping contract ' + (contract ? contract.contract : 'unknown') + ' - missing data. Keys: ' + JSON.stringify(Object.keys(contract)));
        return null;
    }
    const codingContractSolution = codingContractTypesMetadata.find((codingContractTypeMetadata) => codingContractTypeMetadata.name === contract.type);
    if (!codingContractSolution) {
        if (ns) ns.tprint('WARN: No solver found for type: ' + contract.type);
        return null;
    }
    try {
        const result = codingContractSolution.solver(contract.data);
        if (result === null || result === undefined) {
            if (ns) ns.tprint('WARN: Solver returned null/undefined for ' + contract.contract + ' type=' + contract.type);
        }
        return result;
    } catch(e) {
        if (ns) ns.tprint('ERROR: Solver threw for ' + contract.contract + ' type=' + contract.type + ': ' + e.toString());
        return null;
    }
}

function convert2DArrayToString(arr) {
    var components = []
    arr.forEach(function (e) {
        var s = e.toString()
        s = ['[', s, ']'].join('')
        components.push(s)
    })
    return components.join(',').replace(/\s/g, '')
}

// Based on https://github.com/danielyxie/bitburner/blob/master/src/data/codingcontracttypes.ts
// Helper: largest rectangle area in a histogram using a stack — O(n)
function largestRectangleInHistogram(heights) {
    var stack = []
    var maxArea = 0
    for (var i = 0; i <= heights.length; i++) {
        var h = i < heights.length ? heights[i] : 0
        while (stack.length > 0 && heights[stack[stack.length - 1]] > h) {
            var height = heights[stack.pop()]
            var width = stack.length === 0 ? i : i - stack[stack.length - 1] - 1
            maxArea = Math.max(maxArea, height * width)
        }
        stack.push(i)
    }
    return maxArea
}

const codingContractTypesMetadata = [{
    name: 'Find Largest Prime Factor',
    solver: function (data) {
        // Handles both Number and BigInt
        if (typeof data === 'bigint') {
            var n = data;
            var fac = 2n;
            while (n > (fac - 1n) * (fac - 1n)) {
                while (n % fac === 0n) {
                    n = n / fac;
                }
                ++fac;
            }
            return (n === 1n ? fac - 1n : n).toString();
        }
        var n = data;
        var fac = 2;
        while (n > (fac - 1) * (fac - 1)) {
            while (n % fac === 0) {
                n = Math.round(n / fac);
            }
            ++fac;
        }
        return n === 1 ? fac - 1 : n;
    },
},
{
    name: 'Subarray with Maximum Sum',
    solver: function (data) {
        var nums = data.slice()
        for (var i = 1; i < nums.length; i++) {
            nums[i] = Math.max(nums[i], nums[i] + nums[i - 1])
        }
        return Math.max.apply(Math, nums)
    },
},
{
    name: 'Total Ways to Sum',
    solver: function (data) {
        var ways = [1]
        ways.length = data + 1
        ways.fill(0, 1)
        for (var i = 1; i < data; ++i) {
            for (var j = i; j <= data; ++j) {
                ways[j] += ways[j - i]
            }
        }
        return ways[data]
    },
},
{
    name: 'Total Ways to Sum II',
    solver: function (data) {
        try {
            if (!data || !Array.isArray(data) || data.length < 2) return null;
            var n = Number(data[0]);
            if (isNaN(n) || n < 0) return null;
            var allowed = data[1];
            if (!Array.isArray(allowed)) return null;
            if (n === 0) return 1;
            if (allowed.length === 0) return 0;
            allowed = allowed.filter(function(x) { return typeof x === 'number' && x > 0 && x <= n; }).sort(function(a, b) { return a - b; });
            if (allowed.length === 0) return 0;
            var ways = new Array(n + 1).fill(0);
            ways[0] = 1;
            for (var i = 0; i < allowed.length; ++i) {
                var coin = allowed[i];
                for (var j = coin; j <= n; ++j) {
                    ways[j] += ways[j - coin];
                }
            }
            return ways[n];
        } catch(e) {
            return null;
        }
    },
},
{
    name: 'Spiralize Matrix',
    solver: function (data, ans) {
        var spiral = []
        var m = data.length
        var n = data[0].length
        var u = 0
        var d = m - 1
        var l = 0
        var r = n - 1
        var k = 0
        while (true) {
            // Up
            for (var col = l; col <= r; col++) {
                spiral[k] = data[u][col]
                ++k
            }
            if (++u > d) {
                break
            }
            // Right
            for (var row = u; row <= d; row++) {
                spiral[k] = data[row][r]
                ++k
            }
            if (--r < l) {
                break
            }
            // Down
            for (var col = r; col >= l; col--) {
                spiral[k] = data[d][col]
                ++k
            }
            if (--d < u) {
                break
            }
            // Left
            for (var row = d; row >= u; row--) {
                spiral[k] = data[row][l]
                ++k
            }
            if (++l > r) {
                break
            }
        }

        return spiral
    },
},
{
    name: 'Array Jumping Game',
    solver: function (data) {
        var n = data.length
        var i = 0
        for (var reach = 0; i < n && i <= reach; ++i) {
            reach = Math.max(i + data[i], reach)
        }
        var solution = i === n
        return solution ? 1 : 0
    },
},
{
    name: 'Merge Overlapping Intervals',
    solver: function (data) {
        var intervals = data.slice()
        intervals.sort(function (a, b) {
            return a[0] - b[0]
        })
        var result = []
        var start = intervals[0][0]
        var end = intervals[0][1]
        for (var _i = 0, intervals_1 = intervals; _i < intervals_1.length; _i++) {
            var interval = intervals_1[_i]
            if (interval[0] <= end) {
                end = Math.max(end, interval[1])
            } else {
                result.push([start, end])
                start = interval[0]
                end = interval[1]
            }
        }
        result.push([start, end])
        var sanitizedResult = convert2DArrayToString(result)
        return sanitizedResult
    },
},
{
    name: 'Generate IP Addresses',
    solver: function (data, ans) {
        var ret = []
        for (var a = 1; a <= 3; ++a) {
            for (var b = 1; b <= 3; ++b) {
                for (var c = 1; c <= 3; ++c) {
                    for (var d = 1; d <= 3; ++d) {
                        if (a + b + c + d === data.length) {
                            var A = parseInt(data.substring(0, a), 10)
                            var B = parseInt(data.substring(a, a + b), 10)
                            var C = parseInt(data.substring(a + b, a + b + c), 10)
                            var D = parseInt(data.substring(a + b + c, a + b + c + d), 10)
                            if (A <= 255 && B <= 255 && C <= 255 && D <= 255) {
                                var ip = [A.toString(), '.', B.toString(), '.', C.toString(), '.', D.toString()].join('')
                                if (ip.length === data.length + 3) {
                                    ret.push(ip)
                                }
                            }
                        }
                    }
                }
            }
        }
        return ret
    },
},
{
    name: 'Algorithmic Stock Trader I',
    solver: function (data) {
        var prices = data.map(v => Number(v));
        var maxCur = 0
        var maxSoFar = 0
        for (var i = 1; i < prices.length; ++i) {
            maxCur = Math.max(0, (maxCur += prices[i] - prices[i - 1]))
            maxSoFar = Math.max(maxCur, maxSoFar)
        }
        return maxSoFar.toString()
    },
},
{
    name: 'Algorithmic Stock Trader II',
    solver: function (data) {
        var profit = 0
        for (var p = 1; p < data.length; ++p) {
            profit += Math.max(data[p] - data[p - 1], 0)
        }
        return profit.toString()
    },
},
{
    name: 'Algorithmic Stock Trader III',
    solver: function (data) {
        var hold1 = Number.MIN_SAFE_INTEGER
        var hold2 = Number.MIN_SAFE_INTEGER
        var release1 = 0
        var release2 = 0
        for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
            var price = data_1[_i]
            release2 = Math.max(release2, hold2 + price)
            hold2 = Math.max(hold2, release1 - price)
            release1 = Math.max(release1, hold1 + price)
            hold1 = Math.max(hold1, price * -1)
        }
        return release2.toString()
    },
},
{
    name: 'Algorithmic Stock Trader IV',
    solver: function (data) {
        var k = data[0]
        var prices = data[1]
        var len = prices.length
        if (len < 2) {
            return 0
        }
        if (k > len / 2) {
            var res = 0
            for (var i = 1; i < len; ++i) {
                res += Math.max(prices[i] - prices[i - 1], 0)
            }
            return res
        }
        var hold = []
        var rele = []
        hold.length = k + 1
        rele.length = k + 1
        for (var i = 0; i <= k; ++i) {
            hold[i] = Number.MIN_SAFE_INTEGER
            rele[i] = 0
        }
        var cur
        for (var i = 0; i < len; ++i) {
            cur = prices[i]
            for (var j = k; j > 0; --j) {
                rele[j] = Math.max(rele[j], hold[j] + cur)
                hold[j] = Math.max(hold[j], rele[j - 1] - cur)
            }
        }
        return rele[k].toString()
    },
},
{
    name: 'Minimum Path Sum in a Triangle',
    solver: function (data) {
        var n = data.length
        var dp = data[n - 1].slice()
        for (var i = n - 2; i > -1; --i) {
            for (var j = 0; j < data[i].length; ++j) {
                dp[j] = Math.min(dp[j], dp[j + 1]) + data[i][j]
            }
        }
        return dp[0]
    },
},
{
    name: 'Unique Paths in a Grid I',
    solver: function (data) {
        var n = data[0] // Number of rows
        var m = data[1] // Number of columns
        var currentRow = []
        currentRow.length = n
        for (var i = 0; i < n; i++) {
            currentRow[i] = 1
        }
        for (var row = 1; row < m; row++) {
            for (var i = 1; i < n; i++) {
                currentRow[i] += currentRow[i - 1]
            }
        }
        return currentRow[n - 1]
    },
},
{
    name: 'Unique Paths in a Grid II',
    solver: function (data) {
        var obstacleGrid = []
        obstacleGrid.length = data.length
        for (var i = 0; i < obstacleGrid.length; ++i) {
            obstacleGrid[i] = data[i].slice()
        }
        for (var i = 0; i < obstacleGrid.length; i++) {
            for (var j = 0; j < obstacleGrid[0].length; j++) {
                if (obstacleGrid[i][j] == 1) {
                    obstacleGrid[i][j] = 0
                } else if (i == 0 && j == 0) {
                    obstacleGrid[0][0] = 1
                } else {
                    obstacleGrid[i][j] = (i > 0 ? obstacleGrid[i - 1][j] : 0) + (j > 0 ? obstacleGrid[i][j - 1] : 0)
                }
            }
        }
        return obstacleGrid[obstacleGrid.length - 1][obstacleGrid[0].length - 1]
    },
},
{
    name: 'Sanitize Parentheses in Expression',
    solver: function (data) {
        var left = 0
        var right = 0
        var res = []
        for (var i = 0; i < data.length; ++i) {
            if (data[i] === '(') {
                ++left
            } else if (data[i] === ')') {
                left > 0 ? --left : ++right
            }
        }

        function dfs(pair, index, left, right, s, solution, res) {
            if (s.length === index) {
                if (left === 0 && right === 0 && pair === 0) {
                    for (var i = 0; i < res.length; i++) {
                        if (res[i] === solution) {
                            return
                        }
                    }
                    res.push(solution)
                }
                return
            }
            if (s[index] === '(') {
                if (left > 0) {
                    dfs(pair, index + 1, left - 1, right, s, solution, res)
                }
                dfs(pair + 1, index + 1, left, right, s, solution + s[index], res)
            } else if (s[index] === ')') {
                if (right > 0) dfs(pair, index + 1, left, right - 1, s, solution, res)
                if (pair > 0) dfs(pair - 1, index + 1, left, right, s, solution + s[index], res)
            } else {
                dfs(pair, index + 1, left, right, s, solution + s[index], res)
            }
        }
        dfs(0, 0, left, right, data, '', res)

        return res
    },
},
{
    name: 'Find All Valid Math Expressions',
    solver: function (data) {
        var num = data[0]
        var target = data[1]

        function helper(res, path, num, target, pos, evaluated, multed) {
            if (pos === num.length) {
                if (target === evaluated) {
                    res.push(path)
                }
                return
            }
            for (var i = pos; i < num.length; ++i) {
                if (i != pos && num[pos] == '0') {
                    break
                }
                var cur = parseInt(num.substring(pos, i + 1))
                if (pos === 0) {
                    helper(res, path + cur, num, target, i + 1, cur, cur)
                } else {
                    helper(res, path + '+' + cur, num, target, i + 1, evaluated + cur, cur)
                    helper(res, path + '-' + cur, num, target, i + 1, evaluated - cur, -cur)
                    helper(res, path + '*' + cur, num, target, i + 1, evaluated - multed + multed * cur, multed * cur)
                }
            }
        }

        if (num == null || num.length === 0) {
            return []
        }
        var result = []
        helper(result, '', num, target, 0, 0, 0)
        return result
    },
},
// --- New solvers added for v3.0.1 compatibility ---
{
    name: 'Array Jumping Game II',
    solver: function (data) {
        // Minimum number of jumps to reach the last index
        // data[i] = max jump length from position i
        var n = data.length
        if (n <= 1) return 0
        if (data[0] === 0) return -1 // impossible, but shouldn't happen in valid contracts
        var jumps = 0
        var currentEnd = 0
        var farthest = 0
        for (var i = 0; i < n - 1; ++i) {
            farthest = Math.max(farthest, i + data[i])
            if (i === currentEnd) {
                jumps++
                currentEnd = farthest
                if (currentEnd >= n - 1) break
            }
        }
        return jumps
    },
},
{
    name: 'Compression II: LZ Decompression',
    solver: function (data) {
        // Based on official Bitburner source - comprLZDecode
        // Format: alternating literal and backreference chunks
        // [literal_length][literal_chars][backref_length][backref_offset]...
        // length=0 means end of current chunk type
        var plain = "";
        var i = 0;
        while (i < data.length) {
            // Literal chunk
            var literal_length = data.charCodeAt(i) - 0x30; // parseInt
            if (literal_length < 0 || literal_length > 9 || i + 1 + literal_length > data.length) {
                return null; // Invalid
            }
            plain += data.substring(i + 1, i + 1 + literal_length);
            i += 1 + literal_length;
            if (i >= data.length) break;
            // Backreference chunk
            var backref_length = data.charCodeAt(i) - 0x30;
            if (backref_length < 0 || backref_length > 9) {
                return null; // Invalid
            } else if (backref_length === 0) {
                i++;
            } else {
                if (i + 1 >= data.length) return null;
                var backref_offset = data.charCodeAt(i + 1) - 0x30;
                if (backref_length > 0 && (backref_offset < 1 || backref_offset > 9)) {
                    return null;
                }
                if (backref_offset > plain.length) return null;
                for (var j = 0; j < backref_length; j++) {
                    plain += plain[plain.length - backref_offset];
                }
                i += 2;
            }
        }
        return plain;
    },
},
{
    name: 'Encryption II: Vigenère Cipher',
    solver: function (data) {
        // Based on official Bitburner source
        // data = [plaintext, keyword]
        // All chars are uppercase letters (A-Z), no spaces, no numbers
        // Official formula: ((charCode - 2*65 + keyCode) % 26) + 65
        var plaintext, key;
        if (Array.isArray(data)) {
            plaintext = data[0];
            key = data[1];
        } else {
            var spaceIdx = data.lastIndexOf(' ');
            plaintext = data.substring(0, spaceIdx);
            key = data.substring(spaceIdx + 1);
        }
        // Safety: if data contains non-uppercase chars, try alternative parsing
        if (!/^[A-Z]+$/.test(key)) {
            return null;
        }
        var cipher = "";
        for (var i = 0; i < plaintext.length; i++) {
            var a = plaintext.charCodeAt(i);
            if (a >= 65 && a <= 90) {
                cipher += String.fromCharCode(
                    ((a - 2 * 65 + key.charCodeAt(i % key.length)) % 26) + 65
                );
            } else {
                // Non-uppercase char, keep as-is
                cipher += plaintext[i];
            }
        }
        return cipher;
    },
},
{
    name: 'Proper 2-Coloring of a Graph',
    solver: function (data) {
        // data = [numVertices, edges] or just edges array
        // edges is array of [u, v] pairs
        // Result: array of 0/1 for each vertex, or [] if impossible
        var numVertices, edges
        if (Array.isArray(data[0]) && typeof data[0][0] === 'number' && !Array.isArray(data[0][0])) {
            numVertices = data[0]
            edges = data[1]
        } else if (typeof data[0] === 'number' && Array.isArray(data[1])) {
            // data = [numVertices, [...edges]]
            numVertices = data[0]
            edges = data[1]
        } else {
            // Just edges, need to figure out vertex count
            edges = data
            numVertices = 0
            for (var i = 0; i < edges.length; i++) {
                numVertices = Math.max(numVertices, edges[i][0], edges[i][1])
            }
            numVertices++
        }
        // BFS-based bipartite check and coloring
        var adj = []
        for (var i = 0; i < numVertices; i++) adj[i] = []
        for (var i = 0; i < edges.length; i++) {
            adj[edges[i][0]].push(edges[i][1])
            adj[edges[i][1]].push(edges[i][0])
        }
        var color = new Array(numVertices).fill(-1)
        for (var start = 0; start < numVertices; start++) {
            if (color[start] !== -1) continue
            color[start] = 0
            var queue = [start]
            var head = 0
            while (head < queue.length) {
                var u = queue[head++]
                for (var j = 0; j < adj[u].length; j++) {
                    var v = adj[u][j]
                    if (color[v] === -1) {
                        color[v] = 1 - color[u]
                        queue.push(v)
                    } else if (color[v] === color[u]) {
                        return [] // Not bipartite
                    }
                }
            }
        }
        return color.slice(0, numVertices)
    },
},
{
    name: 'Largest Rectangle in a Matrix',
    solver: function (data) {
        // Returns [[r1,c1],[r2,c2]] - corners of largest rectangle containing only 0s
        // Based on official Bitburner source
        const histograms = Array.from({ length: data.length }, () => Array(data[0].length).fill(0));
        for (let i = 0; i < data[0].length; i++) {
            let count = 0;
            for (let j = 0; j < data.length; j++) {
                if (data[j][i] == 0) {
                    count++;
                } else {
                    count = 0;
                }
                histograms[j][i] = count;
            }
        }
        let maxArea = 0;
        let maxL = 0, maxR = 0, maxU = 0, maxD = 0;
        for (let i = 0; i < histograms.length; i++) {
            const row = histograms[i];
            for (let j = 0; j < row.length; j++) {
                if (row[j] == 0) continue;
                let left = j, right = j;
                while (left - 1 >= 0 && row[left - 1] >= row[j]) left--;
                while (right + 1 < row.length && row[right + 1] >= row[j]) right++;
                if ((right - left + 1) * row[j] > maxArea) {
                    maxArea = (right - left + 1) * row[j];
                    maxL = left;
                    maxR = right;
                    maxU = i - row[j] + 1;
                    maxD = i;
                }
            }
        }
        return [[maxU, maxL], [maxD, maxR]];
    },
},
{
    name: 'Square Root',
    solver: function (data) {
        // Based on official Bitburner v3 source
        // data is a BigInt value (~200 digits), find floor(sqrt(data))
        var n;
        if (typeof data === 'bigint') {
            n = data;
        } else if (typeof data === 'string') {
            var str = data.startsWith('__BIGINT__') ? data.slice(10) : data;
            try { n = BigInt(str); } catch(e) { return null; }
        } else if (typeof data === 'number' && !isNaN(data) && isFinite(data)) {
            return Math.floor(Math.sqrt(data)).toString();
        } else {
            return null;
        }
        if (n < 0n) return null;
        if (n < 2n) return n.toString();
        // Binary search for integer square root - more reliable than Newton for BigInt
        var lo = 1n;
        var hi = n;
        while (lo <= hi) {
            var mid = (lo + hi) / 2n;
            var midSq = mid * mid;
            if (midSq === n) return mid.toString();
            if (midSq < n) {
                lo = mid + 1n;
            } else {
                hi = mid - 1n;
            }
        }
        // hi is now floor(sqrt(n))
        return hi.toString();
    },
},
{
    name: 'Total Primes in Range',
    solver: function (data) {
        var low = Number(data[0]);
        var high = Number(data[1]);
        if (high < 2) return 0;
        if (low < 2) low = 2;
        if (high <= 10000000) {
            var sieve = new Array(high + 1).fill(true);
            sieve[0] = sieve[1] = false;
            for (var i = 2; i * i <= high; i++) {
                if (sieve[i]) { for (var j = i * i; j <= high; j += i) sieve[j] = false; }
            }
            var count = 0;
            for (var i = low; i <= high; i++) { if (sieve[i]) count++; }
            return count;
        }
        var sqrtHigh = Math.ceil(Math.sqrt(high));
        var smallPrimes = [];
        var smallSieve = new Array(sqrtHigh + 1).fill(true);
        smallSieve[0] = smallSieve[1] = false;
        for (var i = 2; i <= sqrtHigh; i++) {
            if (smallSieve[i]) {
                smallPrimes.push(i);
                for (var j = i * i; j <= sqrtHigh; j += i) smallSieve[j] = false;
            }
        }
        var rangeSize = high - low + 1;
        var segment = new Array(rangeSize).fill(true);
        for (var p = 0; p < smallPrimes.length; p++) {
            var prime = smallPrimes[p];
            var start = Math.max(prime, Math.ceil(low / prime)) * prime;
            for (var j = start; j <= high; j += prime) segment[j - low] = false;
        }
        var count = 0;
        for (var i = 0; i < rangeSize; i++) { if (segment[i]) count++; }
        return count;
    },
},
{
    name: 'Total Number of Primes',
    solver: function (data) {
        var low = Number(data[0]);
        var high = Number(data[1]);
        if (high < 2) return 0;
        if (low < 2) low = 2;
        if (high <= 10000000) {
            var sieve = new Array(high + 1).fill(true);
            sieve[0] = sieve[1] = false;
            for (var i = 2; i * i <= high; i++) {
                if (sieve[i]) { for (var j = i * i; j <= high; j += i) sieve[j] = false; }
            }
            var count = 0;
            for (var i = low; i <= high; i++) { if (sieve[i]) count++; }
            return count;
        }
        var sqrtHigh = Math.ceil(Math.sqrt(high));
        var smallPrimes = [];
        var smallSieve = new Array(sqrtHigh + 1).fill(true);
        smallSieve[0] = smallSieve[1] = false;
        for (var i = 2; i <= sqrtHigh; i++) {
            if (smallSieve[i]) {
                smallPrimes.push(i);
                for (var j = i * i; j <= sqrtHigh; j += i) smallSieve[j] = false;
            }
        }
        var rangeSize = high - low + 1;
        var segment = new Array(rangeSize).fill(true);
        for (var p = 0; p < smallPrimes.length; p++) {
            var prime = smallPrimes[p];
            var start = Math.max(prime, Math.ceil(low / prime)) * prime;
            for (var j = start; j <= high; j += prime) segment[j - low] = false;
        }
        var count = 0;
        for (var i = 0; i < rangeSize; i++) { if (segment[i]) count++; }
        return count;
    },
},
{
    name: 'HammingCodes: Integer to Encoded Binary',
    solver: function (data) {
        // Based on official Bitburner source - HammingEncode
        // data is a number, encode as extended Hamming code
        var n = typeof data === 'bigint' ? data : BigInt(data);
        // Convert to binary string, reverse for LSB-first
        var data_bits = n.toString(2).split("").reverse().map(function(v) { return parseInt(v); });
        var k = data_bits.length;
        // Build encoded array with parity placeholders at power-of-2 positions
        var enc = [0];
        for (var i = 1; k > 0; i++) {
            if ((i & (i - 1)) !== 0) {
                enc[i] = data_bits[--k];
            } else {
                enc[i] = 0;
            }
        }
        // Calculate subsection parities
        var parityNumber = 0;
        for (var i = 0; i < enc.length; i++) {
            if (enc[i]) parityNumber ^= i;
        }
        var parityArray = parityNumber.toString(2).split("").reverse().map(function(v) { return parseInt(v); });
        for (var i = 0; i < parityArray.length; i++) {
            enc[Math.pow(2, i)] = parityArray[i] ? 1 : 0;
        }
        // Calculate overall parity
        parityNumber = 0;
        for (var i = 0; i < enc.length; i++) {
            if (enc[i]) parityNumber++;
        }
        enc[0] = parityNumber % 2 === 0 ? 0 : 1;
        return enc.join("");
    },
},
{
    name: 'Encryption I: Caesar Cipher',
    solver: function (data) {
        // data = [plaintext, shift]
        // Caesar cipher: shift each letter left by shift amount
        var plaintext = data[0];
        var shift = data[1];
        var cipher = "";
        for (var i = 0; i < plaintext.length; i++) {
            var a = plaintext.charCodeAt(i);
            if (a === 32) {
                cipher += " ";
            } else {
                cipher += String.fromCharCode(((a - 65 - shift + 26) % 26) + 65);
            }
        }
        return cipher;
    },
},
{
    name: 'Compression I: RLE Compression',
    solver: function (data) {
        if (!data || data.length === 0) return '';
        var result = '';
        var count = 1;
        for (var i = 1; i < data.length; i++) {
            if (data[i] === data[i - 1]) {
                count++;
            } else {
                result += count + data[i - 1];
                count = 1;
            }
        }
        result += count + data[data.length - 1];
        return result;
    },
},
{
    name: 'Shortest Path in a Grid',
    solver: function (data) {
        // data is a 2D grid (array of arrays with 0/1)
        // 0 = open, 1 = wall
        // Find shortest path from top-left to bottom-right
        // Return as a string of moves: D=down, R=right, U=up, L=left
        var grid = data;
        var rows = grid.length;
        var cols = grid[0].length;

        if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return '';

        // BFS
        var dist = [];
        var parent = [];
        for (var i = 0; i < rows; i++) {
            dist[i] = new Array(cols).fill(-1);
            parent[i] = new Array(cols).fill(null);
        }
        dist[0][0] = 0;
        var queue = [[0, 0]];
        var head = 0;
        var dirs = [['D', 1, 0], ['R', 0, 1], ['U', -1, 0], ['L', 0, -1]];

        while (head < queue.length) {
            var cur = queue[head++];
            if (cur[0] === rows - 1 && cur[1] === cols - 1) break;
            for (var d = 0; d < dirs.length; d++) {
                var nr = cur[0] + dirs[d][1];
                var nc = cur[1] + dirs[d][2];
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0 && dist[nr][nc] === -1) {
                    dist[nr][nc] = dist[cur[0]][cur[1]] + 1;
                    parent[nr][nc] = [cur[0], cur[1], dirs[d][0]];
                    queue.push([nr, nc]);
                }
            }
        }

        // Reconstruct path
        if (dist[rows - 1][cols - 1] === -1) return '';
        var path = [];
        var cr = rows - 1, cc = cols - 1;
        while (cr !== 0 || cc !== 0) {
            var p = parent[cr][cc];
            path.push(p[2]);
            cr = p[0];
            cc = p[1];
        }
        path.reverse();
        return path.join('');
    },
},
{
    name: 'Compression III: LZ Compression',
    solver: function (data) {
        // Based on official Bitburner comprLZEncode
        // Format: alternating literal and backreference chunks
        // [literal_length][literal_chars][backref_length][backref_offset]...
        // backref_length=0 means no backref (separator between literals)
        if (!data || data.length === 0) return '';
        var compressed = '';
        var decoded = '';
        var pos = 0;
        while (pos < data.length) {
            var litChars = '';
            var backLenFound = 0;
            var backOffFound = 0;
            while (pos + litChars.length < data.length) {
                var testDecoded = decoded + litChars;
                var bestBL = 0;
                var bestBO = 0;
                var matchStart = pos + litChars.length;
                if (litChars.length > 0) {
                    for (var off = 1; off <= Math.min(9, testDecoded.length); off++) {
                        var fl = 0;
                        while (fl < 9 && matchStart + fl < data.length) {
                            var srcIdx = testDecoded.length - off + (fl % off);
                            if (srcIdx < 0 || srcIdx >= testDecoded.length) break;
                            if (data[matchStart + fl] === testDecoded[srcIdx]) fl++;
                            else break;
                        }
                        if (fl > bestBL) { bestBL = fl; bestBO = off; }
                    }
                }
                if (bestBL >= 3) { backLenFound = bestBL; backOffFound = bestBO; break; }
                if (litChars.length >= 9) break;
                litChars += data[pos + litChars.length];
            }
            if (litChars.length === 0) litChars = data[pos];
            pos += litChars.length;
            decoded += litChars;
            compressed += String(litChars.length) + litChars;
            if (pos >= data.length) break;
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
        return compressed;
    },
}]
