import { coneStripe, earthTexture, saucerGlass } from './ufoProps';

test('the cone stripe follows the cone taper instead of sitting inside it', () => {
  const stripe = coneStripe();
  const { radiusTop, radiusBottom, height } = stripe.parameters;
  const coneRadius = (y) => 0.1 * (0.36 - y) / 0.34;
  expect(radiusTop).toBeGreaterThan(coneRadius(0.19 + height / 2));
  expect(radiusTop - coneRadius(0.19 + height / 2)).toBeLessThan(0.002);
  expect(radiusBottom).toBeGreaterThan(coneRadius(0.19 - height / 2));
  expect(radiusBottom - coneRadius(0.19 - height / 2)).toBeLessThan(0.005);
  stripe.dispose();
});

test('the dome has fixed transparency independent of tractor lights, exposure, and fog', () => {
  const glass = saucerGlass();
  expect(glass.isMeshBasicMaterial).toBe(true);
  expect(glass.opacity).toBe(0.23);
  expect(glass.transparent).toBe(true);
  expect(glass.depthWrite).toBe(false);
  expect(glass.toneMapped).toBe(false);
  expect(glass.fog).toBe(false);
  glass.dispose();
});

test('Earth uses a single wrapped surface texture with continent silhouettes', () => {
  const ctx = { fillRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), closePath: jest.fn(), fill: jest.fn() };
  const context = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  try {
    const texture = earthTexture();
    expect(texture.image.width).toBe(512);
    expect(texture.image.height).toBe(256);
    expect(ctx.fill).toHaveBeenCalledTimes(13);
    ctx.lineTo.mock.calls.forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(512);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(256);
    });
    texture.dispose();
  } finally {
    context.mockRestore();
  }
});
