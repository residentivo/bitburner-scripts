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
    const hostClean = hostname ? hostname.replace(/[^a-zA-Z0-9]/g, '') : ''
    const hostCandidates = hostname ? [hostname, hostname.toLowerCase(), hostClean] : []

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
        // "PIN uses 224" — try 224 and permutations, plus partial matches
        if (h.includes('use')) {
            candidates.push(...permutations(pin))
            // Also try subsets and common combos with those digits
            const digits = pin.split('')
            // try each digit alone, pairs, etc
            for (const d of digits) candidates.push(d)
            // try pin with leading zeros
            candidates.push('0' + pin, '00' + pin)
            // try pin reversed
            candidates.push(pin.split('').reverse().join(''))
        }
        return [...new Set([...candidates, ...hostCandidates, ...popCulture])]
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
        return [...new Set([latin, '0', '1', ...hostCandidates, ...commonPasswords])]
    }

    // Default / factory / never changed / didn't set
    if (h.includes('default') || h.includes('factory') || h.includes('never changed') ||
        h.includes("didn't change") || h.includes("didn't set") || h.includes("did i set") ||
        h.includes('still') || h.includes('original') || h.includes('no password') ||
        h.includes('not set'))
        return [...new Set([
            ...hostCandidates, ...popCulture,
            '', 'password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest',
            'root', 'toor', 'daemon', 'sys', 'adm', 'bin', 'superuser', 'operator',
            'server', 'system', 'changeit', 'changeme', 'mysql', 'postgres', 'oracle',
            'cisco', 'public', 'private', 'blank', 'none', 'null',
            'open', 'login', 'unlock', 'access', 'secret', 'test', 'user', 'demo',
            'pass', 'pwd', 'passw0rd', 'p@ssw0rd', 'admin123', 'root123', 'abc123',
            '0000', '1111', '1234', '4321', '7777', '9999',
            'password1', 'password123', 'admin1', 'admin1234', 'root1', 'test1',
            'welcome', 'hello', 'master', 'super', 'god', 'love',
            // Common device/service defaults
            'ubnt', 'zyxel', 'netgear', 'dlink', 'tplink', 'linksys', 'asus',
            'arris', 'motorola', 'huawei', 'technicolor', 'sagemcom',
            // Software defaults
            'jenkins', 'docker', 'nginx', 'apache', 'redis', 'mongo', 'grafana',
            'postgres1', 'mysql1', 'admin!', 'root!', 'sa', 'dbo',
        ])]

    // Buffer length: "Warning: password buffer is N bytes"
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        const candidates = [...hostCandidates, ...popCulture]
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
            ...hostCandidates, ...popCulture, ...extendedPasswords,
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
            'daedalus', 'icarus', 'minos', 'crete', ' underworld', 'labyrinthine',
            'corridoor', 'twist', 'spiral', 'winding', 'enigma', 'riddle', 'conundrum',
            '42', '0', '1', '13', '7', '666', '999', '314',
            ...hostCandidates, ...popCulture, ...extendedPasswords,
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
            'facebook', 'twitter', 'instagram', 'reddit', 'tiktok', 'youtube', 'myspace', 'tumblr', 'snapchat', 'pinterest', 'linkedin', 'slack', 'discord', 'whatsapp', 'telegram',
            'social', 'media', 'browse', 'cafe', 'coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano', 'macchiato', 'ristretto', 'flatwhite',
            'wifi', 'password', 'freewifi', 'freewifi!', 'guestwifi', 'cafewifi', 'netcafe',
            'coffee1', 'cafe1', '1234', '12345', 'admin', 'open',
            ...hostCandidates, ...popCulture, ...extendedPasswords,
        ])]

    // Mountain riddle
    if (h.includes('ascend') || h.includes('mountain') || h.includes('highest'))
        return [...new Set([...hostCandidates, ...popCulture, ...mountainPasswords, ...extendedPasswords])]

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
    return [...new Set([...hostCandidates, ...popCulture, '', ...commonPasswords])]
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
                    // Try heartbleed for more info
                    try {
                        const logs = await ns.dnet.heartbleed(neighbor)
                        if (logs && logs.length > 0) {
                            log(ns, `${neighbor} heartbleed: ${JSON.stringify(logs).substring(0, 200)}`)
                            // Try to extract password hints from logs
                            for (const l of (Array.isArray(logs) ? logs : [logs])) {
                                const lstr = String(l)
                                // If log contains a password-like string, try it next cycle
                                const pwHint = lstr.match(/password[:\s]+(\S+)/i)
                                if (pwHint) log(ns, `${neighbor} hint from log: ${pwHint[1]}`)
                            }
                        }
                    } catch (e) { /* heartbleed not available */ }
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
