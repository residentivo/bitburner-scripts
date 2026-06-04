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
    '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
    '1234567', '12345678', '123456789', '7654321',
    'aaaaaa', '123123', '123321', '121212', '654321', '159753',
    '696969', '6969', '7777777',
    'pass', 'god', 'love', 'master', 'dragon', 'monkey', 'shadow', 'sunshine',
    'princess', 'football', 'baseball', 'trustno1', 'iloveyou', 'welcome',
    'hello', 'charlie', 'donald', 'michael', 'jessica', 'jennifer',
    'superman', 'batman', 'spiderman', 'hunter', 'buster', 'freedom',
    'qwertyuiop', '1qaz2wsx', 'qazwsx', '123qwe', 'zxcvbnm', 'asdfgh', 'asdfghjkl',
    'jordan', 'joshua', 'maggie', 'ginger', 'ashley', 'amanda',
    'cheese', 'summer', 'winter', 'spring', 'autumn',
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

async function log(ns, msg) {
    const line = `[dnet] ${msg}\n`
    const file = '/darknet-log.txt'
    try {
        // Pull latest log from home first
        try { await ns.scp(file, ns.getHostname(), 'home') } catch (e) { /* ok */ }
        let existing = ns.read(file) || ''
        // Keep last 50 lines per host (less spam)
        const lines = (existing + line).split('\n')
        const trimmed = lines.slice(-50).join('\n')
        ns.write(file, trimmed, 'w')
        // Push back to home
        try { await ns.scp(file, 'home') } catch (e) { /* ok */ }
    } catch (e) { /* fallback */ ns.print(line.trim()) }
}

