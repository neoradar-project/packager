import DmsCoordinates from 'dms-conversion'
import Coordinates from 'coordinate-parser'
import { toCartesian } from '../services/projection'

export class GeoHelper {

    public convertESEGeoCoordinatesToCartesian(latStr: string, lonStr: string): [number, number] | null {
        try {
            const lat = this.reformatCoordinates(latStr)
            const lon = this.reformatCoordinates(lonStr)
            const coord = new Coordinates(`${lat} ${lon}`)
            const cartesian = toCartesian([coord.getLongitude(), coord.getLatitude()])
            return [cartesian[0], cartesian[1]]
        } catch (error) {
            return null;
        }
    }

    public convertESEGeoCoordinates(latStr: string, lonStr: string): { lat: number, lon: number } | null {
        try {
            const lat = this.reformatCoordinates(latStr)
            const lon = this.reformatCoordinates(lonStr)
            const coord = new Coordinates(`${lat} ${lon}`)
            return { lat: coord.getLatitude(), lon: coord.getLongitude() }
        } catch (error) {
            return null;
        }
    }

    private reformatCoordinates(coord: string): string {
        const parts = coord.split(".")
        return `${Number(parts[0].substring(1, 4))}:${parts[1]}:${parts[2]}.${parts[3]}${parts[0].substring(0, 1)}`
    }

    public convertGeoCoordinatesToESE(latStr: string, lonStr: string): string {
        const dms = new DmsCoordinates(Number(latStr), Number(lonStr))
        const { longitude, latitude } = dms.dmsArrays;
        let [d, m, s, nsew] = longitude;
        const convLongStr = `${nsew}${this.formatESEDegrees(d)}.${this.formatESEMin(m)}.${this.formatESESec(s)}`
        let [dl, ml, sl, nsewl] = latitude;
        const convLatStr = `${nsewl}${this.formatESEDegrees(dl)}.${this.formatESEMin(ml)}.${this.formatESESec(sl)}`
        const final = `${convLatStr}:${convLongStr}`
        return final
    }

    private formatESEDegrees(deg: number): string {
        if (deg < 10) {
            return `00${deg}`
        }
        if (deg < 100) {
            return `0${deg}`
        }
        return `${deg}`
    }

    private formatESEMin(min: number): string {
        if (min < 10) {
            return `0${min}`
        }
        return `${min}`
    }

    private formatESESec(sec: number): string {
        return `${sec.toFixed(3)}`
    }
}

export const geoHelper = new GeoHelper()