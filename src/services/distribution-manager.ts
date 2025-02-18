import { InputManifest } from "../models/inputManifest.model.js";
import path from "path";
import os from "os";
import { system } from "./system.js";

class DistributionManager {
  private readonly basePackagePath = "src/data/base-package";

  async buildPackage(neoRadarPath: string, data: InputManifest): Promise<void> {
    const outputPath = path.join(data.outputDir, `${data.id}-package`);
    const profilesPath = path.join(outputPath, "profiles");
    const packagePath = path.join(outputPath, data.id);

    // Check if the package was successfully built
    if (await system.directoryExists(packagePath)) {
      const shouldPreparePackage = await this.confirmAction("Do you want to prepare the package for distribution?");

      if (shouldPreparePackage) {
        await this.mergeBasePackage(packagePath);

        // Handle package override after base package is merged
        if (data.packageOverride) {
          await this.handlePackageOverride(data.packageOverride, packagePath);
        }

        const shouldInstallPackage = await this.confirmAction("Do you want to install the package into the NeoRadar client?");

        if (shouldInstallPackage) {
          await this.installPackage(neoRadarPath, data, profilesPath, packagePath);
        }
      }
    } else {
      console.log("Package build failed. Skipping package preparation.");
    }
  }

  private async mergeBasePackage(outputPath: string): Promise<void> {
    // Copy files from base-package to output/id directory
    await system.copyDirectory(this.basePackagePath, outputPath, {
      overwrite: false,
    });
    console.log("Merged base package with output package.");
  }

  private async handlePackageOverride(overridePath: string, outputPath: string): Promise<void> {
    console.log("Applying package overrides...");

    // Check if systems directory exists in the override
    const systemsOverridePath = path.join(overridePath, "systems");
    const hasSystemsOverride = await system.directoryExists(systemsOverridePath);

    if (hasSystemsOverride) {
      await this.handleSystemsOverride(systemsOverridePath, outputPath);
    }

    // Handle other overrides (excluding systems directory if it exists)
    const entries = await system.readDirectory(overridePath);
    for (const entry of entries) {
      if (entry !== "systems") {
        const sourcePath = path.join(overridePath, entry);
        const targetPath = path.join(outputPath, entry);

        if (await system.isDirectory(sourcePath)) {
          await system.copyDirectory(sourcePath, targetPath, { overwrite: true });
        } else {
          await system.copyFile(sourcePath, targetPath);
        }
      }
    }
  }

  private async handleSystemsOverride(systemsOverridePath: string, outputPath: string): Promise<void> {
    const outputSystemsPath = path.join(outputPath, "systems");
    const baseSystemsDefaultPath = path.join(this.basePackagePath, "systems", "default");

    // Get all subdirectories in the systems override
    const systemDirs = await system.readDirectory(systemsOverridePath);

    for (const systemDir of systemDirs) {
      const systemOverridePath = path.join(systemsOverridePath, systemDir);

      // Only process if it's a directory
      if (await system.isDirectory(systemOverridePath)) {
        const outputSystemPath = path.join(outputSystemsPath, systemDir);

        // First, create the system directory and copy base default files
        await system.createDirectory(outputSystemPath, { recursive: true });
        await system.copyDirectory(baseSystemsDefaultPath, outputSystemPath, {
          overwrite: false,
        });

        // Then apply the overrides for this system
        await system.copyDirectory(systemOverridePath, outputSystemPath, {
          overwrite: true,
        });

        console.log(`Applied system overrides for: ${systemDir}`);
      }
    }
  }

  private async installPackage(neoRadarPath: string, data: InputManifest, profilesPath: string, packagePath: string): Promise<void> {
    const neoRadarProfilesPath = path.join(neoRadarPath, "profiles", data.namespace);
    const neoRadarPackagePath = path.join(neoRadarPath, "packages", data.id);

    console.log("Installing package into NeoRadar client...");

    // Create profiles directory if it doesn't exist
    await system.createDirectory(neoRadarProfilesPath, { recursive: true });

    // Copy ASR directory to profiles/namespace directory
    await system.copyDirectory(profilesPath, neoRadarProfilesPath);

    // Copy remaining files to packages/id directory
    await system.copyDirectory(packagePath, neoRadarPackagePath);

    console.log("Package installed into NeoRadar client.");
  }

  private async confirmAction(message: string): Promise<boolean> {
    const answer = await system.prompt(`${message} (y/n): `);
    return answer.toLowerCase() === "y";
  }
}

export default DistributionManager;
