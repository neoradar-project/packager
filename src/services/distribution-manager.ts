import { InputManifest } from "../models/inputManifest.model.js";
import path from "path";
import os from "os";
import { system } from "./system.js";

class DistributionManager {
  private readonly basePackagePath = "src/data/base-package";

  async buildPackage(neoRadarPath: string, data: InputManifest): Promise<void> {
    const outputPath = path.join(data.outputDir, `${data.id}-Package`);
    const profilesPath = path.join(outputPath, "profiles");
    const packagePath = path.join(outputPath, data.id);

    // Check if the package was successfully built
    if (await system.directoryExists(packagePath)) {
      const shouldPreparePackage = await this.confirmAction("Do you want to prepare the package for distribution?");

      if (shouldPreparePackage) {
        await this.mergeBasePackage(packagePath);

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
