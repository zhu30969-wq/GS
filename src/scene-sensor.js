import * as THREE from "../vendor/three.module.js";
import { intensityAt, lambdaUm } from "./physics.js";

const TEXTURE_WIDTH = 1536;
const TEXTURE_HEIGHT = 256;

// Linear mean irradiance over each pixel's footprint in [-domain, domain] cm.
export function sampleSensorColumns(params, domain, width = TEXTURE_WIDTH) {
  if (!Number.isFinite(domain) || domain <= 0 || !Number.isInteger(width) || width < 1) {
    throw new RangeError("Sensor domain and pixel count must be positive.");
  }

  const columns = new Float64Array(width);
  const pixelWidth = (2 * domain) / width;
  const slits = Math.max(2, Math.round(Number(params.slitCount) || 2));
  const envelopeWidth = params.diffractionEnabled === false ? 0 : params.slitUm;
  const cyclesPerSin = ((slits - 1) * params.gratingUm + envelopeWidth) / lambdaUm(params);
  const distanceSquared = params.distanceCm ** 2;

  for (let column = 0; column < width; column += 1) {
    const left = -domain + column * pixelWidth;
    const right = left + pixelWidth;
    const closestToAxis = left > 0 ? left : right < 0 ? right : 0;
    const sinSlopeBound = distanceSquared / (distanceSquared + closestToAxis ** 2) ** 1.5;

    // The grating/envelope product has bandwidth ((N-1)d+b)/lambda in sin(theta).
    // Bound its variation across the footprint, then take >=16 midpoint samples
    // per shortest cycle. Even subpixel principal maxima cannot fall between samples.
    const samples = Math.max(4, Math.ceil(16 * cyclesPerSin * sinSlopeBound * pixelWidth));
    let sum = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const x = left + ((sample + 0.5) * pixelWidth) / samples;
      sum += intensityAt(params, x);
    }
    columns[column] = sum / samples;
  }

  return columns;
}

// color uses the 0..255 RGB channels returned by wavelengthToColor().
export function createSensorTexture(params, domain, color) {
  const columns = sampleSensorColumns(params, domain);
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create the optical sensor canvas.");
  const frame = ctx.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const background = [3, 5, 7];
  const tint = [color.r, color.g, color.b];

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const vertical = (y + 0.5 - TEXTURE_HEIGHT / 2) / (TEXTURE_HEIGHT * 0.18);
    const illumination = Math.exp(-0.5 * vertical ** 2);
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      // Fixed photographic display transfer, applied only after spatial integration.
      const signal = (1 - Math.exp(-4 * columns[x] * illumination)) ** 0.7;
      const offset = (y * TEXTURE_WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        frame.data[offset + channel] = Math.round(
          background[channel] + (tint[channel] - background[channel]) * signal,
        );
      }
      frame.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(frame, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
