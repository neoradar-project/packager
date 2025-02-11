import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join, parse, relative } from "path";

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
    zoom: number;
    orientation: number;
    items: StpItem[];
  };
}

class AsrFolderConverter {
  private static typeMapping: { [key: string]: string } = {
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

  private static parseAsrLine(line: string): StpItem | null {
    const parts = line.split(":");
    if (parts.length < 2) return null;

    const type = parts[0].trim();
    const mappedType = this.typeMapping[type];
    if (!mappedType) return null;

    // Take the second element as the name, ignoring any additional colons
    const name = parts[1].trim();
    if (!name) return null;

    const cleanedName = this.cleanName(name);

    const item: StpItem = {
      showLabel: false,
      uuid: this.createUniqueId(mappedType, cleanedName),
    };

    if (this.pointTypes.has(mappedType)) {
      item.pointType = "icon+text";
    } else if (this.textOnlyTypes.has(mappedType)) {
      item.pointType = "text";
    }

    return item;
  }

  private static convertContent(asrContent: string, filename: string): StpFile {
    const lines = asrContent.split("\n");
    const items: StpItem[] = [];

    for (const line of lines) {
      const item = this.parseAsrLine(line.trim());
      if (item) {
        items.push(item);
      }
    }

    return {
      name: parse(filename).name,
      type: "profile",
      updatedAt: new Date().toISOString(),
      map: {
        center: {
          x: 847183.3480445864,
          y: -6195983.977450224,
        },
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
