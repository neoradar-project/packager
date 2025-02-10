export interface LoginProfiles {
  callsign: string;
  range: number;
  facility: number;
  atisLine1: string;
  atisLine2: string;
  atisLine3: string;
  atisLine4: string;
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

export interface ATCData {
  loginProfiles: Record<string, LoginProfiles>;
  icaoAircraft: Record<string, IcaoAircraft>;
  icaoAirlines: Record<string, IcaoAirline>;
  alias: Record<string, string>;
}
