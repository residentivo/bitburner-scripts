/**
 * darknet.js — Darknet helper (loop mode, auto-propagate)
 * Loops every 1s:
 *   - Check if already running (skip spawn if so)
 *   - Free RAM (memoryReallocation)
 *   - Probe neighbors
 *   - Auth (skip if hasSession), scp+exec propagate
 *   - Run extractor locally
 */

const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR = 'darknet-extractor.js'

const commonPasswords = [
    '', 'password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest',
    'root', 'toor', 'daemon', 'sys', 'adm', 'bin', 'superuser', 'operator',
    'server', 'system', 'changeit', 'changeme', 'mysql', 'postgres', 'oracle',
    'cisco', 'public', 'private', 'blank', 'none', 'null',
    'pass123', 'admin123', 'root123', 'abc123', 'passw0rd',
    'web', 'www', 'ftp', 'ssh', 'telnet',
    'open', 'login', 'unlock', 'access', 'secret',
    'test', 'user', 'demo', 'temp', 'backup',
    '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
    '00000', '11111', '12345', '54321',
    'pass', 'god', 'love', 'master', 'dragon', 'monkey', 'shadow', 'sunshine',
    'princess', 'football', 'baseball', 'trustno1', 'iloveyou', 'welcome',
    'hello', 'charlie', 'donald', 'michael', 'jessica', 'jennifer',
]

const mountainPasswords = [
    '8848', '8849', '8848.86', '29029', '29032', '29035', '29028', '8848m', '8850',
    'everest', 'EVEREST', 'Everest', 'mt-everest', 'mt_everest', 'mteverest',
    'sagarmatha', 'Sagarmatha', 'SAGARMATHA',
    'chomolungma', 'Chomolungma', 'CHOMOLUNGMA',
    'summit', 'SUMMIT', 'Summit',
    'peak', 'PEAK', 'Peak',
    'top', 'TOP', 'Top',
    'ascend', 'ASCEND', 'Ascend',
    'mountain', 'MOUNTAIN', 'Mountain',
    'climb', 'CLIMB', 'Climb',
    'high', 'HIGH', 'High',
    'highest', 'HIGHEST', 'Highest',
    'basecamp', 'Basecamp', 'BASECAMP',
    'hillary', 'Hillary', 'HILLARY', 'tensing', 'norgay',
    'nepal', 'Nepal', 'NEPAL',
    'tibet', 'Tibet', 'TIBET',
    '29029ft', 'k2', 'K2', 'kanchenjunga', 'lhotse', 'makalu',
    'chooyu', 'dhaulagiri', 'manaslu', 'nandadevi', 'annapurna',
    'gasherbrum', 'broadpeak', 'shishapangma',
    'fuji', 'denali', 'matterhorn', 'kilimanjaro', 'aconcagua',
    'olympos', 'olympus',
]

const extendedPasswords = [
    ...commonPasswords,
    ...mountainPasswords,
]

// Generate all permutations of a string (for "shuffled" / "sorted" hints)
function permutations(str) {
    if (str.length <= 1) return [str]
    const results = []
    for (let i = 0; i < str.length; i++) {
        const char = str[i]
        const remaining = str.slice(0, i) + str.slice(i + 1)
        for (const perm of permutations(remaining)) {
            results.push(char + perm)
        }
    }
    // Deduplicate
    return [...new Set(results)]
}

function log(ns, msg) {
    ns.print(`[dnet] ${msg}`)
}

