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
    ns.print(`[dnet] ${msg}`)
}

async function logFail(ns, server, reason, hint = '') {
    ns.print(`[dnet-FAIL] ${server} | ${reason} | ${hint}`)
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
    // Mountain / everest hints — check BOTH hostname AND hint text
    if (hlow.includes('everest') || hlow.includes('mountain') || hlow.includes('himalaya') ||
        h.includes('mountain') || h.includes('everest') || h.includes('himalaya') || h.includes('ascend') ||
        h.includes('summit') || h.includes('peak') || h.includes('climb') || h.includes('highest'))
        popCulture.push('everest', 'EVEREST', 'Everest', 'sagarmatha', 'Sagarmatha', 'SAGARMATHA',
            'chomolungma', 'Chomolungma', 'CHOMOLUNGMA', '8848', '8849', '8848.86', '29029', '29032',
            'summit', 'SUMMIT', 'Summit', 'peak', 'PEAK', 'Peak', 'top', 'TOP', 'Top',
            'ascend', 'ASCEND', 'Ascend', 'mountain', 'MOUNTAIN', 'Mountain',
            'climb', 'CLIMB', 'Climb', 'highest', 'HIGHEST', 'Highest')
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
    // zenith / zero_day themed
    if (hlow.includes('zenith') || hlow.includes('zeni7h') || hlow.includes('z3ro') || hlow.includes('zero'))
        popCulture.push('zenith', 'zeni7h', 'peak', 'summit', 'top', 'apex', 'pinnacle', 'crest', 'crown', 'zero', 'z3ro', '0day', 'zeroday', 'spanky')
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

    // Social media / browsing / cafe hints
    if (h.includes('social media') || h.includes('browsing') || h.includes('cafe') || h.includes('twitter') ||
        h.includes('facebook') || h.includes('instagram') || h.includes('tiktok') || h.includes('reddit'))
        popCulture.push('social', 'SOCIAL', 'Social', 'media', 'MEDIA', 'Media', 'browse', 'BROWSE', 'Browse',
            'cafe', 'CAFE', 'Cafe', 'twitter', 'TWITTER', 'Twitter', 'tweet', 'TWEET', 'Tweet',
            'facebook', 'FACEBOOK', 'Facebook', 'instagram', 'INSTAGRAM', 'Instagram', 'tiktok', 'TikTok',
            'reddit', 'REDDIT', 'Reddit', 'post', 'POST', 'Post', 'like', 'LIKE', 'Like',
            'follow', 'FOLLOW', 'Follow', 'share', 'SHARE', 'Share', 'viral', 'VIRAL', 'Viral',
            'selfie', 'SELFIE', 'Selfie', 'hashtag', 'HASHTAG', 'Hashtag', 'influencer', 'INSTAGRAM',
            'online', 'ONLINE', 'Online', 'web', 'WEB', 'Web', 'internet', 'INTERNET', 'Internet',
            'scroll', 'SCROLL', 'Scroll', 'feed', 'FEED', 'Feed', 'timeline', 'TIMELINE', 'Timeline');

    // Unauthorized / access denied hints
    if (h.includes('authorized') || h.includes('unauthorized') || h.includes('access denied') ||
        h.includes('access granted') || h.includes('permission') || h.includes('forbidden') ||
        h.includes(' restricted') || h.includes("who's'nt") || h.includes('whos not') || h.includes("isn't authorized"))
        popCulture.push('authorized', 'AUTHORIZED', 'Authorized', 'unauthorized', 'UNAUTHORIZED', 'Unauthorized',
            'access', 'ACCESS', 'Access', 'granted', 'GRANTED', 'Granted', 'denied', 'DENIED', 'Denied',
            'permission', 'PERMISSION', 'Permission', 'allow', 'ALLOW', 'Allow', 'deny', 'DENY', 'Deny',
            'forbidden', 'FORBIDDEN', 'Forbidden', 'restricted', 'RESTRICTED', 'Restricted',
            'admin', 'ADMIN', 'Admin', 'root', 'ROOT', 'Root', 'sudo', 'SUDO', 'Sudo');
    // Try hostname as-is for authorized/unauthorized — commonly the password IS the hostname here
    if (h.includes('authorized') || h.includes("who's'nt") || h.includes('whos not'))
        return [...new Set([hostname, hostname.toLowerCase(), ...hostVariants, ...popCulture,
            'authorized', 'unauthorized', 'access', 'granted', 'denied', 'admin', 'password', 'default'])];

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

    // "PIN X" or "The PIN is X" or "PIN: X" (but NOT "PIN uses" — that's handled by shuffled/sorted above)
    const pinMatch = hint.match(/pin\s+(?:is|:|=\s*)(\d+)/i) || hint.match(/pin\s*[:=]\s*(\d+)/i)
    if (pinMatch && pinMatch[1]) {
        const pin = pinMatch[1]
        const candidates = [pin]
        const digits = pin.split('')
        for (const d of digits) candidates.push(d)
        candidates.push(pin.split('').reverse().join(''))
        candidates.push('0' + pin, '00' + pin)
        const pinNum = parseInt(pin)
        candidates.push(String(pinNum * 2), String(pinNum + 1), String(pinNum - 1))
        return [...new Set([...candidates, ...hostVariants, ...popCulture])]
    }

    // "The password is shuffled NNN" / "I accidentally sorted the password: NNN" / "PIN uses NNN"
    // Game source: getPassword() generates numeric string, then sorted. Number().toString() strips leading zeros.
    // So "shuffled 028" means digits [0,2,8], password is a permutation without leading zero: 208,280,802,820,28,82
    const shuffledMatch = hint.match(/shuffled\s+(\d+)/i)
    const sortedMatch = hint.match(/sorted\s+(?:the\s+)?(?:password|pin)?\s*[:=]?\s*(\d+)/i)
    const pinUsesMatch = hint.match(/pin\s+uses\s+(\d+)/i)
    const digitsStr = shuffledMatch?.[1] || sortedMatch?.[1] || pinUsesMatch?.[1]
    if (digitsStr) {
        const perms = permutations(digitsStr)
        // Remove leading zeros (Number().toString() behavior)
        const candidates = [...new Set(perms.map(p => String(Number(p))))]
        // Also try the raw sorted string and common PIN patterns
        candidates.push(digitsStr, digitsStr.split('').reverse().join(''))
        // Try with one extra digit appended (4-digit PIN from 3-digit hint)
        if (digitsStr.length <= 3) {
            for (let d = 0; d <= 9; d++) {
                const extended = digitsStr + String(d)
                candidates.push(...permutations(extended).map(p => String(Number(p))))
            }
        }
        return [...new Set([...candidates, ...hostVariants])]
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

    // "The password is not set" / "no password" / "I didn't set a password" — try empty FIRST
    // Game source (getNoPasswordConfig): password = "" (empty string)
    if (h.includes('not set') || h.includes("didn't set a") || h.includes("did not set") || h.includes("never set")) {
        if (!h.includes('default')) {
            return [...new Set(['', ...hostVariants])]
        }
    }

    // Default / factory / never changed / didn't set / "the password is the default password"
    // Game source: defaultSettingsDictionary = ["admin", "password", "0000", "12345"]
    if (h.includes('default') || h.includes('factory') || h.includes('never changed') ||
        h.includes("didn't change") || h.includes("didn't set") || h.includes("did i set") ||
        h.includes('still') || h.includes('original') || h.includes('no password')) {
        return [...new Set([
            'admin', 'password', '0000', '12345',  // game's actual defaultSettingsDictionary
            '',  // some servers have no password
            ...hostVariants,  // hostname as password (common fallback)
        ])]
    }

    // Buffer length: "Warning: password buffer is N bytes"
    // Game source: getPassword(length, true) — alphanumeric (letters + digits), exact length
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const candidates = [...hostVariants.filter(v => v.length === len)]
        // Brute force alphanumeric of exact length
        // For len <= 4, brute force all; for len 5-6, use common patterns + hostname
        if (len <= 3) {
            // All 3-char alphanumeric: 36^3 = 46656 — manageable
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
            for (let i = 0; i < chars.length; i++) {
                for (let j = 0; j < chars.length; j++) {
                    for (let k = 0; k < chars.length; k++) {
                        candidates.push(chars[i] + chars[j] + chars[k])
                    }
                }
            }
        } else if (len === 4) {
            // 36^4 = 1.6M — too many. Use common 4-char patterns
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
            // All 4-digit numbers
            for (let i = 0; i <= 9999; i++) candidates.push(String(i).padStart(4, '0'))
            // Common 4-letter words
            const words4 = ['pass','test','root','user','abcd','1234','hack','open','null','void','true','fail','exit','loop','code','data','file','link','load','save','help','info','warn','login','auth','tick','halt','ping','sync','lock','wait','fork','exec','kill','push','pull','read','write','pipe','bind','conn','list','drop','swap','move','copy','fill','sort','find','scan','next','prev','last','head','tail','step','stop','skip','mark','flag','size','type','mode','port','host','addr','name','path','base','dest','core','temp','page','byte','word','line','block','chunk','frame','node','edge','tree','leaf','seed','hash','sign','cert','keys','salt','token','rand','time','date','week','year','zone','diff','span','rate','freq','iter','turn','tick','mile','kilo','mega','giga','tera','peta','zero','none','some','any','all','both','each','more','less','much','many','only','just','very','also','then','else','when','once','ever','still','back','deep','high','long','wide','near','far','here','away','left','right','up','down','over','past','into','from','with','that','this','what','which','how','why']
            candidates.push(...words4)
            // 2 chars + 2 digits patterns
            for (let i = 0; i < chars.length; i++) {
                for (let j = 0; j < chars.length; j++) {
                    for (let d = 0; d <= 99; d++) {
                        candidates.push(chars[i] + chars[j] + String(d).padStart(2, '0'))
                        candidates.push(String(d).padStart(2, '0') + chars[i] + chars[j])
                    }
                }
            }
        } else if (len === 5) {
            // 5 chars: common words + hostname-based
            const words5 = ['admin','qwert','abcde','12345','hello','world','sword','blade','shift','enter','space','break','pause','clear','reset','power','start','abort','flush','clean','crash','panic','fault','throw','catch','guard','check','valid','verify','trust','allow','grant','revoke','deny','block','limit','count','first','index','slice','range','delta','alpha','bravo','gamma','theta','sigma','omega','prime','sqrt','floor','ceil','round','login','shell','spawn','daemon','nginx','apache','linux','unix','posix','bash','ssh','scp','curl','wget','ping','dns','dhcp','nfs','smb','ldap','oauth','jwt','xss','csrf','rce','sqli']
            candidates.push(...words5)
            // 5-digit numbers
            for (let i = 0; i <= 99999; i += 100) candidates.push(String(i).padStart(5, '0'))
            for (let i = 0; i <= 999; i++) candidates.push(String(i).padStart(5, '0'))
        } else if (len === 6) {
            // 6 chars: hostname-based + common words
            const words6 = ['123456','qwerty','secret','abcdef','letme1','access','oracle','ubuntu','debian','fedora','centos','redhat','gentoo','arch','window','macos','kernel','system','driver','module','packet','socket','thread','server','client','broker','master','worker','leader','proxy','cache','queue','stack','stream','buffer','object','render','matrix','vector','domain','record','schema','python','golang','kotlin','swift','ruby','perl','rust','haskell','clojure','elixir','erlang','scala','lua','risc','arm','x86','amd64','mips','sparc','ppc','sysv','bsd','glibc','musl','zlib','bzip2','xz','lz4','zstd','brotli','snappy','acodec','mpeg','h264','h265','vp8','vp9','av1','opus','flac','vorbis','aac','mp3','wav','ogg','webm','mkv','mp4','flv','avi','gif','png','jpeg','tiff','webp','svg','pdf','json','yaml','toml','xml','html','css','js','ts','py','rb','go','rs','java','c','cpp','h','sh','bash','fish','zsh','ps1','bat','cmd','sql','r','m','pl','lua','vim','el','clj','ex','erl','hs','ml','scala','kt','dart','zig','nim','v','wasm','net','com','org','wifi','wpa2','sshd','docker','k8s','etcd','vault','consul','kafka','redis','mongo','mysql','psql','sqlite','couch','neo4j','influx','jenkin','gitlab','github','codepi','travic','circle','argo','flux','helm','kusto','terraform']
            candidates.push(...words6)
            // 6-digit numbers (common patterns)
            for (let i = 0; i <= 999; i++) candidates.push(String(i).padStart(6, '0'))
            candidates.push('000000','111111','123456','654321','999999')
        } else {
            // 7+ chars: hostname-based only + common words of that length
            for (const pw of commonPasswords) {
                if (pw.length === len) candidates.push(pw)
            }
            for (const pw of extendedPasswords) {
                if (pw.length === len) candidates.push(pw)
            }
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
            // Every number is divisible by 1 — brute force 0-99999
            for (let i = 0; i <= 99999; i++) candidates.push(String(i))
            // Plus common longer numbers and repeated digits
            candidates.push('12345', '54321', '123456', '654321', '1234567', '7777777',
                '11111', '22222', '33333', '44444', '55555', '66666', '77777', '88888', '99999',
                '100000', '100001', '123123', '112233', '123321',
                '10101', '12300', '45600', '78900', '99990',
                '46660', '46661', '46662', '46663', '46664', '46665', '46666', '46667', '46668', '46669',
                '50000', '60000', '70000', '80000', '90000',
            )
        } else {
            for (let i = 0; i <= 1000; i++) candidates.push(String(divBy * i))
        }
        // Plus word passwords (some servers accept words)
        candidates.push(...commonPasswords)
        return [...new Set(candidates)]
    }

    // Range: "number between X and Y" or "a number between X and Y"
    // Game source (getGuessNumberConfig): password = floor((random * 10 * (difficulty+3)) / 3)
    // maxNumber = 10^password.length, so "between 0 and 10" = 1 digit, "0 and 100" = 2 digits, etc.
    const rangeMatch = hint.match(/(?:a\s+)?number\s+between\s+(\d+)\s+and\s+(\d+)/i) ||
                       hint.match(/from\s+(\d+)\s+to\s+(\d+)/i) ||
                       hint.match(/between\s+(\d+)\s+and\s+(\d+)/i)
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1])
        const hi = parseInt(rangeMatch[2])
        const candidates = [...hostVariants]
        // Try ALL numbers in range (Bitburner auth is fast)
        for (let i = lo; i <= hi; i++) candidates.push(String(i))
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
    // Game source: dogNameDictionary = ["fido", "spot", "rover", "max"]
    if (h.includes("dog") || h.includes("pet") || h.includes("puppy") || h.includes("hound") || h.includes("fur") || h.includes("first dog"))
        return [...new Set([
            'fido', 'spot', 'rover', 'max',  // game's actual dogNameDictionary
            ...hostVariants,
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
            'master', 'MASTER', 'Master',
            'phantom', 'PHANTOM', 'Phantom',  // net;gl0bal_pharmaceu71cal5 → "phantom" is in hostname
            'truth', 'TRUTH', 'Truth',
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
            'global', 'pharmaceutical', 'pharma',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    // "you are one who's'nt authorized" — YESN'T minigame
    // Game source (getYesn_tConfig): getPassword(3 + difficulty/2, difficulty > 8)
    // Password is numeric or alphanumeric, 3+ chars
    if (h.includes('authorized') || h.includes("who's") || h.includes("who is not") || h.includes("whont")) {
        const candidates = [...hostVariants]
        // Brute force numbers 0-99999
        for (let i = 0; i <= 99999; i++) candidates.push(String(i))
        // Common alphanumeric
        for (const pw of commonPasswords) candidates.push(pw)
        return [...new Set(candidates)]
    }

    // "(I'm busy browsing social media at the cafe)" — PACKET SNIFFER
    // Game source (getPacketSnifferConfig): password = getPassword(3 + random*6, difficulty > 8)
    // The password is hidden in heartbleed logs — look for phrases like "Your password has been reset. It is now set to X"
    // This solver relies on heartbleed extraction in the main auth loop, but we try common patterns too
    if (h.includes('social media') || h.includes('browsing') || h.includes('cafe') || h.includes('coffee') ||
        h.includes('tea') || (hostname && /[\u4e00-\u9fff]/.test(hostname))) {
        // Password is numeric or alphanumeric, 3-9 chars — brute force common lengths
        const candidates = [...hostVariants]
        // 3-6 digit numbers (most common for low difficulty)
        for (let i = 0; i <= 999999; i++) candidates.push(String(i))
        // Common alphanumeric patterns
        for (const pw of commonPasswords) candidates.push(pw)
        return [...new Set(candidates)]
    }

    // Mountain riddle — "Ascend the highest mountain!"
    // Game source (getKingOfTheHillConfig): getPassword(min(1 + difficulty/6, 10)) — NUMERIC only
    if (h.includes('ascend') || h.includes('mountain') || h.includes('highest')) {
        const candidates = [...hostVariants]
        // Numeric passwords up to 10 digits — brute force common patterns
        for (let i = 0; i <= 99999; i++) candidates.push(String(i))
        // Common "mountain" numbers
        candidates.push('8848','8849','29029','29032','29035','29028','8850','8848m')
        return [...new Set(candidates)]
    }

    // Riddle fallback
    if (h.includes('riddle') || h.includes('true'))
        return [...new Set([...hostVariants, ...extendedPasswords])]

    // Symbol/emoji hints like "!!🌶️!!"
    // Game source (getSpiceLevelConfig): getPassword(3 + difficulty/3, difficulty > 8)
    // Password is numeric or alphanumeric, 3-11 chars
    if (hint && !h.match(/[a-z]{3,}/)) {
        const stripped = hint.replace(/[^a-zA-Z0-9!@#$%^&*_\-+=]/g, '')
        const candidates = [...new Set([stripped, ''])]
        // Brute force 3-6 digit numbers (most common)
        for (let i = 0; i <= 999999; i++) candidates.push(String(i))
        // Common alphanumeric
        for (const pw of commonPasswords) candidates.push(pw)
        candidates.push(...hostVariants)
        return [...new Set(candidates)]
    }

    // Fallback: if we have a hint but no solver, try everything
    // This catches any unrecognized hints
    return [...new Set([...hostVariants, ...popCulture, '', ...commonPasswords])]
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()

    // Only run on darkweb — ns.dnet API is only available there
    if (host !== 'darkweb') {
        ns.print(`ERROR: ${SCRIPT_NAME} must run on darkweb, not ${host}. Exiting.`);
        return;
    }

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
            ns.print(`[dnet] PROBE ERROR: ${e}`)
            await ns.asleep(500)
            continue
        }

        if (!peers || peers.length === 0) {
            await ns.asleep(500)
            continue
        }

        ns.print(`[dnet] PROBE: found ${peers.length} peers: ${peers.join(', ')}`)

        for (const neighbor of peers) {
            if (neighbor === 'home' || neighbor === host) continue

            ns.print(`[dnet] Processing neighbor: ${neighbor}`)

            // Step A: get details
            let details
            try {
                details = await ns.dnet.getServerDetails(neighbor)
            } catch (e) {
                ns.print(`[dnet] ${neighbor} getServerDetails ERROR: ${e}`)
                continue
            }

            ns.print(`[dnet] ${neighbor} details: online=${details.isOnline} connected=${details.isConnectedToCurrentServer} hasSession=${details.hasSession} hint="${details.passwordHint}"`)

            if (!details.isOnline || !details.isConnectedToCurrentServer) {
                ns.print(`[dnet] ${neighbor} SKIPPED (offline or not connected)`)
                continue
            }

            // Track whether we have session (either already had it or just got it)
            let hasSession = details.hasSession

            // Step B: auth (skip if already authenticated)
            if (!hasSession) {
                const hint = details.passwordHint || ''
                const data = details.data || ''
                const candidates = solvePassword(hint, data, neighbor)

                ns.print(`[dnet] ${neighbor} auth: ${candidates.length} candidates, hint="${hint}"`)

                let authed = false
                if (candidates.length > 0) {
                    for (const pw of candidates) {
                        try {
                            const r = await ns.dnet.authenticate(neighbor, pw)
                            if (r.success) {
                                authed = true
                                hasSession = true
                                ns.print(`[dnet] ${neighbor} AUTH SUCCESS with "${pw}"`)
                                break
                            }
                        } catch (e) { /* try next */ }
                    }
                }

                if (!authed) {
                    // Heartbleed for debug info AND password extraction
                    let bleedPasswords = []
                    try {
                        const logs = await ns.dnet.heartbleed(neighbor)
                        if (logs && logs.length > 0) {
                            log(ns, `${neighbor} BLEED: ${JSON.stringify(logs).substring(0, 300)}`)
                            for (const entry of logs) {
                                const s = String(entry)
                                const pwPatterns = [
                                    /password\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /passwd\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /pass\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /pw\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /secret\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /key\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /login\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /admin\s*[:=]\s*['"]?(\w+)['"]?/i,
                                    /now set to\s+['"]?(\w+)['"]?\s*[\.\!]?\s*$/i,
                                    /account password\s+(?:is|has been changed to)\s+['"]?(\w+)['"]?/i,
                                ]
                                for (const pat of pwPatterns) {
                                    const m = s.match(pat)
                                    if (m && m[1]) bleedPasswords.push(m[1])
                                }
                                if (s.length <= 30 && !s.includes(' ') && /^\w+$/.test(s)) {
                                    bleedPasswords.push(s)
                                }
                                const lastWord = s.match(/to\s+(\w+)\s*[\.\!]?\s*$/i)
                                if (lastWord && lastWord[1] && lastWord[1].length <= 15) {
                                    bleedPasswords.push(lastWord[1])
                                }
                            }
                        }
                    } catch (e) { /* not available */ }
                    if (bleedPasswords.length > 0) {
                        ns.print(`[dnet] ${neighbor} heartbleed: ${bleedPasswords.length} candidates`)
                        for (const pw of [...new Set(bleedPasswords)]) {
                            try {
                                const r = await ns.dnet.authenticate(neighbor, pw)
                                if (r.success) { authed = true; hasSession = true; ns.print(`[dnet] ${neighbor} AUTH SUCCESS (bleed) with "${pw}"`); break }
                            } catch (e) { /* try next */ }
                        }
                    }
                    if (!authed) {
                        const bleedInfo = bleedPasswords.length > 0 ? ` | bleed: ${bleedPasswords.length} candidates` : ' | no bleed'
                        ns.print(`[dnet] ${neighbor} AUTH FAILED: tried ${candidates.length}${bleedInfo}`)
                        await logFail(ns, neighbor, 'auth-failed', `${hint} | tried ${candidates.length}${bleedInfo}`)
                    }
                }
            } else {
                ns.print(`[dnet] ${neighbor} already has session`)
            }

            // Step C: ALWAYS scp scripts to neighbor (even if auth failed)
            // The neighbor needs the scripts to propagate further
            try {
                const scp1 = await ns.scp(SCRIPT_NAME, neighbor, host)
                const scp2 = await ns.scp('darknet-ram.js', neighbor, host)
                const scp3 = await ns.scp(EXTRACTOR, neighbor, host)
                ns.print(`[dnet] ${neighbor} SCP: darknet.js=${scp1} ram.js=${scp2} extractor=${scp3}`)
            } catch (e) {
                ns.print(`[dnet] ${neighbor} SCP ERROR: ${e}`)
            }

            // Step D: exec darknet.js on neighbor if we have session
            // Also try exec even without session — some servers allow it
            try {
                const neighborProcs = ns.ps(neighbor)
                const alreadyRunning = neighborProcs.some(p => p.filename === SCRIPT_NAME)
                if (alreadyRunning) {
                    ns.print(`[dnet] ${neighbor} already running darknet.js`)
                } else {
                    const scriptRam = ns.getScriptRam(SCRIPT_NAME, host)
                    const freeRam = ns.getServerMaxRam(neighbor) - ns.getServerUsedRam(neighbor)
                    const maxThreads = Math.max(1, Math.floor(freeRam / scriptRam))
                    const threads = Math.min(maxThreads, 1)
                    ns.print(`[dnet] ${neighbor} EXEC: scriptRam=${scriptRam} freeRam=${freeRam} maxThreads=${maxThreads} hasSession=${hasSession}`)
                    const pid = ns.exec(SCRIPT_NAME, neighbor, threads)
                    ns.print(`[dnet] ${neighbor} EXEC RESULT: pid=${pid}`)
                    if (pid === 0 && hasSession) {
                        // If exec failed but we have session, try with 1 thread minimum
                        const pid2 = ns.exec(SCRIPT_NAME, neighbor, 1)
                        ns.print(`[dnet] ${neighbor} EXEC RETRY: pid=${pid2}`)
                    }
                    // Verify the script is running
                    await ns.asleep(100)
                    const procsAfter = ns.ps(neighbor)
                    const running = procsAfter.filter(p => p.filename === SCRIPT_NAME)
                    ns.print(`[dnet] ${neighbor} VERIFY: ${running.length} darknet.js instances running`)
                }
            } catch (e) {
                ns.print(`[dnet] ${neighbor} EXEC ERROR: ${e}`)
            }
        }

        // Step E: run extractor on THIS server — check if already running
        const localProcs = ns.ps(host)
        const extractorRunning = localProcs.some(p => p.filename === EXTRACTOR)
        if (!extractorRunning) {
            try { ns.exec(EXTRACTOR, host, 1) } catch (e) { /* ignore */ }
        }

        await ns.asleep(200)  // Fast loop for rapid propagation
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
