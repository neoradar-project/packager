import debug from "debug";
import { system } from "./system.js";
import { ESE, Position, SCT, toGeoJson } from "sector-file-tools";
import { multiLineString } from "@turf/turf";
import { Navaid, Segment } from "sector-file-tools/dist/src/sct.js";
import { NseNavaid, Sector } from "../models/nse.js";
import { EseDataset, SectorLine } from "../models/fromZod.js";
import { convertColorFeaturePropertyToGeojsonProperties } from "../libs/style-helper.js";
import { EseHelper } from "../libs/ese-helper.js";
import { toWgs84 } from "@turf/projection";
const log = debug("NavdataManager");
class NavdataManager {
  private uuidMap = new Map<string, string>();

  constructor() {
    this.init();
  }

  private init() {
    log("Init");
  }

  public async generateNavdata(
    packageId: string,
    namespace: string,
    eseFilePath: string,
    outputPath: string,
    isGNG: boolean = false
  ): Promise<void> {
    log("generateNavdata");
    const path = `${outputPath}/${packageId}-package/${packageId}/datasets`;

    const nse: EseDataset = {
      sectorLines: [],
      sectors: [],
      position: [],
      procedure: [],
      mapItemsIndex: {},
    };
    const allNavaids: NseNavaid[] = [];

    // Clear UUID map for new generation
    this.uuidMap.clear();

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
    nse.mapItemsIndex["region"] = tmpRegions.map((key) => {
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
    if (system.fileExistsSync(`${path}/geo.geojson`)) {
      const geoData = JSON.parse(
        await system.readFile(`${path}/geo.geojson`)
      ).features;
      const tmpGeo: string[] = [];
      for (const feature of geoData) {
        if (tmpGeo.indexOf(feature.properties.section) === -1) {
          tmpGeo.push(feature.properties.section);
        }
      }
      nse.mapItemsIndex["geo"] = tmpGeo.map((key) => {
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
    }

    // sids
    if (system.fileExistsSync(`${path}/sid.geojson`)) {
      const sidsData = JSON.parse(
        await system.readFile(`${path}/sid.geojson`)
      ).features;
      const tmpSids: string[] = [];
      for (const feature of sidsData) {
        const name = this.getFeatureName(feature);
        if (name && tmpSids.indexOf(name) === -1) {
          tmpSids.push(name);
        }
      }
      nse.mapItemsIndex["sid"] = tmpSids.map((key) => {
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
    }

    // stars
    if (system.fileExistsSync(`${path}/star.geojson`)) {
      const starsData = JSON.parse(
        await system.readFile(`${path}/star.geojson`)
      ).features;
      const tmpStars: string[] = [];
      for (const feature of starsData) {
        const name = this.getFeatureName(feature);
        if (name && tmpStars.indexOf(name) === -1) {
          tmpStars.push(name);
        }
      }
      nse.mapItemsIndex["star"] = tmpStars.map((key) => {
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
    }

    // artcc-low
    if (system.fileExistsSync(`${path}/artccLow.geojson`)) {
      const artccLowData = JSON.parse(
        await system.readFile(`${path}/artccLow.geojson`)
      ).features;
      const tmpArtccLow: string[] = [];
      for (const feature of artccLowData) {
        const name = this.getFeatureName(feature);
        if (name && tmpArtccLow.indexOf(name) === -1) {
          tmpArtccLow.push(name);
        }
      }
      nse.mapItemsIndex["artccLow"] = tmpArtccLow.map((key) => {
        const feature = artccLowData.find(
          (f) => this.getFeatureName(f) === key
        );
        if (!feature?.properties.uuid) {
          console.error(`No UUID found for ARTCC Low: ${key}`);
          throw new Error(`Missing UUID for ARTCC Low: ${key}`);
        }
        return {
          name: key,
          uuid: feature.properties.uuid,
        };
      });
    }

    // artcc-high
    if (system.fileExistsSync(`${path}/artccHigh.geojson`)) {
      const artccHighData = JSON.parse(
        await system.readFile(`${path}/artccHigh.geojson`)
      ).features;
      const tmpArtccHigh: string[] = [];
      for (const feature of artccHighData) {
        const name = this.getFeatureName(feature);
        if (name && tmpArtccHigh.indexOf(name) === -1) {
          tmpArtccHigh.push(name);
        }
      }
      nse.mapItemsIndex["artccHigh"] = tmpArtccHigh.map((key) => {
        const feature = artccHighData.find(
          (f) => this.getFeatureName(f) === key
        );
        if (!feature?.properties.uuid) {
          console.error(`No UUID found for ARTCC High: ${key}`);
          throw new Error(`Missing UUID for ARTCC High: ${key}`);
        }
        return {
          name: key,
          uuid: feature.properties.uuid,
        };
      });
    }

    // artcc
    if (system.fileExistsSync(`${path}/artcc.geojson`)) {
      const artccData = JSON.parse(
        await system.readFile(`${path}/artcc.geojson`)
      ).features;
      const tmpArtcc: string[] = [];
      for (const feature of artccData) {
        const name = this.getFeatureName(feature);
        if (name && tmpArtcc.indexOf(name) === -1) {
          tmpArtcc.push(name);
        }
      }
      nse.mapItemsIndex["artcc"] = tmpArtcc.map((key) => {
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
    }

    // navaids
    const navaidsTypeList = ["vor", "ndb", "fix", "airport"];
    for (const type of navaidsTypeList) {
      if (!system.fileExistsSync(`${path}/${type}.geojson`)) {
        continue;
      }
      const typeData = JSON.parse(
        await system.readFile(`${path}/${type}.geojson`)
      ).features;
      nse[type] = typeData.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(`No UUID found for ${type}: ${item.properties.name}`);
          throw new Error(`Missing UUID for ${type}: ${item.properties.name}`);
        }
        const latLon = toWgs84([
          item.geometry.coordinates[0],
          item.geometry.coordinates[1],
        ]);
        return {
          name: this.getFeatureName(item),
          freq: item.properties.freq,
          type: item.properties.type,
          x: item.geometry.coordinates[1],
          y: item.geometry.coordinates[0],
          lat: latLon[1],
          lon: latLon[0],
          uuid: item.properties.uuid,
        };
      });

      nse.mapItemsIndex[type] = typeData.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(`No UUID found for ${type}: ${item.properties.name}`);
          throw new Error(`Missing UUID for ${type}: ${item.properties.name}`);
        }
        return {
          name: this.getFeatureName(item),
          type: item.properties.type,
          uuid: item.properties.uuid,
        };
      });
      allNavaids.push(...nse[type]);
    }

    // runways
    if (system.fileExistsSync(`${path}/runway.geojson`)) {
      const runwaysData = JSON.parse(
        await system.readFile(`${path}/runway.geojson`)
      ).features;
      nse.mapItemsIndex["runway"] = runwaysData.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(
            `No UUID found for runway: ${item.properties.icao}-${item.properties.name}`
          );
          throw new Error(
            `Missing UUID for runway: ${item.properties.icao}-${item.properties.name}`
          );
        }
        return {
          name: this.getFeatureName(item),
          type: item.properties.type,
          uuid: item.properties.uuid,
        };
      });

      nse.runways = runwaysData.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(
            `No UUID found for runway: ${item.properties.icao}-${item.properties.name}`
          );
          throw new Error(
            `Missing UUID for runway: ${item.properties.icao}-${item.properties.name}`
          );
        }
        return {
          id: item.id,
          name: this.getFeatureName(item),
          oppositeId: item.properties.oppositeId,
          type: item.properties.type,
          icao: item.properties.icao,
          uuid: item.properties.uuid,
        };
      });
    }

    // Airways
    const awys = ["lowAirway", "highAirway"];
    for (const awy of awys) {
      if (!system.fileExistsSync(`${path}/${awy}.geojson`)) {
        continue;
      }
      const data = JSON.parse(
        await system.readFile(`${path}/${awy}.geojson`)
      ).features;
      nse.mapItemsIndex[awy] = data.map((item: any) => {
        if (!item.properties.uuid) {
          console.error(`No UUID found for ${awy}: ${item.properties.name}`);
          throw new Error(`Missing UUID for ${awy}: ${item.properties.name}`);
        }
        return {
          name: item.properties.uuid, // TODO get the actual name
          type: item.properties.type,
          uuid: item.properties.uuid,
        };
      });
    }

    // labels
    if (system.fileExistsSync(`${path}/label.geojson`)) {
      const labelsData = JSON.parse(
        await system.readFile(`${path}/label.geojson`)
      ).features;
      const tmpLabels: any[] = [];
      for (const feature of labelsData) {
        const index = tmpLabels.findIndex(
          (item) => item.properties.section === feature.properties.section
        );
        if (index === -1) {
          // if (!feature.properties.section?.includes("Gates")) {
          tmpLabels.push(feature);
          // }
        }
      }
      nse.mapItemsIndex["label"] = tmpLabels
        .map((item: any) => {
          if (!item.properties?.section) {
            console.warn("Skipping label with missing section:", item);
            return null;
          }
          if (!item.properties.uuid) {
            console.error(
              `No UUID found for label: ${
                item.properties.value || item.properties.section
              }`
            );
            throw new Error(
              `Missing UUID for label: ${
                item.properties.value || item.properties.section
              }`
            );
          }
          const featureName = this.getFeatureName(item);
          if (!featureName) {
            return;
          }

          return {
            name: featureName,
            uuid: item.properties.uuid,
          };
        })
        .filter((label): label is NonNullable<typeof label> => label !== null);
    }
    // await system.deleteFile(`${path}/label.geojson`);

    const eseProcessedData = await EseHelper.parseEseContent(
      eseFilePath,
      allNavaids,
      isGNG
    );
    nse.position = eseProcessedData.position;
    nse.procedure = eseProcessedData.procedure;
    nse.sectors = eseProcessedData.sectors;
    nse.sectorLines = eseProcessedData.sectorLines;

    await system.writeFile(
      `${outputPath}/${packageId}-package/${packageId}/datasets/nse.json`,
      JSON.stringify(nse)
    );
  }

  private getFeatureName(feature: any): string | null {
    const type = feature.properties.type;

    // Standard name property types
    if (
      ["airport", "fix", "highAirway", "lowAirway", "ndb", "vor"].includes(type)
    ) {
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
    if (
      [
        "artcc-high",
        "artcc-low",
        "artcc",
        "geo",
        "high-airway",
        "low-airway",
        "sid",
        "star",
      ].includes(type)
    ) {
      if (feature.properties.section) {
        return feature.properties.section;
      }
    }

    // Label specific
    if (type === "label") {
      if (feature.properties.section) {
        return feature.properties.section;
      }

      if (feature.properties.value) {
        return feature.properties.value;
      }
    }

    // Runway specific (combine ICAO and name)
    if (type === "runway") {
      if (feature.properties.icao && feature.properties.name) {
        return `${feature.properties.icao}-${feature.properties.name}-${feature.properties.oppositeId}`;
      }
    }

    // Default fallback
    if (feature.properties.name) {
      return feature.properties.name;
    }

    return null;
  }

  private getSharedUUID(type: string, name: string): string {
    const formatted = `${type}-${name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    return formatted
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .replace(/-$/g, ""); // Remove trailing dash
  }

  private addUUIDToFeature(feature: any): void {
    if (!feature.properties?.type) {
      console.warn("Feature without type:", feature);
      return;
    }
    const type = feature.properties.type;
    const featureName = this.getFeatureName(feature);

    if (featureName) {
      // All named features get a consistent ID based on type and name
      feature.properties.uuid = this.getSharedUUID(type, featureName);
    } else {
      // Features without names get a fallback ID
      feature.properties.uuid = `${type}-unnamed-${Date.now()}`;
    }
  }

  public async generateDataSets(
    packageId: string,
    sctData: SCT,
    eseData: ESE,
    ignoreTypes: string[],
    outputPath: string,
    useSctLabels: boolean = true
  ): Promise<string[]> {
    const path = `${outputPath}/${packageId}-package/${packageId}/datasets`;
    await system.deleteDirectory(path);
    let datasets: string[] = [];

    // Clear UUID map for new generation
    this.uuidMap.clear();
    const geoJsonData = toGeoJson(sctData, eseData, null);
    let features = geoJsonData.features as GeoJSON.Feature[];

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
        uuid: this.getSharedUUID("lowAirway", airway.id),
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
        uuid: this.getSharedUUID("highAirway", airway.id),
      };
      features.push(multiline);
    });

    const allTypes: string[] = [];
    features.forEach((f) => {
      if (!allTypes.includes(f.properties?.type) && f.properties?.type) {
        allTypes.push(f.properties.type);
      }

      if (f.properties?.color) {
        f.properties = convertColorFeaturePropertyToGeojsonProperties(
          f,
          (f.properties?.type ?? "") === "region"
        ).properties;
      }
    });

    if (allTypes.length > 1) {
      datasets = allTypes.filter((t) => !ignoreTypes.includes(t));
      datasets.forEach(async (t) => {
        await this.generateGeoJsonFilesForType(
          path,
          t,
          features.filter((f) => f.properties?.type === t)
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
    const formattedType = type.replace(/-([a-z])/g, (match, letter) =>
      letter.toUpperCase()
    );
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
