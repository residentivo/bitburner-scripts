/**
 * darknet-test2.js — Test probe only
 */
export async function main(ns) {
    ns.print('START')
    try {
        const result = await ns.dnet.probe()
        ns.print('probe OK: ' + JSON.stringify(result))
    } catch (e) {
        ns.print('probe ERROR: ' + e)
    }
    ns.print('DONE')
}
