import fs from 'fs-extra';
import debug from 'debug';
const log = debug('SystemManager');

export class SystemManager {
    constructor() {
        this.init();

    }

    init() {
        log('SystemManager init')
    }

    async getSystemInfo() {
        const data = await fs.readFile('/proc/cpuinfo', 'utf8')
        return data
    }

    async listFiles(directory: string): Promise<string[]> {
        const dirs = await fs.readdir(directory, { withFileTypes: true })
        return dirs.filter(file => !file.name.startsWith('.')).map(d => d.name)
    }

    async writeFile(path: string, data: string) {
        const dirs = path.split('/')
        dirs.pop()
        const dir = dirs.join('/')
        if (!fs.existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true })
        }
        await fs.writeFile(path, data)
    }

    async readFile(path: string): Promise<string> {
        const data = await fs.readFile(path, 'utf8')
        return data
    }

    async deleteFile(path: string) {
        await fs.remove(path)
    }

    async copyDirectory(src: string, dest: string) {
        await fs.copy(src, dest)
    }

    async listDirectories(path: string): Promise<string[]> {
        const dirs = await fs.readdir(path, { withFileTypes: true })
        return dirs.filter(d => d.isDirectory()).map(d => d.name)
    }

    async createDirectory(path: string) {
        await fs.mkdir(path, { recursive: true })
    }

    async deleteDirectory(path: string) {
        await fs.remove(path)
    }

    async deleteContentOfDirectory(path: string) {
        await fs.emptyDir(path)
    }

    async copyFile(src: string, dest: string) {
        await fs.copy(src, dest)
    }
}

export const system = new SystemManager()