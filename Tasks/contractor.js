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
    const plain = input;
    // DP approach matching the official Bitburner implementation
    // state[i][j]: i=0 means literal of length j, i>0 means backref offset i, length j
    let cur_state = Array.from({length:10}, () => Array(10).fill(null));
    let new_state = Array.from({length:10}, () => Array(10).fill(null));

    const set = (state, i, j, str) => {
      const current = state[i][j];
      if (current == null || str.length < current.length) {
        state[i][j] = str;
      } else if (str.length === current.length && Math.random() < 0.5) {
        state[i][j] = str;
      }
    };

    // initial state: literal of length 1
    cur_state[0][1] = "";

    for (let i = 1; i < plain.length; ++i) {
      for (const row of new_state) row.fill(null);
      const c = plain[i];

      // handle literals
      for (let length = 1; length <= 9; ++length) {
        const string = cur_state[0][length];
        if (string == null) continue;

        if (length < 9) {
          set(new_state, 0, length + 1, string);
        } else {
          set(new_state, 0, 1, string + "9" + plain.substring(i - 9, i) + "0");
        }

        for (let offset = 1; offset <= Math.min(9, i); ++offset) {
          if (plain[i - offset] === c) {
            set(new_state, offset, 1, string + String(length) + plain.substring(i - length, i));
          }
        }
      }

      // handle backreferences
      for (let offset = 1; offset <= 9; ++offset) {
        for (let length = 1; length <= 9; ++length) {
          const string = cur_state[offset][length];
          if (string == null) continue;

          if (plain[i - offset] === c) {
            if (length < 9) {
              set(new_state, offset, length + 1, string);
            } else {
              set(new_state, offset, 1, string + "9" + String(offset) + "0");
            }
          }

          set(new_state, 0, 1, string + String(length) + String(offset));

          for (let new_offset = 1; new_offset <= Math.min(9, i); ++new_offset) {
            if (plain[i - new_offset] === c) {
              set(new_state, new_offset, 1, string + String(length) + String(offset) + "0");
            }
          }
        }
      }

      const tmp = new_state;
      new_state = cur_state;
      cur_state = tmp;
    }

    let result = null;
    for (let len = 1; len <= 9; ++len) {
      let string = cur_state[0][len];
      if (string == null) continue;
      string += String(len) + plain.substring(plain.length - len, plain.length);
      if (result == null || string.length < result.length) {
        result = string;
      } else if (string.length === result.length && Math.random() < 0.5) {
        result = string;
      }
    }
    for (let offset = 1; offset <= 9; ++offset) {
      for (let len = 1; len <= 9; ++len) {
        let string = cur_state[offset][len];
        if (string == null) continue;
        string += String(len) + "" + String(offset);
        if (result == null || string.length < result.length) {
          result = string;
        } else if (string.length === result.length && Math.random() < 0.5) {
          result = string;
        }
      }
    }
    return result ?? "";
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

  // === Unique Paths in a Grid I ===
  if (type === "Unique Paths in a Grid I") {
    let n = input[0], m = input[1];
    let cr = new Array(n).fill(1);
    for (let row = 1; row < m; row++)
      for (let i = 1; i < n; i++)
        cr[i] += cr[i - 1];
    return cr[n - 1];
  }

  // === Unique Paths in a Grid II ===
  if (type === "Unique Paths in a Grid II") {
    let og = input.map(r => r.slice());
    for (let i = 0; i < og.length; i++)
      for (let j = 0; j < og[0].length; j++) {
        if (og[i][j] === 1) og[i][j] = 0;
        else if (i === 0 && j === 0) og[0][0] = 1;
        else og[i][j] = (i > 0 ? og[i - 1][j] : 0) + (j > 0 ? og[i][j - 1] : 0);
      }
    return og[og.length - 1][og[0].length - 1];
  }

  // === Algorithmic Stock Trader II ===
  if (type === "Algorithmic Stock Trader II") {
    let p = 0;
    for (let i = 1; i < input.length; i++)
      p += Math.max(input[i] - input[i - 1], 0);
    return p.toString();
  }

  // === Generate IP Addresses ===
  if (type === "Generate IP Addresses") {
    let ret = [];
    let d = input;
    for (let a = 1; a <= 3; a++)
      for (let b = 1; b <= 3; b++)
        for (let c = 1; c <= 3; c++)
          for (let x = 1; x <= 3; x++) {
            if (a + b + c + x === d.length) {
              let A = parseInt(d.substring(0, a), 10);
              let B = parseInt(d.substring(a, a + b), 10);
              let C = parseInt(d.substring(a + b, a + b + c), 10);
              let D = parseInt(d.substring(a + b + c, a + b + c + x), 10);
              if (A <= 255 && B <= 255 && C <= 255 && D <= 255) {
                let ip = [A.toString(), '.', B.toString(), '.', C.toString(), '.', D.toString()].join('');
                if (ip.length === d.length + 3) ret.push(ip);
              }
            }
          }
    return ret;
  }

  // === Spiralize Matrix ===
  if (type === "Spiralize Matrix") {
    let s = [];
    let m = input.length, n = input[0].length;
    let u = 0, df = m - 1, l = 0, r = n - 1, k = 0;
    while (true) {
      for (let c = l; c <= r; c++) { s[k] = input[u][c]; k++; }
      if (++u > df) break;
      for (let row = u; row <= df; row++) { s[k] = input[row][r]; k++; }
      if (--r < l) break;
      for (let c = r; c >= l; c--) { s[k] = input[df][c]; k++; }
      if (--df < u) break;
      for (let row = df; row >= u; row--) { s[k] = input[row][l]; k++; }
      if (++l > r) break;
    }
    return s;
  }

  // === Total Number of Primes ===
  if (type === "Total Number of Primes") {
    let low = Number(input[0]), high = Number(input[1]);
    if (high < 2) return 0;
    if (low < 2) low = 2;
    let s = new Array(high + 1).fill(true);
    s[0] = s[1] = false;
    for (let i = 2; i * i <= high; i++)
      if (s[i])
        for (let j = i * i; j <= high; j += i) s[j] = false;
    let c = 0;
    for (let i = low; i <= high; i++) if (s[i]) c++;
    return c;
  }

  // === Subarray with Maximum Sum ===
  if (type === "Subarray with Maximum Sum") {
    let a = input.slice();
    for (let i = 1; i < a.length; i++)
      a[i] = Math.max(a[i], a[i] + a[i - 1]);
    return Math.max.apply(Math, a);
  }

  // === Encryption II: Vigenère Cipher ===
  if (type === "Encryption II: Vigenère Cipher") {
    let pt, key;
    if (Array.isArray(input)) { pt = input[0]; key = input[1]; }
    else { let si = input.lastIndexOf(' '); pt = input.substring(0, si); key = input.substring(si + 1); }
    let r = '';
    for (let i = 0; i < pt.length; i++) {
      let a = pt.charCodeAt(i);
      if (a >= 65 && a <= 90)
        r += String.fromCharCode(((a - 2 * 65 + key.charCodeAt(i % key.length)) % 26) + 65);
      else r += pt[i];
    }
    return r;
  }

  // === Array Jumping Game ===
  if (type === "Array Jumping Game") {
    let n = input.length, i = 0, r = 0;
    for (; i < n && i <= r; i++) r = Math.max(i + input[i], r);
    return i === n ? 1 : 0;
  }

  // === HammingCodes: Integer to Encoded Binary ===
  if (type === "HammingCodes: Integer to Encoded Binary") {
    let n = typeof input === 'bigint' ? input : BigInt(input);
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

  // === Shortest Path in a Grid ===
  if (type === "Shortest Path in a Grid") {
    let g = input, rows = g.length, cols = g[0].length;
    if (g[0][0] === 1 || g[rows - 1][cols - 1] === 1) return '';
    let dist = [], parent = [];
    for (let i = 0; i < rows; i++) {
      dist[i] = new Array(cols).fill(-1);
      parent[i] = new Array(cols).fill(null);
    }
    dist[0][0] = 0;
    let q = [[0, 0]], h = 0;
    let dirs = [['D', 1, 0], ['R', 0, 1], ['U', -1, 0], ['L', 0, -1]];
    while (h < q.length) {
      let cur = q[h++];
      if (cur[0] === rows - 1 && cur[1] === cols - 1) break;
      for (let x = 0; x < dirs.length; x++) {
        let nr = cur[0] + dirs[x][1], nc = cur[1] + dirs[x][2];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && g[nr][nc] === 0 && dist[nr][nc] === -1) {
          dist[nr][nc] = dist[cur[0]][cur[1]] + 1;
          parent[nr][nc] = [cur[0], cur[1], dirs[x][0]];
          q.push([nr, nc]);
        }
      }
    }
    if (dist[rows - 1][cols - 1] === -1) return '';
    let path = [], cr = rows - 1, cc = cols - 1;
    while (cr !== 0 || cc !== 0) {
      let p = parent[cr][cc];
      path.push(p[2]); cr = p[0]; cc = p[1];
    }
    path.reverse();
    return path.join('');
  }

  // === Total Ways to Sum ===
  if (type === "Total Ways to Sum") {
    let d = input;
    let w = new Array(d + 1).fill(0);
    w[0] = 1;
    for (let i = 1; i < d; i++)
      for (let j = i; j <= d; j++)
        w[j] += w[j - i];
    return w[d];
  }

  // === Total Ways to Sum II ===
  if (type === "Total Ways to Sum II") {
    let n = Number(input[0]), a = input[1];
    if (isNaN(n) || n < 0) return null;
    if (!Array.isArray(a)) return null;
    if (n === 0) return 1;
    if (a.length === 0) return 0;
    a = a.filter(x => typeof x === 'number' && x > 0 && x <= n).sort((x, y) => x - y);
    if (a.length === 0) return 0;
    let w = new Array(n + 1).fill(0);
    w[0] = 1;
    for (let i = 0; i < a.length; i++)
      for (let j = a[i]; j <= n; j++)
        w[j] += w[j - a[i]];
    return w[n];
  }

  // === Algorithmic Stock Trader I ===
  if (type === "Algorithmic Stock Trader I") {
    let p = input.map(Number);
    let mc = 0, ms = 0;
    for (let i = 1; i < p.length; i++) {
      mc = Math.max(0, mc += p[i] - p[i - 1]);
      ms = Math.max(mc, ms);
    }
    return ms.toString();
  }

  // === Algorithmic Stock Trader III ===
  if (type === "Algorithmic Stock Trader III") {
    let h1 = -Infinity, h2 = -Infinity, r1 = 0, r2 = 0;
    for (let i = 0; i < input.length; i++) {
      let price = input[i];
      r2 = Math.max(r2, h2 + price);
      h2 = Math.max(h2, r1 - price);
      r1 = Math.max(r1, h1 + price);
      h1 = Math.max(h1, -price);
    }
    return r2.toString();
  }

  // === Algorithmic Stock Trader IV ===
  if (type === "Algorithmic Stock Trader IV") {
    let k = Number(input[0]), pr = input[1], len = pr.length;
    if (len < 2) return 0;
    if (k > len / 2) {
      let res = 0;
      for (let i = 1; i < len; i++) res += Math.max(pr[i] - pr[i - 1], 0);
      return res;
    }
    let hold = new Array(k + 1).fill(-Infinity);
    let rele = new Array(k + 1).fill(0);
    for (let i = 0; i < len; i++) {
      let cur = pr[i];
      for (let j = k; j > 0; j--) {
        rele[j] = Math.max(rele[j], hold[j] + cur);
        hold[j] = Math.max(hold[j], rele[j - 1] - cur);
      }
    }
    return rele[k].toString();
  }

  // === Encryption I: Caesar Cipher ===
  if (type === "Encryption I: Caesar Cipher") {
    let pt = input[0], sh = input[1], r = '';
    for (let i = 0; i < pt.length; i++) {
      let a = pt.charCodeAt(i);
      if (a === 32) r += ' ';
      else r += String.fromCharCode(((a - 65 - sh + 26) % 26) + 65);
    }
    return r;
  }

  // === Minimum Path Sum in a Triangle ===
  if (type === "Minimum Path Sum in a Triangle") {
    let n = input.length;
    let dp = input[n - 1].slice();
    for (let i = n - 2; i > -1; i--)
      for (let j = 0; j < input[i].length; j++)
        dp[j] = Math.min(dp[j], dp[j + 1]) + input[i][j];
    return dp[0];
  }

  // === Compression II: LZ Decompression ===
  if (type === "Compression II: LZ Decompression") {
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

  // === Find All Valid Math Expressions ===
  if (type === "Find All Valid Math Expressions") {
    let num = input[0], target = input[1];
    let result = [];
    function helper(res, path, s, tar, pos, eva, mult) {
      if (pos === s.length) {
        if (tar === eva) res.push(path);
        return;
      }
      for (let i = pos; i < s.length; i++) {
        if (i !== pos && s[pos] === '0') break;
        let cur = parseInt(s.substring(pos, i + 1));
        if (pos === 0) helper(res, path + cur, s, tar, i + 1, cur, cur);
        else {
          helper(res, path + '+' + cur, s, tar, i + 1, eva + cur, cur);
          helper(res, path + '-' + cur, s, tar, i + 1, eva - cur, -cur);
          helper(res, path + '*' + cur, s, tar, i + 1, eva - mult + mult * cur, mult * cur);
        }
      }
    }
    helper(result, '', num, target, 0, 0, 0);
    return result;
  }

  // === Merge Overlapping Intervals ===
  if (type === "Merge Overlapping Intervals") {
    let iv = input.slice();
    iv.sort((a, b) => a[0] - b[0]);
    let res = [];
    let s2 = iv[0][0], e = iv[0][1];
    for (let i = 0; i < iv.length; i++) {
      if (iv[i][0] <= e) e = Math.max(e, iv[i][1]);
      else { res.push([s2, e]); s2 = iv[i][0]; e = iv[i][1]; }
    }
    res.push([s2, e]);
    return res;
  }

  // === Proper 2-Coloring of a Graph ===
  if (type === "Proper 2-Coloring of a Graph") {
    let nv, edges;
    if (Array.isArray(input[0]) && typeof input[0][0] === 'number' && !Array.isArray(input[0][0])) {
      nv = input[0]; edges = input[1];
    } else if (typeof input[0] === 'number' && Array.isArray(input[1])) {
      nv = input[0]; edges = input[1];
    } else {
      edges = input; nv = 0;
      for (let i = 0; i < edges.length; i++) nv = Math.max(nv, edges[i][0], edges[i][1]);
      nv++;
    }
    let adj = [];
    for (let i = 0; i < nv; i++) adj[i] = [];
    for (let i = 0; i < edges.length; i++) {
      adj[edges[i][0]].push(edges[i][1]);
      adj[edges[i][1]].push(edges[i][0]);
    }
    let color = new Array(nv).fill(-1);
    for (let s = 0; s < nv; s++) {
      if (color[s] !== -1) continue;
      color[s] = 0;
      let q = [s], h = 0;
      while (h < q.length) {
        let u = q[h++];
        for (let j = 0; j < adj[u].length; j++) {
          let v = adj[u][j];
          if (color[v] === -1) { color[v] = 1 - color[u]; q.push(v); }
          else if (color[v] === color[u]) return [];
        }
      }
    }
    return color.slice(0, nv);
  }

  // === Sanitize Parentheses in Expression ===
  if (type === "Sanitize Parentheses in Expression") {
    let d = input;
    let l = 0, r = 0, res = [];
    for (let i = 0; i < d.length; i++) {
      if (d[i] === '(') ++l;
      else if (d[i] === ')') l > 0 ? --l : ++r;
    }
    function dfs(p, idx, cl, cr, s, sol) {
      if (s.length === idx) {
        if (cl === 0 && cr === 0 && p === 0) {
          for (let i = 0; i < res.length; i++) if (res[i] === sol) return;
          res.push(sol);
        }
        return;
      }
      if (s[idx] === '(') {
        if (cl > 0) dfs(p, idx + 1, cl - 1, cr, s, sol);
        dfs(p + 1, idx + 1, cl, cr, s, sol + s[idx]);
      } else if (s[idx] === ')') {
        if (cr > 0) dfs(p, idx + 1, cl, cr - 1, s, sol);
        if (p > 0) dfs(p - 1, idx + 1, cl, cr, s, sol + s[idx]);
      } else {
        dfs(p, idx + 1, cl, cr, s, sol + s[idx]);
      }
    }
    dfs(0, 0, l, r, d, '');
    return res;
  }

  // === Find Largest Prime Factor ===
  if (type === "Find Largest Prime Factor") {
    let n = input;
    if (typeof n === 'bigint') {
      let f = 2n;
      while (n > (f - 1n) * (f - 1n)) { while (n % f === 0n) n = n / f; ++f; }
      return (n === 1n ? f - 1n : n).toString();
    }
    let f = 2;
    while (n > (f - 1) * (f - 1)) {
      while (n % f === 0) n = Math.round(n / f);
      ++f;
    }
    return (n === 1 ? f - 1 : n).toString();
  }

  // === HammingCodes: Encoded Binary to Integer ===
  // SECDED: matches game's HammingDecode function exactly
  if (type === "HammingCodes: Encoded Binary to Integer") {
    const bits = input.trim().split('').map(v => parseInt(v));
    const n = bits.length;
    // Compute error position: XOR of ALL indices (including bit 0) where bit is 1
    let err = 0;
    for (let i = 0; i < n; i++) {
      if (bits[i]) err ^= i;
    }
    // If err != 0, the bit at position err was flipped — correct it
    if (err) {
      bits[err] = bits[err] ? 0 : 1;
    }
    // Extract data bits: non-power-of-2 positions, excluding bit 0
    // Data is stored with flipped endianness (LSB first), so we read in natural order
    let ans = "";
    for (let i = 1; i < n; i++) {
      if ((i & (i - 1)) !== 0) {
        ans += bits[i];
      }
    }
    return parseInt(ans, 2);
  }

  // === HammingCodes: Integer to Encoded Binary ===
  // SECDED: bit[0] = overall even parity, bits[2^k] = parity checks (0-indexed)
  if (type === "HammingCodes: Integer to Encoded Binary") {
    let val = BigInt(input);
    // Game reverses data bits before encoding (flipped endianness)
    let dataBin = val.toString(2).split('').reverse().map(b => parseInt(b));
    let m = dataBin.length;
    let r = 1;
    while (Math.pow(2, r) < m + r + 1) r++;
    let n = m + r + 1; // +1 for overall parity bit at index 0
    let enc = new Array(n).fill(0);
    // Place data bits at non-power-of-2 positions (0-indexed, skipping bit 0)
    let di = 0;
    for (let i = 1; i < n; i++) {
      if ((i & (i - 1)) !== 0) { // not a power of 2
        enc[i] = di < m ? dataBin[di] : 0;
        di++;
      }
    }
    // Compute parity bits at power-of-2 positions (1, 2, 4, 8, ...)
    for (let p = 1; p < n; p <<= 1) {
      let parity = 0;
      for (let i = 1; i < n; i++) {
        if (i & p) parity ^= enc[i];
      }
      enc[p] = parity;
    }
    // Compute overall even parity bit at index 0
    let total = 0;
    for (let i = 1; i < n; i++) total ^= enc[i];
    enc[0] = total; // makes total parity even
    return enc.join('');
  }

  return null;
}

/** @param {NS} ns */
export async function main(ns) {
  // Start with home + darkweb (darkweb not reachable via ns.scan from home)
  let allServers = new Set(["home", "darkweb"]);
  let queue = ["home", "darkweb"];

  // Scan normal network from home + darkweb
  while (queue.length > 0) {
    let host = queue.pop();
    try {
      for (let n of ns.scan(host)) {
        if (!allServers.has(n)) {
          allServers.add(n);
          queue.push(n);
        }
      }
    } catch (e) { /* darkweb might not be scannable, skip */ }
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

  // ns.tprint(`Done. Total: ${total}, Solved: ${solved}, Failed: ${failed}`);
}
