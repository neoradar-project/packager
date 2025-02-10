const RADIUS = 6378137;
const HALF_SIZE = Math.PI * RADIUS;

export const MAXEXTENT = 20037508.342789244;

/**
 * Converts geographical coordinates (longitude and latitude in degrees) to Cartesian coordinates using a Mercator projection.
 *
 * @param input - A tuple of [longitude, latitude] in degrees.
 * @returns A tuple representing the Cartesian coordinates.
 *
 * @remarks
 * The conversion scales the longitude linearly and converts the latitude by applying
 * a logarithmic transformation that simulates the Mercator projection. The resulting y coordinate is
 * clamped to the valid projection range to avoid distortions at extreme values. The Earth's radius (in meters)
 * and half of the total map size are used as constants in the projection.
 */

export function toCartesian(input: readonly [number, number]): [number, number] {
    const length = input.length;
    const dimension = 2;
    const output: [number, number] = [0, 0];

    const halfSize = HALF_SIZE;
    for (let i = 0; i < length; i += dimension) {
        output[i] = (halfSize * input[i]) / 180;
        let y = RADIUS * Math.log(Math.tan((Math.PI * (input[i + 1] + 90)) / 360));
        if (y > halfSize) {
            y = halfSize;
        } else if (y < -halfSize) {
            y = -halfSize;
        }

        output[i + 1] = y;
    }

    return output;
}

/**
 * Converts Cartesian coordinates back to geographical coordinates (longitude and latitude in degrees),
 * effectively reversing the Mercator projection applied in the conversion process.
 *
 * @param input - A tuple of Cartesian coordinates.
 * @returns A tuple of [longitude, latitude] in degrees.
 *
 * @remarks
 * This function reverses the scaling applied to the longitude and applies an exponential and arctangent
 * transformation to the y coordinate to recover the latitude. The y coordinate is first clamped to the valid
 * range before being converted to ensure the output remains accurate. The Earth's radius is used to scale the
 * transformation correctly.
 */
export function fromCartesian(input: readonly [number, number]): [number, number] {
  const length = input.length;
  const dimension = 2;
  const output: [number, number] = [0, 0];
  const halfSize = HALF_SIZE;

  for (let i = 0; i < length; i += dimension) {
      // Convert X coordinate back to longitude
      output[i] = (input[i] * 180) / halfSize;

      // Convert Y coordinate back to latitude
      let y = input[i + 1];

      // Clamp y to valid range
      if (y > halfSize) {
          y = halfSize;
      } else if (y < -halfSize) {
          y = -halfSize;
      }

      // Reverse the Mercator projection
      const exp = Math.exp(y / RADIUS);
      const latitude = (360 * Math.atan(exp) / Math.PI) - 90;

      output[i + 1] = latitude;
  }

  return output;
}
