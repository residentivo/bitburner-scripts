/**
 * darknet-test3.js — Test getServerDetails only
 */
export async function main(ns) {
    ns.print('START')
    try {
        const peers = await ns.dnet.probe()
        if (peers && peers.length > 0) {
            const d = await ns.dnet.getServerDetails(peers[0])
            ns.print('getServerDetails OK: session=' + d.hasSession + ' hint=' + (d.passwordHint || 'none'))
        }
    } catch (e) {
        ns.print('ERROR: ' + e)
    }
    ns.print('DONE')
}
