export interface InputManifest {
  id: string;
  name: string;
  description: string;
  namespace: string;
  sctPath: string;
  esePath: string;
  loginProfilesPath: string;
  icaoAircraftPath: string;
  icaoAirlinesPath: string;
  recatDefinitionPath?: string;
  aliasPath: string;
  outputDir: string;
}

/*
id: id,
      name: name,
      description: description,
      namespace: namespace,
      createdAt: new Date().toISOString(),
      datasets: datasets,
      mapLayers: allLayers,
      images: images,*/

export interface MapLayer {
  name: string;
  type: "geojson" | "mbtiles";
  source: string;
  minZoom?: number;
  maxZoom?: number;
  stroke?: boolean; // Stroke polygons if defined
  pointType?: string; // Point type if defined for DeckGL
  defaultIcon?: string; // Default icon for points
  pickable?: boolean; // Enable picking for DeckGL
  features?: Array<{
    uuid: string;
    name: string | null;
  }>;
}

export interface OutputManifest {
  id: string;
  name: string;
  description: string;
  namespace: string;
  createdAt: string;
  datasets: string[];
  mapLayers: MapLayer[];
  images: string[];
}
