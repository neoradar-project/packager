import debug from "debug";
import { system } from "./system.js";
import { Gate } from "../models/gate.js";
import { PackageAtcPosition } from "../models/position.js";
import { Procedure } from "../models/procedure.js";
import { geoHelper } from "../libs/geo-helper.js";
import { ESE, Position, SCT, toGeoJson } from "sector-file-tools";
import { multiLineString } from "@turf/turf";
import { Navaid, Segment } from "sector-file-tools/dist/src/sct.js";
import { Sector, SectorLine } from "../models/nse.js";

const log = debug("NavdataManager");

class NavdataManager {
  constructor() {
    this.init();
  }

  private init() {
    log("Init");
  }

  private async parseSectorLines(eseFile: string): Promise<any> {
    const eseData = await system.readFile(eseFile);
    const lines = eseData.toString().split("\n");

    const sectorLines: any[] = [];
    const sectors: any[] = [];

    let baseMatrixInt = 690;
    const numericIDReplacementMatrix: Record<string, number> = {};

    let inAirspaceSection = false;

    let currentSectorLine: SectorLine = {
      id: 0,
      points: [],
      display: [],
    };
    let currentSector: Sector = {
      layerUniqueId: 0,
      name: "",
      actives: [],
      owners: [],
      borders: [],
      depApts: [],
      arrApts: [],
      floor: 0,
      ceiling: 0,
      displaySectorLines: [],
    };
    let sectorCounter = 99000;

    for (const line of lines) {
      if (line.startsWith(";=")) continue;
      if (line.startsWith("[AIRSPACE]")) {
        inAirspaceSection = true;
        continue;
      }
      if (inAirspaceSection) {
        // Sectorlines
        if (line.startsWith("SECTORLINE:")) {
          const id = line.split(":")[1].replace("\r", "");
          const isnum = /^\d+$/.test(id);
          if (!isnum) {
            numericIDReplacementMatrix[id] = baseMatrixInt;
            baseMatrixInt++;
            console.log(
              "Replacement matrix for non numeric sector ID is  for " +
                id +
                " is " +
                numericIDReplacementMatrix[id]
            );
          }
          currentSectorLine = {
            id: isnum ? Number(id) : numericIDReplacementMatrix[id],
            points: [],
            display: [],
          };
          sectorLines.push(currentSectorLine);
        }
        if (line.startsWith("COORD:")) {
          const coord = line.split(":");
          const geo = geoHelper.convertESEGeoCoordinates(
            coord[1].replace("\r", ""),
            coord[2].replace("\r", "")
          );
          currentSectorLine.points.push({
            lat: geo?.lat ?? 0,
            lon: geo?.lon ?? 0,
          });
        }
        if (line.startsWith("DISPLAY:")) {
          // const parts = line.split(":");
          // const dsp = {
          //   name: parts[1].replace("\r", "").replace("�", ""),
          // };
          // currentSectorLine.display.push(dsp);
          continue; // Display lines are handled automatically based on common borders
        }
        // Sectors

        if (line.startsWith("SECTOR:")) {
          const parts = line.split(":");
          currentSector = {
            layerUniqueId: sectorCounter++,
            name: parts[1].replace("\r", "").replace("�", ""),
            actives: [],
            owners: [],
            borders: [],
            depApts: [],
            arrApts: [],
            floor: Number(parts[2].replace("\r", "")),
            ceiling: Number(parts[3].replace("\r", "")),
            displaySectorLines: [],
          };
          sectors.push(currentSector);
        }
        if (line.startsWith("OWNER:")) {
          const parts = line.replace("OWNER:", "").split(":");
          currentSector.owners = parts.map((item) => item.replace("\r", ""));
        }
        if (line.startsWith("BORDER:")) {
          const parts = line.replace("BORDER:", "").split(":");
          currentSector.borders = parts.map((item) => {
            let cleanItem = item.replace("\r", "");
            const isnum = /^\d+$/.test(cleanItem);
            if (isnum) {
              return Number(cleanItem);
            } else {
              if (!numericIDReplacementMatrix[cleanItem]) {
                console.error(
                  "No replacement matrix available for " + cleanItem
                );
              }
              return numericIDReplacementMatrix[cleanItem];
            }
          });
        }
        if (line.startsWith("DEPAPT:")) {
          const parts = line.replace("DEPAPT:", "").split(":");
          currentSector.depApts = parts.map((item) => item.replace("\r", ""));
        }
        if (line.startsWith("ARRAPT:")) {
          const parts = line.replace("ARRAPT:", "").split(":");
          currentSector.arrApts = parts.map((item) => item.replace("\r", ""));
        }
        if (line.startsWith("ACTIVE:")) {
          const parts = line.replace("ACTIVE:", "").split(":");
          currentSector.actives.push({
            icao: parts[0].replace("\r", ""),
            runway: parts[1].replace("\r", ""),
          });
        }
        if (line.startsWith("DISPLAY_SECTORLINE:")) {
          const parts = line.replace("DISPLAY_SECTORLINE:", "").split(":");
          currentSector.displaySectorLines.push({
            borderId: Number(parts[0].replace("\r", "")),
            mySector: parts[1].replace("\r", ""),
            otherSectors: parts
              .slice(2)
              .map((item) =>
                item
                  .replace("\r", "")
                  .replace("�", "")
                  .replace(parts[1].replace("\r", ""), "") // We ignore our own sector
              ).filter((item) => item !== ""),
          });
        }
      }
    }

    const data = {
      sectors: sectors,
      sectorLines: sectorLines,
    };

    return data;
  }

