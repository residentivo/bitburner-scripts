/**
 * darknet-test4.js — Test auth with password solving
 */
const commonPasswords = ['password', 'admin', '123456', 'default', 'letmein', 'qwerty', 'guest']

const commonByLength = {
    3: ['cat', 'dog', 'foo', 'bar', '123', 'pwd'],
    4: ['pass', 'test', 'root', 'user', 'abcd', '1234', 'hack', 'open'],
    5: ['admin', 'qwert', 'abcde', '12345', 'hello', 'world', 'sword', 'blade'],
    6: ['123456', 'qwerty', 'secret', 'abcdef', 'letme1', 'access', 'oracle'],
    7: ['letmein', 'abcdefg', '1234567', 'testing', 'changeme'],
    8: ['password', 'trustno1', 'sunshine', 'iloveyou', '12345678'],
}

function solvePassword(hint, hintData) {
    if (!hint) return []
    const h = hint.toLowerCase()

    // Direct extraction: "key is X", "password is X", "pin is X", "it's set to X"
    const keyMatch = hint.match(/(?:key|secret|password|pin|it'?s set to)\s+(\w+)/i)
    if (keyMatch) return [keyMatch[1]]

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

    // Default / factory → try all common
    if (h.includes('default') || h.includes('factory')) return commonPasswords

    // Buffer length
    const bufMatch = hint.match(/buffer is (\d+) bytes?/i)
    if (bufMatch) {
        const len = parseInt(bufMatch[1])
        if (commonByLength[len]) return commonByLength[len]
    }

    // Numbers / captcha
    if (h.includes('numbers') || h.includes('prove you are human') || h.includes('captcha')) {
        if (hintData) {
            const extracted = hintData.replace(/[^0-9]/g, '')
            if (extracted && extracted.length >= 3) return [extracted]
        }
        return ['123456']
    }

    return []
}

export async function main(ns) {
    ns.print('START')

    const peers = await ns.dnet.probe()
    if (!peers || peers.length === 0) {
        ns.print('no neighbors')
        return
    }
    const neighbor = peers[0]
    ns.print('target neighbor: ' + neighbor)

    // Get details — print hint for debug
    const d = await ns.dnet.getServerDetails(neighbor)
    ns.print('details: session=' + d.hasSession)
    ns.print('details: hint=' + JSON.stringify(d.passwordHint))
    ns.print('details: data=' + JSON.stringify(d.data))
    ns.print('details: isOnline=' + d.isOnline)
    ns.print('details: isConnected=' + d.isConnectedToCurrentServer)

    // Solve password from hint
    const candidates = solvePassword(d.passwordHint, d.data)
    if (candidates.length === 0) {
        ns.print('could not solve hint, trying common passwords...')
        candidates.push(...commonPasswords)
    } else {
        ns.print('solved candidates: ' + JSON.stringify(candidates))
    }

    // Try each candidate
    let authed = false
    for (const pw of candidates) {
        ns.print('trying password: ' + pw)
        const result = await ns.dnet.authenticate(neighbor, pw)
        ns.print('auth ' + pw + ': ' + result.success)
        if (result.success) {
            authed = true
            break
        }
    }

    if (!authed) {
        ns.print('ALL AUTH FAILED')
        return
    }

    // Test scp
    const target = 'darknet-test1.js'
    ns.print('scp ' + target + ' to ' + neighbor)
    await ns.scp(target, neighbor)
    ns.print('scp OK')

    // Test exec
    ns.print('exec on ' + neighbor)
    const pid = ns.exec(target, neighbor, 1)
    ns.print('exec pid=' + pid)

    ns.print('DONE')
}
