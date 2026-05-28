import { getFilePath, getNsDataThroughFile, disableLogs, scanAllServers } from '../helpers.js'

/**
 * Extrai dados de contratos específicos para debug
 * Uso: run /Tools/extract-contract.js [hostname]
 */
export async function main(ns) {
    const targetHost = ns.args[0];
    if (!targetHost) return ns.tprint("Uso: run /Tools/extract-contract.js <hostname>");

    const files = ns.ls(targetHost, '.cct');
    for (const contract of files) {
        const type = ns.codingcontract.getContractType(contract, targetHost);
        const data = ns.codingcontract.getData(contract, targetHost);
        const dataStr = JSON.stringify(data, (k, v) =>
            typeof v === 'bigint' ? '__BIGINT__' + v.toString() : v
        );
        ns.tprint(`[${targetHost}] ${contract} (${type})`);
        ns.tprint(`Data type: ${typeof data}, isArray: ${Array.isArray(data)}`);
        ns.tprint(`Data: ${dataStr.substring(0, 300)}`);
        ns.tprint('---');
    }
}
