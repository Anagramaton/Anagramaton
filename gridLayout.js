// gridLayout.js
export class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  equals(other) {
    return this.x === other.x && this.y === other.y;
  }

  toString() {
    return `(${this.x}, ${this.y})`;
  }
}

export class Hex {
  constructor(q, r) {
    this.q = q;
    this.r = r;
    this.s = -q - r;
  }

  equals(other) {
    return this.q === other.q && this.r === other.r && this.s === other.s;
  }

  toString() {
    return `(${this.q}, ${this.r}, ${this.s})`;
  }
}

export class Layout {
  constructor(orientation, size, origin) {
    if (!orientation || !size || !origin) {
      throw new Error('Layout requires orientation, size, and origin');
    }
    this.orientation = orientation;
    this.size = size;
    this.origin = origin;
  }

  hexToPixel(hex) {
    const { f0, f1, f2, f3 } = this.orientation;
    const x = (f0 * hex.q + f1 * hex.r) * this.size.x;
    const y = (f2 * hex.q + f3 * hex.r) * this.size.y;
    return new Point(x + this.origin.x, y + this.origin.y);
  }

  polygonCorners(hex, customRadius = this.size.x) {
    const center = this.hexToPixel(hex);
    return Array.from({ length: 6 }, (_, i) => {
      const angle = 2 * Math.PI * (i + this.orientation.start_angle) / 6;
      return new Point(
        center.x + customRadius * Math.cos(angle),
        center.y + customRadius * Math.sin(angle)
      );
    });
  }

  getHexCorners(hex) {
    return this.polygonCorners(hex);
  }
}
