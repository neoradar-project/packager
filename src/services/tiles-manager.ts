import { system } from "./system.js"
import shell from 'shelljs'

import debug from 'debug'
const log = debug('TilesManager')

import MBTiles from '@mapbox/mbtiles'

class TilesManager {

    public async generateMBTilesFrom(datasetName: string, destination: string, files: string[], forcedMaxZoom?: number): Promise<number> {

        const tilesDirectory = `${destination}`
        await system.createDirectory(tilesDirectory)
        const tilesPath = `${tilesDirectory}/${datasetName}.mbtiles`
        const command = `tippecanoe \
        -z${forcedMaxZoom ? forcedMaxZoom : 'g'} \
        -o ${tilesPath} \
        -n ${datasetName} \
        -pi \
        -r1 \
        -pf \
        -pk \
        ${files.join(' ')} \
        --use-attribute-for-id=id \
        --force`
        shell.exec(command)

        return this.getTilesMaxZoom(tilesPath)
    }

    public async getTilesMaxZoom(path: string): Promise<any> {
        return new Promise((resolve, reject) => {
            new MBTiles(path + '?mode=ro', function (err: any, mbtiles: any) {
                return mbtiles.getInfo(function (err: any, info: any) {
                    resolve(info.maxzoom)
                });
            });
        })

    }
}

export const tilesManager = new TilesManager()