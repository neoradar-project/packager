declare module "@mapbox/mbtiles" {
    class MBTiles {
        constructor(path: string, callback: any)
        getInfo(callback: any): void
    }
    export = MBTiles;
}