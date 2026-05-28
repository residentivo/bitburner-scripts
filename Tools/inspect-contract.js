import { scanAllServers } from '../helpers.js'

/** @param {NS} ns **/
export async function main(ns) {
    const args = ns.args;
    let targetHost = args[0] || null;
    let typeFilter = args[1] || null;

    const servers = targetHost ? [targetHost] : scanAllServers(ns);
    const allContracts = [];

    for (const hostname of servers) {
        const files = ns.ls(hostname, '.cct');
        for (const contract of files) {
            const type = ns.codingcontract.getContractType(contract, hostname);
            if (typeFilter && type !== typeFilter) continue;
            const data = ns.codingcontract.getData(contract, hostname);
            allContracts.push({ hostname, contract, type, data });
        }
    }

    if (allContracts.length === 0) {
        ns.tprint('Nenhum contrato encontrado.');
        return;
    }

    for (const c of allContracts) {
        const dataStr = JSON.stringify(c.data, (k, v) =>
            typeof v === 'bigint' ? '__BIGINT__' + v.toString() : v
        );
        ns.tprint(`[${c.hostname}] ${c.contract} (${c.type})`);
        ns.tprint(`Data type: ${typeof c.data}, isArray: ${Array.isArray(c.data)}`);
        ns.tprint(`Data: ${dataStr}`);
        ns.tprint('---');
    }
}
