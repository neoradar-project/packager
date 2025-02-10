import { MapLayer } from "./fromZod";

export const defaultMapLayers: MapLayer[] = [
  {
    name: "region",
    type: "geojson",
    source: "region",
  },
  {
    name: "artcc",
    type: "geojson",
    source: "artcc",
  },
  {
    name: "ARTCC High",
    type: "geojson",
    source: "artccHigh",
  },
  {
    name: "ARTCC Low",
    type: "geojson",
    source: "artccLow",
  },
  {
    name: "Low Airway",
    type: "geojson",
    source: "lowAirway",
  },
  {
    name: "High Airway",
    type: "geojson",
    source: "highAirway",
  },
  {
    name: "sid",
    type: "geojson",
    source: "sid",
  },
  {
    name: "star",
    type: "geojson",
    source: "star",
  },
  {
    name: "geo",
    type: "geojson",
    source: "geo",
  },
  {
    name: "fix",
    type: "geojson",
    source: "fix",
    hasLabels: true,
  },
  {
    name: "vor",
    type: "geojson",
    source: "vor",
    hasLabels: true,
  },
  {
    name: "ndb",
    type: "geojson",
    source: "ndb",
    hasLabels: true,
  },
  {
    name: "airport",
    type: "geojson",
    source: "airport",
    hasLabels: true,
  },
  {
    name: "runway",
    type: "geojson",
    source: "runway",
  },
  {
    name: "label",
    type: "geojson",
    source: "label",
    isLabelLayer: true,
  },
];
