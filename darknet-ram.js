/**
 * darknet-ram.js — Free RAM via memoryReallocation on this darknet server
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
