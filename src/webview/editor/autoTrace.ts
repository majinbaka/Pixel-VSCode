import { Point } from './state';

export function convexHull(rawPoints: Point[]): Point[] {
  const unique = Array.from(new Map(rawPoints.map((point) => [`${point.x}:${point.y}`, point])).values())
    .sort((first, second) => (first.x === second.x ? first.y - second.y : first.x - second.x));
  if (unique.length <= 2) {
    return unique;
  }

  const cross = (origin: Point, a: Point, b: Point) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function traceAlphaHull(ctx: CanvasRenderingContext2D, width: number, height: number): Point[] {
  const image = ctx.getImageData(0, 0, width, height).data;
  const alphaAt = (x: number, y: number) => image[(y * width + x) * 4 + 3];
  const candidates: Point[] = [];

  for (let y = 0; y < height; y += 1) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) > 8) {
        if (left < 0) {
          left = x;
        }
        right = x;
      }
    }
    if (left >= 0) {
      candidates.push({ x: left, y }, { x: right, y });
    }
  }

  for (let x = 0; x < width; x += 1) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      if (alphaAt(x, y) > 8) {
        if (top < 0) {
          top = y;
        }
        bottom = y;
      }
    }
    if (top >= 0) {
      candidates.push({ x, y: top }, { x, y: bottom });
    }
  }

  return convexHull(candidates);
}
