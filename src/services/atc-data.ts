import debug from "debug";
import { system } from "./system.js";
import { recatDefinition } from "../models/recatDef.model.js";
import { ATCData, IcaoAircraft, IcaoAirline, LoginProfiles, Sector, Volume, BorderLine } from "../models/atcData.js";
import { ParsedEseContent } from "../libs/ese-helper.js";
import { NseNavaid } from "../models/nse.js";
import path from "path";
import fs from "fs";

const log = debug("AtcDataManager");

// Updated interface to ONLY support arrays of LoginProfiles as values
export interface NestedLoginProfiles {
  [key: string]: LoginProfiles[];
}

// Updated ATCData interface to include the nested structure
export interface EnhancedATCData extends Omit<ATCData, "loginProfiles"> {
  loginProfiles: NestedLoginProfiles;
}

class AtcDataManager {
  private nestedProfilesRef: NestedLoginProfiles = {};

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
      icaoAircraft: {},
      icaoAirlines: {},
      alias: {},
      borderLines: {},
      sectors: {},
    };

    // Check if loginProfilesFile is a directory or a file
    const isDirectory = await this.isDirectory(loginProfilesFile);
    console.log("isDirectory", isDirectory, loginProfilesFile);

    if (isDirectory) {
      // Parse profiles from all files in the directory structure (with flattened keys)
      console.log("Parsing login profiles from directory structure");
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
      const { sectors, borderLines } = this.transformSectorsAndBorderLines(eseProcessedData, this.flattenLoginProfiles(atcData.loginProfiles));
      atcData.sectors = sectors;
      atcData.borderLines = borderLines;

      // Update login profiles with sector ownership
      this.updateLoginProfilesWithSectors(this.flattenLoginProfiles(atcData.loginProfiles), eseProcessedData, sectors);
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

    // Update the atcData.loginProfiles with the potentially modified reference
    // This ensures new profiles created during sector processing are included
    atcData.loginProfiles = this.nestedProfilesRef;

    console.log("Final login profiles structure has keys:", Object.keys(atcData.loginProfiles));

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
        console.log(`Added profile ${newProfile.callsign} to location "${key}"`);
        return;
      }
    }

    // Fallback to regular add if we can't find the reference profile
    console.log(`Couldn't find location of reference profile ${referenceProfile.callsign}, using default add method`);
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

  /**
   * Calculate left-to-right sequential match score between two strings
   * (Prioritizes matching characters in sequence from left to right)
   */
  private leftToRightMatchScore(target: string, candidate: string): number {
    // Count matching characters in sequence from left to right
    let matchScore = 0;
    let maxMatchRun = 0;
    let currentMatchRun = 0;
    let i = 0,
      j = 0;

    while (i < target.length && j < candidate.length) {
      if (target[i] === candidate[j]) {
        currentMatchRun++;
        // Give higher weight to earlier matches (multiplier based on position)
        const positionWeight = (target.length - i) * 2;
        matchScore += 10 * positionWeight;
        i++;
        j++;
      } else {
        // Try to find the next match by advancing j
        let found = false;
        let lookAhead = 1;
        while (j + lookAhead < candidate.length && lookAhead <= 3) {
          // Limit look-ahead to 3 chars
          if (target[i] === candidate[j + lookAhead]) {
            j += lookAhead;
            // Penalty for skipping characters
            matchScore -= lookAhead * 5;
            found = true;
            break;
          }
          lookAhead++;
        }

        // If not found by advancing j, advance i
        if (!found) {
          maxMatchRun = Math.max(maxMatchRun, currentMatchRun);
          currentMatchRun = 0;
          i++;
          // Penalty for skipping a character in target
          matchScore -= 10;
        }
      }
    }

    maxMatchRun = Math.max(maxMatchRun, currentMatchRun);

    // Bonus for longer continuous matches
    const continuousBonus = maxMatchRun * maxMatchRun * 10;
    matchScore += continuousBonus;

    // Penalize length differences
    const lengthPenalty = Math.abs(target.length - candidate.length) * 15;
    matchScore -= lengthPenalty;

    // Additional bonus for prefix match (if the beginning characters match)
    let prefixLength = 0;
    while (prefixLength < Math.min(target.length, candidate.length) && target[prefixLength] === candidate[prefixLength]) {
      prefixLength++;
    }

    const prefixBonus = prefixLength * prefixLength * 15;
    matchScore += prefixBonus;

    return matchScore;
  }

  private findClosestWord(target, candidates) {
    // Count matching characters from the beginning until a mismatch
    function countMatchingPrefix(target, word) {
      let count = 0;
      for (let i = 0; i < word.length && i < target.length; i++) {
        if (word[i] === target[i]) {
          count++;
        } else {
          break; // Stop counting at first mismatch
        }
      }
      return count;
    }

    // Find the candidate with the most matching characters
    return candidates.reduce((closest, current) => {
      const closestMatches = countMatchingPrefix(target, closest);
      const currentMatches = countMatchingPrefix(target, current);

      return currentMatches > closestMatches ? current : closest;
    }, candidates[0]);
  }

  private countMatchingPrefix(target, word) {
    let count = 0;
    for (let i = 0; i < word.length && i < target.length; i++) {
      if (word[i] === target[i]) {
        count++;
      } else {
        break;
      }
    }
    return count;
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

          console.log(`Processing directory ${folderName} with files: ${profileFiles.map((f) => path.basename(f)).join(", ")}`);

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

            // Only add profiles that haven't been seen across ANY group
            console.log(`Processing ${Object.keys(parsedProfiles).length} profiles from ${fileName}`);

            Object.values(parsedProfiles).forEach((profile) => {
              // Check against global set of callsigns
              if (!globalCallsigns.has(profile.callsign)) {
                nestedProfiles[groupKey].push(profile);
                globalCallsigns.add(profile.callsign);
                console.log(`Added profile ${profile.callsign} to group ${groupKey}`);
              } else {
                console.log(`Skipping duplicate profile ${profile.callsign} in ${fileName}`);
              }
            });
          }
        }
      }
    }

    // Log summary
    console.log(`Parsed ${globalCallsigns.size} unique profiles across ${Object.keys(nestedProfiles).length} groups`);
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

      // Extract anchor from position callsign
      const anchor = position.callsign.split(/[\*_]/)[0];

      // Find the corresponding login profile by exact callsign match
      let loginProfile = callsignToLoginProfile.get(position.callsign);

      if (!loginProfile) {
        console.log(`No exact login profile found for position ${position.callsign}. Trying to find closest match...`);

        // Split the callsign to find prefix and type
        const callsignParts = position.callsign.split("*");
        const baseCallsignPart = callsignParts[0]; // e.g., "LON_SN" from "LON_SN*_CTR"

        // Get the type (last part after "_")
        const typeMatch = position.callsign.match(/_([^_]+)$/);
        const positionType = typeMatch ? typeMatch[1] : "";

        if (!positionType) {
          console.warn(`Could not determine position type from ${position.callsign}`);
          continue;
        }

        // Get the facility identifier (first part before "_" or "*")
        const facilityId = position.callsign.split(/[_*]/)[0];

        // Look for profiles with same facility ID and same position type
        const similarProfiles: LoginProfiles[] = [];

        for (const [_, profile] of callsignToLoginProfile.entries()) {
          const profileFacilityId = profile.callsign.split(/[_*]/)[0];
          const profileTypeMatch = profile.callsign.match(/_([^_]+)$/);
          const profileType = profileTypeMatch ? profileTypeMatch[1] : "";

          // Check if this profile is for the same facility and same position type
          if (profileFacilityId === facilityId && profileType === positionType) {
            similarProfiles.push(profile);
          }
        }

        if (similarProfiles.length === 0) {
          console.warn(`No matching profiles found for facility ${facilityId} and type ${positionType}`);
          continue;
        }

        // Find the closest match by comparing left-to-right character sequence
        let candidateCallsigns = similarProfiles.map((profile) => profile.callsign.split("*")[0]);
        let closestCallsign = this.findClosestWord(baseCallsignPart, candidateCallsigns);

        // Find the corresponding profile
        let closestProfile = similarProfiles.find((profile) => profile.callsign.split("*")[0] === closestCallsign);
        if (!closestProfile) {
          console.warn(`No closest match found for ${baseCallsignPart}`);
          continue;
        }
        console.log(
          `Best match: ${closestProfile.callsign} matches ${baseCallsignPart} with ${this.countMatchingPrefix(baseCallsignPart, closestCallsign)} characters`
        );

        // Create a new login profile based on the closest match
        loginProfile = {
          ...closestProfile, // Deep clone to avoid reference issues
          callsign: position.callsign,
          anchor: facilityId,
          sectors: {}, // Reset sectors as they might be different
        };

        console.log(`Created login profile for ${position.callsign} based on closest match ${closestProfile.callsign}`);

        // Add the new profile to our map so it can be referenced later
        callsignToLoginProfile.set(position.callsign, loginProfile);

        // Add to the same location as the closest profile
        this.addProfileToSameLocation(loginProfile, closestProfile);
      }

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

        // Find and add other sectors where this identifier is in owners but not first
        parsedEseContent.sectors.forEach((oldSector) => {
          if (!oldSector.owners || oldSector.owners.length <= 1) return;

          const index = oldSector.owners.indexOf(identifier);

          const sectorIdentifier = oldSector.owners[0];
          if (index >= 0) {
            // If found but not at first position
            loginProfile.sectors[sectorIdentifier] = index;
          }
        });
      } else {
        console.warn(`No login profile found for sector identifier ${identifier}`);
      }
    });

    // After all sectors have been added, sort them for each login profile
    Object.values(loginProfiles).forEach((profile) => {
      if (Object.keys(profile.sectors).length > 0) {
        // Get the sectors and priorities into an array for sorting
        const sectorEntries = Object.entries(profile.sectors);

        // Sort by priority value (lowest first)
        sectorEntries.sort((a, b) => a[1] - b[1]);

        // Create a new ordered sectors object
        const orderedSectors: Record<string, number> = {};
        sectorEntries.forEach(([sectorId, priority]) => {
          orderedSectors[sectorId] = priority;
        });

        // Replace with sorted sectors
        profile.sectors = orderedSectors;

        console.log(`Sorted ${sectorEntries.length} sectors for ${profile.callsign}`);
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
