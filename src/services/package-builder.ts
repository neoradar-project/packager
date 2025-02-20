import debug from "debug";
import { LayerSpecification } from "maplibre-gl";
import { parseEse, parseSct } from "sector-file-tools";
import { atcData } from "./atc-data.js";
import { navdata } from "./navdata.js";
import { system } from "./system.js";
import { Package } from "../models/fromZod.js";
import { defaultMapLayers } from "../models/defaults.js";
const log = debug("PackageBuilder");

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

  public async build(
    id: string,
    name: string,
    description: string,
    namespace: string,
    sctFilePath: string,
    eseFilePath: string,
    loginProfilesPath: string,
    icaoAircraftPath: string,
    icaoAirlinesPath: string,
    recatDefinitionPath: string | undefined,
    aliasPath: string,
    outputPath: string,
    useSctLabels: boolean = true
  ): Promise<void> {
    this.outputPath = outputPath;
    await system.createDirectory(this.outputPath).then(() => log("outputPath created"));
    log("build", sctFilePath);

    const sctData = parseSct(await system.readFile(sctFilePath));
    const eseData = parseEse(sctData, await system.readFile(eseFilePath));

    log("generatePackage", namespace, name);
    const packagePath = `${this.outputPath}/${id}-package/${id}`;
    // clean
    await system.deleteDirectory(packagePath);
    // create
    await system.createDirectory(packagePath);

    // Package datasets
    const datasets = await navdata.generateDataSets(id, sctData, eseData, ["low-airway", "high-airway"], outputPath, useSctLabels);

    log("datasets", datasets);

    await sleep(1000);

    // Package global ATC Data

    await atcData.generateAtcdata(id, loginProfilesPath, icaoAircraftPath, icaoAirlinesPath, recatDefinitionPath, aliasPath, outputPath);

    // Generating computable navdata
    await navdata.generateNavdata(id, namespace, eseFilePath, outputPath);

    // generate manifest
    const manifest = {
      $schema: "https://raw.githubusercontent.com/neoradar-project/schemas/refs/heads/main/package/manifest.schema.json",
      id: id,
      name: name,
      version: "1.0.0",
      description: description,
      namespace: namespace,
      createdAt: new Date().toISOString(),
      mapLayers: defaultMapLayers,
      centerPoint: [847183.3480445864, -6195983.977450224],
    } as Package;

    await system.writeFile(`${packagePath}/manifest.json`, JSON.stringify(manifest));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const packageBuilder = new PackageBuilder();
