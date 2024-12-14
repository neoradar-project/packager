import debug from "debug";
import { navdata } from "./navdata.js";
import { tilesManager } from "./tiles-manager.js";
import { atcData } from "./atc-data.js";
import { SystemManager } from "./system.js";
import { EnvConfig } from "../config/config.js";
const log = debug("PackageManager");

const system = new SystemManager();

export class PackageManager {
  commonPath: string = `${EnvConfig.tileserver.sharedDirectory}/common`;
  packagesPath: string = `${EnvConfig.tileserver.sharedDirectory}/packages`;

  constructor() {
    log("PackageManager init");
    system.createDirectory(this.commonPath).then(() => log("commonPath created"));
    system.createDirectory(this.packagesPath).then(() => log("packagesPath created"));
  }

  public async generateBasePackage(): Promise<void> {
    const baseSourcesPath = `${this.commonPath}/sources`;
    // clean
    await system.deleteDirectory(baseSourcesPath);
    // create
    await system.createDirectory(baseSourcesPath);

    const sourceDatas = await system.listDirectories(`${this.commonPath}/data`);
    for (const sourceData of sourceDatas) {
      const sourceDataPath = `${this.commonPath}/data/${sourceData}`;
      const sourceDataFiles = (await system.listFiles(sourceDataPath)).map((f) => `${sourceDataPath}/${f}`);
      log("sourceDataFiles", sourceDataFiles);
      // const commonMaxZoom = await tilesManager.generateMBTilesFrom(sourceData, baseSourcesPath, sourceDataFiles, 5)
      // log('maxZoom', commonMaxZoom)
    }
  }
}

export const packageManager = new PackageManager();
