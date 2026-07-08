/**
 * darknet.js — Darknet helper (loop mode, auto-propagate)
 * Loops every 500ms:
 *   - Check if already running (skip spawn if so)
 *   - Free RAM (memoryReallocation)
 *   - Probe neighbors
 *   - Auth (skip if hasSession), scp+exec propagate
 *   - Run extractor locally
 * 
 * Auth runs in this script on the current darknet server.
 * Candidates are capped to avoid tick timeouts.
 * SCP always from home (darknet servers may not scp between each other).
 */

const __autoRestartStartTime__ = Date.now();
const SCRIPT_NAME = 'darknet.js'
const EXTRACTOR = 'darknet-extractor.js'
const RAM_SCRIPT = 'darknet-ram.js'
const ALL_SCRIPTS = [SCRIPT_NAME, EXTRACTOR, RAM_SCRIPT]

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
    return [...new Set(results)]
}

function hostnameVariants(hostname) {
    if (!hostname) return []
    const leetMap = {'4':'a','3':'e','1':'i','0':'o','7':'t','5':'s'}
    const rot13 = (s) => s.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26))
    const leetDecode = (s) => { let r = ''; for (const c of s.toLowerCase()) r += leetMap[c] || c; return r }
    const caps = (s) => [s, s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()]
    const seen = new Set()
    const out = []
    const add = (...vals) => { for (const v of vals) { if (v && !seen.has(v)) { seen.add(v); out.push(v) } } }

    const emojiDecoded = hostname
        .replace(/\u{1F171}/gu, 'B').replace(/\u{1F170}/gu, 'A')
        .replace(/\u{1F17E}/gu, 'O').replace(/\u{1F17F}/gu, 'P')
        .replace(/\u{1F18E}/gu, 'AB')
    const source = emojiDecoded !== hostname ? emojiDecoded : hostname

    const hostClean = source.replace(/[^a-zA-Z0-9]/g, '')
    const alphaOnly = source.replace(/[^a-zA-Z]/g, '')
    const numOnly = source.replace(/[^0-9]/g, '')

    if (hostClean) add(...caps(hostClean))
    if (alphaOnly && alphaOnly !== hostClean) add(...caps(alphaOnly))
    if (numOnly) add(numOnly)

    const hostLeet = leetDecode(hostClean)
    if (hostLeet !== hostClean.toLowerCase()) add(...caps(hostLeet))

    add(hostClean.split('').reverse().join(''))
    add(hostLeet.split('').reverse().join(''))
    add(rot13(hostClean))

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
        const pNum = part.replace(/[^0-9]/g, '')
        if (pNum) add(pNum)
    }

    const revLeetParts = leetParts.map(p => p.split('').reverse().join('')).filter(r => r.length >= 3)
    for (const rp of revLeetParts) add(rp)
    add([...revLeetParts].reverse().join(''))
    add([...revLeetParts].reverse().join('_'))
    add(revLeetParts.join(''))
    add(leetParts.join('_'), revLeetParts.join('_'))
    for (let i = 0; i < leetParts.length; i++) {
        for (let j = i + 1; j < leetParts.length; j++) {
            add(leetParts[i] + leetParts[j], leetParts[j] + leetParts[i])
        }
    }

    const topVariants = out.slice(0, 20)
    for (const v of topVariants) {
        add(v + '1', v + '123', '!' + v, v + '!', v + '@', v + '#')
    }

    if (hostname && /[\u4e00-\u9fff]/.test(hostname)) add('cha', 'tea', 'chadain')
    if (/^[^a-zA-Z0-9]+$/.test(hostname)) add(hostname, 'dot', 'dots')
    if (hostname.includes(';--')) add('droptable', 'bobbytables', 'sql', 'sqli', "';--", "1=1")
    for (const lp of leetParts) {
        const rev = lp.split('').reverse().join('')
        if (rev.length >= 3 && rev !== lp) add(rev)
    }

    return out
}

const HARDCODED_PASSWORDS = {
    'th3_l4byr1nth': '!!the:masterwork:of:daedalus<5109>!!',
}

