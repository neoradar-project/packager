export interface LoginProfiles {
  callsign: string;
  range: number;
  facility: number;
  atisLine1: string;
  atisLine2: string;
  atisLine3: string;
  atisLine4: string;
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
  icaoAircraft: Record<string, IcaoAircraft>;
  icaoAirlines: Record<string, IcaoAirline>;
  alias: Record<string, string>;
  borderLines: Record<number, BorderLine>;
  sectors: Record<string, Sector>;
}
