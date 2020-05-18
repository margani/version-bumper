import * as core from '@actions/core';
import * as fs from "fs";

import {getBumperOptions, getBumperState} from "./utils/options";
import BumperOptionsFile, {VersionFile} from "./lib/OptionsFile.types";
import BumperState from "./lib/BumperState.type";
import * as readline from "readline";
import {checkout, commit, commitAndPush} from "./utils/gitUtils";
import {CommitOptions} from "./lib/Git.types";


const SUCCESS = 0,
    FAILURE = 1;

async function main() {

    if (!core.getInput('github-token')) {
        core.error("Github token required");
        return FAILURE;
    }

    try {
        let options: BumperOptionsFile = await getBumperOptions();
        let state: BumperState = await getBumperState(options);

        const GIT_OPTIONS: CommitOptions = {
            userName: 'version-bumper',
            userEmail: 'bumper@boringday.co',
            message: `Updated version ${state.curVersion} -> ${state.newVersion}.`,
            token: core.getInput('github-token'),
            branch: state.branch
        };

        await checkout(state.branch);
        await bump(state);
        await commitAndPush(GIT_OPTIONS);

        return SUCCESS;
    } catch (e) {
        core.error(e.message);
        return FAILURE
    }
}

async function bump(state: BumperState) {
    let {files, curVersion, newVersion} = state;
    let wbArray: (() => Promise<void>)[] = []; // write back array

    for (const file of files) {
        try {
            wbArray.push(await setNewVersion(file, curVersion, newVersion));
        } catch (e) {
            core.error(`Error setting new version for file with path ${file.path}`);
            core.error(e.message);
        }
    }
    for (const wb of wbArray) {
        try {
            await wb();
        } catch (e) {
            core.error(`Write back error`);
            core.error(e.message);
        }
    }

}

async function setNewVersion(file: VersionFile, curVersion: string, newVersion: string) {
    const rl = readline.createInterface({input: fs.createReadStream(file.path), crlfDelay: Infinity});
    const numMatches = 1;
    let counter = 1, // line counter
        matches = 0, // matches counter
        update = ""; // string representation of the new file with updated version

    if (!fs.existsSync(file.path))
        throw new Error(`File with path ${file.path} cannot be bumped as it cannot be found.`);

    for await (let ln of rl) {
        if (ln.indexOf(curVersion) !== -1
            && matches < numMatches && !file.line) {
            matches += 1;
            ln = ln.replace(curVersion, newVersion);
        } else if (file.line && counter === file.line) {
            if (ln.indexOf(curVersion) === -1) throw new Error(`Current Version not found on line ${file.line} in file with path ${file.path}.`);
            matches += 1;
            ln = ln.replace(curVersion, newVersion);
        }
        update += ln + '\n';
        counter++; // increment line counter
    }

    return async () => { // write back method
        await fs.writeFileSync(file.path, update, {encoding: 'utf8', flag: 'w'});
    }
}

main()
    .then(status => status)
    .catch(e => {
    core.error(e);
    return FAILURE;
});