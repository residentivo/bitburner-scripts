/**
 * darknet-step3.js — Test scp + exec on first neighbor (after auth)
 */
export async function main(ns) {
    ns.print('START step3')

    const peers = await ns.dnet.probe()
    if (!peers || peers.length === 0) { ns.print('no peers'); return }

    const target = peers[0]
    ns.print('target: ' + target)

    // Auth
    const d = await ns.dnet.getServerDetails(target)
    if (!d.hasSession) {
        const r = await ns.dnet.authenticate(target, 'admin')
        ns.print('auth: ' + r.success)
        if (!r.success) { ns.print('auth failed'); return }
    }

    // scp
    try {
        await ns.scp('darknet-test1.js', target)
        ns.print('scp OK')
    } catch (e) {
        ns.print('scp ERROR: ' + e)
        return
    }

    // exec
    try {
        const pid = ns.exec('darknet-test1.js', target, 1)
        ns.print('exec pid=' + pid)
    } catch (e) {
        ns.print('exec ERROR: ' + e)
    }

    ns.print('DONE step3')
}
