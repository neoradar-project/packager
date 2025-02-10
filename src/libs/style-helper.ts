export const convertColorFeaturePropertyToGeojsonProperties = (
  feature: GeoJSON.Feature,
  isPolygon: boolean = false
): GeoJSON.Feature => {
  const { properties } = feature;
  if (!properties) {
    return feature;
  }
  const { color, ...rest } = properties;
  if (!color) {
    return feature;
  }

  const style = {
    color,
  };

  if (isPolygon) {
    return {
      ...feature,
      properties: {
        ...rest,
        fillStyle: {
          color,
        },
      },
    };
  } else {
    return {
      ...feature,
      properties: {
        ...rest,
        lineStyle: {
          color,
        },
      },
    };
  }
};
