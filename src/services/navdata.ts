import debug from "debug";
import { system } from "./system.js";
import { Gate } from "../models/gate.js";
import { PackageAtcPosition } from "../models/position.js";
import { Procedure } from "../models/procedure.js";
import { geoHelper } from "../libs/geo-helper.js";
import { ESE, Position, SCT, toGeoJson } from "sector-file-tools";
import { multiLineString } from "@turf/turf";
import { Segment, Navaid } from "sector-file-tools/dist/src/sct.js";

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

    let inAirspaceSection = false;

    let currentSectorLine: any;
    let currentSector: any;
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
          currentSectorLine = {
            id: id,
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
            lat: geo?.lat,
            lon: geo?.lon,
          });
        }
        if (line.startsWith("DISPLAY:")) {
          const parts = line.split(":");
          const displayData = parts[1];
          const dsp = {
            fir: "EIXX",
            name: displayData,
            floor: Number(displayData[2].replace("\r", "")),
            ceiling: Number(displayData[3].replace("\r", "")),
          };
          currentSectorLine.display.push(dsp);
        }

        // Sectors

        if (line.startsWith("SECTOR:")) {
          const parts = line.split(":");
          currentSector = {
            layerUniqueId: sectorCounter++,
            name: parts[1],
            fir: "EIXX",
            floor: Number(parts[2].replace("\r", "")),
            ceiling: Number(parts[3].replace("\r", "")),
            actives: [],
          };
          sectors.push(currentSector);
        }
        if (line.startsWith("OWNER:")) {
          const parts = line.replace("OWNER:", "").split(":");
          currentSector.owners = parts.map((item) => item.replace("\r", ""));
        }
        if (line.startsWith("BORDER:")) {
          const parts = line.replace("BORDER:", "").split(":");
          currentSector.borders = parts.map((item) =>
            Number(item.replace("\r", ""))
          );
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
      }

      if (line.startsWith("[RADAR]")) {
        break;
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

    let navdata: any = {};
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
    navdata.region = tmpRegions.map((key) => {
      return {
        name: key,
        sourceId: namespace + "-region",
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
    navdata.geo = tmpGeo.map((key) => {
      return {
        name: key,
        sourceId: namespace,
      };
    });
    await system.deleteFile(`${path}/geo.geojson`);

    // navaids
    const typeList = ["vor", "ndb", "fix", "airport"];
    for (const type of typeList) {
      const typeData = JSON.parse(
        await system.readFile(`${path}/${type}.geojson`)
      ).features;
      navdata[type] = typeData.map((item: any) => {
        return {
          name: item.properties.name,
          freq: item.properties.freq,
          type: item.properties.type,
          lat: item.geometry.coordinates[1],
          lon: item.geometry.coordinates[0],
          layerUniqueId: item.properties.id,
          sourceId: namespace,
        };
      });
      allNavaids.push(...navdata[type]);
      await system.deleteFile(`${path}/${type}.geojson`);
    }

    // runways
    const runwaysData = JSON.parse(
      await system.readFile(`${path}/runway.geojson`)
    ).features;
    navdata.runway = runwaysData.map((item: any) => {
      return {
        id: item.id,
        name: item.properties.name,
        oppositeId: item.properties.oppositeId,
        type: item.properties.type,
        icao: item.properties.icao,
        layerUniqueId: item.properties.id,
        sourceId: namespace,
      };
    });
    await system.deleteFile(`${path}/runway.geojson`);

    // Airways

    const awys = ["lowAirway", "highAirway"];
    for (const awy of awys) {
      const data = JSON.parse(
        await system.readFile(`${path}/${awy}.geojson`)
      ).features;
      navdata[awy] = data.map((item: any) => {
        return {
          id: item.id,
          name: item.properties.name,
          oppositeId: item.properties.oppositeId,
          type: item.properties.type,
          sourceId: namespace,
        };
      });
      await system.deleteFile(`${path}/${awy}.geojson`);
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
    navdata.label = tmpLabels.map((item: any) => {
      return {
        name: item.properties.section,
        value: item.properties.value,
        type: item.properties.type,
        sourceId: namespace,
        lat: item.geometry.coordinates[1],
        lon: item.geometry.coordinates[0],
      };
    });
    await system.deleteFile(`${path}/label.geojson`);

    const eseData = await system.readFile(eseFilePath);
    const lines = eseData.toString().split("\n");

    navdata.gate = [];
    navdata.position = [];
    navdata.procedure = [];

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
      if (inPositionSection && (line.startsWith(";=") || line.length < 5)) {
        inPositionSection = false;
        continue;
      }
      if (inPositionSection) {
        const position = PackageAtcPosition.init(line);
        if (!position) continue;
        position.layerUniqueId = positionCounter++;
        navdata.position.push(position.toJsonObject());
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
        gate.sourceId = namespace;
        navdata.gate.push(gate.toJsonObject());
      }

      if (data[0].includes("STAR") || data[0].includes("SID")) {
        const proc = Procedure.init(line, allNavaids);
        if (!proc) continue;
        proc.layerUniqueId = procedureCounter++;
        navdata.procedure.push(proc.toJsonObject());
      }
    }

    const sectorData = await this.parseSectorLines(eseFilePath);
    navdata.sectors = sectorData.sectors;
    navdata.sectorLines = sectorData.sectorLines;

    await system.writeFile(
      `${outputPath}/${packageId}/datasets/navdata.json`,
      JSON.stringify(navdata)
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

    sctData.lowAirway.forEach(async (airway) => {
      const lines = airway.segments.map((segment): number[][] => {
        const segmentExtract = this.extractSegment(segment);
        return segmentExtract;
      });
      const multiline = multiLineString(lines);
      multiline.properties = {
        id: null,
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
        id: null,
        type: "highAirway",
        name: airway.id,
      };
      features.push(multiline);
    });

    for (const feature of features) {
      if (feature.properties.color) {
        let color = `rgba(${feature.properties.color.join(",")},1)`;
        if (color === "rgba(29,43,43,1)") {
          color = "rgba(0,0,0,0)";
        }
        feature.properties.color = color;
      }
    }

    // remove unwanted features
    features = features.filter((f) => {
      if (f.properties.type === "geo") {
        // removing packaged coastlines
        if (f.properties.section.toLowerCase().includes("coastline")) {
          return false;
        }
        if (
          f.properties.section.toLowerCase().includes("political boundaries")
        ) {
          return false;
        }
        if (f.properties.section.toLowerCase().includes("landmark")) {
          return false;
        }

        return true;
      }
      return true;
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
    console.log(datasets);
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

