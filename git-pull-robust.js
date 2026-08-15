/**
 * Git Pull Script for Bitburner - Robust error handling
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
            // In Bitburner, ns.shell returns the stdout as string on success
            // and throws an exception on non-zero exit code
            const status = await ns.shell(`cd "${localDir}" && git status --porcelain`);
            // If we get here, git status succeeded (exit code 0)
            isGitRepo = true;
        } catch (e) {
            // ns.shell throws on non-zero exit code
            isGitRepo = false;
        }
        
        if (!isGitRepo) {
            if (!quiet) ns.tprint("Initializing git repository...");
            // Initialize git repo
            await ns.shell(`cd "${localDir}" && git init`);
            await ns.shell(`cd "${localDir}" && git remote add origin ${remoteUrl}`);
            await ns.shell(`cd "${localDir}" && git fetch origin ${branch}`);
            await ns.shell(`cd "${localDir}" && git reset --hard origin/${branch}`);
            if (!quiet) ns.tprint("Repository initialized and synced.");
        } else {
            if (!quiet) ns.tprint("Fetching latest changes from remote...");
            await ns.shell(`cd "${localDir}" && git fetch origin ${branch}`);
            
            // Check if we need to update
            let needsUpdate = false;
            if (force) {
                needsUpdate = true;
            } else {
                const localHash = await ns.shell(`cd "${localDir}" && git rev-parse HEAD`);
                const remoteHash = await ns.shell(`cd "${localDir}" && git rev-parse origin/${branch}`);
                needsUpdate = (localHash.trim() !== remoteHash.trim());
            }
            
            if (needsUpdate) {
                if (!quiet) ns.tprint("Updating local repository...");
                await ns.shell(`cd "${localDir}" && git reset --hard origin/${branch}`);
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
        // ROBUST ERROR HANDLING
        // Convert any possible error value to a safe string
        let errorMessage = '[Unknown error]';
        
        try {
            if (error === null) {
                errorMessage = 'null';
            } else if (error === undefined) {
                errorMessage = 'undefined';
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error instanceof Error) {
                errorMessage = error.message || error.name || 'Error';
                if (!errorMessage) {
                    errorMessage = error.toString() || 'Error';
                }
            } else if (typeof error === 'object') {
                errorMessage = error.toString();
                if (errorMessage === '[object Object]' || errorMessage === '{}') {
                    try {
                        errorMessage = JSON.stringify(error);
                    } catch (e) {
                        errorMessage = '[Object]';
                    }
                }
            } else {
                errorMessage = String(error);
            }
            
            // Ensure we have a non-empty message
            if (!errorMessage || errorMessage === '') {
                errorMessage = '[Empty error]';
            }
        } catch (err) {
            // If our error handling fails, use a fallback
            errorMessage = '[Error in error handler]';
        }
        
        ns.tprint(`Error during git synchronization: ${errorMessage}`);
        if (!quiet) ns.tprint("Please check your internet connection and repository access.");
    }
    
    if (!quiet) ns.tprint("GitHub synchronization completed.");
}