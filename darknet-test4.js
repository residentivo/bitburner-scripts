/**
 * darknet-test4.js — Test scp + exec on a neighbor
 */
export async function main(ns) {
    ns.print('START')
    const target = 'darknet-test1.js'

    // Get a neighbor
    const peers = await ns.dnet.probe()
    if (!peers || peers.length === 0) {
        ns.print('no neighbors')
        return
    }
    const neighbor = peers[0]
    ns.print('target neighbor: ' + neighbor)

    // Test getServerDetails
    const d = await ns.dnet.getServerDetails(neighbor)
    ns.print('details: session=' + d.hasSession)

    // Test authenticate
    ns.print('authenticating...')
    const authed = await ns.dnet.authenticate(neighbor, '123456')
    ns.print('auth result: ' + authed.success)

    // Test scp
    ns.print('scp ' + target + ' to ' + neighbor)
    await ns.scp(target, neighbor)
    ns.print('scp OK')

    // Test exec
    ns.print('exec on ' + neighbor)
    const pid = ns.exec(target, neighbor, 1)
    ns.print('exec pid=' + pid)

    ns.print('DONE')
}
