/**
 * darknet-step2.js — Test auth on first neighbor only (no scp, no exec)
 */
export async function main(ns) {
    ns.print('START step2')

    const peers = await ns.dnet.probe()
    if (!peers || peers.length === 0) { ns.print('no peers'); return }

    const target = peers[0]
    ns.print('target: ' + target)

    const d = await ns.dnet.getServerDetails(target)
    ns.print('hint: ' + JSON.stringify(d.passwordHint))
    ns.print('session: ' + d.hasSession)

    if (d.hasSession) {
        ns.print('already has session, skip auth')
    } else {
        // Try just ONE password
        try {
            const r = await ns.dnet.authenticate(target, 'admin')
            ns.print('auth admin: ' + r.success)
        } catch (e) {
            ns.print('auth ERROR: ' + e)
        }
    }

    ns.print('DONE step2')
}
