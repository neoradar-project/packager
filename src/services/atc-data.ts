import debug from "debug";
import { system } from "./system.js";
import { recatDefinition } from "../models/recatDef.model.js";
import { ATCData, IcaoAircraft, IcaoAirline, LoginProfiles, Position, Sector, Volume, BorderLine } from "../models/atcData.js";
import { ParsedEseContent } from "../libs/ese-helper.js";
import { NseNavaid } from "../models/nse.js";
import path from "path";
import fs from "fs";

const log = debug("AtcDataManager");

// Updated interface to ONLY support arrays of LoginProfiles as values
export interface NestedLoginProfiles {
  [key: string]: LoginProfiles[];
}

// Updated ATCData interface to include the nested structure and positions
export interface EnhancedATCData extends Omit<ATCData, "loginProfiles"> {
  loginProfiles: NestedLoginProfiles;
  positions: Record<string, Position>;
}

class AtcDataManager {
  private nestedProfilesRef: NestedLoginProfiles = {};
  private positionsRef: Record<string, Position> = {};
  private callsignToFacilityMap: Record<string, number> = {}; // For storing facility info from login profiles

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
    let atcData: EnhancedATCData = {
      loginProfiles: {},
      positions: {},
      icaoAircraft: {},
      icaoAirlines: {},
      alias: {},
      borderLines: {},
      sectors: {},
    };

    // Check if loginProfilesFile is a directory or a file
    const isDirectory = await this.isDirectory(loginProfilesFile);

    if (isDirectory) {
      // Parse profiles from all files in the directory structure (with flattened keys)
      this.nestedProfilesRef = await this.parseLoginProfilesFromDirectory(loginProfilesFile);
      atcData.loginProfiles = this.nestedProfilesRef;
    } else {
      // Parse profiles from a single file and organize by callsign prefix
      const parsedProfiles = await this.parseLoginProfiles(loginProfilesFile);
      this.nestedProfilesRef = this.organizeProfilesByCallsignPrefix(parsedProfiles);
      atcData.loginProfiles = this.nestedProfilesRef;
    }

