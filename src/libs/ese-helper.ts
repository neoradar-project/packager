import { NseNavaid, Sector } from "../models/nse";
import { EseDataset, SectorLine } from "../models/fromZod.js";
import { PackageAtcPosition } from "../models/position";
import { Procedure } from "../models/procedure";
import { system } from "../services/system";
import { geoHelper } from "./geo-helper";
import * as turf from "@turf/turf";
import { toMercator, toWgs84 } from "@turf/projection";

interface ParsedEseContent {
  position: any[];
  procedure: any[];
  sectors: Sector[];
  sectorLines: SectorLine[];
}

interface SectorHandlerContext {
  currentSector: Sector;
  currentSectorLine: SectorLine;
  sectorCounter: number;
  baseMatrixInt: number;
  numericIDReplacementMatrix: Record<string, number>;
  processingNewSector: boolean;
}

export class EseHelper {
  private static isGNG: boolean = false;
  private static createEmptySector(): Sector {
    return {
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
  }

  private static createEmptySectorLine(): SectorLine {
    return {
      id: 0,
      points: [],
      display: [],
    };
  }

  static async parseEseContent(eseFilePath: string, allNavaids: NseNavaid[], isGNG: boolean = false): Promise<ParsedEseContent> {
    const eseData = await system.readFile(eseFilePath);
    const lines = eseData.toString().split("\n");
    this.isGNG = isGNG;
    const result: ParsedEseContent = {
      position: [],
      procedure: [],
      sectors: [],
      sectorLines: [],
    };

    const counters = {
      position: 10000,
      procedure: 30000,
      sector: 99000,
    };

    const context: SectorHandlerContext = {
      currentSector: this.createEmptySector(),
      currentSectorLine: this.createEmptySectorLine(),
      sectorCounter: counters.sector,
      baseMatrixInt: 690,
      numericIDReplacementMatrix: {},
      processingNewSector: false,
    };

    const lineHandlers = this.createLineHandlers(result, counters, context, allNavaids);
    let currentSection = "";

    for (let line of lines) {
      line = this.cleanLine(line);
      if (!this.isValidLine(line)) continue;

      if (this.isSectionHeader(line)) {
        // Check if we're moving to a new section and we have an incomplete sector
        if (currentSection === "AIRSPACE" && context.processingNewSector) {
          this.validateAndFinalizeSector(result, context);
        }

        currentSection = this.extractSectionName(line);
        continue;
      }

      const handler = lineHandlers[currentSection] || lineHandlers["DEFAULT"];
      handler(line);
    }

    // Check the last sector at the end of the file
    if (context.processingNewSector) {
      this.validateAndFinalizeSector(result, context);
    }

    return result;
  }

  private static validateAndFinalizeSector(result: ParsedEseContent, context: SectorHandlerContext): void {
    // If the sector has no borders, remove it from the result
    if (context.currentSector.borders.length === 0) {
      // Find the index of the current sector in the result sectors array
      const sectorIndex = result.sectors.findIndex((s) => s.name === context.currentSector.name);
      if (sectorIndex !== -1) {
        // Remove the sector from the array
        console.warn(`Warning: Sector ${context.currentSector.name} is being added with no borders`);
      }
    }

    context.processingNewSector = false;
  }

  private static cleanLine(line: string): string {
    return line.replaceAll("�", "").replaceAll("\r", "").trim();
  }

  private static isValidLine(line: string): boolean {
    return Boolean(line && !line.startsWith(";="));
  }

  private static isSectionHeader(line: string): boolean {
    return line.startsWith("[") && line.endsWith("]");
  }

  private static extractSectionName(line: string): string {
    return line.replace("[", "").replace("]", "");
  }

  private static createLineHandlers(
    result: ParsedEseContent,
    counters: Record<string, number>,
    context: SectorHandlerContext,
    allNavaids: NseNavaid[]
  ): Record<string, (line: string) => void> {
    return {
      POSITIONS: (line: string) => {
        this.handlePosition(line, result, counters);
      },
      AIRSPACE: (line: string) => {
        this.handleAirspace(line, result, context, allNavaids);
      },
      DEFAULT: (line: string) => {
        this.handleDefault(line, result, counters, allNavaids);
      },
    };
  }

  private static handlePosition(line: string, result: ParsedEseContent, counters: Record<string, number>): void {
    if (line.startsWith(";") || !line.trim()) return;

    const position = PackageAtcPosition.init(line, this.isGNG);
    if (!position) return;

    result.position.push(position.toJsonObject());
  }

  private static handleDefault(line: string, result: ParsedEseContent, counters: Record<string, number>, allNavaids: NseNavaid[]): void {
    const data = line.split(":");
    if (data.length < 3) return;

    if (this.isProcedure(data[0])) {
      this.handleProcedure(line, result, counters, allNavaids);
    }
  }

  private static isProcedure(value: string): boolean {
    return value.includes("STAR") || value.includes("SID");
  }

  private static handleProcedure(line: string, result: ParsedEseContent, counters: Record<string, number>, allNavaids: NseNavaid[]): void {
    const proc = Procedure.init(line, allNavaids);
    if (!proc) return;

    result.procedure.push(proc.toJsonObject());
  }

  private static handleAirspace(line: string, result: ParsedEseContent, context: SectorHandlerContext, allNavaids: NseNavaid[]): void {
    if (line.startsWith("SECTORLINE:") || line.startsWith("CIRCLE_SECTORLINE:")) {
      this.handleSectorLine(line, result, context, allNavaids);
    } else if (line.startsWith("COORD:")) {
      this.handleCoord(line, context);
    } else if (line.startsWith("SECTOR:")) {
      // If we encounter a new SECTOR: line and we're still processing a previous sector,
      // validate and finalize the previous sector before starting a new one
      if (context.processingNewSector) {
        this.validateAndFinalizeSector(result, context);
      }
      this.handleNewSector(line, result, context);
    } else if (line.startsWith("OWNER:")) {
      this.handleOwner(line, context);
    } else if (line.startsWith("BORDER:")) {
      this.handleBorder(line, context);
    } else if (line.startsWith("DEPAPT:")) {
      this.handleDepApt(line, context);
    } else if (line.startsWith("ARRAPT:")) {
      this.handleArrApt(line, context);
    } else if (line.startsWith("ACTIVE:")) {
      this.handleActive(line, context);
    } else if (line.startsWith("DISPLAY_SECTORLINE:")) {
      this.handleDisplaySectorLine(line, context);
    }
  }

  private static handleSectorLine(line: string, result: ParsedEseContent, context: SectorHandlerContext, allNavaids: NseNavaid[]): void {
    const id = line.split(":")[1];
    const isnum = /^\d+$/.test(id);

    if (!isnum) {
      context.numericIDReplacementMatrix[id] = context.baseMatrixInt++;
      // console.log(`Replacement matrix for non numeric sector ID ${id} is ${context.numericIDReplacementMatrix[id]}`);
    }
    context.currentSectorLine = {
      id: isnum ? Number(id) : context.numericIDReplacementMatrix[id],
      points: [],
      display: [],
    };

    result.sectorLines.push(context.currentSectorLine);

    if (line.startsWith("CIRCLE_SECTORLINE:")) {
      this.handleCircleSectorLine(line, context, allNavaids);
    }
  }

  private static handleCircleSectorLine(line: string, context: SectorHandlerContext, allNavaids: NseNavaid[]): void {
    const parts = line.split(":");
    const geo = this.getCircleCenter(parts, allNavaids);

    if (!this.isValidGeoCoord(geo)) return;

    try {
      const radius = Number(parts[parts.length === 5 ? 4 : 3]);
      if (isNaN(radius) || !geo) return;

      const circle = turf.circle(turf.point([geo.lon, geo.lat]), radius, {
        steps: 10,
        units: "nauticalmiles",
      });
      const circlePoints = circle.geometry.coordinates[0].map((coord: number[]) => {
        const cartesian = toMercator([coord[1], coord[0]]);
        if (!cartesian[0] || !cartesian[1]) {
          console.log("Invalid circle point:", { line, geo, coord, cartesian });
        }
        return cartesian;
      });
      context.currentSectorLine.points = circlePoints;
    } catch (error) {
      console.error("Circle creation failed:", { error, geo });
    }
  }

  private static getCircleCenter(parts: string[], navaids: NseNavaid[]): { lat: number; lon: number } | null {
    if (parts.length === 5) {
      const coords = geoHelper.convertESEGeoCoordinates(parts[2], parts[3]);

      if (coords && (!coords.lat || !coords.lon)) {
        console.log("Invalid circle center:", coords);
      }

      return coords ? { lat: Number(coords.lat), lon: Number(coords.lon) } : null;
    }

    const navaid = navaids.find((n) => n.name === parts[2].trim());

    if (!navaid || !navaid.lat || !navaid.lon) {
      return null;
    }

    const toCartesian = toWgs84([Number(navaid.lon), Number(navaid.lat)]);
    return { lat: toCartesian[1], lon: toCartesian[0] };
  }

  private static isValidGeoCoord(geo: { lat: number; lon: number } | null): boolean {
    return Boolean(geo?.lat && geo?.lon && !isNaN(geo.lat) && !isNaN(geo.lon));
  }

  private static handleCoord(line: string, context: SectorHandlerContext): void {
    const coord = line.split(":");
    const geo = geoHelper.convertESEGeoCoordinatesToCartesian(coord[1], coord[2]);
    if (!geo) return;
    context.currentSectorLine.points.push(geo);
  }

  private static handleNewSector(line: string, result: ParsedEseContent, context: SectorHandlerContext): void {
    const parts = line.split(":");
    context.currentSector = {
      name: parts[1],
      actives: [],
      owners: [],
      borders: [],
      depApts: [],
      arrApts: [],
      floor: Number(parts[2]),
      ceiling: Number(parts[3]),
      displaySectorLines: [],
    };
    result.sectors.push(context.currentSector);
    context.processingNewSector = true;
  }

  private static handleOwner(line: string, context: SectorHandlerContext): void {
    const parts = line.replace("OWNER:", "").split(":");
    context.currentSector.owners = parts.map((item) => item.replace("\r", ""));
  }

  private static handleBorder(line: string, context: SectorHandlerContext): void {
    const parts = line.replace("BORDER:", "").split(":");
    context.currentSector.borders = parts
      .map((item) => {
        const cleanItem = item.replace("\r", "");
        if (!cleanItem) return null;

        const isnum = /^\d+$/.test(cleanItem);
        return isnum ? Number(cleanItem) : context.numericIDReplacementMatrix[cleanItem] || null;
      })
      .filter((item): item is number => item !== null);
  }

  private static handleDepApt(line: string, context: SectorHandlerContext): void {
    const parts = line.replace("DEPAPT:", "").split(":");
    context.currentSector.depApts = parts.map((item) => item.replace("\r", ""));
  }

  private static handleArrApt(line: string, context: SectorHandlerContext): void {
    const parts = line.replace("ARRAPT:", "").split(":");
    context.currentSector.arrApts = parts.map((item) => item.replace("\r", ""));
  }

  private static handleActive(line: string, context: SectorHandlerContext): void {
    const parts = line.replace("ACTIVE:", "").split(":");
    context.currentSector.actives.push({
      icao: parts[0].replace("\r", ""),
      runway: parts[1].replace("\r", ""),
    });
  }

  private static handleDisplaySectorLine(line: string, context: SectorHandlerContext): void {
    const parts = line.replace("DISPLAY_SECTORLINE:", "").split(":");
    context.currentSector.displaySectorLines.push({
      borderId: Number(parts[0].replace("\r", "")),
      mySector: parts[1].replace("\r", ""),
      otherSectors: parts
        .slice(2)
        .map((item) => item.replace("\r", "").replace("�", "").replace(parts[1].replace("\r", ""), ""))
        .filter((item) => item !== ""),
    });
  }
}
