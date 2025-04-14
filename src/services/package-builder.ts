import debug from "debug";
import { LayerSpecification } from "maplibre-gl";
import { parseEse, parseSct } from "sector-file-tools";
import { atcData } from "./atc-data.js";
import { navdata } from "./navdata.js";
import { system } from "./system.js";
import { Package } from "../models/fromZod.js";
import { defaultMapLayers } from "../models/defaults.js";
import { InputManifest } from "../models/inputManifest.model.js";

interface UUIDMapping {
  [type: string]: Array<{
    uuid: string;
    name: string | null;
  }>;
}

class PackageBuilder {
  outputPath: string = "";
  commonPath: string = "";
  constructor() {
    this.commonPath = "./src/data/common";
  }

  private _verifyMandatoryFilesExist(data: InputManifest) {
    if (!data.sctPath || !system.fileExistsSync(data.sctPath)) {
      throw new Error("Missing SCT path or file does not exist");
    }
    if (!data.esePath || !system.fileExistsSync(data.esePath)) {
      throw new Error("Missing ESE path or file does not exist");
    }
    if (!data.loginProfilesPath || !system.fileExistsSync(data.loginProfilesPath)) {
      throw new Error("Missing login profiles path");
    }
    if (!data.icaoAircraftPath || !system.fileExistsSync(data.icaoAircraftPath)) {
      throw new Error("Missing ICAO aircraft file path");
    }
    if (!data.icaoAirlinesPath || !system.fileExistsSync(data.icaoAirlinesPath)) {
      throw new Error("Missing ICAO airlines file path");
    }
  }

  public async build(inputManifest: InputManifest): Promise<void> {
    this.outputPath = inputManifest.outputDir;

    // First check if all mandatory files are present
    this._verifyMandatoryFilesExist(inputManifest);

    await system.createDirectory(this.outputPath).then(() => console.log("outputPath created"));

    const sctData = parseSct(await system.readFile(inputManifest.sctPath));
    const eseData = parseEse(sctData, await system.readFile(inputManifest.esePath));

    console.log("Generating package: ", inputManifest.namespace, inputManifest.name);
    const packagePath = `${this.outputPath}/${inputManifest.id}-package/${inputManifest.id}`;
    // clean
    await system.deleteDirectory(packagePath);
    // create
    await system.createDirectory(packagePath);

    // Generate datasets from SCT and ESE data
    const datasets = await navdata.generateDataSets(
      inputManifest.id,
      sctData,
      eseData,
      ["low-airway", "high-airway"],
      this.outputPath,
      inputManifest.useSctLabels
    );

    console.log("Datasets generated:", datasets);

    await sleep(1000);

    // Process raw ESE file to extract navaid, sector, and position information
    console.log("Generating navdata...");
    const allNavaids = await navdata.generateNavdata(inputManifest.id, inputManifest.namespace, inputManifest.esePath, this.outputPath, inputManifest.isGNG);

    console.log("Processing ESE content...");
    const parsedEseContent = await navdata.parseEseContent(inputManifest.esePath, allNavaids, inputManifest.isGNG);

    // Generate ATC data with the parsed ESE content
    console.log("Generating ATC data...");
    await atcData.generateAtcdata(
      inputManifest.id,
      inputManifest.loginProfilesPath,
      inputManifest.icaoAircraftPath,
      inputManifest.icaoAirlinesPath,
      inputManifest.recatDefinitionPath,
      inputManifest.aliasPath,
      this.outputPath,
      parsedEseContent // Pass the parsed ESE content to generate sector data
    );

    // Generate manifest
    console.log("Generating manifest...");
    const manifest = {
      $schema: "https://raw.githubusercontent.com/neoradar-project/schemas/refs/heads/main/package/manifest.schema.json",
      id: inputManifest.id,
      name: inputManifest.name,
      version: "1.0.0",
      description: inputManifest.description,
      namespace: inputManifest.namespace,
      createdAt: new Date().toISOString(),
      mapLayers: defaultMapLayers,
      centerPoint: [847183.3480445864, -6195983.977450224],
    } as Package;

    await system.writeFile(`${packagePath}/manifest.json`, JSON.stringify(manifest, null, 2));

    console.log("Package build completed successfully!");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const packageBuilder = new PackageBuilder();
