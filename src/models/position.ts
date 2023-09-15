import { geoHelper } from "../libs/geo-helper.js"

export class PackageAtcPosition {

    callsign!: string
    name!: string
    frequency!: string
    
    identifier!: string

    sector!: string
    subSector!: string
    facility!: string

    squawkStart!: string
    squawkEnd!: string

    visiblityPoints: [number, number][] = []

    layerUniqueId: number = 0

    constructor(data: any) {
        Object.assign(this, data)
    }

    public toJsonObject(): any {
        return {
            name: this.name,
            callsign: this.callsign,
            frequency: this.frequency,
            identifier: this.identifier,
            sector: this.sector,
            subSector: this.subSector,
            facility: this.facility,
            squawkStart: this.squawkStart,
            squawkEnd: this.squawkEnd,
            layerUniqueId: this.layerUniqueId,
            visiblityPoints: this.visiblityPoints
        }
    }

    static init(line: string): PackageAtcPosition | null {
        const data = line.split(":")
        if (data.length >= 4) {
            const allPoints: [number,number][] = []

            for(let i = 11; i < data.length; i += 2) {
                try {
                    const geo = geoHelper.convertESEGeoCoordinates(data[i], data[i + 1])
                    if(geo) allPoints.push([geo?.lat, geo.lon])
                } catch (error) {
                    console.log(error)
                }
            }

            const gate = new PackageAtcPosition({
                callsign: data[0].replace("\r", ""),
                name: data[1].replace("\r", ""),
                frequency: data[2].replace("\r", ""),
                identifier: data[3].replace("\r", ""),
                subSector: data[4].replace("\r", ""),
                sector: data[5].replace("\r", ""),
                facility: data[6].replace("\r", ""),
                squawkStart: data[9].replace("\r", ""),
                squawkEnd: data[10].replace("\r", ""),
                visiblityPoints: allPoints
            })
            return gate
        }
        return null
    }
}
