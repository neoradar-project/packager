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
import { v4 as uuidv4 } from "uuid";
const log = debug("NavdataManager");

class NavdataManager {
  private uuidMap = new Map<string, string>();

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
            console.log("Replacement matrix for non numeric sector ID is  for " + id + " is " + numericIDReplacementMatrix[id]);
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
          const geo = geoHelper.convertESEGeoCoordinates(coord[1].replace("\r", ""), coord[2].replace("\r", ""));
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
          currentSector.borders = parts
            .map((item) => {
              let cleanItem = item.replace("\r", "");
              if (!cleanItem) return null; // Skip empty entries

              const isnum = /^\d+$/.test(cleanItem);
              if (isnum) {
                return Number(cleanItem);
              } else {
                if (!numericIDReplacementMatrix[cleanItem]) {
                  console.error("No replacement matrix available for " + cleanItem);
                  return null; // Return null for invalid entries
                }
                return numericIDReplacementMatrix[cleanItem];
              }
            })
            .filter((item): item is number => item !== null); // Type guard to ensure only numbers remain
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
              .map(
                (item) => item.replace("\r", "").replace("�", "").replace(parts[1].replace("\r", ""), "") // We ignore our own sector
              )
              .filter((item) => item !== ""),
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

  public async generateNavdata(packageId: string, namespace: string, eseFilePath: string, outputPath: string): Promise<void> {
    log("generateNavdata");
    const path = `${outputPath}/${packageId}/datasets`;

    let nse: any = {};
    const allNavaids: any[] = [];

    // Clear UUID map for new generation
    this.uuidMap.clear();

    // regions
    const regionsData = JSON.parse(await system.readFile(`${path}/region.geojson`)).features;
    const tmpRegions: string[] = [];
    for (const feature of regionsData) {
      if (tmpRegions.indexOf(feature.properties.region) === -1) {
        tmpRegions.push(feature.properties.region);
      }
    }
    nse.region = tmpRegions.map((key) => {
      const feature = regionsData.find((f) => f.properties.region === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for region: ${key}`);
        throw new Error(`Missing UUID for region: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // geo
    const geoData = JSON.parse(await system.readFile(`${path}/geo.geojson`)).features;
    const tmpGeo: string[] = [];
    for (const feature of geoData) {
      if (tmpGeo.indexOf(feature.properties.section) === -1) {
        tmpGeo.push(feature.properties.section);
      }
    }
    nse.geo = tmpGeo.map((key) => {
      const feature = geoData.find((f) => f.properties.section === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for geo section: ${key}`);
        throw new Error(`Missing UUID for geo section: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // sids
    const sidsData = JSON.parse(await system.readFile(`${path}/sid.geojson`)).features;
    const tmpSids: string[] = [];
    for (const feature of sidsData) {
      const name = this.getFeatureName(feature);
      if (name && tmpSids.indexOf(name) === -1) {
        tmpSids.push(name);
      }
    }
    nse.sid = tmpSids.map((key) => {
      const feature = sidsData.find((f) => this.getFeatureName(f) === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for SID: ${key}`);
        throw new Error(`Missing UUID for SID: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // stars
    const starsData = JSON.parse(await system.readFile(`${path}/star.geojson`)).features;
    const tmpStars: string[] = [];
    for (const feature of starsData) {
      const name = this.getFeatureName(feature);
      if (name && tmpStars.indexOf(name) === -1) {
        tmpStars.push(name);
      }
    }
    nse.star = tmpStars.map((key) => {
      const feature = starsData.find((f) => this.getFeatureName(f) === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for STAR: ${key}`);
        throw new Error(`Missing UUID for STAR: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // artcc-low
    const artccLowData = JSON.parse(await system.readFile(`${path}/artccLow.geojson`)).features;
    const tmpArtccLow: string[] = [];
    for (const feature of artccLowData) {
      const name = this.getFeatureName(feature);
      if (name && tmpArtccLow.indexOf(name) === -1) {
        tmpArtccLow.push(name);
      }
    }
    nse.artccLow = tmpArtccLow.map((key) => {
      const feature = artccLowData.find((f) => this.getFeatureName(f) === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for ARTCC Low: ${key}`);
        throw new Error(`Missing UUID for ARTCC Low: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // artcc-high
    const artccHighData = JSON.parse(await system.readFile(`${path}/artccHigh.geojson`)).features;
    const tmpArtccHigh: string[] = [];
    for (const feature of artccHighData) {
      const name = this.getFeatureName(feature);
      if (name && tmpArtccHigh.indexOf(name) === -1) {
        tmpArtccHigh.push(name);
      }
    }
    nse.artccHigh = tmpArtccHigh.map((key) => {
      const feature = artccHighData.find((f) => this.getFeatureName(f) === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for ARTCC High: ${key}`);
        throw new Error(`Missing UUID for ARTCC High: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // artcc
    const artccData = JSON.parse(await system.readFile(`${path}/artcc.geojson`)).features;
    const tmpArtcc: string[] = [];
    for (const feature of artccData) {
      const name = this.getFeatureName(feature);
      if (name && tmpArtcc.indexOf(name) === -1) {
        tmpArtcc.push(name);
      }
    }
    nse.artcc = tmpArtcc.map((key) => {
      const feature = artccData.find((f) => this.getFeatureName(f) === key);
      if (!feature?.properties.uuid) {
        console.error(`No UUID found for ARTCC: ${key}`);
        throw new Error(`Missing UUID for ARTCC: ${key}`);
      }
      return {
        name: key,
        uuid: feature.properties.uuid,
      };
    });

    // navaids
    const typeList = ["vor", "ndb", "fix", "airport"];
    for (const type of typeList) {
      const typeData = JSON.parse(await system.readFile(`${path}/${type}.geojson`)).features;
      nse[type] = typeData.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(`No UUID found for ${type}: ${item.properties.name}`);
          throw new Error(`Missing UUID for ${type}: ${item.properties.name}`);
        }
        return {
          name: this.getFeatureName(item),
          freq: item.properties.freq,
          type: item.properties.type,
          lat: item.geometry.coordinates[1],
          lon: item.geometry.coordinates[0],
          layerUniqueId: item.properties.id,
          uuid: item.properties.uuid,
        };
      });
      allNavaids.push(...nse[type]);
    }

    // runways
    const runwaysData = JSON.parse(await system.readFile(`${path}/runway.geojson`)).features;
    nse.runway = runwaysData.map((item: any) => {
      if (!item.properties.uuid) {
        console.error(`No UUID found for runway: ${item.properties.icao}-${item.properties.name}`);
        throw new Error(`Missing UUID for runway: ${item.properties.icao}-${item.properties.name}`);
      }
      return {
        id: item.id,
        name: this.getFeatureName(item),
        oppositeId: item.properties.oppositeId,
        type: item.properties.type,
        icao: item.properties.icao,
        layerUniqueId: item.properties.id,
        uuid: item.properties.uuid,
      };
    });

    // Airways
    const awys = ["lowAirway", "highAirway"];
    for (const awy of awys) {
      const data = JSON.parse(await system.readFile(`${path}/${awy}.geojson`)).features;
      nse[awy] = data.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(`No UUID found for ${awy}: ${item.properties.name}`);
          throw new Error(`Missing UUID for ${awy}: ${item.properties.name}`);
        }
        return {
          id: item.id,
          name: this.getFeatureName(item),
          oppositeId: item.properties.oppositeId,
          type: item.properties.type,
          uuid: item.properties.uuid,
        };
      });
    }

    // labels
    const labelsData = JSON.parse(await system.readFile(`${path}/label.geojson`)).features;
    const tmpLabels: any[] = [];
    for (const feature of labelsData) {
      const index = tmpLabels.findIndex((item) => item.properties.section === feature.properties.section);
      if (index === -1) {
        if (!feature.properties.section?.includes("Gates")) {
          tmpLabels.push(feature);
        }
      }
    }
    nse.label = tmpLabels
      .map((item: any) => {
        if (!item.properties?.section) {
          console.warn("Skipping label with missing section:", item);
          return null;
        }
        if (!item.properties.uuid) {
          console.error(`No UUID found for label: ${item.properties.value || item.properties.section}`);
          throw new Error(`Missing UUID for label: ${item.properties.value || item.properties.section}`);
        }
        return {
          name: this.getFeatureName(item),
          value: item.properties.value || "",
          type: item.properties.type || "default",
          lat: item.geometry.coordinates[1],
          lon: item.geometry.coordinates[0],
          uuid: item.properties.uuid,
        };
      })
      .filter((label): label is NonNullable<typeof label> => label !== null);
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
      if (inPositionSection && line.startsWith("[") && !line.startsWith("[POSITIONS]")) {
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

    await system.writeFile(`${outputPath}/${packageId}/datasets/nse.json`, JSON.stringify(nse));
  }

  private getFeatureName(feature: any): string | null {
    const type = feature.properties.type;

    // Standard name property types
    if (["airport", "fix", "highAirway", "lowAirway", "ndb", "vor"].includes(type)) {
      if (feature.properties.name) {
        return feature.properties.name;
      }
    }

    if (["region"].includes(type)) {
      if (feature.properties.region) {
        return feature.properties.region;
      }
    }

    // Section property types
    if (["artcc-high", "artcc-low", "artcc", "geo", "high-airway", "low-airway", "sid", "star"].includes(type)) {
      if (feature.properties.section) {
        return feature.properties.section;
      }
    }

    // Label specific
    if (type === "label") {
      if (feature.properties.section) {
        return feature.properties.value;
      }

      if (feature.properties.value) {
        return feature.properties.value;
      }
    }

    // Runway specific (combine ICAO and name)
    if (type === "runway") {
      if (feature.properties.icao && feature.properties.name) {
        return `${feature.properties.icao}-${feature.properties.name}`;
      }
    }

    // Default fallback
    if (feature.properties.name) {
      return feature.properties.name;
    }

    return null;
  }

  private getSharedUUID(type: string, name: string): string {
    return `${type}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }

  private addUUIDToFeature(feature: any): void {
    const type = feature.properties.type;
    const featureName = this.getFeatureName(feature);

    if (featureName) {
      // All named features get a consistent ID based on type and name
      feature.properties.uuid = this.getSharedUUID(type, featureName);
      feature.properties._mappedName = featureName;
    } else {
      // Features without names get a fallback ID
      feature.properties.uuid = `${type}-unnamed-${Date.now()}`;
    }
  }

  private generateFeatureMapping(features: any[]): Record<string, any[]> {
    const mapping: Record<string, any[]> = {};
    const seenUUIDs = new Set<string>();

    features.forEach((feature) => {
      const type = feature.properties.type;
      if (!mapping[type]) {
        mapping[type] = [];
      }

      const uuid = feature.properties.uuid;
      const name = feature.properties._mappedName;

      // Only add each UUID once per type
      const key = `${type}-${uuid}`;
      if (!seenUUIDs.has(key)) {
        seenUUIDs.add(key);
        if (name) {
          mapping[type].push({ uuid, name });
        } else {
          mapping[type].push({ uuid });
        }
      }
    });

    return mapping;
  }

  public async generateDataSets(packageId: string, sctData: SCT, eseData: ESE, ignoreTypes: string[], outputPath: string): Promise<string[]> {
    const path = `${outputPath}/${packageId}/datasets`;
    await system.deleteDirectory(path);
    let datasets: string[] = [];

    // Clear UUID map for new generation
    this.uuidMap.clear();
    const geoJsonData = toGeoJson(sctData, eseData, null, "WGS84");
    let features = geoJsonData.features as any[];

    // Add UUIDs to existing features
    features.forEach((feature) => this.addUUIDToFeature(feature));

    // Handle airways with shared UUIDs
    sctData.lowAirway.forEach((airway) => {
      const lines = airway.segments.map((segment): number[][] => {
        const segmentExtract = this.extractSegment(segment);
        return segmentExtract;
      });
      const multiline = multiLineString(lines);
      multiline.properties = {
        type: "lowAirway",
        name: airway.id,
        uuid: this.getSharedUUID("lowAirway", airway.id),
      };
      multiline.properties._mappedName = airway.id;
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
        uuid: this.getSharedUUID("highAirway", airway.id),
      };
      multiline.properties._mappedName = airway.id;
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
        ? [(segment.start as Navaid).position.lonFloat, (segment.start as Navaid).position.latFloat]
        : [(segment.start as Position).lonFloat, (segment.start as Position).latFloat]
    );
    returnSegment.push(
      "position" in segment.end
        ? [(segment.end as Navaid).position.lonFloat, (segment.end as Navaid).position.latFloat]
        : [(segment.end as Position).lonFloat, (segment.end as Position).latFloat]
    );
    return returnSegment;
  }

  private async generateGeoJsonFilesForType(path: string, type: string, allFeatures: any[]): Promise<void> {
    const features = allFeatures;
    const geojson = {
      type: "FeatureCollection",
      features: features,
    };
    const data = JSON.stringify(geojson);
    const formattedType = type.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
    await system.writeFile(`${path}/${formattedType}.geojson`, data);
    return;
  }

  private async loadJsonFromFile(path: string): Promise<any> {
    const data = await system.readFile(path);
    return JSON.parse(data);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const navdata = new NavdataManager();
