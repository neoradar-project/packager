import { distance, point } from "@turf/turf";

export class Procedure {
  type!: string;
  icao!: string;
  name!: string;
  runway!: string;
  points!: string[];

  constructor(data: any) {
    Object.assign(this, data);
  }

  public toJsonObject(): any {
    return {
      type: this.type,
      icao: this.icao,
      name: this.name,
      runway: this.runway,
      points: this.points,
    };
  }

  static init(line: string, navaids: any): Procedure | null {
    const data = line.split(":").filter((item) => item !== "");
    if (data.length >= 5) {
      const proc = new Procedure({
        type: data[0].replace("\r", ""),
        icao: data[1].replace("\r", ""),
        runway: data[2].replace("\r", ""),
        name: data[3].replace("\r", ""),
      });
      const pts = data[4]
        .split(" ")
        .filter((item) => item !== "")
        .map((item) => item.replace("\r", ""));
      proc.points = pts;
      return proc;
    }
    return null;
  }
}