    // Process sectors and border lines if ESE data is provided
    if (eseProcessedData) {
      const { sectors, borderLines, positions } = this.transformSectorsAndBorderLines(eseProcessedData);
      atcData.sectors = sectors;
      atcData.borderLines = borderLines;
      atcData.positions = positions;
      this.positionsRef = positions;

      // Update positions with sector ownership
      this.updatePositionsWithSectors(atcData.positions, eseProcessedData, sectors);
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

    // Update the atcData with the potentially modified references
    atcData.loginProfiles = this.nestedProfilesRef;
    atcData.positions = this.positionsRef;

    // Create output path if it doesn't exist
    const outputDir = `${outputPath}/${packageId}-package/${packageId}/datasets`;
    if (!(await this.directoryExists(outputDir))) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    // Write the final data
    await system.writeFile(`${outputDir}/atc-data.json`, JSON.stringify(atcData, null, 2));
    console.log(`ATC data written to ${outputDir}/atc-data.json`);
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(path);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Add a profile to the same location as a reference profile
   */
  private addProfileToSameLocation(newProfile: LoginProfiles, referenceProfile: LoginProfiles): void {
    // Find where the reference profile exists
    for (const [key, profiles] of Object.entries(this.nestedProfilesRef)) {
      const index = profiles.findIndex((p) => p.callsign === referenceProfile.callsign);
      if (index >= 0) {
        // Add the new profile to the same array
        profiles.push(newProfile);
        return;
      }
    }

    // Fallback to regular add if we can't find the reference profile
    this.addProfileToStructure(newProfile);
  }

  /**
   * Add a profile to the appropriate place in the structure
   */
  private addProfileToStructure(profile: LoginProfiles): void {
    // Determine where to add this profile
    const facilityId = profile.callsign.split(/[_*]/)[0]; // e.g., "EGLL"

    // Check if we have a entry for this facility
    if (this.nestedProfilesRef[facilityId]) {
      // Add to existing facility
      this.nestedProfilesRef[facilityId].push(profile);
    } else {
      // Create a new entry for this facility
      this.nestedProfilesRef[facilityId] = [profile];
    }
  }

  private async parseLoginProfilesFromDirectory(directoryPath: string): Promise<NestedLoginProfiles> {
    const nestedProfiles: NestedLoginProfiles = {};
    // Global set to track all callsigns across all groups
    const globalCallsigns = new Set<string>();

    // Get all subdirectories
    const subdirs = await fs.promises.readdir(directoryPath, { withFileTypes: true });

    // Process each subdirectory
    for (const subdir of subdirs) {
      if (subdir.isDirectory()) {
        const folderName = subdir.name;
        const folderPath = path.join(directoryPath, folderName);

        // Find all profile files in this subdirectory
        const profileFiles = await this.findProfileFiles(folderPath);

        if (profileFiles.length > 0) {
          // Sort files by priority (simpler names first)
          profileFiles.sort((a, b) => {
            const aBasename = path.basename(a);
            const bBasename = path.basename(b);

            // Profiles.txt gets highest priority
            if (aBasename === "Profiles.txt") return -1;
            if (bBasename === "Profiles.txt") return 1;

            // Otherwise, sort by name complexity
            const aComplexity = (aBasename.match(/[_\-]/g) || []).length;
            const bComplexity = (bBasename.match(/[_\-]/g) || []).length;

            return aComplexity - bComplexity;
          });

          // Process each profile file
          for (const profileFile of profileFiles) {
            const fileName = path.basename(profileFile, ".txt");

            // Skip if not a profile file
            if (!fileName.includes("Profiles")) continue;

            // Parse the profiles from this file
            const parsedProfiles = await this.parseLoginProfiles(profileFile);

            // Create a group name by removing "Profiles" and any delimiters
            let groupSuffix = fileName === "Profiles" ? "" : fileName.replace("Profiles", "");

            // Clean up the group name (remove delimiters and trim)
            groupSuffix = groupSuffix.replace(/[_\-]/g, " ").trim();

            // Combine folder name and group suffix to create a flattened key
            const groupKey = groupSuffix ? `${folderName} ${groupSuffix}` : folderName;

            // Create the group array if it doesn't exist
            if (!nestedProfiles[groupKey]) {
              nestedProfiles[groupKey] = [];
            }

            Object.values(parsedProfiles).forEach((profile) => {
              // Check against global set of callsigns
              if (!globalCallsigns.has(profile.callsign)) {
                nestedProfiles[groupKey].push(profile);
                globalCallsigns.add(profile.callsign);
              }
            });
          }
        }
      }
    }

    return nestedProfiles;
  }

  private async findProfileFiles(directoryPath: string): Promise<string[]> {
    const files = await fs.promises.readdir(directoryPath);
    return files.filter((file) => file.includes("Profiles") && file.endsWith(".txt")).map((file) => path.join(directoryPath, file));
  }

  private organizeProfilesByCallsignPrefix(profiles: Record<string, LoginProfiles>): NestedLoginProfiles {
    const organized: NestedLoginProfiles = {};

    for (const [key, profile] of Object.entries(profiles)) {
      const callsignParts = profile.callsign.split("_");
      const prefix = callsignParts[0]; // Take the first part of the callsign

      if (!organized[prefix]) {
        organized[prefix] = [];
      }

      organized[prefix].push(profile);
    }

    return organized;
  }

  private flattenLoginProfiles(nestedProfiles: NestedLoginProfiles): Record<string, LoginProfiles> {
    const flattened: Record<string, LoginProfiles> = {};

    // Process all arrays directly (since we now have a flat structure)
    Object.values(nestedProfiles).forEach((profileArray) => {
      profileArray.forEach((profile) => {
        flattened[profile.callsign] = profile;
      });
    });

    return flattened;
  }

  private async parseLoginProfiles(loginProfilesFile: string): Promise<Record<string, LoginProfiles>> {
    const profiles = await system.readFile(loginProfilesFile);
    const lines = profiles.toString().split("\n");

    const data: Record<string, LoginProfiles> = {};
    let currentProfile = "";

    // Create a temporary map for facility information
    this.callsignToFacilityMap = {};

    for (const line of lines) {
      if (line.startsWith("PROFILE:")) {
        const elements = line.split(":");
        currentProfile = elements[1];

        // Store facility in temporary map
        this.callsignToFacilityMap[elements[1]] = Number(elements[3]);

        // Create login profile without facility
        data[currentProfile] = {
          callsign: elements[1],
          range: Number(elements[2]),
          atisLine1: "",
          atisLine2: "",
          atisLine3: "",
          atisLine4: "",
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

  private transformSectorsAndBorderLines(parsedEseContent: ParsedEseContent): {
    sectors: Record<string, Sector>;
    borderLines: Record<number, BorderLine>;
    positions: Record<string, Position>;
  } {
    const sectors: Record<string, Sector> = {};
    const borderLines: Record<number, BorderLine> = {};
    const positions: Record<string, Position> = {};

    // Define facility type mapping
    const facilityTypeMap: Record<string, number> = {
      OBS: 0,
      FSS: 1,
      DEL: 2,
      GND: 3,
      TWR: 4,
      APP: 5,
      CTR: 6,
      ATIS: 7,
    };

    // Convert sector lines to border lines
    parsedEseContent.sectorLines.forEach((sectorLine) => {
      borderLines[sectorLine.id] = {
        id: sectorLine.id,
        lines: sectorLine.points,
      };
    });

    // Create a mapping of position identifiers to the ESE position objects
    const identifierToPosition = new Map<string, any>();
    parsedEseContent.position.forEach((pos) => {
      identifierToPosition.set(pos.identifier, pos);
    });

    // Keep track of which position identifiers already have sectors created for them
    const identifiersWithSectors = new Set<string>();
    let sectorIdCounter = 1000; // Start counter for sector IDs

    // First, create all positions from the ESE data
    parsedEseContent.position.forEach((pos) => {
      const callsign = pos.callsign;
      const identifier = pos.identifier;
      const anchor = callsign.split(/[\*_]/)[0];

      // Determine facility by trying multiple methods
      let facility = 0; // Default value

      // Method 1: Use value from parsed ESE position if available
      if (pos.facility && !isNaN(Number(pos.facility))) {
        facility = Number(pos.facility);
      }
      // Method 2: Look up in our temporary facility map
      else if (this.callsignToFacilityMap[callsign] !== undefined) {
        facility = this.callsignToFacilityMap[callsign];
      }
      // Method 3: Extract from callsign suffix (e.g., APP, CTR, etc.)
      else {
        const lastPart = callsign.split("_").pop()?.toUpperCase();
        if (lastPart && facilityTypeMap[lastPart] !== undefined) {
          facility = facilityTypeMap[lastPart];
        }
      }

      // Add to positions record
      positions[callsign] = {
        callsign: callsign,
        facility: facility,
        sectors: {}, // Will be populated later
        anchor: anchor,
      };

      console.log(`Created position: ${callsign} with identifier ${identifier}`);
    });

    // Process each sector from the parsed ESE content
    for (const oldSector of parsedEseContent.sectors) {
      // Skip if no owners or owners array is empty
      if (!oldSector.owners || oldSector.owners.length === 0) continue;

      const identifier = oldSector.owners[0];

      // Find all sectors with this identifier as the first owner
      const relatedSectors = parsedEseContent.sectors.filter((s) => s.owners && s.owners.length > 0 && s.owners[0] === identifier);

      // Find the position with this identifier
      const position = identifierToPosition.get(identifier);

      if (!position) {
        console.warn(`No position found for identifier ${identifier}`);
        continue;
      }

      // Skip if we've already processed this identifier
      if (identifiersWithSectors.has(identifier)) {
        continue;
      }

      const callsign = position.callsign;
      const anchor = callsign.split(/[\*_]/)[0];
      const facility = positions[callsign]?.facility || 0;

      // Create the new sector
      const newSector: Sector = {
        id: sectorIdCounter++,
        volumes: [],
        identifier: identifier,
        frequency: parseInt(position.frequency.replace(".", "")) || 0,
        activeAirports: [],
        facility: facility,
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

      console.log(`Created sector for ${callsign} with identifier ${identifier} and ${newSector.volumes.length} volumes`);

      // Mark this identifier as having a sector
      identifiersWithSectors.add(identifier);
    }

    // Create empty sectors for positions that don't have any sectors
    // where they are the primary owner (owners[0])
    parsedEseContent.position.forEach((pos) => {
      const identifier = pos.identifier;

      // Skip if we've already created a sector for this identifier
      if (identifiersWithSectors.has(identifier)) {
        return;
      }

      // This position doesn't have any sectors where it's the primary owner
      // Create an empty sector for it
      const callsign = pos.callsign;
      const anchor = callsign.split(/[\*_]/)[0];
      const facility = positions[callsign]?.facility || 0;

      const emptySector: Sector = {
        id: sectorIdCounter++,
        volumes: [], // Empty volumes array
        identifier: identifier,
        frequency: parseInt(pos.frequency.replace(".", "")) || 0,
        activeAirports: [],
        facility: facility,
        anchor: anchor,
      };

      // Add to sectors record
      sectors[identifier] = emptySector;

      console.log(`Created empty sector for position ${callsign} with identifier ${identifier}`);
    });

    return { sectors, borderLines, positions };
  }

  private updatePositionsWithSectors(positions: Record<string, Position>, parsedEseContent: ParsedEseContent, sectors: Record<string, Sector>): void {
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

      if (callsign && positions[callsign]) {
        const position = positions[callsign];

        // Find and add other sectors where this identifier is in owners
        parsedEseContent.sectors.forEach((oldSector) => {
          if (!oldSector.owners || oldSector.owners.length <= 1) return;

          const index = oldSector.owners.indexOf(identifier);
          if (index === -1) return; // This identifier is not an owner of this sector

          const sectorIdentifier = oldSector.owners[0]; // Primary owner

          // Add to position's sectors with appropriate priority
          position.sectors[sectorIdentifier] = index;
        });
      } else {
        console.warn(`No position found for sector identifier ${identifier}`);
      }
    });

    // After all sectors have been added, sort them for each position
    Object.values(positions).forEach((position) => {
      if (Object.keys(position.sectors).length > 0) {
        // Get the sectors and priorities into an array for sorting
        const sectorEntries = Object.entries(position.sectors);

        // Sort by priority value (lowest first)
        sectorEntries.sort((a, b) => a[1] - b[1]);

        // Create a new ordered sectors object
        const orderedSectors: Record<string, number> = {};
        sectorEntries.forEach(([sectorId, priority]) => {
          orderedSectors[sectorId] = priority;
        });

        // Replace with sorted sectors
        position.sectors = orderedSectors;

        console.log(`Position ${position.callsign} has ${Object.keys(orderedSectors).length} sectors`);
      } else {
        console.log(`Position ${position.callsign} has no sectors`);
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
