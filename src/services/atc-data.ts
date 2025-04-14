import debug from "debug";
import { system } from "./system.js";
import { recatDefinition } from "../models/recatDef.model.js";
import { ATCData, IcaoAircraft, IcaoAirline, LoginProfiles, Sector, Volume, BorderLine } from "../models/atcData.js";
import { ParsedEseContent } from "../libs/ese-helper.js";
import { NseNavaid } from "../models/nse.js";

const log = debug("AtcDataManager");

class AtcDataManager {
  constructor() {}

  public async generateAtcdata(
    packageId: string,
    loginProfilesFile: string,
    icaoAircraftPath: string,
    icaoAirlinesPath: string,
    recatDefinitionPath: string | undefined,
    aliasPath: string,
    outputPath: string,
    eseProcessedData?: ParsedEseContent
  ): Promise<void> {
    log("generateAtcData", packageId, loginProfilesFile);
    let atcData: ATCData = {
      loginProfiles: {},
      icaoAircraft: {},
      icaoAirlines: {},
      alias: {},
      borderLines: {},
      sectors: {},
    };

    // Parse login profiles first
    atcData.loginProfiles = await this.parseLoginProfiles(loginProfilesFile);

    // Process sectors and border lines if ESE data is provided
    if (eseProcessedData) {
      const { sectors, borderLines } = this.transformSectorsAndBorderLines(eseProcessedData, atcData.loginProfiles);
      atcData.sectors = sectors;
      atcData.borderLines = borderLines;

      // Update login profiles with sector ownership
      this.updateLoginProfilesWithSectors(atcData.loginProfiles, eseProcessedData, sectors);
    }

    // Parse aircraft data
    atcData.icaoAircraft = await this.parseIcaoAircraft(icaoAircraftPath, recatDefinitionPath);

    // Parse airline data
    atcData.icaoAirlines = await this.parseIcaoAirline(icaoAirlinesPath);

    // Parse alias data if available
    if (aliasPath) {
      atcData.alias = await this.parseAlias(aliasPath);
    } else {
      atcData.alias = {};
    }

    await system.writeFile(`${outputPath}/${packageId}-package/${packageId}/datasets/atc-data.json`, JSON.stringify(atcData));
  }

  private async parseLoginProfiles(loginProfilesFile: string): Promise<Record<string, LoginProfiles>> {
    const profiles = await system.readFile(loginProfilesFile);
    const lines = profiles.toString().split("\n");

    const data: Record<string, LoginProfiles> = {};
    let currentProfile = "";
    for (const line of lines) {
      if (line.startsWith("PROFILE:")) {
        const elements = line.split(":");
        currentProfile = elements[1];

        // Extract anchor from callsign (part before * or _)
        const anchor = elements[1].split(/[\*_]/)[0];

        data[currentProfile] = {
          callsign: elements[1],
          range: Number(elements[2]),
          facility: Number(elements[3]),
          atisLine1: "",
          atisLine2: "",
          atisLine3: "",
          atisLine4: "",
          sectors: {}, // Initialize empty sectors record
          anchor: anchor,
        };
        continue;
      }
      if (line.startsWith("ATIS")) {
        const elements = line.split(":");
        const atisLineNum = Number(elements[0]?.substring(4));
        data[currentProfile][`atisLine${atisLineNum}`] = elements[1];
      }
    }

    return data;
  }

  private transformSectorsAndBorderLines(
    parsedEseContent: ParsedEseContent,
    loginProfiles: Record<string, LoginProfiles>
  ): {
    sectors: Record<string, Sector>;
    borderLines: Record<number, BorderLine>;
  } {
    const sectors: Record<string, Sector> = {};
    const borderLines: Record<number, BorderLine> = {};

    // Convert sector lines to border lines
    parsedEseContent.sectorLines.forEach((sectorLine) => {
      borderLines[sectorLine.id] = {
        id: sectorLine.id,
        lines: sectorLine.points,
      };
    });

    // Create lookup maps for efficient access
    const callsignToLoginProfile = new Map<string, LoginProfiles>();
    Object.entries(loginProfiles).forEach(([key, profile]) => {
      callsignToLoginProfile.set(profile.callsign, profile);
    });

    // Track completed identifiers to avoid duplicates
    const completedIdentifiers = new Set<string>();
    let sectorIdCounter = 1000; // Start with an arbitrary number

    // Process each sector from the parsed ESE content
    for (const oldSector of parsedEseContent.sectors) {
      // Skip if no owners or owners array is empty
      if (!oldSector.owners || oldSector.owners.length === 0) continue;

      const identifier = oldSector.owners[0];

      // Skip if we've already processed this identifier
      if (completedIdentifiers.has(identifier)) continue;

      // Find all sectors with this identifier as the first owner
      const relatedSectors = parsedEseContent.sectors.filter((s) => s.owners && s.owners.length > 0 && s.owners[0] === identifier);

      // Find the position with this identifier
      const position = parsedEseContent.position.find((p) => p.identifier === identifier);

      if (!position) {
        console.warn(`No position found for identifier ${identifier}`);
        continue;
      }

      // Find the corresponding login profile by exact callsign match
      const loginProfile = callsignToLoginProfile.get(position.callsign);

      if (!loginProfile) {
        console.warn(`No login profile found for position ${position.callsign}`);
        continue;
      }
      // Extract anchor from position callsign
      const anchor = position.callsign.split(/[\*_]/)[0];
      // Create the new sector
      const newSector: Sector = {
        id: sectorIdCounter++,
        volumes: [],
        identifier: identifier,
        frequency: parseInt(position.frequency.replace(".", "")),
        activeAirports: [],
        facility: loginProfile.facility,
        anchor: anchor,
      };

      // Add volumes from related sectors
      for (const relatedSector of relatedSectors) {
        const volume: Volume = {
          id: relatedSector.name,
          definition: relatedSector.borders || [],
          floor: relatedSector.floor,
          ceiling: relatedSector.ceiling,
          activationCondition: [],
        };

        // Collect active airports
        if (relatedSector.depApts && relatedSector.depApts.length > 0) {
          newSector.activeAirports.push(...relatedSector.depApts);
        }
        if (relatedSector.arrApts && relatedSector.arrApts.length > 0) {
          newSector.activeAirports.push(...relatedSector.arrApts);
        }

        newSector.volumes.push(volume);
      }

      // Remove duplicate active airports
      newSector.activeAirports = [...new Set(newSector.activeAirports)];

      // Add to sectors record
      sectors[identifier] = newSector;

      // Mark this identifier as completed
      completedIdentifiers.add(identifier);
    }

    return { sectors, borderLines };
  }