  public async generateNavdata(
    packageId: string,
    namespace: string,
    eseFilePath: string,
    outputPath: string
  ): Promise<void> {
    log("generateNavdata");
    const path = `${outputPath}/${packageId}/datasets`;

    let nse: any = {};
    const allNavaids: any[] = [];

    // regions
    const regionsData = JSON.parse(
      await system.readFile(`${path}/region.geojson`)
    ).features;
    const tmpRegions: string[] = [];
    for (const feature of regionsData) {
      if (tmpRegions.indexOf(feature.properties.region) === -1) {
        tmpRegions.push(feature.properties.region);
      }
    }
    nse.region = tmpRegions.map((key) => {
      return {
        name: key,
      };
    });
    await system.deleteFile(`${path}/region.geojson`);

    // geo
    const geoData = JSON.parse(
      await system.readFile(`${path}/geo.geojson`)
    ).features;
    const tmpGeo: string[] = [];
    for (const feature of geoData) {
      if (tmpGeo.indexOf(feature.properties.section) === -1) {
        tmpGeo.push(feature.properties.section);
      }
    }
    nse.geo = tmpGeo.map((key) => {
      return {
        name: key,
      };
    });
    // await system.deleteFile(`${path}/geo.geojson`);

    // navaids
    const typeList = ["vor", "ndb", "fix", "airport"];
    for (const type of typeList) {
      const typeData = JSON.parse(
        await system.readFile(`${path}/${type}.geojson`)
      ).features;
      nse[type] = typeData.map((item: any) => {
        return {
          name: item.properties.name,
          freq: item.properties.freq,
          type: item.properties.type,
          lat: item.geometry.coordinates[1],
          lon: item.geometry.coordinates[0],
          layerUniqueId: item.properties.id,
        };
      });
      allNavaids.push(...nse[type]);
      // await system.deleteFile(`${path}/${type}.geojson`);
    }

    // runways
    const runwaysData = JSON.parse(
      await system.readFile(`${path}/runway.geojson`)
    ).features;
    nse.runway = runwaysData.map((item: any) => {
      return {
        id: item.id,
        name: item.properties.name,
        oppositeId: item.properties.oppositeId,
        type: item.properties.type,
        icao: item.properties.icao,
        layerUniqueId: item.properties.id,
      };
    });
    // await system.deleteFile(`${path}/runway.geojson`);

    // Airways

    const awys = ["lowAirway", "highAirway"];
    for (const awy of awys) {
      const data = JSON.parse(
        await system.readFile(`${path}/${awy}.geojson`)
      ).features;
      nse[awy] = data.map((item: any) => {
        return {
          id: item.id,
          name: item.properties.name,
          oppositeId: item.properties.oppositeId,
          type: item.properties.type,
        };
      });
      // await system.deleteFile(`${path}/${awy}.geojson`);
    }

    // labels
    const labelsData = JSON.parse(
      await system.readFile(`${path}/label.geojson`)
    ).features;
    // merge labels with same section value
    const tmpLabels: any[] = [];
    for (const feature of labelsData) {
      const index = tmpLabels.findIndex(
        (item) => item.properties.section === feature.properties.section
      );
      if (index === -1) {
        if (!feature.properties.section.includes("Gates")) {
          tmpLabels.push(feature);
        }
      }
    }
    nse.label = tmpLabels.map((item: any) => {
      return {
        name: item.properties.section,
        value: item.properties.value,
        type: item.properties.type,
        lat: item.geometry.coordinates[1],
        lon: item.geometry.coordinates[0],
      };
    });
    // await system.deleteFile(`${path}/label.geojson`);

    const eseData = await system.readFile(eseFilePath);
    const lines = eseData.toString().split("\n");

    nse.gate = [];
    nse.position = [];
    nse.procedure = [];

    let gateCounter = 5000;
    let positionCounter = 10000;
    let procedureCounter = 30000;
    // TODO : AMSR, TWY?, VFR points

    let inPositionSection = false;
    for (const line of lines) {
      if (line.startsWith("[POSITIONS]")) {
        inPositionSection = true;
        continue;
      }
      if (
        inPositionSection &&
        line.startsWith("[") &&
        !line.startsWith("[POSITIONS]")
      ) {
        inPositionSection = false;
        continue;
      }
      if (inPositionSection) {
        const position = PackageAtcPosition.init(line);
        if (!position) continue;
        position.layerUniqueId = positionCounter++;
        nse.position.push(position.toJsonObject());
      }

      if (line.startsWith(";=")) continue;
      const data = line.split(":");
      if (data.length < 3) continue;

      if (data[2].includes("Gates")) {
        const gate = Gate.init(line);
        if (!gate) continue;
        const aptIcao = data[2].substring(0, 4);
        gate.icao = aptIcao;
        gate.layerUniqueId = gateCounter++;
        nse.gate.push(gate.toJsonObject());
      }

      if (data[0].includes("STAR") || data[0].includes("SID")) {
        const proc = Procedure.init(line, allNavaids);
        if (!proc) continue;
        proc.layerUniqueId = procedureCounter++;
        nse.procedure.push(proc.toJsonObject());
      }
    }

    const sectorData = await this.parseSectorLines(eseFilePath);
    nse.sectors = sectorData.sectors;
    nse.sectorLines = sectorData.sectorLines;

    await system.writeFile(
      `${outputPath}/${packageId}/datasets/nse.json`,
      JSON.stringify(nse)
    );
  }