function solvePassword(hint, hintData, hostname = '') {
    if (hostname && HARDCODED_PASSWORDS[hostname]) {
        return [HARDCODED_PASSWORDS[hostname], ...hostnameVariants(hostname)]
    }
    if (!hint) return []
    const h = hint.toLowerCase()
    const hostVariants = hostnameVariants(hostname)
    const popCulture = []
    const hlow = (hostname || '').toLowerCase()
    const expectedMatch = hint.match(/expected\\s*'([^']+)'/i)
    if (expectedMatch && expectedMatch[1]) {
        return [expectedMatch[1]]
    }

    if (hlow.includes('anor') || hlow.includes('londo') || hlow.includes('lordran') || hlow.includes('souls') || hlow.includes('firelink'))
        popCulture.push('solaire', 'darkwraith', 'hollow', 'gwyndolin', 'ornstein', 'smough', 'gwyn', 'nito', 'seath', 'kalameet', 'priscilla', 'artorias', 'manus', 'quelaag', 'chaos', 'fire', 'bonfire', 'estus', 'pyromancy', 'dark', 'sun', 'praise the sun', 'darksouls', 'lordran', 'anorlondo', 'ash', 'ember', 'kindle', 'humanity', 'hollowed')
    if (hlow.includes('machine') || hlow.includes('church') || hlow.includes('god'))
        popCulture.push('machine', 'god', 'deus', 'church', 'templar', 'cyber', 'android', 'synth', 'matrix', 'skynet', 'omnic', 'primordial', 'architect', 'builder', 'creator', 'maker')
    if (hlow.includes('labyr') || hlow.includes('maze') || hlow.includes('l4byr'))
        popCulture.push('minotaur', 'theseus', 'ariadne', 'thread', 'labyrinth', 'maze', 'daedalus', 'icarus', 'corridoor')
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
        popCulture.push('rogue', 'rogueone', 'rebel', 'spy', 'agent', 'covert', 'stealth', 'roguesecurity', 'security', 'secure', 'sec', 'secu', 'securi7y', 'r0gue')
    if (hlow.includes('cryp7o') || hlow.includes('crypto') || hlow.includes('sanctuary') || hlow.includes('5anc7uary'))
        popCulture.push('crypto', 'cryp7o', 'sanctuary', '5anc7uary', 'sanc7uary', 'encrypt', 'cipher', 'aes', 'rsa', 'sha256', 'hash', 'cryptosanctuary', 'cryp7o5anc7uary', 'temple', 'shrine', 'haven', 'refuge', 'asylum')
    if (hlow.includes('blade') || hlow.includes('b1ade'))
        popCulture.push('blade', 'b1ade', 'bladerunner', 'runner', 'deckard', 'replicant', 'tyrell', 'nexus', 'neon', 'cyberpunk', 'android', 'ricardo', 'batty')
    if (hlow.includes('bit') && hlow.includes('system'))
        popCulture.push('bitsystems', 'bitsys', 'binary', 'byte', 'bit', 'system', 'sys', '0b', '0x', 'overflow', '8bit', '16bit', '32bit', '64bit')
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
    if (hlow.includes('zenith') || hlow.includes('zeni7h') || hlow.includes('z3ro') || hlow.includes('zero'))
        popCulture.push('zenith', 'zeni7h', 'peak', 'summit', 'top', 'apex', 'pinnacle', 'crest', 'crown', 'zero', 'z3ro', '0day', 'zeroday', 'spanky')
    if (hlow.includes('hydro') || hlow.includes('water'))
        popCulture.push('hydro', 'water', 'aqua', 'fluid', 'dam', 'river', 'stream', 'ocean', 'wave', 'current')
    if (hlow.includes('m1n3cr4ft') || hlow.includes('minecraft'))
        popCulture.push('minecraft', 'm1n3cr4ft', 'creeper', 'enderman', 'diamond', 'redstone', 'herobrine', 'steve', 'notch', 'pickaxe')
    if (hlow.includes('drop') || hlow.includes('table') || hlow.includes(';--'))
        popCulture.push('drop', 'droptable', 'sql', 'sqli', 'injection', 'bobby', 'bobbytables', 'hacker', ';--', '1=1', 'or1=1', 'admin--', "' or '1'='1")
    if (hlow.includes('rekcah'))
        popCulture.push('hacker', 'rekcah', 'crack', 'hack', 'reverse', 'mirror')
    if (hostname && /[\u4e00-\u9fff]/.test(hostname))
        popCulture.push('cha', 'tea', 'chadain', '茶店', 'teashop', 'cafe', 'coffee', 'matcha', 'oolong', 'green', 'chinese')
    if (hlow.includes('smart') || hlow.includes('fridge') || hlow.includes('toaster'))
        popCulture.push('smart', 'fridge', 'toaster', 'iot', 'device', 'appliance', 'connected', 'wifi', 'default', 'admin')
    if (hlow.includes('u17ra') || hlow.includes('ultra') || hlow.includes('7ech') || hlow.includes('tech'))
        popCulture.push('ultra', 'u17ra', 'tech', '7ech', 'ultimate', 'extreme', 'advance', 'next', 'future')
    if (hlow.includes('cat') || hlow.includes('meow'))
        popCulture.push('cat', 'meow', 'kitty', 'feline', 'whiskers', 'paws', 'purr', 'tabby', 'garfield', 'tom', 'scratch')
    if (hlow === 'xd' || hlow.includes('xd'))
        popCulture.push('xd', 'XD', 'lol', 'lmao', 'rofl', 'haha', 'teehee', 'hehe', 'giggle', 'laugh')
    if (hlow.includes('citadel') || hlow.includes('c1tadel'))
        popCulture.push('citadel', 'c1tadel', 'fortress', 'castle', 'keep', 'stronghold', 'bastion', 'rampart')
    if (hlow.includes('kuaigong'))
        popCulture.push('kuaigong', 'kuai', 'gong', 'fast', 'quick', 'speed', 'rapid')
    if (hlow.includes('microhard'))
        popCulture.push('microhard', 'microsoft', 'micro', 'hard', 'windows', 'bill', 'gates', 'surface', 'azure')
    if (hlow.includes('omnitek'))
        popCulture.push('omnitek', 'omni', 'tek', 'all', 'everything', 'tech')
    if (hlow.includes('watchdog'))
        popCulture.push('watchdog', 'guard', 'sentinel', 'guardian', 'protector', 'keeper', 'lookout')
    if (hlow.includes('netweb'))
        popCulture.push('netweb', 'network', 'web', 'internet', 'online', 'cloud', 'mesh')
    if (hlow.includes('5ummit') || hlow.includes('summit'))
        popCulture.push('summit', '5ummit', 'peak', 'mountain', 'conference', 'top')
    if (hlow.includes('c3lls3rvic3s') || hlow.includes('cellservice'))
        popCulture.push('cellservices', 'c3lls3rvic3s', 'cell', 'service', 'mobile', 'phone', 'carrier', 'network', 'signal')
    if (hlow.includes('echo') || hlow.includes('hyper'))
        popCulture.push('echo', 'hyper', 'echohyper', 'ping', 'response', 'bounce', 'reflect', 'amplify')
    if (hlow.includes('netlink'))
        popCulture.push('netlink', 'link', 'connection', 'bridge', 'gateway', 'router', 'switch')
    if (hlow.includes('bitrunner'))
        popCulture.push('bitrunners', 'runner', 'run', 'bits', 'binary', 'mining', 'rig')
    if (hlow.includes('bitcitadel'))
        popCulture.push('bitcitadel', 'bit', 'citadel', 'fortress', 'crypto', 'vault')
    if (hlow.includes('light') && hlow.includes('grid'))
        popCulture.push('lightgrid', 'light', 'grid', 'power', 'energy', 'electric', 'voltage', 'watt', 'lumen')
    if (hlow === 'localhost' || hlow.includes('localhost'))
        popCulture.push('localhost', '127.0.0.1', 'local', 'home', 'loopback', 'self', 'host')
    if (hlow.includes('helios') || hlow.includes('terminal'))
        popCulture.push('helios', 'sun', 'solar', 'apollo', 'terminal', 'console', 'shell', 'command')
    if (hlow.includes('genesis'))
        popCulture.push('genesis', 'beginning', 'origin', 'alpha', 'creation', 'first', 'start')
    if (hlow.includes('anonymou') || hlow.includes('an0nymou'))
        popCulture.push('anonymous', 'anonymou5', 'anon', 'legion', 'expectus', 'mask', 'v', 'vendetta', 'guyfawkes')
    if (hlow.includes('aevum'))
        popCulture.push('aevum', 'eternity', 'age', 'time', 'forever', 'infinite', 'aeon', 'eonic')
    if (hlow.includes('nevahlov') || hlow.includes('volhanev'))
        popCulture.push('nevahlov', 'volhanev', 'valhalla', 'valhlov', 'asgard', 'norse', 'viking', 'odin', 'warrior')
    if (hlow === 'freedom' || hlow.includes('freedom'))
        popCulture.push('freedom', 'free', 'liberty', 'independence', 'open', 'libre')
    if (hlow.includes('dallas'))
        popCulture.push('dallas', 'texas', 'cowboy', 'ranch', 'lonestar', 'dallas1')
    if (hlow.includes('smart') || hlow.includes('doorbell') || hlow.includes('s4msong') || hlow.includes('samsung'))
        popCulture.push('smart', 'samsung', 'doorbell', 'iot', 'device', 'smarthome', 'connect', 'setup')
    if (hlow.includes('sec7or') || hlow.includes('sector'))
        popCulture.push('sector', 'sec7or', 'ci7y', 'city', 'hall', 'district', 'zone', '12')
    if (hlow.includes('m1chelle') || hlow.includes('michelle'))
        popCulture.push('michelle', 'm1chelle', 'shell', 'mish', 'micki')
    if (hlow.includes('fir3wa11') || hlow.includes('firewall'))
        popCulture.push('firewall', 'fir3wa11', 'fw', 'iptables', 'block', 'filter', 'allow')
    if (hlow.includes('1ed4t1c') || hlow.includes('edict'))
        popCulture.push('edict', '1ed4t1c', 'decree', 'law', 'rule', 'order', 'mandate')
    if (hlow.includes('orez'))
        popCulture.push('zero', 'orez', '0', 'null', 'nothing')
    if (hlow.includes('null'))
        popCulture.push('null', 'nil', 'none', 'empty', 'void', '0')
    if (hlow.includes('meta') && hlow.includes('syst'))
        popCulture.push('metasystems', 'meta', 'systems', 'system', 'meta_systems')
    if (hlow.includes('byte'))
        popCulture.push('byte', 'byte1', 'bite', '8bit', 'octet')
    if (hlow.includes('global'))
        popCulture.push('global', 'world', 'intl', 'international', 'planet')
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

    if (h.includes('social media') || h.includes('browsing') || h.includes('cafe') || h.includes('twitter') ||
        h.includes('facebook') || h.includes('instagram') || h.includes('tiktok') || h.includes('reddit'))
        popCulture.push('social', 'SOCIAL', 'Social', 'media', 'MEDIA', 'Media', 'browse', 'BROWSE', 'Browse',
            'cafe', 'CAFE', 'Cafe', 'twitter', 'TWITTER', 'Twitter', 'tweet', 'TWEET', 'Tweet',
            'facebook', 'FACEBOOK', 'Facebook', 'instagram', 'INSTAGRAM', 'Instagram', 'tiktok', 'TikTok',
            'reddit', 'REDDIT', 'Reddit', 'post', 'POST', 'Post', 'like', 'LIKE', 'Like',
            'follow', 'FOLLOW', 'Follow', 'share', 'SHARE', 'Share', 'viral', 'VIRAL', 'Viral',
            'selfie', 'SELFIE', 'Selfie', 'hashtag', 'HASHTAG', 'Hashtag', 'influencer', 'INSTAGRAM',
            'online', 'ONLINE', 'Online', 'web', 'WEB', 'Web', 'internet', 'INTERNET', 'Internet',
            'scroll', 'SCROLL', 'Scroll', 'feed', 'FEED', 'Feed', 'timeline', 'TIMELINE', 'Timeline')

    if (h.includes('authorized') || h.includes('unauthorized') || h.includes('access denied') ||
        h.includes('access granted') || h.includes('permission') || h.includes('forbidden') ||
        h.includes(' restricted') || h.includes("who's'nt") || h.includes('whos not') || h.includes("isn't authorized"))
        popCulture.push('authorized', 'AUTHORIZED', 'Authorized', 'unauthorized', 'UNAUTHORIZED', 'Unauthorized',
            'access', 'ACCESS', 'Access', 'granted', 'GRANTED', 'Granted', 'denied', 'DENIED', 'Denied',
            'permission', 'PERMISSION', 'Permission', 'allow', 'ALLOW', 'Allow', 'deny', 'DENY', 'Deny',
            'forbidden', 'FORBIDDEN', 'Forbidden', 'restricted', 'RESTRICTED', 'Restricted',
            'admin', 'ADMIN', 'Admin', 'root', 'ROOT', 'Root', 'sudo', 'SUDO', 'Sudo')
    if (h.includes('authorized') || h.includes("who's'nt") || h.includes('whos not')) {
        const candidates = [...new Set([hostname, hostname.toLowerCase(), ...hostVariants, ...popCulture,
            'authorized', 'unauthorized', 'access', 'granted', 'denied', 'admin', 'password', 'default',
            'one', '1', 'two', '2', 'i', 'me', 'who', 'you', 'nobody', 'anonymous', 'guest'])]
        for (let i = 0; i <= 99999; i++) candidates.push(String(i))
        return [...new Set(candidates)]
    }

    const keyMatch = hint.match(/(?:key|secret|pin|it'?s set to)\s+(?:is\s+)?(\w+)/i)
    if (keyMatch && keyMatch[1]) {
        const val = keyMatch[1].toLowerCase()
        if (!['is', 'the', 'a', 'an', 'not', 'still', 'empty', 'to', 'set', 'divisible', 'made'].includes(val)) {
            return [...new Set([keyMatch[1], ...hostVariants])]
        }
    }
    const pwMatch = hint.match(/password\s+is\s+(\w+)/i)
    if (pwMatch && pwMatch[1]) {
        const val = pwMatch[1].toLowerCase()
        if (!['is', 'the', 'a', 'an', 'not', 'still', 'empty', 'to', 'set', 'default', 'required', 'divisible', 'made', 'configured', 'chosen', 'unknown', 'missing'].includes(val)) {
            return [...new Set([pwMatch[1], ...hostVariants])]
        }
    }

    const madeMatch = hint.match(/(?:made|built|created|formed)\s+(?:from|out of|with)\s+(\d+)/i)
    if (madeMatch) {
        const n = parseInt(madeMatch[1])
        const candidates = [String(n)]
        const sqrt = Math.sqrt(n)
        if (Number.isInteger(sqrt)) candidates.push(String(sqrt))
        candidates.push(...permutations(String(n)))
        candidates.push(String(Math.floor(n / 2)), String(n * 2), String(n + 1), String(n - 1))
        return [...new Set([...candidates, ...hostVariants, ...commonPasswords])]
    }

    const pinMatch = hint.match(/pin\s+(?:is|:|=\s*)(\d+)/i) || hint.match(/pin\s*[:=]\s*(\d+)/i)
    if (pinMatch && pinMatch[1]) {
        const pin = pinMatch[1]
        const candidates = [pin]
        for (const d of pin.split('')) candidates.push(d)
        candidates.push(pin.split('').reverse().join(''))
        candidates.push('0' + pin, '00' + pin)
        const pinNum = parseInt(pin)
        candidates.push(String(pinNum * 2), String(pinNum + 1), String(pinNum - 1))
        return [...new Set([...candidates, ...hostVariants, ...popCulture])]
    }

    const shuffledMatch = hint.match(/shuffled\s+(\d+)/i)
    const sortedMatch = hint.match(/sorted\s+(?:the\s+)?(?:password|pin)?\s*[:=]?\s*(\d+)/i)
    const pinUsesMatch = hint.match(/pin\s+uses\s+(\d+)/i)
    const digitsStr = shuffledMatch?.[1] || sortedMatch?.[1] || pinUsesMatch?.[1]
    if (digitsStr) {
        const perms = permutations(digitsStr)
        const candidates = [...new Set(perms.map(p => String(Number(p))))]
        candidates.push(digitsStr, digitsStr.split('').reverse().join(''))
        if (digitsStr.length <= 3) {
            for (let d = 0; d <= 9; d++) {
                candidates.push(...permutations(digitsStr + String(d)).map(p => String(Number(p))))
            }
        }
        return [...new Set([...candidates, ...hostVariants])]
    }

    if (h.includes('no password') || h.includes('there is no'))
        return [...new Set(['', ...hostVariants, ...popCulture, ...commonPasswords])]

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
    const latinMatch = hint.match(/value of the number ['"]?(\w+)['"]?/i)
    if (latinMatch) {
        const latin = latinMatch[1].toLowerCase()
        const latinNums = { nulla:0, nil:0, nihilo:0, unus:1, una:1, duo:2, duae:2, tres:3, tria:3, quattuor:4, quinque:5, sex:6, septem:7, octo:8, novem:9, decem:10, undecim:11, duodecim:12, tredecim:13, quattuordecim:14, quindecim:15, sedecim:16, septendecim:17, duodeviginti:18, undeviginti:19, viginti:20, triginta:30, quadraginta:40, quinquaginta:50, sexaginta:60, septuaginta:70, octoginta:80, nonaginta:90, centum:100, ducenti:200, trecenti:300, quadringenti:400, quingenti:500, sescenti:600, septingenti:700, octingenti:800, nongenti:900, mille:1000 }
        if (latin in latinNums) return [String(latinNums[latin])]
        return [...new Set([latin, '0', '1', ...hostVariants, ...commonPasswords])]
    }

    if (h.includes('not set') || h.includes("didn't set a") || h.includes("did not set") || h.includes("never set")) {
        if (!h.includes('default')) {
            return [...new Set(['', ...hostVariants])]
        }
    }

    if (h.includes('default') || h.includes('factory') || h.includes('never changed') ||
        h.includes("didn't change") || h.includes("didn't set") || h.includes("did i set") ||
        h.includes('still') || h.includes('original') || h.includes('no password')) {
        return [...new Set([
            'admin', 'password', '0000', '12345',
            '',
            ...hostVariants,
        ])]
    }

    // Buffer length: "Warning: password buffer is N bytes"
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const numericFirst = []
        const alphaFallback = []
        const hostBased = hostVariants.filter(v => v.length === len)

        if (len <= 3) {
            for (let i = 0; i <= 999; i++) numericFirst.push(String(i).padStart(len, '0'))
        } else if (len === 4) {
            for (let i = 0; i <= 9999; i++) numericFirst.push(String(i).padStart(4, '0'))
            alphaFallback.push('pass','test','root','user','hack','open','code','data','file',
                'auth','lock','ping','read','write','exec','kill','push','pull','swap','move',
                'copy','fill','sort','find','scan','flag','port','host','addr','name','path',
                'core','temp','page','byte','word','line','node','edge','tree','hash','sign',
                'cert','keys','salt','seed','token','login','admin','bash','ssh','ftp','dns',
                'null','void','true','fail','exit','loop','help','info','warn','wait','bind',
                'conn','list','drop','next','last','head','tail','step','stop','skip','mark')
        } else if (len === 5) {
            for (let i = 0; i <= 9999; i++) numericFirst.push(String(i).padStart(5, '0'))
            for (let i = 10000; i <= 10999; i++) numericFirst.push(String(i))
            numericFirst.push('11111','22222','33333','44444','55555','66666','77777','88888','99999','00000')
            alphaFallback.push('admin','hello','world','sword','blade','shift','enter','break','clear',
                'reset','power','start','abort','flush','clean','crash','panic','fault','guard',
                'check','valid','verify','trust','allow','login','shell','spawn','daemon','nginx',
                'apache','linux','posix','bash','ssh','curl','wget','ping','dns','dhcp','nfs',
                'ldap','oauth','jwt','xss','csrf','rce','sqli','test1','user1','guest','qwert')
        } else if (len === 6) {
            for (let i = 0; i <= 9999; i++) numericFirst.push(String(i).padStart(6, '0'))
            for (let i = 100000; i <= 100999; i++) numericFirst.push(String(i))
            numericFirst.push('111111','222222','333333','444444','555555','666666','777777','888888','999999','000000')
            numericFirst.push('123456','654321','123123','112233','123321')
            alphaFallback.push('qwerty','secret','access','ubuntu','debian','fedora','centos','redhat',
                'window','kernel','system','driver','packet','socket','thread','server','client',
                'broker','master','worker','leader','stream','buffer','object','matrix','vector',
                'domain','python','golang','kotlin','swift','ruby','login','config')
        } else {
            for (const pw of commonPasswords) {
                if (pw.length === len) numericFirst.push(pw)
            }
            for (const pw of extendedPasswords) {
                if (pw.length === len) numericFirst.push(pw)
            }
        }
        const all = [...new Set([...hostBased, ...numericFirst, ...alphaFallback])]
        if (all.length > 20000) return all.slice(0, 20000)
        return all
    }

    if (!h.includes('prove you are human') && !h.includes('captcha')) {
        const useMatch = hint.match(/(?:use|enter|input)\s+(\w+)/i)
        if (useMatch && useMatch[1]) return [useMatch[1]]
    }

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

    const divMatch = hint.match(/divisible\s+by\s+(\d+)/i)
    if (divMatch) {
        const divBy = parseInt(divMatch[1])
        const candidates = [...hostVariants]
        if (divBy === 1) {
            for (let i = 0; i <= 99999; i++) candidates.push(String(i))
        } else {
            for (let i = 0; i <= 1000; i++) candidates.push(String(divBy * i))
        }
        candidates.push(...commonPasswords)
        return [...new Set(candidates)]
    }

    const rangeMatch = hint.match(/(?:a\s+)?number\s+between\s+(\d+)\s+and\s+(\d+)/i) ||
                       hint.match(/from\s+(\d+)\s+to\s+(\d+)/i) ||
                       hint.match(/between\s+(\d+)\s+and\s+(\d+)/i)
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1])
        const hi = parseInt(rangeMatch[2])
        const candidates = [...hostVariants]
        for (let i = lo; i <= hi; i++) candidates.push(String(i))
        return [...new Set(candidates)]
    }

    if (h.includes('empty') && (h.includes('pin') || h.includes('password'))) return ['', ...commonPasswords]

    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha') || h.includes('type the numbers')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 1) return [extracted]
        }
        const numFromHost = hostname ? hostname.replace(/[^0-9]/g, '') : ''
        return [...new Set([
            numFromHost,
            '1234', '12345', '123456', '1337', '42', '0', '1',
            '123', '456', '789', '1111', '9999', '0000', '4242',
            '31337', '65536', '8080', '443', '80',
            ...hostVariants, ...popCulture, ...commonPasswords,
        ])]
    }

    if (h.includes("dog") || h.includes("pet") || h.includes("puppy") || h.includes("hound") || h.includes("fur") || h.includes("first dog"))
        return [...new Set(['fido', 'spot', 'rover', 'max', ...hostVariants])]

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
            'th3l4byr1nth', 'th3_l4byr1nth', 'thelabyrinth', 'the_labyrinth',
            'l4byr1nth', 'l4byr',
            '42', '0', '1', '13', '7', '666', '999', '314',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    if (h.includes('master') || h.includes('true master') || h.includes('may pass'))
        return [...new Set([
            'master', 'MASTER', 'Master',
            'phantom', 'PHANTOM', 'Phantom',
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
            'neon', 'inc', 'neoninc', 'ne0n',
            '42', '0', '1', '7', '3', '13', '69', '777', '1337',
            'blade', 'cyber', 'hacker', 'crack', 'hack', 'root',
            'global', 'pharmaceutical', 'pharma',
            ...hostVariants, ...popCulture, ...extendedPasswords,
        ])]

    if (h.includes("who's") || h.includes("who is not") || h.includes("whont")) {
        const candidates = [...hostVariants]
        for (let i = 0; i <= 99999; i++) candidates.push(String(i))
        candidates.push('password', 'admin', 'default', 'yes', 'no', 'one', '1', 'i', 'me')
        return [...new Set(candidates)]
    }

    if (h.includes('social media') || h.includes('browsing') || h.includes('cafe') || h.includes('coffee') ||
        h.includes('tea') || (hostname && /[\u4e00-\u9fff]/.test(hostname))) {
        const candidates = [
            ...hostVariants,
            'twitter', 'Twitter', 'TWITTER', 'tweet', 'Tweet',
            'instagram', 'Instagram', 'INSTAGRAM', 'insta', 'Insta',
            'facebook', 'Facebook', 'FACEBOOK', 'fb', 'FB',
            'tiktok', 'TikTok', 'TIKTOK',
            'snapchat', 'Snapchat', 'SNAPCHAT', 'snap',
            'reddit', 'Reddit', 'REDDIT',
            'linkedin', 'LinkedIn', 'LINKEDIN',
            'youtube', 'YouTube', 'YOUTUBE', 'yt',
            'whatsapp', 'WhatsApp', 'WHATSAPP',
            'telegram', 'Telegram', 'TELEGRAM',
            'discord', 'Discord', 'DISCORD',
            'cafe', 'Cafe', 'CAFE', 'coffee', 'Coffee', 'COFFEE',
            'latte', 'Latte', 'espresso', 'cappuccino',
            'scrolling', 'doomscrolling', 'browsing',
            'social', 'Social', 'SOCIAL', 'media', 'Media', 'MEDIA',
            'wifi', 'WiFi', 'WIFI', 'internet',
            'online', 'Online', 'ONLINE',
            'password', 'admin', 'default', '123456', 'qwerty',
        ]
        for (let i = 0; i <= 9999; i++) candidates.push(String(i))
        return [...new Set(candidates)]
    }

    if (h.includes("ascend") || h.includes("mountain") || h.includes("highest")) {
        const candidates = [...hostVariants, ...mountainPasswords]
        for (let i = 0; i <= 9999; i++) candidates.push(String(i))
        return [...new Set(candidates)]
    }

    if (h.includes('riddle') || h.includes('true'))
        return [...new Set([...hostVariants, ...extendedPasswords])]

    if (hint && !h.match(/[a-z]{3,}/)) {
        const stripped = hint.replace(/[^a-zA-Z0-9!@#$%^&*_\-+=]/g, '')
        const candidates = [...new Set([stripped, ''])]
        for (let i = 0; i <= 9999; i++) candidates.push(String(i))
        candidates.push('password', 'admin', 'default', 'spicy', 'hot', 'fire')
        candidates.push(...hostVariants)
        return [...new Set(candidates)]
    }

    return [...new Set([...hostVariants, ...popCulture, '', ...commonPasswords])]
}

/** Ensure all scripts exist on this server, copying from home if needed */
async function ensureScripts(ns, host) {
    if (host === 'home') return
    for (const script of ALL_SCRIPTS) {
        if (!ns.fileExists(script, host)) {
            try {
                const ok = await ns.scp(script, host, 'home')
                if (ok) {
                    ns.print(`[dnet] ${script} copied to ${host} from home`)
                } else {
                    ns.print(`[dnet] ${script} COPY FROM HOME FAILED`)
                }
            } catch (e) {
                ns.print(`[dnet] ${script} COPY ERROR: ${e}`)
            }
        }
    }
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname()

    ns.disableLog('ALL')

    // Dedup: if another instance is already running, exit
    const myPid = ns.pid
    const others = ns.ps(host).filter(p => p.filename === SCRIPT_NAME && p.pid !== myPid)
    if (others.length > 0) return

    ns.print(`[dnet] STARTING darknet.js on ${host} (pid=${myPid})`)

    // Test if ns.dnet is available on this server
    try {
        const testBlocked = await ns.dnet.getBlockedRam(host)
        ns.print(`[dnet] ns.dnet API available on ${host}, blockedRam=${testBlocked}`)
    } catch (e) {
        ns.print(`[dnet] ERROR: ns.dnet API NOT available on ${host}: ${e}`)
        return
    }

    // Ensure scripts exist on this server
    await ensureScripts(ns, host)

    while (true) {
        // Auto-restart if running for more than 30 minutes
        if (Date.now() - __autoRestartStartTime__ > 30 * 60 * 1000) {
            ns.exec('darknet.js', ns.getHostname(), 1, ...ns.args);
            ns.exit();
        }

        // Re-check scripts
        await ensureScripts(ns, host)

        // Free RAM
        try {
            const blocked = await ns.dnet.getBlockedRam(host)
            if (blocked > 0) await ns.dnet.memoryReallocation()
        } catch (e) { /* ignore */ }

        // Probe
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

            // Get details
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

            let hasSession = details.hasSession

            // Auth (skip if already authenticated)
            if (!hasSession) {
                const hint = details.passwordHint || ''
                const data = details.data || ''
                const candidates = solvePassword(hint, data, neighbor)

                ns.print(`[dnet] ${neighbor} auth: ${candidates.length} candidates, hint="${hint}"`)

                let authed = false

                // Try heartbleed FIRST
                let bleedPasswords = []
                try {
                    const logs = await ns.dnet.heartbleed(neighbor)
                    if (logs && logs.length > 0) {
                        ns.print(`[dnet] ${neighbor} BLEED: ${JSON.stringify(logs).substring(0, 300)}`)
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
                                /now set to\s+['"]?(\w+)['"]?\s*[.\!]?\s*$/i,
                                /account password\s+(?:is|has been changed to)\s+['"]?(\w+)['"]?/i,
                            ]
                            for (const pat of pwPatterns) {
                                const m = s.match(pat)
                                if (m && m[1]) bleedPasswords.push(m[1])
                            }
                            if (s.length <= 30 && !s.includes(' ') && /^\w+$/.test(s)) {
                                bleedPasswords.push(s)
                            }
                            const lastWord = s.match(/to\s+(\w+)\s*[.\!]?\s*$/i)
                            if (lastWord && lastWord[1] && lastWord[1].length <= 15) {
                                bleedPasswords.push(lastWord[1])
                            }
                        }
                    }
                } catch (e) { /* not available */ }

                // Try heartbleed passwords FIRST — cap at 500
                if (bleedPasswords.length > 0) {
                    const bleedCapped = [...new Set(bleedPasswords)].slice(0, 500)
                    ns.print(`[dnet] ${neighbor} heartbleed: ${bleedCapped.length} candidates`)
                    for (const pw of bleedCapped) {
                        try {
                            const r = await ns.dnet.authenticate(neighbor, pw)
                            if (r.success) { authed = true; hasSession = true; ns.print(`[dnet] ${neighbor} AUTH SUCCESS (bleed) with "${pw}"`); break }
                        } catch (e) { /* try next */ }
                    }
                }

                // Then try candidate list — HARD CAP at 50k
                if (!authed && candidates.length > 0) {
                    const maxAttempts = Math.min(candidates.length, 50000)
                    for (let i = 0; i < maxAttempts; i++) {
                        const pw = candidates[i]
                        try {
                            const r = await ns.dnet.authenticate(neighbor, pw)
                            if (r.success) {
                                authed = true
                                hasSession = true
                                ns.print(`[dnet] ${neighbor} AUTH SUCCESS with "${pw}" (attempt ${i+1}/${maxAttempts})`)
                                break
                            }
                        } catch (e) { /* try next */ }
                    }
                }

                if (!authed) {
                    ns.print(`[dnet] ${neighbor} AUTH FAILED: tried ${candidates.length} candidates`)
                }
            } else {
                ns.print(`[dnet] ${neighbor} already has session`)
            }

            // ALWAYS scp scripts to neighbor — from home
            try {
                const scp1 = await ns.scp(SCRIPT_NAME, neighbor, 'home')
                const scp2 = await ns.scp(RAM_SCRIPT, neighbor, 'home')
                const scp3 = await ns.scp(EXTRACTOR, neighbor, 'home')
                ns.print(`[dnet] ${neighbor} SCP: darknet=${scp1} ram=${scp2} extractor=${scp3}`)
            } catch (e) {
                ns.print(`[dnet] ${neighbor} SCP ERROR: ${e}`)
            }

            // Exec darknet.js on neighbor
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
                    const pid = ns.exec(SCRIPT_NAME, neighbor, threads)
                    ns.print(`[dnet] ${neighbor} EXEC: pid=${pid} scriptRam=${scriptRam} freeRam=${freeRam}`)
                }
                // Also run extractor
                const extractorRunning = neighborProcs.some(p => p.filename === EXTRACTOR)
                if (!extractorRunning) {
                    const extPid = ns.exec(EXTRACTOR, neighbor, 1)
                    ns.print(`[dnet] ${neighbor} EXTRACTOR exec: pid=${extPid}`)
                }
            } catch (e) {
                ns.print(`[dnet] ${neighbor} EXEC ERROR: ${e}`)
            }
        }

        // Run extractor on THIS server
        const localProcs = ns.ps(host)
        const extractorRunning = localProcs.some(p => p.filename === EXTRACTOR)
        if (!extractorRunning) {
            const extPid = ns.exec(EXTRACTOR, host, 1)
            ns.print(`[dnet] ${host} EXTRACTOR exec: pid=${extPid}`)
        } else {
            ns.print(`[dnet] ${host} EXTRACTOR already running`)
        }

        await ns.asleep(500)
    }
}

export function autocomplete(data) {
    return ["--tail"]
}
