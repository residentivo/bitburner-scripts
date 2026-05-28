import { scanAllServers } from '../helpers.js'

/**
 * Extrai contratos de um servidor (ou de todos) e mostra na tela
 * Uso: run Tools/extract-contract.js [hostname] [--type "Type Filter"]
 * 
 * Sem argumentos: lista todos os contratos de todos os servidores
 * Com hostname: filtra apenas esse servidor
 * Com --type: filtra por tipo de contrato
 */
export async function main(ns) {
    const args = ns.args;
    let targetHost = null;
    let typeFilter = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--type' && i + 1 < args.length) {
            typeFilter = args[++i];
        } else if (!targetHost) {
            targetHost = args[i];
        }
    }

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
        ns.tprint(`Nenhum contrato encontrado${typeFilter ? ` do tipo "${typeFilter}"` : ''}.`);
        return;
    }

    ns.tprint(`\n=== ${allContracts.length} contrato(s) encontrado(s) ===\n`);

    for (const c of allContracts) {
        // Serializa data tratando BigInt
        const dataStr = JSON.stringify(c.data, (k, v) =>
            typeof v === 'bigint' ? `__BIGINT__${v}` : v
        );
        ns.tprint(`[${c.hostname}] ${c.contract} (${c.type})`);
        ns.tprint(`Data: ${dataStr}`);
        ns.tprint(`Command:`);
        ns.tprint(`run Tasks/contractor.js.solver.js '${JSON.stringify({ hostname: c.hostname, type: c.type, data: c.data }, (k, v) => typeof v === 'bigint' ? `__BIGINT__${v}` : v).replace(/"__BIGINT__(\d+)"/g, '$1')}' --tail`);
        ns.tprint('---');
    }
}
