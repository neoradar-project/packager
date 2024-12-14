import debug from "debug";
import { LayerSpecification } from "maplibre-gl";
import { parseEse, parseSct } from "sector-file-tools";
import { atcData } from "./atc-data.js";
import { layerManager } from "./layers.js";
import { navdata } from "./navdata.js";
import { system } from "./system.js";
import { tilesManager } from "./tiles-manager.js";
import { MapLayer } from "../models/inputManifest.model.js";
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
    outputPath: string
  ): Promise<void> {
    this.outputPath = outputPath;
    await system.createDirectory(this.outputPath).then(() => log("outputPath created"));
    log("build", sctFilePath);

    const sctData = parseSct(await system.readFile(sctFilePath));
    const eseData = parseEse(await system.readFile(eseFilePath));

    log("generatePackage", namespace, name);
    const packagePath = `${this.outputPath}/${id}`;
    // clean
    await system.deleteDirectory(packagePath);
    // create
    await system.createDirectory(packagePath);

    // const sources: any[] = [];
    // copy fonts
    // const fonts = await system.listFiles(`${this.commonPath}/fonts`);
    // await system.createDirectory(`${packagePath}/fonts`);
    // for (const font of fonts) {
    //   await system.copyFile(
    //     `${this.commonPath}/fonts/${font}`,
    //     `${packagePath}/fonts/${font}`
    //   );
    // }

    // // copy images
    // const images = await system.listFiles(`${this.commonPath}/images`);
    // await system.createDirectory(`${this.outputPath}/${id}/images`);
    // for (const image of images) {
    //   await system.copyFile(
    //     `${this.commonPath}/images/${image}`,
    //     `${packagePath}/images/${image}`
    //   );
    // }

    // copy base sources
    // const baseSources = await system.listFiles(`${this.commonPath}/sources`);
    // for (const baseSource of baseSources) {
    //   const baseSourcePath = `${this.commonPath}/sources/${baseSource}`;
    //   const maxZoom = await tilesManager.getTilesMaxZoom(baseSourcePath);
    //   sources.push({
    //     id: baseSource.replace(".mbtiles", ""),
    //     maxZoom: maxZoom,
    //   });
    //   await system.copyFile(
    //     baseSourcePath,
    //     `${packagePath}/tiles/${baseSource}`
    //   );
    // }

    // Package datasets
    const datasets = await navdata.generateDataSets(id, sctData, eseData, ["sid", "star"], outputPath);

    log("datasets", datasets);

    await sleep(1000);

    const packageTilesDirectory = `${this.outputPath}/${id}/tiles`;
    // main namespace tiles
    const path = `${this.outputPath}/${id}/datasets`;
    const regionSource = namespace + "-region";

    // const mainZoom = await tilesManager.generateMBTilesFrom(
    //   namespace,
    //   packageTilesDirectory,
    //   datasets.filter((d) => d !== "region").map((d) => `${path}/${d}.geojson`)
    // );
    // sources.push({
    //   id: namespace,
    //   maxZoom: mainZoom,
    // });

    // const regionPath = `${this.outputPath}/${id}/datasets/region.geojson`;
    // const regionZoom = await tilesManager.generateMBTilesFrom(
    //   regionSource,
    //   packageTilesDirectory,
    //   [regionPath],
    //   16
    // );

    // Package global ATC Data

    await atcData.generateAtcdata(id, loginProfilesPath, icaoAircraftPath, icaoAirlinesPath, recatDefinitionPath, aliasPath, outputPath);

    const uuidMappings: UUIDMapping = JSON.parse(await system.readFile(`${outputPath}/${id}/datasets/uuid-mapping.json`));
    // Generating layers specs

    // const packageLayers = datasets
    //   .filter(
    //     (d) =>
    //       d !== "region" &&
    //       d !== "artcc" &&
    //       d !== "artcc-high" &&
    //       d !== "artcc-low" &&
    //       d !== "low-airway" &&
    //       d !== "high-airway"
    //   )
    //   .map((d) => layerManager.generateLayerConfigFor(d, namespace))
    //   .filter((l) => l !== null);
    // const regionLayer = layerManager.generateLayerConfigFor(
    //   "region",
    //   regionSource
    // );
    // const allLayers = baseLayers.concat(regionLayer).concat(packageLayers);

    const mapLayers: MapLayer[] = [
      {
        name: "region",
        type: "geojson",
        source: "region",
        features: uuidMappings["region"] || [],
      },
      {
        name: "artcc",
        type: "geojson",
        source: "artcc",
        features: uuidMappings["artcc"] || [],
      },
      {
        name: "artcc-high",
        type: "geojson",
        source: "artcc-high",
        features: uuidMappings["artcc-high"] || [],
      },
      {
        name: "artcc-low",
        type: "geojson",
        source: "artcc-low",
        features: uuidMappings["artcc-low"] || [],
      },
      {
        name: "lowAirway",
        type: "geojson",
        source: "lowAirway",
        features: uuidMappings["lowAirway"] || [],
      },
      {
        name: "highAirway",
        type: "geojson",
        source: "highAirway",
        features: uuidMappings["highAirway"] || [],
      },
      {
        name: "sid",
        type: "geojson",
        source: "sid",
        features: uuidMappings["sid"] || [],
      },
      {
        name: "star",
        type: "geojson",
        source: "star",
        features: uuidMappings["star"] || [],
      },
      {
        name: "geo",
        type: "geojson",
        source: "geo",
        features: uuidMappings["geo"] || [],
      },
      {
        name: "fix",
        type: "geojson",
        source: "fix",
        pointType: "icon+text",
        features: uuidMappings["fix"] || [],
      },
      {
        name: "vor",
        type: "geojson",
        source: "vor",
        pointType: "icon+text",
        features: uuidMappings["vor"] || [],
      },
      {
        name: "ndb",
        type: "geojson",
        source: "ndb",
        pointType: "icon+text",
        features: uuidMappings["ndb"] || [],
      },
      {
        name: "airport",
        type: "geojson",
        source: "airport",
        pointType: "icon+text",
        features: uuidMappings["airport"] || [],
      },
      {
        name: "runway",
        type: "geojson",
        source: "runway",
        features: uuidMappings["runway"] || [],
      },
      {
        name: "label",
        type: "geojson",
        source: "label",
        pointType: "text",
        features: uuidMappings["label"] || [],
      },
    ];

    // Generating computable navdata
    await navdata.generateNavdata(id, namespace, eseFilePath, outputPath);

    // generate manifest
    const manifest = {
      id: id,
      name: name,
      description: description,
      namespace: namespace,
      createdAt: new Date().toISOString(),
      datasets: datasets,
      mapLayers: mapLayers,
      uuidMappings: uuidMappings,
    };
    await system.writeFile(`${packagePath}/manifest.json`, JSON.stringify(manifest));
  }

  /*private async generateRegionsLayouts(packageId: string, fromDataset: string, sourceName: string): Promise<{ sourceName: string, maxZoom: number, layers: string[] }> {
        const regionDataSetPath = `${this.packagesPath}/${packageId}/datasets/${fromDataset}.geojson`
        const data = JSON.parse(await system.readFile(regionDataSetPath))
        
        const airportsIcao: any = {}
        const regions: any[] = []
        
        for (const feature of data.features) {
            if (feature.properties.region.includes('AVISO')) {
                const icao = feature.properties.region.split(' ')[0]
                if (!airportsIcao[icao]) {
                    airportsIcao[icao] = []
                }
                airportsIcao[icao].push(feature)
            }
            else {
                regions.push(feature)
            }
        }

        const icaoList = Object.keys(airportsIcao)
        for (const icao of icaoList) {
            const airportDataSetPath = `${this.packagesPath}/${packageId}/datasets/${sourceName}/${icao}.geojson`
            await system.writeFile(airportDataSetPath, JSON.stringify({
                type: 'FeatureCollection',
                features: airportsIcao[icao]
            }))
        }


        const airportDataSetPaths = (await system.listFiles(`${this.packagesPath}/${packageId}/datasets/${sourceName}`)).map(f => `${this.packagesPath}/${packageId}/datasets/${sourceName}/${f}`)
        const maxZoom = await tilesManager.generateMBTilesFrom(sourceName, `${this.packagesPath}/${packageId}/tiles`, airportDataSetPaths, 18)
        return { sourceName: sourceName, maxZoom: maxZoom, layers: icaoList }
    }*/
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const packageBuilder = new PackageBuilder();
