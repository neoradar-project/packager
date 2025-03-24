import { z } from "zod";

export const GeoJsonPropertiesExtensionSchema = z.object({
  uuid: z.string(),
  value: z.string().optional(),
  lineStyle: z
    .object({
      color: z.array(z.number()),
      width: z.number().optional().default(1),
      opacity: z.number().optional().default(1),
      dashArray: z.array(z.number()).optional(),
    })
    .optional(),
  fillStyle: z
    .object({
      color: z.array(z.number()),
      opacity: z.number().optional().default(1),
    })
    .optional(),
  symbolStyle: z
    .object({
      symbol: z.string(),
      size: z.number().optional().default(10),
    })
    .optional(),
  labelStyle: z
    .object({
      color: z.array(z.number()),
      size: z.number().optional().default(10),
      offset: z.array(z.number()).optional().default([0, 0]),
    })
    .optional(),
});

export type GeoJsonPropertiesExtension = z.infer<typeof GeoJsonPropertiesExtensionSchema>;

export const MapLayerSchema = z.object({
  name: z.string(),
  type: z.enum(["geojson"]),
  source: z.string().default("auto"),
  defaultStyle: GeoJsonPropertiesExtensionSchema.optional(),
  hasLabels: z.boolean().optional(),
  isLabelLayer: z.boolean().optional(),
});

export type MapLayer = z.infer<typeof MapLayerSchema>;

export const PackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  namespace: z.string(),
  createdAt: z.string(),
  centerPoint: z.array(z.number()),
  mapLayers: z.array(MapLayerSchema).optional(),
});

export type Package = z.infer<typeof PackageSchema>;

export const cartesianPointSchema = z.array(z.number());

export const EseDatasetPositionSchema = z.object({
  name: z.string(),
  callsign: z.string(),
  frequency: z.string(),
  identifier: z.string(),
  sector: z.string(),
  subSector: z.string().optional(),
  facility: z.string(),
  squawkStart: z.string(),
  squawkEnd: z.string(),
  displaySectorLines: z.array(z.number()).optional(),
  visibilityPoints: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export type EseDatasetPosition = z.infer<typeof EseDatasetPositionSchema>;

export const EseDatasetProcedurePointSchema = z.object({
  name: z.string(),
  type: z.enum(["vor", "fix", "ndb", "airport"]),
  lat: z.number(),
  lon: z.number(),
  uuid: z.string(),
});

export const EseDatasetProcedureSchema = z.object({
  type: z.enum(["SID", "STAR"]),
  icao: z.string(),
  name: z.string(),
  runway: z.string().optional(),
  points: z.array(EseDatasetProcedurePointSchema),
});
export type EseDatasetProcedure = z.infer<typeof EseDatasetProcedureSchema>;

export const EseDatasetNavaidsSchema = z.object({
  name: z.string(),
  freq: z.string().optional(),
  type: z.enum(["vor", "ndb", "fix", "airport"]),
  x: z.number(),
  y: z.number(),
  lat: z.number(),
  lon: z.number(),
  uuid: z.string(),
});

export type EseDatasetNavaids = z.infer<typeof EseDatasetNavaidsSchema>;

export const EseDatasetRunwaySchema = z.object({
  id: z.string(),
  name: z.string(),
  icao: z.string(),
  type: z.string(),
  uuid: z.string(),
  oppositeId: z.string(),
});

export type EseDatasetRunway = z.infer<typeof EseDatasetRunwaySchema>;

export const EseDefaultActiveRunways = z.array(z.object({ icao: z.string(), runway: z.string() }));

const _sectorDisplaySectorSchema = z.object({
  borderId: z.number(),
  mySector: z.string(),
  otherSectors: z.array(z.string()),
});

export const EseDatasetSectorSchema = z.object({
  name: z.string(),
  floor: z.number(),
  ceiling: z.number(),
  actives: EseDefaultActiveRunways.optional(),
  displaySectorLines: z.array(_sectorDisplaySectorSchema).optional(),
  owners: z.array(z.string()).optional(),
  borders: z.array(z.number()).optional(),
  depApts: z.array(z.string()).optional(),
  arrApts: z.array(z.string()).optional(),
});
export type EseDatasetSector = z.infer<typeof EseDatasetSectorSchema>;

/* eslint-disable @typescript-eslint/no-unused-vars */
const _sectorDisplaySchema = z.object({
  name: z.string(),
});
export type SectorDisplay = z.infer<typeof _sectorDisplaySchema>;

const SectorLineSchema = z.object({
  id: z.number(),
  points: z.array(cartesianPointSchema),
  display: z.array(
    z.object({
      fir: z.string(),
      name: z.string(),
      floor: z.number().optional(),
      ceiling: z.number().optional(),
    })
  ),
});
export type SectorLine = z.infer<typeof SectorLineSchema>;

export const MapIndexItemSchema = z.object({
  name: z.string(),
  uuid: z.string(),
});

export type MapIndexItem = z.infer<typeof MapIndexItemSchema>;

export const EseDatasetMapIndexSchema = z.record(z.string(), z.array(MapIndexItemSchema));

export type EseDatasetMapIndex = z.infer<typeof EseDatasetMapIndexSchema>;

export const EseDatasetSchema = z.object({
  sectorLines: z.array(SectorLineSchema).optional(),
  sectors: z.array(EseDatasetSectorSchema).optional(),
  position: z.array(EseDatasetPositionSchema).optional(),
  procedure: z.array(EseDatasetProcedureSchema).optional(),
  runways: z.array(EseDatasetRunwaySchema).optional(),
  vor: z.array(EseDatasetNavaidsSchema).optional(),
  ndb: z.array(EseDatasetNavaidsSchema).optional(),
  fix: z.array(EseDatasetNavaidsSchema).optional(),
  airport: z.array(EseDatasetNavaidsSchema).optional(),
  mapItemsIndex: EseDatasetMapIndexSchema,
});

export type EseDataset = z.infer<typeof EseDatasetSchema>;

export interface MapItemsSearchableDataStructure {
  name: string;
  layer: string;
  uuid: string;
}
