import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join, parse, relative } from "path";
import * as turf from "@turf/turf";
import { toMercator } from "@turf/projection";
import { NonNullChain } from "typescript";

interface StpItem {
  showLabel: boolean;
  uuid: string;
  pointType?: string;
}

interface StpFile {
  name: string;
  type: string;
  updatedAt: string;
  map: {
    center: {
      x: number;
      y: number;
    };
    windowArea: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
    zoom: number;
    orientation: number;
    items: StpItem[];
  };
}

class AsrFolderConverter {
  private static layerTypeMapping: { [key: string]: string } = {
    "ARTCC high boundary": "artccHigh",
    "ARTCC low boundary": "artccLow",
    "ARTCC boundary": "artcc",
    Regions: "region",
    "Low airways": "lowAirway",
    "High airways": "highAirway",
    Sids: "sid",
    Stars: "star",
    Geo: "geo",
    Fixes: "fix",
    VORs: "vor",
    NDBs: "ndb",
    Airports: "airport",
    Runways: "runway",
    "Free text": "label",
  };

  private static pointTypes: Set<string> = new Set(["fix", "vor", "ndb", "airport"]);
  private static textOnlyTypes: Set<string> = new Set(["label"]);

  private static createUniqueId(type: string, name: string): string {
    const typeStr = type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const formatted = `${typeStr}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    return formatted.replace(/-+/g, "-").replace(/-$/g, "");
  }

  private static cleanName(name: string): string {
    return name.trim();
  }

  // private static getCenterPoint(bbox: number[]): { x: number; y: number } {
  //   const center = turf.center(turf.featureCollection([turf.bboxPolygon(bbox)]));
  //   const [lon, lat] = center.geometry.coordinates;
  //   console.log(`Center point is: ${lat}, ${lon}`);
  //   const [x, y] = toCartesian([lat, lon]);
  //   console.log(`Center point in cartesian is: ${x}, ${y}`);

  //   return { x, y };
  // }

  private static parseAsrLines(lines: string[]): {
    items: StpItem[];
    centerPoint: { x: number; y: number } | null;
    windowArea: { minX: number; minY: number; maxX: number; maxY: number };
  } {
    let items: StpItem[] = [];
    let centerPoint: { x: number; y: number } | null = null;
    let windowArea = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length < 2) continue;

      const type = parts[0].trim();

      // If a layer line is found, parse it
      const mappedType = this.layerTypeMapping[type];
      if (mappedType) {
        const item = this.parseLayerLine(mappedType, parts);
        if (item) items.push(item);
      }

      // Window area line
      if (type === "WINDOWAREA" && parts.length >= 5) {
        const bounds = parts.slice(1, 5).map((x) => parseFloat(x));
        const [minLat, minLon, maxLat, maxLon] = bounds;

        const point1 = turf.point([minLon, minLat]);
        const point2 = turf.point([maxLon, maxLat]);
        const center = turf.center(turf.featureCollection([point1, point2]));

        const [lon, lat] = center.geometry.coordinates;

        const [minX, minY] = toMercator([minLon, minLat]);
        const [maxX, maxY] = toMercator([maxLon, maxLat]);

        windowArea = { minX, minY, maxX, maxY };

        const [x, y] = toMercator([lon, lat]);

        if (!centerPoint) {
          centerPoint = { x, y };
        }
      }
    }

    return { items, centerPoint, windowArea };
  }

  private static parseLayerLine(type: string, parts: string[]): StpItem | null {
    const name = parts[1].trim();
    if (!name) return null;

    const cleanedName = this.cleanName(name);

    const item: StpItem = {
      showLabel: false,
      uuid: this.createUniqueId(type, cleanedName),
    };

    if (this.pointTypes.has(type)) {
      item.pointType = "icon+text";
    } else if (this.textOnlyTypes.has(type)) {
      item.pointType = "text";
    }

    return item;
  }

  private static convertContent(asrContent: string, filename: string): StpFile {
    const lines = asrContent.split("\n");

    const { items, centerPoint, windowArea } = this.parseAsrLines(lines);

    return {
      name: parse(filename).name,
      type: "profile",
      updatedAt: new Date().toISOString(),
      map: {
        center: centerPoint || { x: 0, y: 0 },
        windowArea,
        zoom: 7,
        orientation: 0,
        items,
      },
    };
  }

  private static ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  private static processFile(filepath: string, inputBasePath: string, outputBasePath: string): void {
    try {
      const content = readFileSync(filepath, "utf8");
      const relativePath = relative(inputBasePath, filepath);
      const parsedPath = parse(relativePath);

      const outputDirPath = join(outputBasePath, parse(relativePath).dir);
      this.ensureDirectoryExists(outputDirPath);

      const outputFilePath = join(outputDirPath, `${parsedPath.name}.stp`);

      const stpData = this.convertContent(content, parsedPath.name);
      writeFileSync(outputFilePath, JSON.stringify(stpData, null, 2));
      console.log(`Converted ${filepath} -> ${outputFilePath}`);
    } catch (error) {
      console.error(`Error processing file ${filepath}:`, error);
    }
  }

  private static processDirectory(dirPath: string, inputBasePath: string, outputBasePath: string): void {
    const items = readdirSync(dirPath);

    for (const item of items) {
      const fullPath = join(dirPath, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        this.processDirectory(fullPath, inputBasePath, outputBasePath);
      } else if (stat.isFile() && item.toLowerCase().endsWith(".asr")) {
        this.processFile(fullPath, inputBasePath, outputBasePath);
      }
    }
  }

  public static convertFolder(inputPath: string, outputPath: string): void {
    if (!existsSync(inputPath)) {
      throw new Error(`Input folder does not exist: ${inputPath}`);
    }

    this.ensureDirectoryExists(outputPath);

    try {
      this.processDirectory(inputPath, inputPath, outputPath);
      console.log("Conversion completed successfully");
    } catch (error) {
      console.error("Error during folder conversion:", error);
      throw error;
    }
  }
}

export default AsrFolderConverter;
