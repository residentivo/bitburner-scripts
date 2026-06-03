/**
 * darknet-test1.js — Test memoryReallocation only
 */
export async function main(ns) {
    ns.print('START')
    try {
        await ns.dnet.memoryReallocation()
        ns.print('memoryReallocation OK')
    } catch (e) {
        ns.print('memoryReallocation ERROR: ' + e)
    }
    ns.print('DONE')
}
