import fs from "fs-extra";
import debug from "debug";
const log = debug("SystemManager");
import readline from "readline";

export class SystemManager {
  private rl: readline.Interface;

  constructor() {
    this.init();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  init() {
    log("SystemManager init");
  }

  deinit() {
    this.rl.close();
  }

  async getSystemInfo() {
    const data = await fs.readFile("/proc/cpuinfo", "utf8");
    return data;
  }

  async listFiles(directory: string): Promise<string[]> {
    const dirs = await fs.readdir(directory, { withFileTypes: true });
    return dirs.filter((file) => !file.name.startsWith(".")).map((d) => d.name);
  }

  async writeFile(path: string, data: string) {
    const dirs = path.split("/");
    dirs.pop();
    const dir = dirs.join("/");
    if (!fs.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(path, data);
  }

  async readFile(path: string): Promise<string> {
    const data = await fs.readFile(path, "utf8");
    return data;
  }

  async deleteFile(path: string) {
    await fs.remove(path);
  }

  async copyDirectory(src: string, dest: string, options?: { overwrite?: boolean; filter?: (src: string) => boolean }) {
    const { overwrite = true, filter = () => true } = options || {};
    await fs.copy(src, dest, {
      overwrite,
      filter: (src) => filter(src),
    });
  }

  async listDirectories(path: string): Promise<string[]> {
    const dirs = await fs.readdir(path, { withFileTypes: true });
    return dirs.filter((d) => d.isDirectory()).map((d) => d.name);
  }

  async createDirectory(path: string, options?: { recursive?: boolean }) {
    const { recursive = true } = options || {};
    await fs.mkdir(path, { recursive });
  }

  async deleteDirectory(path: string) {
    await fs.remove(path);
  }

  async deleteContentOfDirectory(path: string) {
    await fs.emptyDir(path);
  }

  async copyFile(src: string, dest: string) {
    await fs.copy(src, dest);
  }

  async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  async prompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(message, (answer) => {
        resolve(answer);
      });
    });
  }
}

export const system = new SystemManager();
