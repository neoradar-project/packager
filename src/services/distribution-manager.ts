import { InputManifest } from "../models/inputManifest.model.js";
import path from "path";
import os from "os";
import { system } from "./system.js";

class DistributionManager {
  private readonly basePackagePath = "src/data/base-package";

  async buildPackage(neoRadarPath: string, data: InputManifest): Promise<void> {
    const outputPath = path.join(data.outputDir, data.id);

    // Check if the package was successfully built
    if (await system.directoryExists(outputPath)) {
      const shouldPreparePackage = await this.confirmAction("Do you want to prepare the package for distribution?");

      if (shouldPreparePackage) {
        await this.mergeBasePackage(outputPath);

        const shouldInstallPackage = await this.confirmAction("Do you want to install the package into the NeoRadar client?");

        if (shouldInstallPackage) {
          await this.installPackage(neoRadarPath, data, outputPath);
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

  private async installPackage(neoRadarPath: string, data: InputManifest, outputPath: string): Promise<void> {
    const profilesPath = path.join(neoRadarPath, "profiles", data.namespace);
    const packagePath = path.join(neoRadarPath, "packages", data.id);

    // Create profiles directory if it doesn't exist
    await system.createDirectory(profilesPath, { recursive: true });

    // Copy ASR directory to profiles/namespace directory
    const asrSourcePath = path.join(outputPath, "ASR");
    await system.copyDirectory(asrSourcePath, profilesPath);

    // Copy remaining files to packages/id directory
    await system.copyDirectory(outputPath, packagePath, {
      filter: (src) => !src.includes("ASR"),
    });

    console.log("Package installed into NeoRadar client.");
  }

  private async confirmAction(message: string): Promise<boolean> {
    const answer = await system.prompt(`${message} (y/n): `);
    return answer.toLowerCase() === "y";
  }
}

export default DistributionManager;
