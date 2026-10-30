import { getNsDataThroughFile, log } from '../helpers.js'

/**
 * covenant-trainer.js - Train the player's combat stats to get ready for The Covenant
 *
 * Runs periodically (via daemon periodicScripts when daemon.js is started with --train-for-covenant).
 * Only starts training once all sleeves (at least --min-sleeves of them) are "ready":
 *   - sync at 100%, shock at 0%, and no sleeve augmentations left to buy.
 * Then it puts the player in the gym, always training the lowest combat stat, until all
 * combat stats reach --combat-req (850 by default, the requirement for The Covenant).
 * Hacking, money and augmentation requirements are handled naturally by the other scripts.
 *
 * While training is active, a flag file is written so work-for-factions.js doesn't override the gym work.
 */
export const covenantTrainingFlagFile = '/Temp/covenant-training.txt';
const factionName = "The Covenant";
const gymName = "Powerhouse Gym"; // Best gym in the game (Sector-12)
const gymCity = "Sector-12";
const stats = [{ key: 'strength', gym: 'str' }, { key: 'defense', gym: 'def' }, { key: 'dexterity', gym: 'dex' }, { key: 'agility', gym: 'agi' }];

const argsSchema = [
    ['min-sleeves', 3], // Minimum number of sleeves that must be bought / fully trained before we start training the player
    ['combat-req', 850], // Combat stat level to train each stat to (The Covenant requires 850)
    ['no-focus', false], // Train without focus (incurs a penalty unless you own "Neuroreceptor Management Implant")
];

export function autocomplete(data, _) {
    data.flags(argsSchema);
    return [];
}

/** @param {NS} ns **/
export async function main(ns) {
    const options = ns.flags(argsSchema);
    const stopTraining = (reason) => {
        if (ns.fileExists(covenantTrainingFlagFile)) {
            ns.rm(covenantTrainingFlagFile);
            log(ns, `INFO: Stopped training for ${factionName}: ${reason}`, true, 'info');
        } else ns.print(`Not training for ${factionName}: ${reason}`);
    };

    // Already a member (or invited)? Nothing to do - faction-manager.js will join for us.
    const player = await getNsDataThroughFile(ns, 'ns.getPlayer()', '/Temp/player-info.txt');
    if (player.factions.includes(factionName))
        return stopTraining(`already a member.`);
    const invites = await getNsDataThroughFile(ns, 'ns.singularity.checkFactionInvitations()', '/Temp/player-faction-invites.txt');
    if (invites.includes(factionName))
        return stopTraining(`invitation already received.`);

    // Ensure sleeves are all bought and fully trained
    let numSleeves = 0;
    try { numSleeves = await getNsDataThroughFile(ns, 'ns.sleeve.getNumSleeves()', '/Temp/sleeve-count.txt'); } catch { }
    if (numSleeves < options['min-sleeves'])
        return stopTraining(`only ${numSleeves} of ${options['min-sleeves']} sleeves available.`);
    const sleeves = await getNsDataThroughFile(ns, `[...Array(${numSleeves}).keys()].map(i => ({ ...ns.sleeve.getSleeve(i), ` +
        `augsLeft: ns.sleeve.getSleevePurchasableAugs(i).length }))`, '/Temp/sleeve-readiness.txt');
    const notReady = sleeves.map((s, i) => ({ ...s, i })).filter(s => s.sync < 100 || s.shock > 0 || s.augsLeft > 0);
    if (notReady.length > 0)
        return stopTraining(`sleeves not ready yet: ` + notReady.map(s =>
            `#${s.i} (sync ${s.sync.toFixed(1)}%, shock ${s.shock.toFixed(1)}%, ${s.augsLeft} augs left)`).join(', '));

    // Find the lowest combat stat that still needs training
    const skills = player.skills ?? player;
    const deficient = stats.filter(s => skills[s.key] < options['combat-req']).sort((a, b) => skills[a.key] - skills[b.key]);
    if (deficient.length == 0)
        return stopTraining(`all combat stats are at least ${options['combat-req']}.`);
    const target = deficient[0];
    ns.write(covenantTrainingFlagFile, String(Date.now()), 'w'); // Signal work-for-factions.js to stay out of the way

    // Already training the right stat? Then nothing to do
    const currentWork = await getNsDataThroughFile(ns, 'ns.singularity.getCurrentWork()', '/Temp/current-work.txt');
    if (currentWork?.type == "CLASS" && currentWork?.classType == target.gym && currentWork?.location == gymName)
        return ns.print(`Already training ${target.key} (${skills[target.key]} / ${options['combat-req']}) at ${gymName}.`);

    if (player.city != gymCity && !(await getNsDataThroughFile(ns, `ns.singularity.travelToCity('${gymCity}')`, '/Temp/travel.txt')))
        return log(ns, `WARNING: Could not travel to ${gymCity} to train for ${factionName}.`, false, 'warning');
    const focus = !options['no-focus'] && !(await getNsDataThroughFile(ns,
        `ns.singularity.getOwnedAugmentations().includes("Neuroreceptor Management Implant")`, '/Temp/owns-neuroreceptor.txt'));
    if (await getNsDataThroughFile(ns, `ns.singularity.gymWorkout('${gymName}', '${target.gym}', ${focus})`, '/Temp/gym-workout.txt'))
        log(ns, `SUCCESS: Training ${target.key} (${skills[target.key]} / ${options['combat-req']}) at ${gymName} to get ready for ${factionName}.`, false, 'success');
    else
        log(ns, `ERROR: Failed to start training ${target.key} at ${gymName}.`, true, 'error');
}
