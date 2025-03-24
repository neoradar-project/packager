import { z } from 'zod';

export interface LatLon {
  lat: number;
  lon: number;
}

interface SectorLineDisplay {
  borderId: number;
  mySector: string;
  otherSectors: string[];
}

export interface Sector {
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

export interface NseNavaid {
  name: string;
  freq: number;
  type: string;
  lat: number;
  lon: number;
  uuid: string;
}