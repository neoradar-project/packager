export interface LoginProfiles {
  callsign: string;
  range: number;
  atisLine1: string;
  atisLine2: string;
  atisLine3: string;
  atisLine4: string;
}

export interface Position {
  callsign: string;
  facility: number;
  sectors: Record<string, number>;
  anchor: string;
}

export interface IcaoAircraft {
  icao: string;
  engines: string;
  builder: string;
  wakeCat: string;
  recatCat: string;
  name: string;
}

export interface IcaoAirline {
  icao: string;
  name: string;
  callsign: string;
  country: string;
}

export interface BorderLine {
  id: number;
  lines: Array<Array<number>>;
}

export interface Volume {
  id: string;
  definition: number[];
  floor: number;
  ceiling: number;
  activationCondition: any[];
}

export interface Sector {
  id: number; // Internal
  volumes: Volume[];
  identifier: string; // "LLN" "LS"
  frequency: number;
  activeAirports: string[];
  facility: number;
  anchor: string; // "EGLL" "LFFF"
}

export interface ATCData {
  loginProfiles: Record<string, LoginProfiles>;
  positions: Record<string, Position>;
  icaoAircraft: Record<string, IcaoAircraft>;
  icaoAirlines: Record<string, IcaoAirline>;
  alias: Record<string, string>;
  borderLines: Record<number, BorderLine>;
  sectors: Record<string, Sector>;
}

export enum AtcPositionType {
  OBS = 0,
  FSS = 1,
  DEL = 2,
  GND = 3,
  TWR = 4,
  APP = 5,
  CTR = 6,
  ATIS = 7,
}
