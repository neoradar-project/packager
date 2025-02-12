import { distance, point } from "@turf/turf";

export class Procedure {
  type!: string;
  icao!: string;
  name!: string;
  runway!: string;
  points!: any[];
  layerUniqueId: number = 0;

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
      layerUniqueId: this.layerUniqueId,
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
      proc.buildPointsString(pts, navaids);
      return proc;
    }
    return null;
  }

  private buildPointsString(pointNames: string[], allNavaids: any) {
    const points: any[] = [];

    for (const pointName of pointNames) {
      const navaids = this.findNavaids(pointName, allNavaids);
      if (navaids.length === 1) {
        points.push(navaids[0]);
      } else if (navaids.length > 1) {
        let lastPoint: any;
        if (points.length === 0) {
          const airports = this.findNavaids(this.icao, allNavaids);
          if (airports.length === 1) {
            lastPoint = airports[0];
          } else {
            continue;
          }
        } else {
          lastPoint = points[points.length - 1];
        }
        let nearestNavaid = navaids[0];
        let nearestDistance = distance(point([lastPoint.lon, lastPoint.lat]), point([navaids[0].lon, navaids[0].lat]));
        for (const navaid of navaids) {
          const dist = distance(point([lastPoint.lon, lastPoint.lat]), point([navaid.lon, navaid.lat]));
          if (dist < nearestDistance) {
            nearestNavaid = navaid;
            nearestDistance = dist;
          }
        }
        points.push(nearestNavaid);
      } else {
        continue;
      }
    }
    this.points = points;
  }

  private findNavaids(name: string, allNavaids: any): any[] {
    return allNavaids.filter((navaid: any) => navaid.name === name);
  }
}
