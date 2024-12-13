export interface LatLon {
    lat: number;
    lon: number;
}

export interface SectorLine {
    id: number;
    points: LatLon[];
    display?: any;
}

interface SectorLineDisplay {
    borderId: number;
    mySector: string;
    otherSectors: string[];
}

export interface Sector {
    layerUniqueId: number;
    name: string;
    actives: Array<any>;
    owners: string[];
    borders: number[];
    depApts: string[];
    arrApts: string[];
    floor: number;
    ceiling: number;
    displaySectorLines: SectorLineDisplay[];
}