async function logFail(ns, server, reason, hint = '') {
    const key = `${server}|${reason}|`
    const line = `${key}${hint}\n`
    const file = '/darknet-failures.txt'
    try {
        let existing = ns.read(file) || ''
        try {
            await ns.scp(file, ns.getHostname(), 'home')
            existing = ns.read(file) || existing
        } catch (e) { /* home not reachable yet */ }

        if (!existing.includes(key)) {
            const merged = existing + line
            await ns.write(file, merged, 'w')
            try {
                await ns.scp(file, 'home')
            } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
}

function solvePassword(hint, hintData, hostname = '') {
    if (!hint) return []
    const h = hint.toLowerCase()
    const hostCandidates = hostname ? [hostname, hostname.toLowerCase(), hostname.replace(/[^a-zA-Z0-9]/g, '')] : []

    // Direct extraction: "key is X", "password is X", "pin is X", "it's set to X"
    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(?:is\s+)?(\w+)/i)
    if (keyMatch && keyMatch[1]) {
        const val = keyMatch[1].toLowerCase()
        if (!['is', 'the', 'a', 'an', 'not', 'still', 'empty', 'to', 'set', 'divisible', 'made'].includes(val)) {
            return [keyMatch[1]]
        }
    }

    // "The key is made from N" — N might be a perfect square, or try N itself as password
    const madeMatch = hint.match(/(?:made|built|created|formed)\s+(?:from|out of|with)\s+(\d+)/i)
    if (madeMatch) {
        const n = parseInt(madeMatch[1])
        const candidates = [String(n)]
        // Perfect square?
        const sqrt = Math.sqrt(n)
        if (Number.isInteger(sqrt)) candidates.push(String(sqrt))
        // Try prime factorization combos
        const digits = String(n).split('')
        candidates.push(...permutations(String(n)))
        // Common math
        candidates.push(String(Math.floor(n / 2)), String(n * 2), String(n + 1), String(n - 1))
        return [...new Set([...candidates, ...hostCandidates, ...commonPasswords])]
    }

    // "PIN X" or "The PIN is X" or "PIN uses X" or "PIN: X"
    const pinMatch = hint.match(/pin\s+(?:is|uses|:|=\s*)(\d+)/i) || hint.match(/pin\s*[:=]?\s*(\d+)/i)
    if (pinMatch && pinMatch[1]) {
        const pin = pinMatch[1]
        const candidates = [pin]
        // "PIN uses 224" — try 224 and permutations
        if (h.includes('use')) {
            candidates.push(...permutations(pin))
        }
        return [...new Set(candidates)]
    }

    // "The password is shuffled NNN" — all permutations
    const shuffledMatch = hint.match(/shuffled\s+(\d+)/i)
    if (shuffledMatch) {
        return [...new Set(permutations(shuffledMatch[1]))]
    }

    // "I accidentally sorted the password: NNN" — unsort = all permutations
    const sortedMatch = hint.match(/sorted\s+(?:the\s+)?(?:password|pin)?\s*[:=]?\s*(\d+)/i)
    if (sortedMatch) {
        return [...new Set(permutations(sortedMatch[1]))]
    }

    // "There is no password"
    if (h.includes('no password') || h.includes('there is no')) return ['', ...commonPasswords]

    // Roman numeral
    const romanMatch = hint.match(/value of the number ['"]?([IVXLCDM]+)['"]?/i)
    if (romanMatch) {
        const roman = romanMatch[1].toUpperCase()
        const rv = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
        let num = 0
        for (let i = 0; i < roman.length; i++) {
            const val = rv[roman[i]] || 0
            const next = (i + 1 < roman.length) ? (rv[roman[i + 1]] || 0) : 0
            num += (val < next) ? -val : val
        }
        return [String(num)]
    }

    // Default / factory / never changed / didn't set
    if (h.includes('default') || h.includes('factory') || h.includes('never changed') ||
        h.includes("didn't change") || h.includes("didn't set") || h.includes("did i set") ||
        h.includes('still') || h.includes('original') || h.includes('no password') ||
        h.includes('not set'))
        return [...new Set([...hostCandidates, '', ...commonPasswords])]

    // Buffer length: "Warning: password buffer is N bytes"
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        // Generate all common passwords of exactly this length + brute force numeric
        const candidates = [...hostCandidates]
        // Add all common passwords of this length
        for (const pw of commonPasswords) {
            if (pw.length === len) candidates.push(pw)
        }
        // Add all numbers of this length
        if (len <= 6) {
            const min = Math.pow(10, len - 1)
            const max = Math.pow(10, len) - 1
            // Don't brute force too many — limit to 200
            if (max - min <= 200) {
                for (let i = min; i <= max; i++) candidates.push(String(i))
            } else {
                // Just try common patterns of this length
                candidates.push(String(min), String(max), '0'.repeat(len), '9'.repeat(len))
                candidates.push('1'.repeat(len), '123456'.substring(0, len))
            }
        }
        // Special: len 5 → try 5-digit numbers
        if (len === 5) {
            candidates.push('12345', '54321', '11111', '00000', '99999')
        }
        if (len === 6) {
            candidates.push('123456', '654321', '111111', '000000', '999999')
        }
        if (len === 7) {
            candidates.push('1234567', '7654321', '1111111', '0000000', '9999999')
        }
        return [...new Set(candidates)]
    }

    // "Remember to use X"
    if (!h.includes('prove you are human') && !h.includes('captcha')) {
        const useMatch = hint.match(/(?:use|enter|input)\s+(\w+)/i)
        if (useMatch && useMatch[1]) return [useMatch[1]]
    }

    // Base conversion: "base N number X in base 10" — X can include hex digits (A-F)
    const baseMatch = hint.match(/base\s+(\d+)\s+number\s+([0-9A-Fa-f]+)/i)
    if (baseMatch) {
        const base = parseInt(baseMatch[1])
        const numStr = baseMatch[2]
        let result = 0
        for (let i = 0; i < numStr.length; i++) {
            const ch = numStr[i].toUpperCase()
            const digit = ch >= 'A' && ch <= 'F' ? ch.charCodeAt(0) - 55 : parseInt(ch)
            result = result * base + digit
        }
        return [String(result)]
    }

    // "the password is ... in base 10" with data like "16,7C"
    if (h.includes('base 10') && hintData) {
        const parts = hintData.split(',').map(s => s.trim())
        if (parts.length === 2) {
            const base = parseInt(parts[0])
            const numStr = parts[1]
            if (base > 1 && numStr.length > 0) {
                let result = 0
                for (let i = 0; i < numStr.length; i++) {
                    const ch = numStr[i].toUpperCase()
                    const digit = ch >= 'A' && ch <= 'F' ? ch.charCodeAt(0) - 55 : parseInt(ch)
                    result = result * base + digit
                }
                return [String(result)]
            }
        }
    }

    // "divisible by X" — massive expansion
    const divMatch = hint.match(/divisible\s+by\s+(\d+)/i)
    if (divMatch) {
        const divBy = parseInt(divMatch[1])
        const candidates = [...hostCandidates]
        if (divBy === 1) {
            // Every number is divisible by 1 — brute force 0-9999
            for (let i = 0; i <= 9999; i++) candidates.push(String(i))
            // Plus common longer numbers
            candidates.push('12345', '54321', '123456', '654321', '1234567', '7777777')
        } else {
            for (let i = 0; i <= 1000; i++) candidates.push(String(divBy * i))
        }
        // Plus word passwords (some servers accept words)
        candidates.push(...commonPasswords)
        return [...new Set(candidates)]
    }

    // Range: "number between X and Y" or "a number between X and Y"
    const rangeMatch = hint.match(/(?:a\s+)?number\s+between\s+(\d+)\s+and\s+(\d+)/i) ||
                       hint.match(/from\s+(\d+)\s+to\s+(\d+)/i)
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1])
        const hi = parseInt(rangeMatch[2])
        if (hi - lo <= 200) {
            const candidates = []
            for (let i = lo; i <= hi; i++) candidates.push(String(i))
            return candidates
        }
        // For large ranges, try common numbers
        const candidates = [...hostCandidates]
        for (let i = lo; i <= Math.min(lo + 50, hi); i++) candidates.push(String(i))
        for (let i = Math.max(hi - 10, lo); i <= hi; i++) candidates.push(String(i))
        return [...new Set(candidates)]
    }

    // "PIN is empty"
    if (h.includes('empty') && (h.includes('pin') || h.includes('password'))) return ['', ...commonPasswords]

    // Captcha: "Type the numbers to prove you are human" — need data field
    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha') || h.includes('type the numbers')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 1) return [extracted]
        }
        // Without data, brute force common captcha answers
        return [...new Set([
            '1234', '12345', '123456', '1337', '42', '0', '1',
            '123', '456', '789', '1111', '9999', '0000', '4242',
            ...commonPasswords,
        ])]
    }

    // Dog's name / pet name
    if (h.includes("dog") || h.includes("pet") || h.includes("puppy") || h.includes("hound") || h.includes("fur"))
        return [...new Set([
            'rex', 'rover', 'fido', 'buster', 'max', 'buddy', 'charlie', 'jack', 'cooper',
            'rocky', 'toby', 'duke', 'zeus', 'bear', 'tiger', 'shadow', 'bandit', 'sparky',
            'barney', 'winston', 'ginger', 'daisy', 'molly', 'lady', 'sasha', 'lola',
            'pluto', 'snoopy', 'odog', 'dog', 'doggy', 'pup', 'wolf', 'fox', 'cody',
            'lassie', 'beethoven', 'scooby', 'clifford', 'marley', 'houdini',
            ...hostCandidates, ...extendedPasswords,
        ])]

    // Maze / labyrinth / dark corridor riddle
    if (h.includes('maze') || h.includes('labyrinth') || h.includes('corridor') || h.includes('dungeon') ||
        h.includes('echo') || h.includes('footstep') || h.includes('silence') || h.includes('dark'))
        return [...new Set([
            'maze', 'labyrinth', 'minotaur', 'theseus', 'ariadne', 'thread', 'exit', 'escape',
            'dead', 'end', 'center', 'core', 'depth', 'abyss', 'dark', 'shadow', 'void',
            'silence', 'echo', 'lost', 'hidden', 'path', 'way', 'door', 'gate', 'portal',
            'candle', 'torch', 'light', 'key', 'north', 'south', 'east', 'west',
            'left', 'right', 'forward', 'back', 'turn', 'follow', 'trust', 'fear',
            '42', '0', '1', '13', '7', '666', '999', '314',
            ...hostCandidates, ...extendedPasswords,
        ])]

    // "Only a true master may pass" / master riddle
    if (h.includes('master') || h.includes('true master'))
        return [...new Set([
            'master', 'MASTER', 'Master', 'truth', 'TRUTH', 'Truth',
            'wise', 'Wise', 'WISE', 'sage', 'Sage', 'SAGE',
            'king', 'Knight', 'warrior', 'hero', 'champion',
            'gandalf', 'merlin', 'yoda', 'dumbledore', 'raistlin',
            'open', 'sesame', 'abracadabra', 'alohomora',
            '42', '0', '1', '7', '3', '13',
            ...hostCandidates, ...extendedPasswords,
        ])]

    // "you are one who's'nt authorized" / "not authorized" riddle
    if (h.includes('authorized') || h.includes("who's") || h.includes("who is not") || h.includes("whont"))
        return [...new Set([
            'authorized', 'unauthorized', 'yes', 'no', 'maybe', 'please', 'letmein',
            'access', 'granted', 'denied', 'permit', 'allow', 'accept', 'approve',
            'user', 'admin', 'root', 'sudo', 'su', 'login', 'auth', 'token',
            '0', '1', '42', '1337', '401', '403', '200',
            ...hostCandidates, ...extendedPasswords,
        ])]

    // "(I'm busy browsing social media at the cafe)" — social media / cafe riddle
    if (h.includes('social media') || h.includes('browsing') || h.includes('cafe') || h.includes('coffee'))
        return [...new Set([
            'facebook', 'twitter', 'instagram', 'reddit', 'tiktok', 'youtube',
            'social', 'media', 'browse', 'cafe', 'coffee', 'latte', 'espresso',
            'wifi', 'password', 'freewifi', 'freewifi!', 'guestwifi',
            'coffee1', 'cafe1', '1234', '12345',
            ...hostCandidates, ...extendedPasswords,
        ])]

    // Mountain riddle
    if (h.includes('ascend') || h.includes('mountain') || h.includes('highest'))
        return [...new Set([...hostCandidates, ...mountainPasswords, ...extendedPasswords])]

    // Riddle fallback
    if (h.includes('riddle') || h.includes('true'))
        return [...new Set([...hostCandidates, ...extendedPasswords])]

    // Symbol/emoji hints like "!!🌶️!!"
    if (hint && !h.match(/[a-z]{3,}/)) {
        const stripped = hint.replace(/[^a-zA-Z0-9!@#$%^&*_\-+=]/g, '')
        return [...new Set([
            stripped, '',
            // Spicy/hot variants
            'spicy', 'hot', 'fire', 'pepper', 'chili', 'habanero', 'jalapeno',
            'ghostpepper', 'capsaicin', 'scoville', 'heat', 'burn', 'flame',
            '!!', '!!!', '!@#', '!@#$',
            ...hostCandidates, ...extendedPasswords,
        ])]
    }

    // Fallback: if we have a hint but no solver, try everything
    // This catches any unrecognized hints
    return [...new Set([...hostCandidates, '', ...commonPasswords])]
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    log(ns, `START on ${host} (loop mode)`)

    // Dedup: if another instance is already running, exit
    const myPid = ns.pid
    const others = ns.ps(host).filter(p => p.filename === SCRIPT_NAME && p.pid !== myPid)
    if (others.length > 0) {
        log(ns, `another instance already running (pid ${others[0].pid}), exiting`)
        return
    }

    while (true) {
        // Step 0: Free RAM (only if blocked > 0)
        try {
            const blocked = await ns.dnet.getBlockedRam(host)
            if (blocked > 0) {
                await ns.dnet.memoryReallocation()
            }
        } catch (e) { /* ignore */ }

        // Step 1: Probe
        let peers
        try {
            peers = await ns.dnet.probe()
        } catch (e) {
            log(ns, `probe error: ${e}`)
            await ns.asleep(1000)
            continue
        }

        if (!peers || peers.length === 0) {
            await ns.asleep(1000)
            continue
        }

        let spawned = 0
        let fails = 0

        for (const neighbor of peers) {
            if (neighbor === 'home' || neighbor === host) continue

            // Step A: get details
            let details
            try {
                details = await ns.dnet.getServerDetails(neighbor)
            } catch (e) {
                fails++
                continue
            }

            if (!details.isOnline || !details.isConnectedToCurrentServer) {
                await logFail(ns, neighbor, 'unreachable')
                fails++
                continue
            }

            // Step B: auth (skip if already authenticated)
            if (details.hasSession) {
                // already authenticated, skip auth
            } else {
                const hint = details.passwordHint || ''
                const data = details.data || ''
                const candidates = solvePassword(hint, data, neighbor)

                if (candidates.length === 0) {
                    await logFail(ns, neighbor, 'hint-unsolved', hint)
                    fails++
                    continue
                }

                let authed = false
                for (const pw of candidates) {
                    try {
                        const r = await ns.dnet.authenticate(neighbor, pw)
                        if (r.success) {
                            log(ns, `${neighbor} auth OK '${pw}'`)
                            authed = true
                            break
                        }
                    } catch (e) { /* try next */ }
                }

                if (!authed) {
                    log(ns, `${neighbor} AUTH FAILED`)
                    await logFail(ns, neighbor, 'auth-failed', hint)
                    fails++
                    continue
                }
            }

            // Step C: scp scripts to neighbor
            try {
                await ns.scp(SCRIPT_NAME, neighbor)
                await ns.scp('darknet-ram.js', neighbor)
                await ns.scp(EXTRACTOR, neighbor)
            } catch (e) {
                fails++
                continue
            }

            // Step D: exec darknet.js on neighbor (propagate) — check if already running
            const neighborProcs = ns.ps(neighbor)
            const alreadyRunning = neighborProcs.some(p => p.filename === SCRIPT_NAME)
            if (!alreadyRunning) {
                try {
                    const pid = ns.exec(SCRIPT_NAME, neighbor, 1)
                    if (pid) {
                        spawned++
                        log(ns, `${neighbor} darknet pid=${pid} (propagating)`)
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // Step E: run extractor on THIS server — check if already running
        const localProcs = ns.ps(host)
        const extractorRunning = localProcs.some(p => p.filename === EXTRACTOR)
        if (!extractorRunning) {
            try {
                const pid = ns.exec(EXTRACTOR, host, 1)
                if (pid) log(ns, `local extractor pid=${pid}`)
            } catch (e) { /* ignore */ }
        }

        if (spawned > 0 || fails > 0)
            log(ns, `cycle: ${spawned} spawned, ${fails} failed, ${peers.length} peers`)

        await ns.asleep(1000)
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