async function logFail(ns, server, reason, hint = '') {
    const key = `${server}|${reason}|${hint}`
    const file = '/darknet-failures.txt'
    try {
        // Pull latest from home, merge, deduplicate, write back
        let existing = ns.read(file) || ''
        try {
            await ns.scp(file, ns.getHostname(), 'home')
            existing = ns.read(file) || existing
        } catch (e) { /* home not reachable yet */ }

        // Deduplicate: keep only unique keys
        const seen = new Set()
        const lines = existing.split('\n').filter(l => l.trim())
        const deduped = []
        for (const l of lines) {
            if (!seen.has(l)) { seen.add(l); deduped.push(l) }
        }
        // Add new entry if not seen
        if (!seen.has(key)) deduped.push(key)

        const output = deduped.join('\n') + '\n'
        await ns.write(file, output, 'w')
        try { await ns.scp(file, 'home') } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
}

// Generate ALL plausible password variants from a hostname
function hostnameVariants(hostname) {
    if (!hostname) return []
    const leetMap = {'4':'a','3':'e','1':'i','0':'o','7':'t','5':'s'}
    const rot13 = (s) => s.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26))
    const leetDecode = (s) => { let r = ''; for (const c of s.toLowerCase()) r += leetMap[c] || c; return r }
    const caps = (s) => [s, s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()]
    const seen = new Set()
    const out = []
    const add = (...vals) => { for (const v of vals) { if (v && !seen.has(v)) { seen.add(v); out.push(v) } } }

    // Step 1: Emoji decode (MUST be first — affects all downstream)
    const emojiDecoded = hostname
        .replace(/\u{1F171}/gu, 'B').replace(/\u{1F170}/gu, 'A')
        .replace(/\u{1F17E}/gu, 'O').replace(/\u{1F17F}/gu, 'P')
        .replace(/\u{1F18E}/gu, 'AB')
    const source = emojiDecoded !== hostname ? emojiDecoded : hostname

    // Step 2: Clean versions
    const hostClean = source.replace(/[^a-zA-Z0-9]/g, '')
    const alphaOnly = source.replace(/[^a-zA-Z]/g, '')
    const numOnly = source.replace(/[^0-9]/g, '')

    // Step 3: Core variants — all casings of clean hostname
    if (hostClean) add(...caps(hostClean))
    if (alphaOnly && alphaOnly !== hostClean) add(...caps(alphaOnly))
    if (numOnly) add(numOnly)

    // Step 4: Leet-decode the whole thing
    const hostLeet = leetDecode(hostClean)
    if (hostLeet !== hostClean.toLowerCase()) add(...caps(hostLeet))

    // Step 5: Reverse
    add(hostClean.split('').reverse().join(''))
    add(hostLeet.split('').reverse().join(''))

    // Step 6: ROT13
    add(rot13(hostClean))

    // Step 7: Split on ALL delimiters + leet-decode each part
    const parts = source.split(/[:$;^_.\-&%@#+]+/).filter(p => p.length > 0)
    const leetParts = []
    for (const part of parts) {
        const pClean = part.replace(/[^a-zA-Z0-9]/g, '')
        if (!pClean) continue
        add(...caps(pClean))
        const pLeet = leetDecode(pClean)
        if (pLeet !== pClean.toLowerCase()) {
            add(...caps(pLeet))
            leetParts.push(pLeet)
        } else {
            leetParts.push(pClean.toLowerCase())
        }
        // Number parts (e.g. :7310 → 7310)
        const pNum = part.replace(/[^0-9]/g, '')
        if (pNum) add(pNum)
    }

    // Step 8: All pairwise + triple combos of leet-decoded parts
    // This produces things like: dark+matrix=darkmatrix, cyber+security=cybersecurity
    // Also produce combos with each part REVERSED (yhcrana→anarchy, skrowtenten→nettennetworks)
    const revLeetParts = leetParts.map(p => p.split('').reverse().join('')).filter(r => r.length >= 3)
    for (const rp of revLeetParts) add(rp)
    // KEY INSIGHT: Entire hostname might be a reversed phrase
    // e.g. dog_enihcam_eht_fo_hcruhc → [dog,enihcam,eht,fo,hcruhc] → rev each → [god,machine,the,of,church] → reverse order → church_of_the_machine_god
    const reversedOrderPhrase = [...revLeetParts].reverse().join('')
    const reversedOrderUnderscore = [...revLeetParts].reverse().join('_')
    const revPartsForward = revLeetParts.join('')
    add(reversedOrderPhrase, reversedOrderUnderscore, revPartsForward)
    // Also try the full reversed leetParts in original order with underscores
    add(leetParts.join('_'), revLeetParts.join('_'))
    // Combos of normal parts
    for (let i = 0; i < leetParts.length; i++) {
        for (let j = i + 1; j < leetParts.length; j++) {
            add(leetParts[i] + leetParts[j], leetParts[j] + leetParts[i])
            // CamelCase
            add(leetParts[i].charAt(0).toUpperCase() + leetParts[i].slice(1) + leetParts[j].charAt(0).toUpperCase() + leetParts[j].slice(1))
        }
    }
    // Combos of reversed parts (e.g. anarchy+of+shadows = shadows_of_anarchy)
    for (let i = 0; i < revLeetParts.length; i++) {
        for (let j = i + 1; j < revLeetParts.length; j++) {
            add(revLeetParts[i] + revLeetParts[j], revLeetParts[j] + revLeetParts[i])
        }
    }
    // Mixed: normal + reversed
    for (const np of leetParts) {
        for (const rp of revLeetParts) {
            add(np + rp, rp + np)
        }
    }
    for (let i = 0; i < leetParts.length; i++) {
        for (let j = i + 1; j < leetParts.length; j++) {
            for (let k = j + 1; k < leetParts.length; k++) {
                add(leetParts[i] + leetParts[j] + leetParts[k])
                add(leetParts[k] + leetParts[j] + leetParts[i])
            }
        }
    }
    // Full concatenation of all parts
    if (leetParts.length > 3) add(leetParts.join(''))

    // Step 9: Common mutations of top variants
    const topVariants = out.slice(0, 20) // first 20 are the most likely
    for (const v of topVariants) {
        add(v + '1', v + '123', '!' + v, v + '!', v + '@', v + '#')
    }

    // Step 10: Special hostname patterns
    // Chinese characters: 茶店 → tea, cha
    if (hostname && /[\u4e00-\u9fff]/.test(hostname)) add('cha', 'tea', 'chadain')
    // Punctuation-only: .... → dot, dots
    if (/^[^a-zA-Z0-9]+$/.test(hostname)) add(hostname, 'dot', 'dots')
    // SQL injection: ;-- → bobby, droptable
    if (hostname.includes(';--')) add('droptable', 'bobbytables', 'sql', 'sqli', "';--", "1=1")
    // Reversed word detection: rekcah → hacker, repyh → hyper
    for (const lp of leetParts) {
        const rev = lp.split('').reverse().join('')
        if (rev.length >= 3 && rev !== lp) add(rev)
    }

    return out
}

// Hardcoded passwords for specific hostnames (discovered manually / via heartbleed)
const HARDCODED_PASSWORDS = {
    'th3_l4byr1nth': '!!the:masterwork:of:daedalus<5109>!!',
}

function solvePassword(hint, hintData, hostname = '') {
    // Hardcoded override — always try first
    if (hostname && HARDCODED_PASSWORDS[hostname]) {
        return [HARDCODED_PASSWORDS[hostname], ...hostnameVariants(hostname)]
    }
    if (!hint) return []
    const h = hint.toLowerCase()

    // Generate hostname variants (used by ALL hint types)
    const hostVariants = hostnameVariants(hostname)

    // Pop culture / themed passwords based on hostname hints
    const popCulture = []
    const hlow = (hostname || '').toLowerCase()
    if (hlow.includes('anor') || hlow.includes('londo') || hlow.includes('lordran') || hlow.includes('souls') || hlow.includes('firelink'))
        popCulture.push('solaire', 'darkwraith', 'hollow', 'gwyndolin', 'ornstein', 'smough', 'gwyn', 'nito', 'seath', 'kalameet', 'priscilla', 'artorias', 'manus', 'quelaag', 'chaos', 'fire', 'bonfire', 'estus', 'pyromancy', 'dark', 'sun', 'praise the sun', 'darksouls', 'lordran', 'anorlondo', 'ash', 'ember', 'kindle', 'humanity', 'hollowed')
    if (hlow.includes('machine') || hlow.includes('church') || hlow.includes('god'))
        popCulture.push('machine', 'god', 'deus', 'church', 'templar', 'cyber', 'android', 'synth', 'matrix', 'skynet', 'omnic', 'primordial', 'architect', 'builder', 'creator', 'maker')
    if (hlow.includes('labyr') || hlow.includes('maze') || hlow.includes('l4byr'))
        popCulture.push('minotaur', 'theseus', 'ariadne', 'thread', 'labyrinth', 'maze', 'daedalus', 'icarus', 'corridoor')
    if (hlow.includes('everest') || hlow.includes('mountain') || hlow.includes('himalaya'))
        popCulture.push('everest', 'sagarmatha', 'chomolungma', '8848', '29029')
    if (hlow.includes('fitness') || hlow.includes('gym') || hlow.includes('snap'))
        popCulture.push('fitness', 'gym', 'workout', 'lift', 'gain', 'protein', 'cardio', 'sweat', 'muscle', 'iron', 'pump', 'fit', 'strong', 'power', 'endurance')
    if (hlow.includes('clarke') || hlow.includes('incorporated') || hlow.includes('anonymous'))
        popCulture.push('clarke', 'hal', 'hal9000', 'hal9001', '2001', '2001space', 'odyssey', 'monolith', 'heuristic', 'daisy', 'daisydaisy', 'skynet', 'ai', 'deepthought', '42', '42!', '42!!', 'spicy', 'hot', 'pepper', 'chili', 'clarkeinc', 'anonymous', 'anon', 'incognito')
    if (hlow.includes('goto') || hlow.includes('g0t0') || hlow.includes('g0to'))
        popCulture.push('goto', 'goto10', 'goto_10', '10', 'loop', 'infinite', 'basic', 'gwbasic', 'qbasic', 'run', 'end', 'cont', 'next', 'step', 'basic10', '10goto10', 'g0t0', 'g0t010')
    if (hlow.includes('pineapple'))
        popCulture.push('pineapple', 'pineapplepen', 'ppap', 'penpineapple', 'tropical', 'fruit', 'ananas', 'abacaxi', 'hawaii', 'maui', 'honolulu')
    if (hlow.includes('rogue') || hlow.includes('roguesecuri'))
        popCulture.push('rogue', 'rogueone', 'rogueone', 'rebel', 'spy', 'agent', 'covert', 'stealth', 'roguesecurity', 'security', 'secure', 'sec', 'secu', 'securi7y', 'r0gue')
    if (hlow.includes('cryp7o') || hlow.includes('crypto') || hlow.includes('sanctuary') || hlow.includes('5anc7uary'))
        popCulture.push('crypto', 'cryp7o', 'sanctuary', '5anc7uary', 'sanc7uary', 'encrypt', 'cipher', 'aes', 'rsa', 'sha256', 'hash', 'cryptosanctuary', 'cryp7o5anc7uary', 'temple', 'shrine', 'haven', 'refuge', 'asylum')
    if (hlow.includes('blade') || hlow.includes('b1ade'))
        popCulture.push('blade', 'b1ade', 'bladerunner', 'runner', 'deckard', 'replicant', 'tyrell', 'nexus', 'neon', 'cyberpunk', 'android', 'ricardo', 'batty')
    if (hlow.includes('bit') && hlow.includes('system'))
        popCulture.push('bitsystems', 'bitsys', 'binary', 'byte', 'bit', 'system', 'sys', '0b', '0x', 'overflow', '8bit', '16bit', '32bit', '64bit')
    // Dark / cyber / tech themed
    if (hlow.includes('cyber') || hlow.includes('phantom') || hlow.includes('dark'))
        popCulture.push('cyber', 'phantom', 'dark', 'cyberphantom', 'darkphantom', 'cyberpunk', 'ghost', 'shadow', 'stealth', 'neon', 'noir')
    if (hlow.includes('neo') && (hlow.includes('blade') || hlow.includes('corp')))
        popCulture.push('neo', 'neocorp', 'neoblade', 'matrix', 'one', 'theone', 'morpheus', 'trinity', 'zion', 'nebuchadnezzar')
    if (hlow.includes('black') || hlow.includes('hand'))
        popCulture.push('blackhand', 'black', 'hand', 'shadow', 'assassin', 'night', 'darkness', 'syndicate', 'mafia', 'yakuza')
    if (hlow.includes('tweeter') || hlow.includes('tweet'))
        popCulture.push('tweeter', 'tweet', 'twitter', 'bird', 'bluebird', 'chirp', 'x', 'retweet', 'follow')
    if (hlow.includes('crack'))
        popCulture.push('crack', 'cracker', 'cracking', 'hashcat', 'john', 'brute', 'rainbow', 'crack_networks', 'crackcorp', '0day')
    if (hlow.includes('hospital') || hlow.includes('matrix'))
        popCulture.push('hospital', 'matrix', 'hospitalmatrix', 'surgeon', 'nurse', 'doctor', 'patient', 'med', 'health', 'cure')
    if (hlow.includes('zenith') || hlow.includes('zeni7h'))
        popCulture.push('zenith', 'zeni7h', 'peak', 'summit', 'top', 'apex', 'pinnacle', 'crest', 'crown')
    if (hlow.includes('hydro') || hlow.includes('water'))
        popCulture.push('hydro', 'water', 'aqua', 'fluid', 'dam', 'river', 'stream', 'ocean', 'wave', 'current')
    if (hlow.includes('anor') || hlow.includes('londo'))
        popCulture.push('anorlondo', 'anor', 'londo', 'ornstein', 'smough', 'gwyndolin', 'solaire', 'darkwraith', 'gwyn', 'priscilla', 'dark', 'sun', 'fire', 'lordsoul')
    if (hlow.includes('m1n3cr4ft') || hlow.includes('minecraft'))
        popCulture.push('minecraft', 'm1n3cr4ft', 'creeper', 'enderman', 'diamond', 'redstone', 'herobrine', 'steve', 'notch', 'pickaxe')
    // SQL injection / hacker hosts
    if (hlow.includes('drop') || hlow.includes('table') || hlow.includes(';--'))
        popCulture.push('drop', 'droptable', 'sql', 'sqli', 'injection', 'bobby', 'bobbytables', 'hacker', ';--', '1=1', 'or1=1', 'admin--', "' or '1'='1")
    // Reversed hostnames: gro;rekcah = hacker backwards
    if (hlow.includes('rekcah'))
        popCulture.push('hacker', 'rekcah', 'crack', 'hack', 'reverse', 'mirror')
    // Chinese hostnames: 茶店 = tea shop
    if (hostname && /[\u4e00-\u9fff]/.test(hostname))
        popCulture.push('cha', 'tea', 'chadain', '茶店', 'teashop', 'cafe', 'coffee', 'matcha', 'oolong', 'green', 'chinese')
    // IoT hosts
    if (hlow.includes('smart') || hlow.includes('fridge') || hlow.includes('toaster'))
        popCulture.push('smart', 'fridge', 'toaster', 'iot', 'device', 'appliance', 'connected', 'wifi', 'default', 'admin')
    // Ultra tech
    if (hlow.includes('u17ra') || hlow.includes('ultra') || hlow.includes('7ech') || hlow.includes('tech'))
        popCulture.push('ultra', 'u17ra', 'tech', '7ech', 'ultimate', 'extreme', 'advance', 'next', 'future')
    // Cat related
    if (hlow.includes('cat') || hlow.includes('meow'))
        popCulture.push('cat', 'meow', 'kitty', 'feline', 'whiskers', 'paws', 'purr', 'tabby', 'garfield', 'tom', 'scratch')
    // XD host
    if (hlow === 'xd' || hlow.includes('xd'))
        popCulture.push('xd', 'XD', 'lol', 'lmao', 'rofl', 'haha', 'teehee', 'hehe', 'giggle', 'laugh')
    // Metacitadel / citadel
    if (hlow.includes('citadel') || hlow.includes('c1tadel'))
        popCulture.push('citadel', 'c1tadel', 'fortress', 'castle', 'keep', 'stronghold', 'bastion', 'rampart')
    // Kuaigong
    if (hlow.includes('kuaigong'))
        popCulture.push('kuaigong', 'kuai', 'gong', 'fast', 'quick', 'speed', 'rapid')
    // Microhard
    if (hlow.includes('microhard'))
        popCulture.push('microhard', 'microsoft', 'micro', 'hard', 'windows', 'bill', 'gates', 'surface', 'azure')
    // Omnitek
    if (hlow.includes('omnitek'))
        popCulture.push('omnitek', 'omni', 'tek', 'all', 'everything', 'tech')
    // Watchdog
    if (hlow.includes('watchdog'))
        popCulture.push('watchdog', 'guard', 'sentinel', 'guardian', 'protector', 'keeper', 'lookout')
    // Netweb
    if (hlow.includes('netweb'))
        popCulture.push('netweb', 'network', 'web', 'internet', 'online', 'cloud', 'mesh')
    // 5ummit / summit
    if (hlow.includes('5ummit') || hlow.includes('summit'))
        popCulture.push('summit', '5ummit', 'peak', 'mountain', 'conference', 'top')
    // c3lls3rvic3s
    if (hlow.includes('c3lls3rvic3s') || hlow.includes('cellservice'))
        popCulture.push('cellservices', 'c3lls3rvic3s', 'cell', 'service', 'mobile', 'phone', 'carrier', 'network', 'signal')
    // echo-hyper / netlink
    if (hlow.includes('echo') || hlow.includes('hyper'))
        popCulture.push('echo', 'hyper', 'echohyper', 'ping', 'response', 'bounce', 'reflect', 'amplify')
    if (hlow.includes('netlink'))
        popCulture.push('netlink', 'link', 'connection', 'bridge', 'gateway', 'router', 'switch')
    // bitrunners / bitcitadel
    if (hlow.includes('bitrunner'))
        popCulture.push('bitrunners', 'runner', 'run', 'bits', 'binary', 'mining', 'rig')
    if (hlow.includes('bitcitadel'))
        popCulture.push('bitcitadel', 'bit', 'citadel', 'fortress', 'crypto', 'vault')
    // light & grid
    if (hlow.includes('light') && hlow.includes('grid'))
        popCulture.push('lightgrid', 'light', 'grid', 'power', 'energy', 'electric', 'voltage', 'watt', 'lumen')
    // localhost
    if (hlow === 'localhost' || hlow.includes('localhost'))
        popCulture.push('localhost', '127.0.0.1', 'local', 'home', 'loopback', 'self', 'host')
    // helios / terminal
    if (hlow.includes('helios') || hlow.includes('terminal'))
        popCulture.push('helios', 'sun', 'solar', 'apollo', 'terminal', 'console', 'shell', 'command')
    // genesis / net::genesis
    if (hlow.includes('genesis'))
        popCulture.push('genesis', 'beginning', 'origin', 'alpha', 'creation', 'first', 'start')
    // Anonymous / anonymou5
    if (hlow.includes('anonymou') || hlow.includes('an0nymou'))
        popCulture.push('anonymous', 'anonymou5', 'anon', 'legion', 'expectus', 'mask', 'v', 'vendetta', 'guyfawkes')
    // New patterns from latest failures
    // aevum (Latin for "age/eternity")
    if (hlow.includes('aevum'))
        popCulture.push('aevum', 'eternity', 'age', 'time', 'forever', 'infinite', 'aeon', 'eonic')
    // omuretsu (Japanese/reversed tesumo?)
    if (hlow.includes('omuretsu') || hlow.includes('omuret5u') || hlow.includes('omur375u') || hlow.includes('omure7su'))
        popCulture.push('omuretsu', 'tesumo', 'sumo', 'muretso', 'japanese', 'sushi', 'ramen', 'omuret5u', 'omur375u', 'omure7su')
    // Oriath (Path of Exile)
    if (hlow.includes('oriath'))
        popCulture.push('oriath', 'poE', 'pathofexile', 'exile', 'wraeclast', 'sarn', 'kitava', 'sin', 'innocence', 'theocracy')
    // ishima (Ghost in the Shell / Japanese)
    if (hlow.includes('ishima'))
        popCulture.push('ishima', 'ghost', 'shell', 'motoko', 'kusanagi', 'tachikoma', 'section9', 'cyberbrain', 'android')
    // the_void
    if (hlow.includes('void') || hlow.includes('the_void'))
        popCulture.push('void', 'the_void', 'null', 'empty', 'nothing', 'abyss', 'darkness', 'black', 'zero', 'nil')
    // ranger
    if (hlow.includes('ranger'))
        popCulture.push('ranger', 'forest', 'patrol', 'scout', 'tracker', 'hunt', 'wild', 'nature', 'aragorn', 'strider')
    // football
    if (hlow.includes('football'))
        popCulture.push('football', 'soccer', 'touchdown', 'goal', 'field', 'ball', 'fifa', 'nfl', 'gridiron', 'quarterback')
    // laptop
    if (hlow.includes('laptop'))
        popCulture.push('laptop', 'notebook', 'portable', 'macbook', 'thinkpad', 'dell', 'hp', 'lenovo', 'computer', 'pc')
    // crush_fitness_gym
    if (hlow.includes('crush') && hlow.includes('gym'))
        popCulture.push('crush', 'crushfitness', 'gym', 'fitness', 'workout', 'iron', 'pump', 'gain', 'swole')
    // giga / citadel
    if (hlow.includes('giga'))
        popCulture.push('giga', 'gigabyte', 'giga1', 'gb', 'billion', '10^9', 'g')
    // data / systems / apex / industries
    if (hlow.includes('data') && hlow.includes('system'))
        popCulture.push('datasystems', 'data', 'system', 'sys', 'database', 'db', 'storage', 'info')
    if (hlow.includes('1ndu5tr1e5') || hlow.includes('industries'))
        popCulture.push('industries', '1ndu5tr1e5', 'industry', 'factory', 'manufacture', 'production')
    // EZ_BAKE_OVEN
    if (hlow.includes('bake') || hlow.includes('oven'))
        popCulture.push('bake', 'oven', 'ezbake', 'cake', 'bread', 'cookie', 'pastry', '350', '425', '375', '450')
    // bachman
    if (hlow.includes('bachman'))
        popCulture.push('bachman', 'bach', 'music', 'composer', 'classical', 'organ', 'cantata', 'fugue')
    // The_Depth5 / depth
    if (hlow.includes('depth') || hlow.includes('depth5'))
        popCulture.push('depth', 'depth5', 'deep', 'abyss', 'bottom', 'ocean', 'trench', '5', 'the_depth5')
    // global_pharmaceuticals
    if (hlow.includes('pharma'))
        popCulture.push('pharma', 'pharmaceutical', 'drug', 'medicine', 'pill', 'vaccine', 'cure', 'rx')
    // 7ian_di_hui / tian_di_hui (天地会 = Heaven and Earth Society)
    if (hlow.includes('7ian') || hlow.includes('tian'))
        popCulture.push('tiandihui', '7ian_di_hui', '天地会', 'heaven', 'earth', 'society', 'triad', 'secret', 'martial', 'kungfu')
    // h4cker / hacker
    if (hlow.includes('h4cker') || hlow.includes('hacker'))
        popCulture.push('hacker', 'h4cker', 'crack', 'exploit', 'root', '0day', 'hack', 'breach', 'pentest')
    // OrangeTV
    if (hlow.includes('orange') || hlow.includes('orangetv'))
        popCulture.push('orange', 'orangetv', 'tv', 'telecom', 'fruit', 'citrus', 'os', 'livetv')
    // 5olution5 / solutions
    if (hlow.includes('5olution') || hlow.includes('solution'))
        popCulture.push('solutions', '5olution5', 'solve', 'answer', 'fix', 'resolve')
    // r0gu3:ma7rix / rogue matrix
    if (hlow.includes('r0gu3') || (hlow.includes('rogue') && hlow.includes('ma7rix')))
        popCulture.push('roguematrix', 'r0gu3ma7rix', 'rogue', 'matrix', 'r0gu3', 'ma7rix', 'glitch', 'anomaly')
    // bitc0in / bitcoin
    if (hlow.includes('bitc0in') || hlow.includes('bitcoin') || hlow.includes('bi7coin'))
        popCulture.push('bitcoin', 'bitc0in', 'bi7coin', 'btc', 'satoshi', 'nakamoto', 'blockchain', 'mining', 'miner', 'hash', 'wallet')
    // ne7web / netweb with 🅱️
    if (hlow.includes('ne7web') || hlow.includes('ne7we'))
        popCulture.push('netweb', 'ne7web', 'network', 'web', 'internet', 'online', '7168')
    // cryp7o@w3b / cryptoweb
    if (hlow.includes('cryp7o') && hlow.includes('w3b'))
        popCulture.push('cryptoweb', 'cryp7ow3b', 'crypto', 'web', 'encrypt', 'cipher', 'tls')
    // New from latest batch
    // nevahlov (volhanev reversed? or nevalhlov → Valhlov → Valhalla?)
    if (hlow.includes('nevahlov') || hlow.includes('volhanev'))
        popCulture.push('nevahlov', 'volhanev', 'valhalla', 'valhlov', 'asgard', 'norse', 'viking', 'odin', 'warrior')
    // freedom
    if (hlow === 'freedom' || hlow.includes('freedom'))
        popCulture.push('freedom', 'free', 'liberty', 'independence', 'open', 'libre')
    // dallas / city names
    if (hlow.includes('dallas'))
        popCulture.push('dallas', 'texas', 'cowboy', 'ranch', 'lonestar', 'dallas1')
    // smart devices
    if (hlow.includes('smart') || hlow.includes('doorbell') || hlow.includes('s4msong') || hlow.includes('samsung'))
        popCulture.push('smart', 'samsung', 'doorbell', 'iot', 'device', 'smarthome', 'connect', 'setup')
    // sec7or / sector / city hall
    if (hlow.includes('sec7or') || hlow.includes('sector'))
        popCulture.push('sector', 'sec7or', 'ci7y', 'city', 'hall', 'district', 'zone', '12')
    // m1chelle / michelle
    if (hlow.includes('m1chelle') || hlow.includes('michelle'))
        popCulture.push('michelle', 'm1chelle', 'shell', 'mish', 'micki')
    // fir3wa11 / firewall
    if (hlow.includes('fir3wa11') || hlow.includes('firewall'))
        popCulture.push('firewall', 'fir3wa11', 'fw', 'iptables', 'block', 'filter', 'allow')
    // 1ed4t1c / edict / zero_day reversed
    if (hlow.includes('1ed4t1c') || hlow.includes('edict'))
        popCulture.push('edict', '1ed4t1c', 'decree', 'law', 'rule', 'order', 'mandate')
    // orez / zero reversed
    if (hlow.includes('orez'))
        popCulture.push('zero', 'orez', '0', 'null', 'nothing')
    // null / services
    if (hlow.includes('null'))
        popCulture.push('null', 'nil', 'none', 'empty', 'void', '0')
    // crypto_flame / meta_systems
    if (hlow.includes('meta') && hlow.includes('syst'))
        popCulture.push('metasystems', 'meta', 'systems', 'system', 'meta_systems')
    // byte / tech
    if (hlow.includes('byte'))
        popCulture.push('byte', 'byte1', 'bite', '8bit', 'octet')
    // global
    if (hlow.includes('global'))
        popCulture.push('global', 'world', 'intl', 'international', 'planet')
    // rho_construction / fulcrum / omega / love / UwU / FatBit / tetrads / bungo / etc
    if (hlow.includes('rho'))
        popCulture.push('rho', 'construction', 'build', 'density', 'greek')
    if (hlow.includes('fulcrum'))
        popCulture.push('fulcrum', 'pivot', 'balance', 'lever', 'center', 'core')
    if (hlow.includes('omega'))
        popCulture.push('omega', 'last', 'final', 'end', 'ultimate', 'z')
    if (hlow === 'love')
        popCulture.push('love', 'heart', 'amor', 'cura', 'adore', 'passion', '0')
    if (hlow === 'uwu' || hlow === 'owo')
        popCulture.push('uwu', 'owo', 'cute', 'kawaii', 'anime', 'weeb', 'furries')
    if (hlow.includes('fatbit'))
        popCulture.push('fatbit', 'fat', 'bit', 'bigbit', 'phatbit')
    if (hlow.includes('tetrads'))
        popCulture.push('tetrads', 'tetrad', 'four', 'quad', '4', 'quartet')
    if (hlow.includes('bungo'))
        popCulture.push('bungo', 'bongo', 'drum', 'beat', 'jungle')
    if (hlow.includes('echonet') || hlow.includes('echo_net'))
        popCulture.push('echonet', 'echo', 'network', 'ping', 'sonar', 'reflect')
    if (hlow.includes('vitalife'))
        popCulture.push('vitalife', 'vital', 'life', 'health', 'bio', 'energy')
    if (hlow.includes('nethub'))
        popCulture.push('nethub', 'network', 'hub', 'switch', 'router')
    if (hlow.includes('icarus'))
        popCulture.push('icarus', 'sun', 'wax', 'wing', 'fly', 'daedalus', 'fall')
    if (hlow.includes('zb_institute') || hlow.includes('institute'))
        popCulture.push('institute', 'research', 'academic', 'university', 'zb', 'tech')
    if (hlow.includes('nova'))
        popCulture.push('nova', 'new', 'star', 'supernova', 'explosion')
    if (hlow.includes('syscore'))
        popCulture.push('syscore', 'core', 'system', 'kernel')
    if (hlow.includes('crackcorp'))
        popCulture.push('crackcorp', 'crack', 'corp', 'corporation')
    if (hlow.includes('regnig'))
        popCulture.push('regnig', 'reign', 'king', 'rule', 'govern', 'power')
    if (hlow.includes('amgis') || hlow.includes('sigma'))
        popCulture.push('sigma', 'amgis', 'four_sigma', '4sigma', 'probability', 'standard')
    if (hlow.includes('skrow'))
        popCulture.push('networks', 'skrow', 'nettenworks')
    if (hlow.includes('mmocfed'))
        popCulture.push('mmocfed', 'defcomm', 'defense', 'command', 'military', 'comms')
    // Latest batch
    if (hlow.includes('chongqing'))
        popCulture.push('chongqing', 'chinese', 'city', 'sichuan', 'hotpot', 'yangtze')
    if (hlow.includes('procagem') || hlow.includes('megacorp'))
        popCulture.push('megacorp', 'procagem', 'mega', 'corporation', 'corp')
    if (hlow.includes('illuminati'))
        popCulture.push('illuminati', 'newworldorder', 'nwo', 'secret', 'conspiracy', 'eye', 'triangle')
    if (hlow.includes('bladeburners'))
        popCulture.push('bladeburners', 'blade', 'burner', 'bb', 'blackburn')
    if (hlow.includes('syndicate') || hlow.includes('covenant'))
        popCulture.push('syndicate', 'covenant', 'organization', 'order', 'faction', 'guild', 'league')
    if (hlow.includes('rothman'))
        popCulture.push('rothman', 'rothmanuniversity', 'university', 'college', 'school', 'academic')
    if (hlow.includes('storm'))
        popCulture.push('storm', 'thunder', 'lightning', 'rain', 'tempest', 'hurricane')
    if (hlow.includes('deltaone'))
        popCulture.push('deltaone', 'delta', 'one', 'd1', 'change')
    if (hlow.includes('solaris'))
        popCulture.push('solaris', 'sun', 'oracle', 'sparc', 'unix')
    if (hlow.includes('national_security') || hlow.includes('nsa'))
        popCulture.push('nsa', 'nationalsecurity', 'agency', 'government', 'surveillance', 'crypto')
    if (hlow.includes('four_sigma'))
        popCulture.push('foursigma', 'four_sigma', '4sigma', 'sigma', 'quant', 'hedge')
    if (hlow.includes('new_tokyo') || hlow.includes('n3w_7okyo'))
        popCulture.push('newtokyo', 'new_tokyo', 'tokyo', 'japan', 'neotokyo', 'n3w_7okyo')
    if (hlow.includes('galactic'))
        popCulture.push('galactic', 'galaxy', 'space', 'star', 'cosmic', 'milkyway')
    if (hlow.includes('universal'))
        popCulture.push('universal', 'global', 'world', 'all', 'everywhere')
    // More from latest batch
    if (hlow.includes('the_slums') || hlow.includes('slums'))
        popCulture.push('slums', 'the_slums', 'ghetto', 'poor', 'undercity', 'favela')
    if (hlow.includes('foodnstuff') || hlow.includes('foodns7uff'))
        popCulture.push('foodnstuff', 'food', 'stuff', 'snack', 'eat', 'noodle')
    if (hlow.includes('amanda'))
        popCulture.push('amanda', 'mandy', 'aanda')
    if (hlow.includes('biteme') || hlow.includes('b17e'))
        popCulture.push('biteme', 'bite', 'byte', 'biteme!', 'eatme')
    if (hlow.includes('nwo'))
        popCulture.push('nwo', 'newworldorder', 'nw', 'order')
    if (hlow.includes('v7_7ram5') || hlow.includes('v_rams'))
        popCulture.push('vrams', 'v7_7ram5', 'ram', 'memory', 'dram', 'vram')
    if (hlow.includes('abc123') || hlow === 'abc123')
        popCulture.push('abc123', 'abc', '123', 'abc123!')
    if (hlow.includes('l0calh0st') || hlow.includes('localh0st'))
        popCulture.push('localhost', 'l0calh0st', 'local', 'home', '127001', 'loopback')
    if (hlow.includes('h0me'))
        popCulture.push('home', 'h0me', 'house', 'base', 'root')

    // Direct extraction: "key is X", "password is X", "pin is X", "it's set to X"
    // But NOT "The default password is set" / "The password is set to default" — those fall through
    const keyMatch = hint.match(/(?:key|secret|pin|it'?s set to)\s+(?:is\s+)?(\w+)/i)
    if (keyMatch && keyMatch[1]) {
        const val = keyMatch[1].toLowerCase()
        if (!['is', 'the', 'a', 'an', 'not', 'still', 'empty', 'to', 'set', 'divisible', 'made'].includes(val)) {
            // Return the extracted value, but also try hostname variants (password might be different)
            return [...new Set([keyMatch[1], ...hostVariants])]
        }
    }
    // "password is X" but only if X looks like a concrete value (not "set", "default", "required")
    const pwMatch = hint.match(/password\s+is\s+(\w+)/i)
    if (pwMatch && pwMatch[1]) {
        const val = pwMatch[1].toLowerCase()
        if (!['is', 'the', 'a', 'an', 'not', 'still', 'empty', 'to', 'set', 'default', 'required', 'divisible', 'made', 'configured', 'chosen', 'unknown', 'missing'].includes(val)) {
            return [...new Set([pwMatch[1], ...hostVariants])]
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
        return [...new Set([...candidates, ...hostVariants, ...commonPasswords])]
    }

    // "PIN X" or "The PIN is X" or "PIN uses X" or "PIN: X"
    const pinMatch = hint.match(/pin\s+(?:is|uses|:|=\s*)(\d+)/i) || hint.match(/pin\s*[:=]?\s*(\d+)/i)
    if (pinMatch && pinMatch[1]) {
        const pin = pinMatch[1]
        const candidates = [pin]
        // "PIN uses 224" — try 224 and permutations, plus partial matches
        if (h.includes('use')) {
            candidates.push(...permutations(pin))
            const digits = pin.split('')
            for (const d of digits) candidates.push(d)
            // reversed
            candidates.push(pin.split('').reverse().join(''))
            // "PIN uses 145" → generate all PINs containing those digits
            // 3-digit: just permutations (already added above)
            // 4-digit PINs with one extra digit (0-9)
            for (let extra = 0; extra <= 9; extra++) {
                const extended = pin + String(extra)
                candidates.push(...permutations(extended))
            }
            // 5-digit PINs with two extra digits (common combos)
            for (let e1 = 0; e1 <= 9; e1++) {
                for (let e2 = 0; e2 <= 9; e2++) {
                    // Only a few common patterns to avoid explosion
                    if (e1 === e2 || e1 === 0 || e2 === 0) {
                        const extended = pin + String(e1) + String(e2)
                        // Just try sorted and a few perms, not all
                        candidates.push(extended, extended.split('').reverse().join(''))
                        const sorted = extended.split('').sort().join('')
                        candidates.push(sorted)
                    }
                }
            }
            // Pad with leading zeros
            candidates.push('0' + pin, '00' + pin, '000' + pin)
            // Common math with those digits
            const pinNum = parseInt(pin)
            candidates.push(String(pinNum * 2), String(pinNum * 3), String(pinNum + 1), String(pinNum - 1))
        }
        return [...new Set([...candidates, ...hostVariants, ...popCulture])]
    }

    // "The password is shuffled NNN" — all permutations
    const shuffledMatch = hint.match(/shuffled\s+(\d+)/i)
    if (shuffledMatch) {
        return [...new Set([...permutations(shuffledMatch[1]), ...hostVariants])]
    }

    // "I accidentally sorted the password: NNN" — unsort = all permutations
    const sortedMatch = hint.match(/sorted\s+(?:the\s+)?(?:password|pin)?\s*[:=]?\s*(\d+)/i)
    if (sortedMatch) {
        return [...new Set([...permutations(sortedMatch[1]), ...hostVariants])]
    }

    // "There is no password"
    if (h.includes('no password') || h.includes('there is no'))
        return [...new Set(['', ...hostVariants, ...popCulture, ...commonPasswords])]

    // Roman numeral / Latin number words: "value of the number 'X'"
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
    // Latin number words: nulla=0, unus=1, duo=2, tres=3, quattuor=4, quinque=5, sex=6, septem=7, octo=8, novem=9, decem=10
    const latinMatch = hint.match(/value of the number ['"]?(\w+)['"]?/i)
    if (latinMatch) {
        const latin = latinMatch[1].toLowerCase()
        const latinNums = { nulla:0, nil:0, nihilo:0, unus:1, una:1, duo:2, duae:2, tres:3, tria:3, quattuor:4, quinque:5, sex:6, septem:7, octo:8, novem:9, decem:10, undecim:11, duodecim:12, tredecim:13, quattuordecim:14, quindecim:15, sedecim:16, septendecim:17, duodeviginti:18, undeviginti:19, viginti:20, triginta:30, quadraginta:40, quinquaginta:50, sexaginta:60, septuaginta:70, octoginta:80, nonaginta:90, centum:100, ducenti:200, trecenti:300, quadringenti:400, quingenti:500, sescenti:600, septingenti:700, octingenti:800, nongenti:900, mille:1000 }
        if (latin in latinNums) return [String(latinNums[latin])]
        // Try as the word itself if not found
        return [...new Set([latin, '0', '1', ...hostVariants, ...commonPasswords])]
    }

    // Default / factory / never changed / didn't set / "the password is the default password"
    if (h.includes('default') || h.includes('factory') || h.includes('never changed') ||
        h.includes("didn't change") || h.includes("didn't set") || h.includes("did i set") ||
        h.includes('still') || h.includes('original') || h.includes('no password') ||
        h.includes('not set'))
        return [...new Set([
            ...hostVariants, ...popCulture,
            '', 'password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest',
            'root', 'toor', 'daemon', 'sys', 'adm', 'bin', 'superuser', 'operator',
            'server', 'system', 'changeit', 'changeme', 'mysql', 'postgres', 'oracle',
            'cisco', 'public', 'private', 'blank', 'none', 'null',
            'open', 'login', 'unlock', 'access', 'secret', 'test', 'user', 'demo',
            'pass', 'pwd', 'passw0rd', 'p@ssw0rd', 'admin123', 'root123', 'abc123',
            '0000', '1111', '1234', '4321', '7777', '9999',
            'password1', 'password123', 'admin1', 'admin1234', 'root1', 'test1',
            'welcome', 'hello', 'master', 'super', 'god', 'love', 'code',
            // Common device/service defaults
            'ubnt', 'zyxel', 'netgear', 'dlink', 'tplink', 'linksys', 'asus',
            'arris', 'motorola', 'huawei', 'technicolor', 'sagemcom',
            // Software defaults
            'jenkins', 'docker', 'nginx', 'apache', 'redis', 'mongo', 'grafana',
            'postgres1', 'mysql1', 'admin!', 'root!', 'sa', 'dbo',
            // IoT/smart device defaults
            'smart', 'fridge', 'toaster', 'device', 'iot', 'setup', 'connect',
            // Parody/tech corp names (microhard=Microsoft parody, etc)
            'microhard', 'omnitek', 'kuaigong', 'megacorp', 'apex', 'rogue',
            'hospital', 'arcade', '4rc4de', 'summit', '5ummit',
            // Factory literal
            'factory', 'factory1', 'factoryreset', 'settings', 'default1',
        ])]

    // Buffer length: "Warning: password buffer is N bytes"
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const candidates = [...hostVariants, ...popCulture]
        // Massive wordlists by length
        const wordsByLen = {
            3: ['cat','dog','foo','bar','baz','qux','pwd','key','abc','xyz','net','web','ssh','ftp','sql','api','hex','bin','oct','raw','red','big','hot','top','low','new','old','cap','log','bit','set','get','run','end','map','tag','ref','pid','uid','gid','dev','mod','sys','env','var','lib','inc','ext','err','dbg','val','idx','num','len','max','min','sum','avg','add','sub','mul','div','rem','rat','vec','mat','row','col','dim','nil','nan','inf','yes','no','off','not','and','nor','xor','imp','iff','tru','fls','arr','obj','str','int','chr','buf','reg','seg','stk','que','lst','tre','grp','set','fun','app','win','frm','dlg','btn','tab','fld','img','txt','lnk','drv','dev','com','net','org','edu','gov','mil','int','pro','biz','inf','name','mobi','asia','cat','jobs','post','tel','travel','xxx','coop','aero','museum','arpa','root','local'],
            4: ['pass','test','root','user','abcd','1234','hack','open','null','void','true','fail','exit','loop','code','data','file','link','load','save','help','info','warn','error','debug','trace','login','auth','tick','halt','ping','sync','lock','wait','fork','exec','kill','push','pull','seek','jump','call','send','recv','read','write','pipe','open','shut','bind','conn','disc','list','peek','poll','drop','swap','move','copy','fill','sort','find','scan','next','prev','last','head','tail','step','stop','skip','mark','flag','size','type','mode','flag','mask','port','host','addr','name','path','base','dest','core','temp','swap','page','byte','word','line','block','chunk','frame','pixel','grid','node','edge','tree','root','leaf','seed','hash','sign','cert','keys','salt','seed','token','code','seed','rand','time','date','week','year','zone','diff','span','rate','freq','step','iter','loop','turn','tick','mile','kilo','mega','giga','tera','peta','exbi','zebi','yobi','zero','null','none','some','any','all','both','each','more','less','much','many','only','just','very','also','then','else','when','once','ever','never','still','back','deep','high','long','wide','near','far','here','away','left','right','up','down','over','past','into','onto','upon','from','with','that','this','what','which','how','why'],
            5: ['admin','qwert','abcde','12345','hello','world','sword','blade','shift','enter','space','break','pause','clear','reset','power','start','abort','flush','clean','crash','panic','fault','throw','catch','guard','check','valid','verify','trust','allow','grant','revoke','deny','block','limit','count','first','index','slice','range','delta','alpha','bravo','gamma','delta','theta','sigma','omega','prime','sqrt','floor','ceil','round','abs','sign','log2','log10','power','exp','sin','cos','tan','asin','acos','atan','atan2','sinh','cosh','tanh','clamp','lerp','min','max','swap','revrs','sort','uniq','flat','join','split','trim','strip','lower','upper','title','camel','snake','kebab','pascal','dot','path','slash','comma','colon','semi','point','vuln','exploit','shell','spawn','daemon','nginx','apache','linux','unix','posix','bash','zsh','csh','ksh','ssh','scp','sftp','rsync','curl','wget','ping','traceroute','dns','dhcp','nfs','smb','cifs','ldap','kerberos','oauth','jwt','ssrf','xss','csrf','rce','sqli','xxe'],
            6: ['123456','qwerty','secret','abcdef','letme1','access','oracle','ubuntu','debian','fedora','centos','redhat','gentoo','arch','alpine','window','macos','kernel','system','driver','module','packet','socket','thread','socket','server','client','broker','master','worker','leader','follower','proxy','cache','queue','stack','stream','buffer','object','render','shader','matrix','vector','tensor','scalar','domain','record','schema','cursor','cursor','cursor','python','golang','kotlin','swift','ruby','perl','rust','haskell','clojure','elixir','erlang','scala','lua','risc','arm','x86','amd64','mips','sparc','ppc','sysv','bsd','glibc','musl','tinfo','ncurse','readli','zlib','bzip2','xz','lz4','zstd','brotli','snappy','lzfse','acodec','mpeg','h264','h265','vp8','vp9','av1','opus','flac','vorbis','aac','mp3','wav','ogg','webm','mkv','mp4','flv','avi','gif','png','jpeg','tiff','webp','svg','pdf','docx','xlsx','json','yaml','toml','xml','html','css','js','ts','py','rb','go','rs','java','c','cpp','h','sh','bash','fish','zsh','ps1','bat','cmd','sql','r','m','pl','lua','vim','el','clj','ex','erl','hs','ml','scala','kt','dart','swift','zig','nim','v','wasm','net','com','org','wifi','wpa2','tls12','sshd','nginx','apache','docker','k8s','etcd','vault','consul','kafka','redis','mongo','mysql','psql','mariad','sqlite','oracle','msssql','couch','neo4j','influx','grafan','promet','elastic','logsta','kibana','jenkin','gitlab','github','codepi','travic','circle','argo','flux','helm','kusto','terraform'],
            7: ['1234567','7654321','1111111','0000000','9999999','letmein','changeme','trustno','abcdefg','testing','default','welcome','pass123','admin12','root1234','backup1','network','service','process','session','connect','request','respond','message','handler','control','command','monitor','trigger','deploy','release','rollback','restart','upgrade','downgrade','refresh','rebuild','compile','execute','analyze','display','console','terminal','prompt','dialog','option','setting','feature','plugin','module','extend','update','install','uninstal','config','preference','profile','account','privacy','security','encrypt','decrypt','encode','decode','compress','decompress','serialize','deserial','validate','sanitize','transform','convert','resolve','reject','fulfill','observe','subscribe','dispatch','emit','listen','notify','publish','consume','produce','process','compute','calculate','simulate','optimize','minimize','maximize','approxim','interpol','extrapo','regress','predict','classify','cluster','detect','recognize','identify','extract','generate','compose','aggregate','reduce','filter','project','invert','transpose','conjugate','normalize','orthogo','diagonal','symmetr','determi','eigen','singular','factoriz','decompos','permute','combin','shuffle','sample','random','stochast','markov','bayes','gaussian','poisson','uniform','exponent','weibull','pareto','lognorm','bernoul','binomia','hyperg','negbino','geom','chisq','fstat','tstat','betafunc','erf','gammafn','zetafn','digamma','polygam','bessel','legendr','chebys','hermite','laguerr','jacobi','fourier','laplace','hilbert','z transf','mellin','cauchy','riemann','dirichl','mobius','euler','fermat','mersenn','carmich','wilson','fermat2','bezout','euclid','kroneck','legendr2','jacobi2','ramanuj','hardy','waring','goldbac','collatz','thue','prouhet','morse','gray','huffman','shannon','fano','arthur','turing','church','godel','cantor','hilbert2','noether','gauss2','euler2','fermat3','laplace2','fourier2','newton2','leibniz','banach','jordan2','gram2','schmidt','schur','weierst','riemann2','mobius2','cauchy2','klein','poincar','rieman3','manifol','topolog','metric2','hausdor','fractal','mandelb','julia2','cantor2','sierpin','koch2','minkows','fatou2','bifurca','logisti','lorenz2','rossler','henon2','arnold2','chirikov','circle2','sine2','baker2','ikeda2','tinkerbell','gingerb','mahlena','swatrz','kapreka','collatz2','ulam2','goodste','busybea','tagasys','life2','rule110','conway2','langton','turmit2','curtist','margolu','levy2','brownia','wiener2','ornstei','uhlenbe','ito2','straton','fokker2','planck2','kolmogo','chapman','riccati','bessel2','airy2','hermite2','laguerr2','hyperg2','conflue','whittak','meijer2','fox2','hfun2','appell2','lauric2','pfaff2','gauss3','kummer2','euler3','dirichl2','lerch2','polylog','li2','clausen','glaisher','katona','chowla','hooley','barban','viggo','bombier','elliot','selberg2','weil2','tate2','lang2','grothen','atiyah2','wiles2','perelman','yau2','donalds','kontse','voevod','milnor2','smale2','nash2','morse2','thom2','cerf2','kirby2','lens2','kervair','rokhlin','wall2','browder','sullivan','quillen2','baues2','frieds2','serre2','deligne','beilins','bloch2','kato2','hodge2','griffit2','clemens2','voisin2','green2','taubes2','kronhei','mrowka','bismut2','getzler2','lenhard','pasc2','fermat4'],
        }
        // Add words of exact length
        if (wordsByLen[len]) candidates.push(...wordsByLen[len])
        // Also from commonPasswords
        for (const pw of commonPasswords) {
            if (pw.length === len) candidates.push(pw)
        }
        // Add from extendedPasswords
        for (const pw of extendedPasswords) {
            if (pw.length === len) candidates.push(pw)
        }
        // Brute force numbers of this length (if feasible)
        if (len <= 5) {
            const min = len === 1 ? 0 : Math.pow(10, len - 1)
            const max = Math.pow(10, len) - 1
            for (let i = min; i <= max; i++) candidates.push(String(i))
        } else if (len === 6) {
            // 6 digits = 900k, too many. Try common 6-digit patterns
            candidates.push('000000','111111','123456','654321','999999','000001','100000','999998')
            for (let i = 0; i <= 999; i++) candidates.push(String(i).padStart(6, '0'))
        } else if (len === 7) {
            // Try common 7-digit numbers and padded 6-digit
            for (let i = 0; i <= 999; i++) candidates.push(String(i).padStart(7, '0'))
            for (let i = 1000000; i <= 1000999; i++) candidates.push(String(i))
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
        const candidates = [...hostVariants]
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
                       hint.match(/from\s+(\d+)\s+to\s+(\d+)/i) ||
                       hint.match(/between\s+(\d+)\s+and\s+(\d+)/i)
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1])
        const hi = parseInt(rangeMatch[2])
        const candidates = [...hostVariants, ...popCulture]
        if (hi - lo <= 200) {
            for (let i = lo; i <= hi; i++) candidates.push(String(i))
        } else {
            // Too many — sample strategically
            for (let i = lo; i <= Math.min(lo + 50, hi); i++) candidates.push(String(i))
            for (let i = Math.max(hi - 10, lo); i <= hi; i++) candidates.push(String(i))
            // Common interesting numbers in range
            for (let i = lo; i <= hi; i++) {
                if (i === 42 || i === 69 || i === 13 || i === 7 || i === 0 || i === 1 ||
                    i === 99 || i === 100 || (i > 0 && (i & (i-1)) === 0)) // powers of 2
                    candidates.push(String(i))
            }
        }
        // Also try common passwords as some servers accept words for "number" hints
        candidates.push(...commonPasswords)
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
        // Without data, brute force common captcha answers + hostname numbers
        const numFromHost = hostname ? hostname.replace(/[^0-9]/g, '') : ''
        return [...new Set([
            numFromHost,
            '1234', '12345', '123456', '1337', '42', '0', '1',
            '123', '456', '789', '1111', '9999', '0000', '4242',
            '31337', '65536', '8080', '443', '80',
            ...hostVariants, ...popCulture, ...commonPasswords,
        ])]
    }

    // Dog's name / pet name / "my first dog's name"
    if (h.includes("dog") || h.includes("pet") || h.includes("puppy") || h.includes("hound") || h.includes("fur") || h.includes("first dog"))
        return [...new Set([
            'rex', 'rover', 'fido', 'buster', 'max', 'buddy', 'charlie', 'jack', 'cooper',
            'rocky', 'toby', 'duke', 'zeus', 'bear', 'tiger', 'shadow', 'bandit', 'sparky',
            'barney', 'winston', 'ginger', 'daisy', 'molly', 'lady', 'sasha', 'lola',
            'pluto', 'snoopy', 'odog', 'dog', 'doggy', 'pup', 'wolf', 'fox', 'cody',
            'lassie', 'beethoven', 'scooby', 'clifford', 'marley', 'houdini',
            'ace', 'apollo', 'archie', 'bailey', 'barkley', 'benji', 'biscuit', 'blaze',
            'boomer', 'bruno', 'bubba', 'buddy', 'copper', 'dakota', 'dexter', 'diego',
            'duffy', 'eddie', 'flash', 'frankie', 'george', 'gizmo', 'goofy', 'harley',
            'henry', 'hugo', 'indy', 'jasper', 'jake', 'koda', 'leo', 'linus',
            'lucky', 'luke', 'murphy', 'nala', 'odie', 'oliver', 'otis', 'ozzy',
            'patch', 'peanut', 'prince', 'rascal', 'romeo', 'roscoe', 'ruby', 'rusty',
            'sam', 'sammy', 'scout', 'scrappy', 'sebastian', 'simba', 'spike', 'stella',
            'taco', 'teddy', 'thor', 'tiny', 'tito', 'waffles', 'walter', 'wiggles',
            'winnebago', 'woof', 'yoshi', 'ziggy', 'zoe',
            'old yeller', 'copper', 'balto', 'toto', 'courage', 'brian', 'porthos',
            ...hostVariants, ...popCulture, ...extendedPasswords,
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
            'daedalus', 'icarus', 'minos', 'crete', 'underworld', 'labyrinthine',
            'corridoor', 'twist', 'spiral', 'winding', 'enigma', 'riddle', 'conundrum',
            // L4byr1nth specific
            'th3l4byr1nth', 'th3_l4byr1nth', 'thelabyrinth', 'the_labyrinth',
            'l4byr1nth', 'l4byr',
            '42', '0', '1', '13', '7', '666', '999', '314',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    // "Only a true master may pass" / master riddle
    if (h.includes('master') || h.includes('true master') || h.includes('may pass'))
        return [...new Set([
            'master', 'MASTER', 'Master', 'truth', 'TRUTH', 'Truth',
            'wise', 'Wise', 'WISE', 'sage', 'Sage', 'SAGE',
            'king', 'Knight', 'warrior', 'hero', 'champion',
            'gandalf', 'merlin', 'yoda', 'dumbledore', 'raistlin',
            'open', 'sesame', 'abracadabra', 'alohomora',
            'mellon', 'friend', 'speak', 'enter', 'password',
            'moria', 'balrog', 'fellowship', 'shire', 'hobbit',
            'excalibur', 'camelot', 'arthur', 'lancelot', 'avalon',
            'ancalime', 'elessar', 'elbereth', 'galadriel', 'legolas',
            'nihao', 'konnichiwa', 'ola', 'hello', 'welcome',
            'please', 'letmein', 'iamroot', 'sudo', 'su',
            // Neon-specific (neon^inc host)
            'neon', 'inc', 'neoninc', 'ne0n',
            '42', '0', '1', '7', '3', '13', '69', '777', '1337',
            'blade', 'cyber', 'hacker', 'crack', 'hack', 'root',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    // "you are one who's'nt authorized" / "not authorized" riddle
    if (h.includes('authorized') || h.includes("who's") || h.includes("who is not") || h.includes("whont"))
        return [...new Set([
            'authorized', 'unauthorized', 'yes', 'no', 'maybe', 'please', 'letmein',
            'access', 'granted', 'denied', 'permit', 'allow', 'accept', 'approve',
            'user', 'admin', 'root', 'sudo', 'su', 'login', 'auth', 'token',
            // "who's'nt" = who won't → negation riddle, password might be the opposite
            'iam', 'i_am', 'not', 'who', 'whos', 'whont', 'wont', 'will',
            '0', '1', '42', '1337', '401', '403', '200',
            // Hostname as password (common for these riddles)
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    // "(I'm busy browsing social media at the cafe)" — social media / cafe riddle
    // Also matches Chinese tea shop hosts (茶店 etc)
    if (h.includes('social media') || h.includes('browsing') || h.includes('cafe') || h.includes('coffee') ||
        h.includes('tea') || (hostname && /[\u4e00-\u9fff]/.test(hostname)))
        return [...new Set([
            'facebook', 'twitter', 'instagram', 'reddit', 'tiktok', 'youtube', 'myspace', 'tumblr', 'snapchat', 'pinterest', 'linkedin', 'slack', 'discord', 'whatsapp', 'telegram',
            'social', 'media', 'browse', 'cafe', 'coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'macchiato', 'ristretto', 'flatwhite',
            // Tea shop variants (茶店 = tea shop)
            'tea', 'cha', 'chadain', 'teashop', 'matcha', 'oolong', 'greentea', 'boba', 'bubbletea', 'chinese',
            'wifi', 'password', 'freewifi', 'freewifi!', 'guestwifi', 'cafewifi', 'netcafe',
            'coffee1', 'cafe1', '1234', '12345', 'admin', 'open',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    // Mountain riddle
    if (h.includes('ascend') || h.includes('mountain') || h.includes('highest'))
        return [...new Set([
            ...hostVariants, ...popCulture, ...mountainPasswords, ...extendedPasswords,
            // Also try reversed hostname (gro;rekcah = hacker)
            ...hostVariants.filter(c => c.length > 2).map(c => c.split('').reverse().join('')),
        ])]

    // Riddle fallback
    if (h.includes('riddle') || h.includes('true'))
        return [...new Set([...hostVariants, ...extendedPasswords])]

    // Symbol/emoji hints like "!!🌶️!!"
    if (hint && !h.match(/[a-z]{3,}/)) {
        // Try to decode common emojis to words
        const emojiWordMap = {
            '🌶️': 'spicy', '🔥': 'fire', '💀': 'dead', '❤️': 'love', '⚡': 'power',
            '🌟': 'star', '👑': 'king', '🗡️': 'blade', '🚀': 'rocket', '💎': 'diamond',
            '🔑': 'key', '🗝️': 'key', '🔒': 'lock', '🔓': 'unlock', '☠️': 'skull',
            '⭐': 'star', '🌈': 'rainbow', '🎯': 'target', '🍕': 'pizza', '🎵': 'music',
            '💻': 'computer', '🤖': 'robot', '👾': 'alien', '🧠': 'brain', '🦾': 'arm',
        }
        const emojiWords = []
        for (const [emoji, word] of Object.entries(emojiWordMap)) {
            if (hint.includes(emoji)) emojiWords.push(word)
        }
        const stripped = hint.replace(/[^a-zA-Z0-9!@#$%^&*_\-+=]/g, '')
        return [...new Set([
            stripped, '',
            ...emojiWords,
            // Spicy/hot variants
            'spicy', 'hot', 'fire', 'pepper', 'chili', 'habanero', 'jalapeno',
            'ghostpepper', 'capsaicin', 'scoville', 'heat', 'burn', 'flame',
            '!!', '!!!', '!@#', '!@#$', '!1!', '!0!',
            // Punctuation-only patterns with numbers
            '0', '1', '42', '69', '666', '1337',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]
    }

    // Fallback: if we have a hint but no solver, try everything
    // This catches any unrecognized hints
    return [...new Set([...hostVariants, ...popCulture, '', ...commonPasswords])]
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()
    // Suppress ALL noisy logs — only our file log remains
    ns.disableLog('ALL')

    // Dedup: if another instance is already running, exit
    const myPid = ns.pid
    const others = ns.ps(host).filter(p => p.filename === SCRIPT_NAME && p.pid !== myPid)
    if (others.length > 0) return

    while (true) {
        // Step 0: Free RAM (only if blocked > 0)
        try {
            const blocked = await ns.dnet.getBlockedRam(host)
            if (blocked > 0) await ns.dnet.memoryReallocation()
        } catch (e) { /* ignore */ }

        // Step 1: Probe
        let peers
        try {
            peers = await ns.dnet.probe()
        } catch (e) {
            await ns.asleep(1000)
            continue
        }

        if (!peers || peers.length === 0) {
            await ns.asleep(1000)
            continue
        }

        for (const neighbor of peers) {
            if (neighbor === 'home' || neighbor === host) continue

            // Step A: get details
            let details
            try {
                details = await ns.dnet.getServerDetails(neighbor)
            } catch (e) { continue }

            if (!details.isOnline || !details.isConnectedToCurrentServer) continue

            // Step B: auth (skip if already authenticated)
            if (!details.hasSession) {
                const hint = details.passwordHint || ''
                const data = details.data || ''
                const candidates = solvePassword(hint, data, neighbor)

                if (candidates.length === 0) continue

                let authed = false
                for (const pw of candidates) {
                    try {
                        const r = await ns.dnet.authenticate(neighbor, pw)
                        if (r.success) {
                            authed = true
                            break
                        }
                    } catch (e) { /* try next */ }
                }

                if (!authed) {
                    // Heartbleed for debug info
                    try {
                        const logs = await ns.dnet.heartbleed(neighbor)
                        if (logs && logs.length > 0) {
                            log(ns, `${neighbor} BLEED: ${JSON.stringify(logs).substring(0, 300)}`)
                        }
                    } catch (e) { /* not available */ }
                    log(ns, `${neighbor} FAIL '${hint}' data='${data}'`)
                    await logFail(ns, neighbor, 'auth-failed', hint)
                    continue
                }
            }

            // Step C: scp scripts to neighbor
            try {
                await ns.scp(SCRIPT_NAME, neighbor)
                await ns.scp('darknet-ram.js', neighbor)
                await ns.scp(EXTRACTOR, neighbor)
            } catch (e) { continue }

            // Step D: exec darknet.js on neighbor — check if already running
            const neighborProcs = ns.ps(neighbor)
            const alreadyRunning = neighborProcs.some(p => p.filename === SCRIPT_NAME)
            if (!alreadyRunning) {
                try { ns.exec(SCRIPT_NAME, neighbor, 1) } catch (e) { /* ignore */ }
            }
        }

        // Step E: run extractor on THIS server — check if already running
        const localProcs = ns.ps(host)
        const extractorRunning = localProcs.some(p => p.filename === EXTRACTOR)
        if (!extractorRunning) {
            try { ns.exec(EXTRACTOR, host, 1) } catch (e) { /* ignore */ }
        }

        await ns.asleep(1000)
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
