import Debug from "debug";
const debug = Debug("MainServer");
import { packageBuilder } from "./services/package-builder.js";
import { system } from "./services/system.js";
import { InputManifest } from "./models/inputManifest.model.js";
import AsrFolderConverter from "./services/asr-converter.js";
import path from "path";
import os from "os";
import DistributionManager from "./services/distribution-manager.js";

function getDefaultNeoRadarPath() {
  const documentsPath = path.join(os.homedir(), "Documents");
  return path.join(documentsPath, "NeoRadar");
}

async function startJobs() {
  debug("Starting !");
  const inputFilePath = process.argv[2];
  const customNeoRadarPath = process.argv[3];

  console.log("Input file path: ", inputFilePath);

  // Use custom path if provided, otherwise use default documents/NeoRadar path
  const neoRadarPath = customNeoRadarPath || getDefaultNeoRadarPath();
  console.log("NeoRadar path: ", neoRadarPath);

  if (!inputFilePath || !system.fileExistsSync(inputFilePath)) {
    throw new Error("Input file does not exist");
  }

  const data = JSON.parse(
    await system.readFile(inputFilePath)
  ) as InputManifest;

  await packageBuilder.build(data);

  try {
    if (!data.asrPath) {
      console.log("No ASR directory provided, skipping ASR conversion");
    } else {
      const path = `${data.outputDir}/${data.id}-package/profiles`;
      await system.deleteDirectory(path);
      AsrFolderConverter.convertFolder(data.asrPath, path);
    }
  } catch (error) {
    console.error("Conversion failed:", error);
  }

  const distributionManager = new DistributionManager();
  await distributionManager.buildPackage(neoRadarPath, data);

  system.deinit();
}

startJobs();
