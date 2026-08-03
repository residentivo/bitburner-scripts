/**
 * darknet-launcher.js — Ensures darknet scripts are on darkweb and running.
 * Run periodically from daemon.js or cron.
 * Copies scripts if TOR is purchased, spawns darknet.js if not already running.
 */

const SCRIPTS = ['darknet.js', 'darknet-ram.js', 'darknet-extractor.js']
const TARGET = 'darkweb'

export async function main(ns) {
    // Check if TOR is purchased (darkweb accessible)
    try {
        const hasDarkweb = ns.serverExists(TARGET)
        if (!hasDarkweb) {
            ns.print('darkweb not accessible yet (TOR not purchased)')
            return
        }
    } catch {
        ns.print('cannot check darkweb')
        return
    }

    // Copy all scripts to darkweb
    for (const script of SCRIPTS) {
        try {
            await ns.scp(script, TARGET)
            ns.print(`scp ${script} OK`)
        } catch (e) {
            ns.print(`scp ${script} error: ${e}`)
        }
    }

    // Check if darknet.js is already running on darkweb
    const running = ns.ps(TARGET).some(p => p.filename === 'darknet.js')
    if (running) {
        ns.print('darknet.js already running on darkweb')
        return
    }

    // Spawn darknet.js with forwarded args
    try {
        const pid = ns.exec('darknet.js', TARGET, 1, ...ns.args)
        ns.print(`spawned darknet.js pid=${pid}`)
    } catch (e) {
        ns.print(`spawn error: ${e}`)
    }
}

export function autocomplete(data) {
    return data.scripts
}
