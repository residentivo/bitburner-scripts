/**
 * Git Pull Script for Bitburner
 * Synchronizes scripts from GitHub repository residentivo/bitburner-scripts (branch main)
 * 
 * Usage: run git-pull.js [--force] [--quiet]
 * 
 * @param {NS} ns
 **/
export async function main(ns) {
    // Disable logging for performance (as per user preference)
    ns.disableLog("ALL");
    
    const args = ns.args;
    const force = args.includes("--force");
    const quiet = args.includes("--quiet");
    
    if (!quiet) {
        ns.tprint("Starting GitHub synchronization...");
    }
    
    const repo = "residentivo/bitburner-scripts";
    const branch = "main";
    const localDir = "/home/ivo/projects/Bitburner";
    const remoteUrl = `https://github.com/${repo}.git`;
    
    try {
        // Check if we're in a git repository
        let isGitRepo = false;
        try {
            const status = await ns.exec(`cd "${localDir}" && git status`, 1, 0);
            isGitRepo = (status !== 0); // exec returns 0 on success in Bitburner?
        } catch (e) {
            isGitRepo = false;
        }
        
        if (!isGitRepo) {
            if (!quiet) ns.tprint("Initializing git repository...");
            // Initialize git repo
            await ns.exec(`cd "${localDir}" && git init`, 1, 0);
            await ns.exec(`cd "${localDir}" && git remote add origin ${remoteUrl}`, 1, 0);
            await ns.exec(`cd "${localDir}" && git fetch origin ${branch}`, 1, 0);
            await ns.exec(`cd "${localDir}" && git reset --hard origin/${branch}`, 1, 0);
            if (!quiet) ns.tprint("Repository initialized and synced.");
        } else {
            if (!quiet) ns.tprint("Fetching latest changes from remote...");
            await ns.exec(`cd "${localDir}" && git fetch origin ${branch}`, 1, 0);
            
            // Check if we need to update
            let needsUpdate = false;
            if (force) {
                needsUpdate = true;
            } else {
                const localHash = await ns.exec(`cd "${localDir}" && git rev-parse HEAD`, 1, 0);
                const remoteHash = await ns.exec(`cd "${localDir}" && git rev-parse origin/${branch}`, 1, 0);
                needsUpdate = (localHash.trim() !== remoteHash.trim());
            }
            
            if (needsUpdate) {
                if (!quiet) ns.tprint("Updating local repository...");
                await ns.exec(`cd "${localDir}" && git reset --hard origin/${branch}`, 1, 0);
                if (!quiet) ns.tprint("Repository updated successfully.");
            } else {
                if (!quiet) ns.tprint("Repository is already up to date.");
            }
        }
        
        // Optional: Run any setup scripts if they exist
        const setupScript = `${localDir}/setup.js`;
        const setupExists = await ns.fileExists(setupScript);
        if (setupExists && !quiet) {
            ns.tprint("Found setup script. Running setup...");
            await ns.exec(`run ${setupScript}`, 2, 0); // Run in background with 2 second timeout
        }
        
    } catch (error) {
        ns.tprint(`Error during git synchronization: ${error.message}`);
        if (!quiet) ns.tprint("Please check your internet connection and repository access.");
    }
    
    if (!quiet) ns.tprint("GitHub synchronization completed.");
}