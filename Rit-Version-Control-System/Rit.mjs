#!/usr/bin/env node

import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { diffLines } from "diff";
import chalk from "chalk";
import { Command } from "commander";

const program = new Command();

class Rit {
  constructor(repoPath = ".") {
    this.repoPath = path.join(repoPath, ".rit");
    this.objectPath = path.join(this.repoPath, "objects"); //.rit/objects
    this.headPath = path.join(this.repoPath, "HEAD"); //.rit/HEAD
    this.indexPath = path.join(this.repoPath, "index"); //.rit/index
    this.init();
  }

  //init
  async init() {
    await fs.mkdir(this.objectPath, { recursive: true });
    try {
      await fs.writeFile(this.headPath, "", { flag: "wx" }); // wx: open for writing. fails if file exists
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: "wx" });
    } catch (error) {
      console.log("Already exists .rit directory");
    }
  }

  //Hash content acc to SHA1
  hashObject(content) {
    return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
  }

  //Add file to staging area
  async add(fileToBeAdded) {
    const fileData = await fs.readFile(fileToBeAdded, { encoding: "utf-8" }); //Read the file
    const fileHash = this.hashObject(fileData); //Get hash of file content
    console.log(fileHash);
    const newFileHashObjectPath = path.join(this.objectPath, fileHash);
    await fs.writeFile(newFileHashObjectPath, fileData);
    await this.updateStagingArea(fileToBeAdded, fileHash);
    console.log(`Added ${fileToBeAdded}`);
  }

  async updateStagingArea(filePath, fileHash) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: "utf-8" })
    ); //read the index file
    index.push({ path: filePath, hash: fileHash }); // add the file to the index
    await fs.writeFile(this.indexPath, JSON.stringify(index));
  }

  async commit(message) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: "utf-8" })
    );
    const parentCommit = await this.getCurrentHead();
    const commitData = {
      timeStamp: new Date().toISOString(),
      message,
      files: index,
      parent: parentCommit,
    };

    const commitHash = this.hashObject(JSON.stringify(commitData));
    const commitPath = path.join(this.objectPath, commitHash);
    await fs.writeFile(commitPath, JSON.stringify(commitData));
    await fs.writeFile(this.headPath, commitHash); //update the HEAD to point to the new commit
    await fs.writeFile(this.indexPath, JSON.stringify([]));
    console.log(`Committed with hash: ${commitHash}`);
  }

  async getCurrentHead() {
    try {
      return await fs.readFile(this.headPath, { encoding: "utf-8" });
    } catch (error) {
      return null;
    }
  }

  async log() {
    let currentCommitHash = await this.getCurrentHead();
    while (currentCommitHash) {
      const commitData = JSON.parse(
        await fs.readFile(path.join(this.objectPath, currentCommitHash), {
          encoding: "utf-8",
        })
      );
      console.log(`----------------------------------------------\n`);
      console.table(
        Object.fromEntries(
          Object.entries(commitData).filter(([key, value]) => key !== "files")
        )
      );
      currentCommitHash = commitData.parent;
    }
  }
  async showCommitDiff(commitHash) {
    const commitData = JSON.parse(await this.getCommitData(commitHash));
    if (!commitData) {
      console.log("commit data not found");
      return;
    }
    console.log(commitData);
    for (const file of commitData.files) {
      console.log(`File : ${file.path}`);
      const fileContent = await this.getFileContent(file.hash);
      console.log(`File content : ${fileContent}`);
      if (commitData.parent) {
        //get commit parent data
        const parentCommitData = JSON.parse(
          await this.getCommitData(commitData.parent)
        );
        const getParentFileContent = await this.getParentFileContent(
          parentCommitData,
          file.path
        );
        if (getParentFileContent !== "undefined") {
          console.log("\nDiff:");
          const diff = diffLines(getParentFileContent, fileContent);
          diff.forEach((part) => {
            part.added && process.stdout.write(chalk.green("++" + part.value));
            part.removed && process.stdout.write(chalk.red("--" + part.value));
            !part.added &&
              !part.removed &&
              process.stdout.write(chalk.grey(part.value));
          });
          console.log();
        } else {
          console.log("First Commit");
        }
      }
    }
  }
  async getCommitData(commitHash) {
    const commitPath = path.join(this.objectPath, commitHash);
    try {
      return await fs.readFile(commitPath, { encoding: "utf-8" });
    } catch (error) {
      console.log(`Failed to read commit data ${error}`);
    }
  }
  async getFileContent(fileHash) {
    const objectPath = path.join(this.objectPath, fileHash);
    return await fs.readFile(objectPath, { encoding: "utf-8" });
  }
  async getParentFileContent(parentCommitData, filePath) {
    const parentFile = parentCommitData.files.find(
      (file) => file.path === filePath
    );
    if (parentFile) {
      return await this.getFileContent(parentFile.hash);
    }
  }
}

// (async () => {
//   const rit = new Rit();
//   //   await rit.add("test.mjs");
//   //   await rit.commit("6th commit");
//   //   await rit.log();
//   await rit.showCommitDiff("5e2b06579ad23d8690ec7252ce8b8a31205624b0");
// })();

program.command("init").action(async () => {
  const rit = new Rit();
});

program.command("add <file>").action(async (file) => {
  const rit = new Rit();
  await rit.add(file);
});

program.command("commit <message>").action(async (message) => {
  const rit = new Rit();
  await rit.commit(message);
});

program.command("log").action(async () => {
  const rit = new Rit();
  await rit.log();
});

program.command("show <commitHash>").action(async (commitHash) => {
  const rit = new Rit();
  await rit.showCommitDiff(commitHash);
});

program.parse(process.argv);
