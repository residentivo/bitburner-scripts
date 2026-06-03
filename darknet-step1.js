/**
 * darknet-step1.js — Test ONLY probe + getServerDetails (no auth, no scp, no exec)
 */
export async function main(ns) {
    ns.print('START step1')

    let peers
    try {
        peers = await ns.dnet.probe()
        ns.print('probe OK: ' + JSON.stringify(peers))
    } catch (e) {
        ns.print('probe ERROR: ' + e)
        return
    }

    if (!peers || peers.length === 0) {
        ns.print('no peers')
        return
    }

    for (const p of peers) {
        try {
            const d = await ns.dnet.getServerDetails(p)
            ns.print('details ' + p + ': session=' + d.hasSession + ' hint=' + JSON.stringify(d.passwordHint))
        } catch (e) {
            ns.print('details ' + p + ' ERROR: ' + e)
        }
    }

    ns.print('DONE step1')
}