  private updateLoginProfilesWithSectors(
    loginProfiles: Record<string, LoginProfiles>,
    parsedEseContent: ParsedEseContent,
    sectors: Record<string, Sector>
  ): void {
    // Create a map from position identifier to callsign
    const identifierToCallsign = new Map<string, string>();
    parsedEseContent.position.forEach((position) => {
      if (position.identifier) {
        identifierToCallsign.set(position.identifier, position.callsign);
      }
    });

    // For each sector we've created
    Object.entries(sectors).forEach(([identifier, sector]) => {
      // Get the callsign for this identifier
      const callsign = identifierToCallsign.get(identifier);

      if (callsign && loginProfiles[callsign]) {
        const loginProfile = loginProfiles[callsign];

        console.log(`Mapping sector ${identifier} to login profile ${callsign}`);
        parsedEseContent.sectors.forEach((oldSector) => {
          if (!oldSector.owners || oldSector.owners.length <= 1) return;

          const index = oldSector.owners.indexOf(identifier);
          if (index >= 0) {
            loginProfile.sectors[oldSector.name] = index;
          }
        });
      } else {
        console.warn(`No login profile found for sector identifier ${identifier}`);
      }
    });
  }

  private async parseIcaoAirline(icaoAirlinesPath: string): Promise<Record<string, IcaoAirline>> {
    const profiles = await system.readFile(icaoAirlinesPath);
    const lines = profiles.toString().split("\n");
    const data: Record<string, IcaoAirline> = {};
    for (const line of lines) {
      if (line.startsWith(";")) {
        continue;
      }
      const parts = line.split("\t");
      if (parts.length < 4) {
        continue;
      }
      const obj = {
        icao: parts[0],
        name: parts[1],
        callsign: parts[2],
        country: parts[3].replace("\r", ""),
      } as IcaoAirline;
      data[obj.icao] = obj;
    }

    return data;
  }

  private async parseIcaoAircraft(icaoAircraftPath: string, recatDefinitionPath: string | undefined): Promise<Record<string, IcaoAircraft>> {
    const profiles = await system.readFile(icaoAircraftPath);
    let recatDef: recatDefinition[] | undefined = undefined;
    if (recatDefinitionPath) {
      const recatData = await system.readFile(recatDefinitionPath);
      recatDef = JSON.parse(recatData) as recatDefinition[];
    }
    const lines = profiles.toString().split("\n");
    const data: Record<string, IcaoAircraft> = {};
    for (const line of lines) {
      if (line.startsWith(";")) {
        continue;
      }
      const parts = line.split("\t");
      if (parts.length < 4) {
        continue;
      }

      const engines = parts[1].slice(1);
      const wakeCat = parts[1].charAt(0);
      const icao = parts[0];
      let recat = "";
      if (recatDef) {
        recat = recatDef.find((rd) => rd.icao === icao)?.categoryLabel || "";
      }
      const obj = {
        icao: icao,
        engines: engines,
        builder: parts[2],
        wakeCat: wakeCat,
        recatCat: recat,
        name: parts[3].replace("\r", ""),
      } as IcaoAircraft;
      data[obj.icao] = obj;
    }

    return data;
  }

  private async parseAlias(aliasPath: string): Promise<Record<string, string>> {
    const profiles = await system.readFile(aliasPath);
    const lines = profiles.toString().split("\n");
    const data: Record<string, string> = {};
    for (const line of lines) {
      if (line.startsWith(";") || line.startsWith(" ")) {
        continue;
      }
      if (line.length > 0) {
        const ref = line.split(" ")[0].trim();
        data[ref.replace(".", "")] = line.replace(ref, "").trim();
      }
    }
    return data;
  }
}

export const atcData = new AtcDataManager();
