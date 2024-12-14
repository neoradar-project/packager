import debug from "debug";
import { LayerSpecification } from "maplibre-gl";
const log = debug("LayerManager");

class LayerManager {
  public generateLayerConfigFor(layerName: string, source: string): LayerSpecification {
    log("generateLayerConfigFor", layerName, source);

    switch (layerName) {
      case "region":
        return this.generateFillLayerConfig(layerName, source);
      case "geo":
        return this.generateLineLayerConfig(layerName, source, null);
      case "runway":
        return this.generateLineLayerConfig(layerName, source, "#FEFEFE");
      case "airport":
        return this.generateSymbolLayerConfig(layerName, source, "airport", "#D400FF");
      case "vor":
        return this.generateSymbolLayerConfig(layerName, source, "vor", "#0022FF");
      case "ndb":
        return this.generateSymbolLayerConfig(layerName, source, "ndb", "#FFD000");
      case "fix":
        return this.generateSymbolLayerConfig(layerName, source, "fix", "#00FF00");
      case "label":
        return this.generateSymbolLayerConfig(layerName, source, "label", "#FFFFFF", "value", false);
      case "lowAirway":
        return this.generateLineLayerConfig(layerName, source, "#A60000");
      case "highAirway":
        return this.generateLineLayerConfig(layerName, source, "#AD7300");
    }
    throw new Error(`Layer ${layerName} not supported`);
  }

  private generateFillLayerConfig(layerName: string, source: string): LayerSpecification {
    return {
      id: layerName,
      type: "fill",
      source: source,
      "source-layer": layerName,
      paint: {
        "fill-color": ["get", "color"],
        "fill-antialias": true,
        "fill-outline-color": "rgba(0, 0, 0, 0)",
      },
      filter: ["has", "uuid"], // Only show features with UUID
    };
  }

  private generateLineLayerConfig(layerName: string, source: string, defaultColor: string | null): LayerSpecification {
    return {
      id: layerName,
      type: "line",
      source: source,
      "source-layer": layerName,
      paint: {
        "line-color": defaultColor ? defaultColor : ["get", "color"],
      },
      filter: ["has", "uuid"], // Only show features with UUID
    };
  }

  private generateSymbolLayerConfig(
    layerName: string,
    source: string,
    iconName: string,
    defaultColor: string,
    forceProperty: string | null = null,
    hasIcon = true
  ): LayerSpecification {
    return {
      id: layerName,
      type: "symbol",
      source: source,
      "source-layer": layerName,
      layout: {
        "icon-image": hasIcon ? iconName : undefined,
        visibility: "visible",
        "symbol-z-order": "auto",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-transform": "uppercase",
        "text-field": {
          type: "identity",
          property: forceProperty ? forceProperty : "name",
        },
        "symbol-avoid-edges": true,
        "text-size": 10,
        "text-font": ["literal", ["ECAMFontRegular"]],
        "text-pitch-alignment": "auto",
        "text-anchor": "top",
        "text-padding": hasIcon ? 5 : 0,
        "text-offset": hasIcon ? [0, 0.7] : [0, 0],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": 0.1,
      },
      paint: {
        "icon-color": defaultColor,
        "text-color": defaultColor,
      },
      filter: ["has", "uuid"], // Only show features with UUID
    };
  }
}

export const layerManager = new LayerManager();
