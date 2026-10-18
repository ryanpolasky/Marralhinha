import * as THREE from 'three';
import { makeCanvas } from './textures';

const CONTINENTS = [
  [[-168, 65], [-140, 70], [-125, 57], [-107, 55], [-95, 70], [-62, 54], [-57, 47], [-81, 25], [-88, 18], [-101, 22], [-118, 32], [-128, 48], [-151, 57]],
  [[-81, 12], [-66, 10], [-50, -1], [-35, -8], [-43, -23], [-54, -35], [-68, -55], [-74, -39], [-77, -15]],
  [[-53, 60], [-43, 62], [-20, 75], [-30, 83], [-53, 80], [-64, 68]],
  [[-10, 36], [-17, 22], [-14, 5], [9, 4], [12, -7], [19, -35], [32, -29], [41, -12], [50, 11], [36, 28], [24, 32], [10, 37]],
  [[-10, 36], [-9, 44], [-3, 49], [8, 54], [4, 60], [19, 71], [39, 68], [59, 73], [100, 76], [145, 63], [179, 66], [163, 50], [141, 44], [128, 33], [119, 23], [109, 3], [99, 9], [92, 22], [79, 8], [69, 24], [52, 28], [44, 12], [35, 29], [27, 41], [18, 40], [12, 45], [3, 43]],
  [[112, -22], [115, -34], [135, -35], [149, -39], [154, -27], [144, -11], [132, -13], [124, -17]],
  [[47, -13], [50, -16], [47, -25], [44, -24]],
  [[130, -3], [142, -3], [151, -10], [139, -9]],
  [[-8, 50], [-6, 59], [-2, 58], [1, 51]],
  [[137, 34], [140, 40], [146, 44], [143, 36]],
];

export function earthTexture() {
  const [canvas, ctx] = makeCanvas(512, 256);
  ctx.fillStyle = '#194c85';
  ctx.fillRect(0, 0, 512, 256);
  const polygon = (points, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([lon, lat], i) => {
      const x = (lon + 180) / 360 * 512;
      const y = (90 - lat) / 180 * 256;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  };
  CONTINENTS.forEach((points) => polygon(points, '#6a9969'));
  polygon([[-17, 25], [7, 33], [33, 28], [36, 16], [14, 12], [-15, 17]], '#b9aa77');
  polygon([[38, 30], [49, 30], [57, 20], [44, 13]], '#b9aa77');
  polygon([[-180, -72], [-130, -76], [-60, -69], [0, -72], [60, -68], [130, -73], [180, -70], [180, -90], [-180, -90]], '#d6e3e4');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export function coneStripe() {
  return new THREE.CylinderGeometry(0.042, 0.059, 0.055, 10, 1, true);
}

export function saucerGlass() {
  return new THREE.MeshBasicMaterial({
    color: '#a9ddd7', transparent: true, opacity: 0.23,
    depthWrite: false, toneMapped: false, fog: false,
  });
}