  public async generateDataSets(
    packageId: string,
    sctData: SCT,
    eseData: ESE,
    ignoreTypes: string[],
    outputPath: string
  ): Promise<string[]> {
    // clear dataset directory
    const path = `${outputPath}/${packageId}/datasets`;
    await system.deleteDirectory(path);
    let datasets: string[] = [];

    const geoJsonData = toGeoJson(sctData, eseData, null, "WGS84");
    let features = geoJsonData.features as any[];

    sctData.lowAirway.forEach((airway) => {
      const lines = airway.segments.map((segment): number[][] => {
        const segmentExtract = this.extractSegment(segment);
        return segmentExtract;
      });
      const multiline = multiLineString(lines);
      multiline.properties = {
        type: "lowAirway",
        name: airway.id,
      };
      features.push(multiline);
    });

    sctData.highAirway.forEach((airway) => {
      const lines = airway.segments.map((segment): number[][] => {
        const segmentExtract = this.extractSegment(segment);
        return segmentExtract;
      });
      const multiline = multiLineString(lines);
      multiline.properties = {
        type: "highAirway",
        name: airway.id,
      };
      features.push(multiline);
    });

    const allTypes: string[] = [];
    features.forEach((f) => {
      if (!allTypes.includes(f.properties.type)) {
        allTypes.push(f.properties.type);
      }
    });

    if (allTypes.length > 1) {
      datasets = allTypes.filter((t) => !ignoreTypes.includes(t));
      datasets.forEach(async (t) => {
        await this.generateGeoJsonFilesForType(
          path,
          t,
          features.filter((f) => f.properties.type === t)
        );
      });
    }

    return datasets;
  }

  private extractSegment(segment: Segment): number[][] {
    let returnSegment: number[][] = [];
    returnSegment.push(
      "position" in segment.start
        ? [
            (segment.start as Navaid).position.lonFloat,
            (segment.start as Navaid).position.latFloat,
          ]
        : [
            (segment.start as Position).lonFloat,
            (segment.start as Position).latFloat,
          ]
    );
    returnSegment.push(
      "position" in segment.end
        ? [
            (segment.end as Navaid).position.lonFloat,
            (segment.end as Navaid).position.latFloat,
          ]
        : [
            (segment.end as Position).lonFloat,
            (segment.end as Position).latFloat,
          ]
    );
    return returnSegment;
  }

  private async generateGeoJsonFilesForType(
    path: string,
    type: string,
    allFeatures: any[]
  ): Promise<void> {
    const features = allFeatures;
    const geojson = {
      type: "FeatureCollection",
      features: features,
    };
    const data = JSON.stringify(geojson);
    await system.writeFile(`${path}/${type}.geojson`, data);
    return;
  }

  private async loadJsonFromFile(path: string): Promise<any> {
    const data = await system.readFile(path);
    return JSON.parse(data);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const navdata = new NavdataManager();
