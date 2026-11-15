import {
  EngineeringSummary,
  GuardrailConfig,
  InfieldConfig,
  InfieldSeatModule,
  SavedStadiumProject,
  SavedStadiumRevision,
  SightlineRowResult,
  StandSector,
  StandSectorFillType,
  StandTier,
  StadiumSchema,
} from '../types/stadium';

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

/**
 * Snaps a coordinate value to the specified CAD grid step if snapping is enabled.
 */
export function snapToGridValue(val: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return Number(val.toFixed(2));
  return Number((Math.round(val / gridSize) * gridSize).toFixed(2));
}

/**
 * Exact polar distance R(theta) from center (0,0) to the outer boundary of a rounded rectangle
 * with half-length a (along X), half-width b (along Y), and corner radius r.
 */
function rayRoundedRectIntersection(thetaRad: number, a: number, b: number, rRaw: number): number {
  const r = Math.max(0, Math.min(rRaw, Math.min(a, b) - 0.01));
  const cos = Math.abs(Math.cos(thetaRad));
  const sin = Math.abs(Math.sin(thetaRad));

  if (r <= 0.05) {
    const tx = cos > 1e-6 ? a / cos : 1e9;
    const ty = sin > 1e-6 ? b / sin : 1e9;
    return Math.min(tx, ty);
  }

  const cx = a - r;
  const cy = b - r;

  // Check intersection with straight vertical edge x = a (valid if y <= cy)
  if (cos > 1e-6) {
    const tVert = a / cos;
    const yAtVert = tVert * sin;
    if (yAtVert <= cy + 1e-5) {
      return tVert;
    }
  }

  // Check intersection with straight horizontal edge y = b (valid if x <= cx)
  if (sin > 1e-6) {
    const tHoriz = b / sin;
    const xAtHoriz = tHoriz * cos;
    if (xAtHoriz <= cx + 1e-5) {
      return tHoriz;
    }
  }

  // Otherwise ray intersects the circular corner arc centered at (cx, cy) with radius r:
  // (t*cos - cx)^2 + (t*sin - cy)^2 = r^2
  // t^2 - 2*t*(cx*cos + cy*sin) + (cx^2 + cy^2 - r^2) = 0
  const bQuad = cx * cos + cy * sin;
  const cQuad = cx * cx + cy * cy - r * r;
  const disc = Math.max(0, bQuad * bQuad - cQuad);
  return bQuad + Math.sqrt(disc);
}

/**
 * Returns the exact distance R (in meters) from the stadium origin (0,0) to the
 * outer perimeter of the Infield at angle `angleDeg` (0° = +X East, 90° = +Y South/North).
 */
export function getInfieldOuterRadiusAtAngle(infield: InfieldConfig, angleDeg: number): number {
  const theta = angleDeg * DEG_TO_RAD;
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);

  switch (infield.shape) {
    case 'circle': {
      return a;
    }
    case 'ellipse': {
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const denom = Math.sqrt(b * b * cos * cos + a * a * sin * sin);
      return denom > 1e-6 ? (a * b) / denom : a;
    }
    case 'square': {
      const sideHalf = a;
      const r = Math.min(infield.cornerRadius || 0, sideHalf * 0.45);
      return rayRoundedRectIntersection(theta, sideHalf, sideHalf, r);
    }
    case 'rectangle': {
      return rayRoundedRectIntersection(theta, a, b, 0);
    }
    case 'rounded-rect':
    default: {
      const r = Math.min(infield.cornerRadius, Math.min(a, b) - 0.5);
      return rayRoundedRectIntersection(theta, a, b, Math.max(0, r));
    }
  }
}

/**
 * Returns the expanded geometric radius R(theta) of the infield's true shape
 * offset outward by `expansionDist` (in meters).
 * - 'circle': radius a + d
 * - 'ellipse': true geometric ellipse (a + d, b + d)
 * - 'square': sharp square (r=0) or equidistant rounded square (r+d)
 * - 'rectangle': crisp mitered rectangle (a + d, b + d, r = 0)
 * - 'rounded-rect': exact Minkowski/normal offset rounded-rect (a + d, b + d, r + d)
 */
export function getInfieldShapeExpandedRadiusAtAngle(
  infield: InfieldConfig,
  expansionDist: number,
  angleDeg: number
): number {
  const theta = angleDeg * DEG_TO_RAD;
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);
  const d = Math.max(0, expansionDist);

  switch (infield.shape) {
    case 'circle': {
      return a + d;
    }
    case 'ellipse': {
      const aExp = a + d;
      const bExp = b + d;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const denom = Math.sqrt(bExp * bExp * cos * cos + aExp * aExp * sin * sin);
      return denom > 1e-6 ? (aExp * bExp) / denom : aExp;
    }
    case 'square': {
      const sideHalf = a + d;
      const baseR = Math.min(infield.cornerRadius || 0, a * 0.45);
      const rExp = baseR > 0.05 ? Math.min(sideHalf - 0.5, baseR + d) : 0;
      return rayRoundedRectIntersection(theta, sideHalf, sideHalf, rExp);
    }
    case 'rectangle': {
      return rayRoundedRectIntersection(theta, a + d, b + d, 0);
    }
    case 'rounded-rect':
    default: {
      const baseR = Math.max(0, Math.min(infield.cornerRadius, Math.min(a, b) - 0.5));
      const rExp = baseR > 0.05 ? Math.min(Math.min(a + d, b + d) - 0.5, baseR + d) : 0;
      return rayRoundedRectIntersection(theta, a + d, b + d, rExp);
    }
  }
}

export interface InfieldPerimeterPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface SectorNormalSample {
  baseX: number;
  baseY: number;
  nx: number;
  ny: number;
  dIn: number;
  dOut: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  /** Perpendicular run (used to keep 3D outer rim elevation smooth and slope strictly equal to slopeDeg) */
  perpRun: number;
}

interface NormalizedShapeBox {
  a: number;
  b: number;
  rEff: number;
  vHalf: number;
  hSpan: number;
  vSpan: number;
  qArc: number;
  totalPerimeter: number;
}

function getNormalizedShapeBox(infield: InfieldConfig): NormalizedShapeBox {
  const a = Math.max(10, infield.length / 2);
  const b = infield.shape === 'square' ? a : Math.max(10, infield.width / 2);
  const rRaw = infield.shape === 'rectangle' ? 0 : infield.cornerRadius || 0;
  const rClamped =
    infield.shape === 'square'
      ? Math.max(0, Math.min(rRaw, a * 0.45))
      : Math.max(0, Math.min(rRaw, Math.min(a, b) - 0.5));
  const rEff = rClamped > 0.05 ? rClamped : 0;

  const vHalf = Math.max(0, b - rEff);
  const hSpan = Math.max(0, 2 * (a - rEff));
  const vSpan = Math.max(0, 2 * (b - rEff));
  const qArc = (Math.PI / 2) * rEff;
  const totalPerimeter = 2 * hSpan + 2 * vSpan + 4 * qArc;

  return { a, b, rEff, vHalf, hSpan, vSpan, qArc, totalPerimeter };
}

const ELLIPSE_LUT_STEPS = 720;
const ellipseLutCache = new Map<string, { cumLen: number[]; totalPerimeter: number }>();

function getEllipseArcLUT(a: number, b: number): { cumLen: number[]; totalPerimeter: number } {
  const key = `${a.toFixed(3)}|${b.toFixed(3)}`;
  const cached = ellipseLutCache.get(key);
  if (cached) return cached;

  const cumLen: number[] = [0];
  let prevX = a;
  let prevY = 0;
  const stepT = (2 * Math.PI) / ELLIPSE_LUT_STEPS;
  for (let k = 1; k <= ELLIPSE_LUT_STEPS; k++) {
    const t = k * stepT;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    cumLen.push(cumLen[k - 1] + Math.hypot(x - prevX, y - prevY));
    prevX = x;
    prevY = y;
  }
  const entry = { cumLen, totalPerimeter: cumLen[ELLIPSE_LUT_STEPS] };
  if (ellipseLutCache.size > 64) ellipseLutCache.clear();
  ellipseLutCache.set(key, entry);
  return entry;
}

/**
 * Returns the exact infield perimeter point (x, y) and strictly 90°-perpendicular outward unit normal (nx, ny)
 * at normalized arc-length fraction `frac` in [0, 1] starting from (a, 0) counter-clockwise.
 */
export function getInfieldPointAndNormalAtFrac(
  infield: InfieldConfig,
  frac: number,
  side: 'start' | 'end' = 'start'
): InfieldPerimeterPoint {
  const u = frac === 1 ? 1 : ((frac % 1) + 1) % 1;
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);

  if (infield.shape === 'circle') {
    const theta = u * 2 * Math.PI;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return { x: a * cos, y: a * sin, nx: cos, ny: sin };
  }

  if (infield.shape === 'ellipse') {
    const { cumLen, totalPerimeter } = getEllipseArcLUT(a, b);
    const targetS = u * totalPerimeter;
    let lo = 0;
    let hi = ELLIPSE_LUT_STEPS;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumLen[mid] <= targetS) lo = mid;
      else hi = mid;
    }
    const s0 = cumLen[lo];
    const s1 = cumLen[hi];
    const segFrac = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;
    const t = ((lo + segFrac) / ELLIPSE_LUT_STEPS) * 2 * Math.PI;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const x = a * cosT;
    const y = b * sinT;
    // Outward normal perpendicular to ellipse tangent (-a*sinT, b*cosT) is (b*cosT, a*sinT)
    const rnx = b * cosT;
    const rny = a * sinT;
    const nLen = Math.hypot(rnx, rny) || 1;
    return { x, y, nx: rnx / nLen, ny: rny / nLen };
  }

  // Analytical piecewise parameterization for 'square', 'rectangle', 'rounded-rect'
  const { a: bx, b: by, rEff, vHalf, hSpan, vSpan, qArc, totalPerimeter } =
    getNormalizedShapeBox(infield);
  const cx = bx - rEff;
  const cy = by - rEff;
  const s = u * totalPerimeter;

  const s1 = vHalf;
  const s2 = s1 + qArc;
  const s3 = s2 + hSpan;
  const s4 = s3 + qArc;
  const s5 = s4 + vSpan;
  const s6 = s5 + qArc;
  const s7 = s6 + hSpan;
  const s8 = s7 + qArc;
  const eps = side === 'start' ? -1e-6 : 1e-6;

  if (s <= s1 + eps) {
    return { x: bx, y: s, nx: 1, ny: 0 };
  }
  if (qArc > 0 && s <= s2 + eps) {
    const phi = ((s - s1) / qArc) * (Math.PI / 2);
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    return { x: cx + rEff * cos, y: cy + rEff * sin, nx: cos, ny: sin };
  }
  if (s <= s3 + eps) {
    return { x: cx - (s - s2), y: by, nx: 0, ny: 1 };
  }
  if (qArc > 0 && s <= s4 + eps) {
    const phi = Math.PI / 2 + ((s - s3) / qArc) * (Math.PI / 2);
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    return { x: -cx + rEff * cos, y: cy + rEff * sin, nx: cos, ny: sin };
  }
  if (s <= s5 + eps) {
    return { x: -bx, y: cy - (s - s4), nx: -1, ny: 0 };
  }
  if (qArc > 0 && s <= s6 + eps) {
    const phi = Math.PI + ((s - s5) / qArc) * (Math.PI / 2);
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    return { x: -cx + rEff * cos, y: -cy + rEff * sin, nx: cos, ny: sin };
  }
  if (s <= s7 + eps) {
    return { x: -cx + (s - s6), y: -by, nx: 0, ny: -1 };
  }
  if (qArc > 0 && s <= s8 + eps) {
    const phi = 1.5 * Math.PI + ((s - s7) / qArc) * (Math.PI / 2);
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    return { x: cx + rEff * cos, y: -cy + rEff * sin, nx: cos, ny: sin };
  }
  return { x: bx, y: -cy + (s - s8), nx: 1, ny: 0 };
}

/**
 * Returns the exact total perimeter length (in meters) of the infield's outer boundary.
 */
export function getInfieldPerimeterMeters(infield: InfieldConfig): number {
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);
  if (infield.shape === 'circle') {
    return Number((2 * Math.PI * a).toFixed(1));
  }
  if (infield.shape === 'ellipse') {
    return Number(getEllipseArcLUT(a, b).totalPerimeter.toFixed(1));
  }
  return Number(getNormalizedShapeBox(infield).totalPerimeter.toFixed(1));
}

/**
 * Inverts a polar angle `angleDeg` into the exact normalized infield perimeter fraction u in [0, 1].
 */
export function getPerimFracAtAngle(infield: InfieldConfig, angleDeg: number): number {
  const normDeg = ((angleDeg % 360) + 360) % 360;
  if (infield.shape === 'circle') {
    return normDeg / 360;
  }

  const rad = normDeg * DEG_TO_RAD;
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);

  if (infield.shape === 'ellipse') {
    let t = Math.atan2(a * Math.sin(rad), b * Math.cos(rad));
    if (t < 0) t += 2 * Math.PI;
    const { cumLen, totalPerimeter } = getEllipseArcLUT(a, b);
    const idxF = (t / (2 * Math.PI)) * ELLIPSE_LUT_STEPS;
    const i0 = Math.min(ELLIPSE_LUT_STEPS - 1, Math.floor(idxF));
    const f = idxF - i0;
    const s = cumLen[i0] * (1 - f) + cumLen[i0 + 1] * f;
    return totalPerimeter > 0 ? s / totalPerimeter : 0;
  }

  const r = getInfieldOuterRadiusAtAngle(infield, normDeg);
  const px = r * Math.cos(rad);
  const py = r * Math.sin(rad);
  const { a: bx, b: by, rEff, vHalf, hSpan, vSpan, qArc, totalPerimeter } =
    getNormalizedShapeBox(infield);
  const cx = bx - rEff;
  const cy = by - rEff;
  const eps = 1e-3;
  const s1 = vHalf;
  const s2 = s1 + qArc;
  const s3 = s2 + hSpan;
  const s4 = s3 + qArc;
  const s5 = s4 + vSpan;
  const s6 = s5 + qArc;
  const s7 = s6 + hSpan;
  const s8 = s7 + qArc;

  let s = 0;
  if (normDeg >= 360 - 1e-4 || normDeg <= 1e-4) {
    return 0;
  } else if (px >= bx - eps && py >= 0 && py <= cy + eps) {
    s = Math.max(0, py);
  } else if (rEff > 0 && px >= cx - eps && py >= cy - eps) {
    const phi = Math.max(0, Math.min(Math.PI / 2, Math.atan2(py - cy, px - cx)));
    s = s1 + (phi / (Math.PI / 2)) * qArc;
  } else if (py >= by - eps && px >= -cx - eps && px <= cx + eps) {
    s = s2 + (cx - px);
  } else if (rEff > 0 && px <= -cx + eps && py >= cy - eps) {
    const phi = Math.max(Math.PI / 2, Math.min(Math.PI, Math.atan2(py - cy, px + cx)));
    s = s3 + ((phi - Math.PI / 2) / (Math.PI / 2)) * qArc;
  } else if (px <= -bx + eps && py >= -cy - eps && py <= cy + eps) {
    s = s4 + (cy - py);
  } else if (rEff > 0 && px <= -cx + eps && py <= -cy + eps) {
    let phi = Math.atan2(py + cy, px + cx);
    if (phi < 0) phi += 2 * Math.PI;
    phi = Math.max(Math.PI, Math.min(1.5 * Math.PI, phi));
    s = s5 + ((phi - Math.PI) / (Math.PI / 2)) * qArc;
  } else if (py <= -by + eps && px >= -cx - eps && px <= cx + eps) {
    s = s6 + (px + cx);
  } else if (rEff > 0 && px >= cx - eps && py <= -cy + eps) {
    let phi = Math.atan2(py + cy, px - cx);
    if (phi < 0) phi += 2 * Math.PI;
    phi = Math.max(1.5 * Math.PI, Math.min(2 * Math.PI, phi));
    s = s7 + ((phi - 1.5 * Math.PI) / (Math.PI / 2)) * qArc;
  } else {
    s = s8 + (py + cy);
  }

  return totalPerimeter > 0 ? Math.max(0, Math.min(1, s / totalPerimeter)) : 0;
}

/**
 * Resolves the normalized infield perimeter fraction range [startFrac, endFrac] for a sector.
 */
export function getSectorPerimFracs(
  infield: InfieldConfig,
  tier: StandTier,
  sector?: StandSector,
  fallbackStartDeg = 0,
  fallbackEndDeg = 15
): { startFrac: number; endFrac: number } {
  if (
    sector &&
    typeof sector.startPerimFrac === 'number' &&
    typeof sector.endPerimFrac === 'number' &&
    (sector.endPerimFrac > sector.startPerimFrac ||
      (sector.endPerimFrac >= sector.startPerimFrac &&
        sector.startNormalRad !== undefined &&
        sector.endNormalRad !== undefined))
  ) {
    return { startFrac: sector.startPerimFrac, endFrac: sector.endPerimFrac };
  }
  if (sector && tier.sectors.length > 0 && tier.sectors.length === tier.sectorCount) {
    const idx = Math.max(0, sector.sectorIndex);
    const cnt = Math.max(1, tier.sectorCount);
    return { startFrac: idx / cnt, endFrac: (idx + 1) / cnt };
  }
  const sDeg = sector ? sector.startAngleDeg : fallbackStartDeg;
  const eDeg = sector ? sector.endAngleDeg : fallbackEndDeg;
  const startFrac = getPerimFracAtAngle(infield, sDeg);
  const endFrac = eDeg >= 359.99 ? 1 : getPerimFracAtAngle(infield, eDeg);
  return {
    startFrac,
    endFrac: endFrac > startFrac ? endFrac : 1,
  };
}

export interface SectorBoundaryAnchor {
  frac: number;
  angleDeg: number;
  normalRad?: number;
}

/**
 * Computes sector boundary anchors [0..N] along the infield perimeter such that:
 *  - Every dividing seam remains strictly 90° perpendicular to the infield edge, AND
 *  - Cut positions are distributed by equal extruded tier area (balancing straight sides
 *    and rounded/sharp corners so all blocks in the tier have virtually equal area).
 */
export function computeEqualAreaSectorBoundaries(
  infield: InfieldConfig,
  tier: StandTier,
  allTiers: StandTier[]
): SectorBoundaryAnchor[] {
  const n = Math.max(1, Math.min(72, Math.round(tier.sectorCount)));
  if (infield.shape === 'circle') {
    return Array.from({ length: n + 1 }, (_, i) => ({
      frac: i / n,
      angleDeg: Number(((i * 360) / n).toFixed(2)),
    }));
  }

  const tiersForLookup = allTiers.length > 0 ? allTiers : [tier];

  interface AreaWalkNode {
    frac: number;
    x: number;
    y: number;
    nx: number;
    ny: number;
    normalRad: number;
    ix: number;
    iy: number;
    ox: number;
    oy: number;
  }

  const makeNode = (
    frac: number,
    x: number,
    y: number,
    nx: number,
    ny: number,
    normalRad: number,
    isCornerMiter: boolean
  ): AreaWalkNode => {
    const dist = getTierNormalDistancesAtPoint(
      infield,
      tiersForLookup,
      tier,
      x,
      y,
      nx,
      ny,
      isCornerMiter
    );
    const effScale =
      isCornerMiter &&
      (tier.morphMode || 'concentric-circle') === 'infield-shape' &&
      tier.concentricMorph > 0.5
        ? dist.miterScale
        : 1;
    const dIn = dist.dIn;
    const dOut = dist.dOut;
    void effScale;
    return {
      frac,
      x,
      y,
      nx,
      ny,
      normalRad,
      ix: x + dIn * nx,
      iy: y + dIn * ny,
      ox: x + dOut * nx,
      oy: y + dOut * ny,
    };
  };

  const nodes: AreaWalkNode[] = [];
  const isBoxShape =
    infield.shape === 'rectangle' ||
    infield.shape === 'square' ||
    infield.shape === 'rounded-rect';
  const box = isBoxShape ? getNormalizedShapeBox(infield) : null;
  const isSharpRect = Boolean(box && box.rEff === 0);

  if (isSharpRect && box) {
    const L = box.totalPerimeter || 1;
    const u1 = box.vHalf / L;
    const u3 = (box.vHalf + box.hSpan) / L;
    const u5 = (box.vHalf + box.hSpan + box.vSpan) / L;
    const u7 = (box.vHalf + 2 * box.hSpan + box.vSpan) / L;

    const corners = [
      { u: u1, x: box.a, y: box.b, preRad: 0, postRad: Math.PI / 2 },
      { u: u3, x: -box.a, y: box.b, preRad: Math.PI / 2, postRad: Math.PI },
      { u: u5, x: -box.a, y: -box.b, preRad: Math.PI, postRad: 1.5 * Math.PI },
      { u: u7, x: box.a, y: -box.b, preRad: 1.5 * Math.PI, postRad: 2 * Math.PI },
    ];

    const pushStraightSegment = (uStart: number, uEnd: number, steps: number) => {
      for (let k = 0; k <= steps; k++) {
        const u = uStart + ((uEnd - uStart) * k) / steps;
        const side = k === steps ? 'end' : 'start';
        const pt = getInfieldPointAndNormalAtFrac(infield, u, side);
        let nRad = Math.atan2(pt.ny, pt.nx);
        if (nRad < 0) nRad += 2 * Math.PI;
        nodes.push(makeNode(u, pt.x, pt.y, pt.nx, pt.ny, nRad, false));
      }
    };

    const pushCornerFan = (c: (typeof corners)[number], steps = 16) => {
      for (let k = 0; k <= steps; k++) {
        const alpha = (k / steps) * (Math.PI / 2);
        const rad = c.preRad + alpha;
        const isMid = k > 0 && k < steps;
        nodes.push(
          makeNode(c.u, c.x, c.y, Math.cos(rad), Math.sin(rad), rad, isMid)
        );
      }
    };

    pushStraightSegment(0, u1, 48);
    pushCornerFan(corners[0]);
    pushStraightSegment(u1, u3, 72);
    pushCornerFan(corners[1]);
    pushStraightSegment(u3, u5, 48);
    pushCornerFan(corners[2]);
    pushStraightSegment(u5, u7, 72);
    pushCornerFan(corners[3]);
    pushStraightSegment(u7, 1, 48);
  } else {
    const rawUs: number[] = [];
    const totalSteps = 480;
    for (let k = 0; k <= totalSteps; k++) {
      rawUs.push(k / totalSteps);
    }
    for (const c of [0, 0.25, 0.5, 0.75, 1]) {
      rawUs.push(c);
    }
    if (box) {
      const L = box.totalPerimeter || 1;
      const s1 = box.vHalf;
      const s2 = s1 + box.qArc;
      const s3 = s2 + box.hSpan;
      const s4 = s3 + box.qArc;
      const s5 = s4 + box.vSpan;
      const s6 = s5 + box.qArc;
      const s7 = s6 + box.hSpan;
      const s8 = s7 + box.qArc;
      for (const sVal of [s1, s2, s3, s4, s5, s6, s7, s8]) {
        rawUs.push(sVal / L);
      }
    }
    rawUs.sort((x, y) => x - y);

    const dedupedUs: number[] = [];
    for (const u of rawUs) {
      const clamped = Math.max(0, Math.min(1, u));
      if (dedupedUs.length === 0 || clamped - dedupedUs[dedupedUs.length - 1] > 1e-6) {
        dedupedUs.push(clamped);
      }
    }
    if (dedupedUs[dedupedUs.length - 1] < 1 - 1e-6) {
      dedupedUs.push(1);
    }

    for (const u of dedupedUs) {
      const pt = getInfieldPointAndNormalAtFrac(infield, u, u >= 1 - 1e-6 ? 'end' : 'start');
      let nRad = Math.atan2(pt.ny, pt.nx);
      if (nRad < 0) nRad += 2 * Math.PI;
      nodes.push(makeNode(u, pt.x, pt.y, pt.nx, pt.ny, nRad, false));
    }
  }

  const cumArea: number[] = [0];
  for (let k = 0; k < nodes.length - 1; k++) {
    const p = nodes[k];
    const q = nodes[k + 1];
    // Shoelace area of quad (p.I -> q.I -> q.O -> p.O)
    const segArea =
      0.5 *
      Math.abs(
        (p.ix * q.iy - q.ix * p.iy) +
          (q.ix * q.oy - q.ox * q.iy) +
          (q.ox * p.oy - p.ox * q.oy) +
          (p.ox * p.iy - p.ix * p.oy)
      );
    cumArea.push(cumArea[k] + segArea);
  }

  const totalArea = cumArea[cumArea.length - 1];
  if (totalArea <= 1e-6) {
    return Array.from({ length: n + 1 }, (_, i) => ({
      frac: i / n,
      angleDeg: Number(((i * 360) / n).toFixed(2)),
    }));
  }

  const anchors: SectorBoundaryAnchor[] = [{ frac: 0, angleDeg: 0 }];

  for (let i = 1; i < n; i++) {
    const target = (i / n) * totalArea;
    let lo = 0;
    let hi = cumArea.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumArea[mid] <= target) lo = mid;
      else hi = mid;
    }

    const a0 = cumArea[lo];
    const a1 = cumArea[lo + 1];
    const t = a1 > a0 + 1e-9 ? (target - a0) / (a1 - a0) : 0;
    const n0 = nodes[lo];
    const n1 = nodes[lo + 1];

    const insideSharpCorner = isSharpRect && Math.abs(n1.frac - n0.frac) < 1e-6;
    if (insideSharpCorner) {
      const normalRad = n0.normalRad * (1 - t) + n1.normalRad * t;
      let ang = ((Math.atan2(n0.y, n0.x) * RAD_TO_DEG) % 360 + 360) % 360;
      for (const cardinal of [90, 180, 270]) {
        if (Math.abs(ang - cardinal) < 0.05) ang = cardinal;
      }
      anchors.push({
        frac: n0.frac,
        angleDeg: Number(ang.toFixed(2)),
        normalRad,
      });
    } else {
      let frac = n0.frac * (1 - t) + n1.frac * t;
      for (const c of [0.25, 0.5, 0.75]) {
        if (Math.abs(frac - c) < 1e-4) frac = c;
      }
      const pt = getInfieldPointAndNormalAtFrac(infield, frac);
      let ang = ((Math.atan2(pt.y, pt.x) * RAD_TO_DEG) % 360 + 360) % 360;
      for (const cardinal of [90, 180, 270]) {
        if (Math.abs(ang - cardinal) < 0.05) ang = cardinal;
      }
      anchors.push({
        frac,
        angleDeg: Number(ang.toFixed(2)),
      });
    }
  }

  anchors.push({ frac: 1, angleDeg: 360 });
  return anchors;
}

/**
 * Computes polar boundary angles [theta_0, theta_1, ..., theta_N] in [0, 360]
 * corresponding to equal-area 90°-normal sector cuts along the tier/infield perimeter.
 */
export function computeInfieldShapeSectorAngles(
  infield: InfieldConfig,
  count: number,
  tier?: StandTier,
  allTiers?: StandTier[]
): number[] {
  const n = Math.max(1, Math.min(72, Math.round(count)));
  if (infield.shape === 'circle') {
    return Array.from({ length: n + 1 }, (_, i) => Number(((i * 360) / n).toFixed(2)));
  }

  const refTier: StandTier = tier
    ? { ...tier, sectorCount: n }
    : {
        id: 'ref-tier',
        level: 1,
        name: 'ref',
        innerOffset: 0,
        radialDepth: 20,
        baseElevation: 1,
        sectorCount: n,
        defaultFillType: 'standard',
        defaultRows: 20,
        defaultRowPitch: 0.85,
        defaultSlopeDeg: 24,
        defaultSeatSpacing: 0.5,
        defaultExitCount: n,
        radialAisleWidth: 1.8,
        defaultGuardrail: {
          frontRailEnabled: true,
          frontRailHeight: 1.1,
          rearWallEnabled: true,
          rearWallHeight: 1.2,
          aisleHandrailEnabled: true,
          material: 'tempered-glass',
        },
        morphMode: 'infield-shape',
        concentricMorph: 1,
        sectors: [],
      };
  return computeEqualAreaSectorBoundaries(infield, refTier, allTiers || [refTier]).map(
    (a) => a.angleDeg
  );
}

/**
 * Returns geometric feature/corner angles in [0, 360] for shapes with straight segments or corners
 * so polygons and 3D meshes never clip sharp vertices.
 */
export function getShapeFeatureAngles(
  infield: InfieldConfig,
  expansionDist = 0
): number[] {
  if (infield.shape === 'circle' || infield.shape === 'ellipse') return [];
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);
  const d = Math.max(0, expansionDist);

  const q1Angles: number[] = [];
  if (infield.shape === 'square') {
    q1Angles.push(45);
    const r = Math.min(infield.cornerRadius || 0, a * 0.45);
    if (r > 0.05) {
      q1Angles.push(Math.atan2(a - r, a + d) * RAD_TO_DEG);
      q1Angles.push(Math.atan2(a + d, a - r) * RAD_TO_DEG);
    }
  } else if (infield.shape === 'rectangle') {
    q1Angles.push(Math.atan2(b, a) * RAD_TO_DEG);
    if (d > 0) q1Angles.push(Math.atan2(b + d, a + d) * RAD_TO_DEG);
  } else {
    // rounded-rect
    const r = Math.max(0, Math.min(infield.cornerRadius, Math.min(a, b) - 0.5));
    q1Angles.push(Math.atan2(b, a) * RAD_TO_DEG);
    if (r > 0.05) {
      q1Angles.push(Math.atan2(b - r, a) * RAD_TO_DEG);
      q1Angles.push(Math.atan2(b, a - r) * RAD_TO_DEG);
    }
    if (d > 0) {
      q1Angles.push(Math.atan2(b + d, a + d) * RAD_TO_DEG);
    }
  }

  const all: number[] = [];
  for (const ang of q1Angles) {
    if (ang > 0.01 && ang < 89.99) {
      all.push(ang, 180 - ang, 180 + ang, 360 - ang);
    }
  }
  return all;
}

/**
 * Returns sorted angle steps between aStart and aEnd, inserting any geometric corner/tangent
 * feature angles strictly within (aStart, aEnd) for sharp CAD/3D precision.
 */
export function getSectorAngleSteps(
  infield: InfieldConfig,
  allTiers: StandTier[],
  tier: StandTier,
  aStart: number,
  aEnd: number,
  minSteps = 12
): number[] {
  const sortedTiers = [...allTiers].sort((a, b) => a.level - b.level);
  const cumDepth = sortedTiers
    .filter((t) => t.level <= tier.level)
    .reduce((acc, t) => acc + (t.level === 1 ? 0 : Math.max(0, t.innerOffset)) + t.radialDepth, 0);

  const rawAngles: number[] = [];
  for (let i = 0; i <= minSteps; i++) {
    rawAngles.push(aStart + ((aEnd - aStart) * i) / minSteps);
  }

  const featureAngles = [
    ...getShapeFeatureAngles(infield, 0),
    ...getShapeFeatureAngles(infield, cumDepth),
  ];
  for (const fa of featureAngles) {
    if (fa > aStart + 0.05 && fa < aEnd - 0.05) {
      rawAngles.push(fa);
    }
  }

  rawAngles.sort((x, y) => x - y);
  // Deduplicate very close angles
  const deduped: number[] = [];
  for (const a of rawAngles) {
    if (deduped.length === 0 || a - deduped[deduped.length - 1] > 0.04) {
      deduped.push(a);
    }
  }
  if (deduped[deduped.length - 1] < aEnd - 1e-4) {
    deduped[deduped.length - 1] = aEnd;
  }
  return deduped;
}

/**
 * Computes the inner and outer radius of a specific StandTier at any polar angle `angleDeg`.
 * Guarantee: Tier 1 (level === 1) inner ring ALWAYS coincides 100% with the Infield outer ring!
 * Supports 2-choice morphMode:
 *  - 'infield-shape': Morphs outer boundary into the true geometric expansion of the infield shape.
 *  - 'concentric-circle': Morphs outer boundary into a concentric circle centered at (0,0).
 */
export function getTierRadiiAtAngle(
  infield: InfieldConfig,
  allTiers: StandTier[],
  targetTier: StandTier,
  angleDeg: number
): { innerRadius: number; outerRadius: number } {
  const infieldR = getInfieldOuterRadiusAtAngle(infield, angleDeg);
  const sortedTiers = [...allTiers].sort((a, b) => a.level - b.level);

  let currentOuterR = infieldR;
  let cumulativeDepth = 0;

  for (const tier of sortedTiers) {
    const isFirstTier = tier.level === 1;
    // Tier 1 inner ring strictly coincides with the infield outer ring
    const tierInnerR = isFirstTier ? infieldR : currentOuterR + Math.max(0, tier.innerOffset);

    cumulativeDepth += (isFirstTier ? 0 : Math.max(0, tier.innerOffset)) + tier.radialDepth;

    const pureShapeOuterR = tierInnerR + tier.radialDepth;
    const morphMode = tier.morphMode || 'concentric-circle';

    let targetOuterR: number;
    let effectiveMorph: number;

    if (morphMode === 'infield-shape') {
      // Mode 2: Morph toward the exact geometric offset/shape of the infield itself
      targetOuterR = getInfieldShapeExpandedRadiusAtAngle(infield, cumulativeDepth, angleDeg);
      effectiveMorph = Math.min(1, Math.max(0, tier.concentricMorph));
    } else {
      // Mode 1: Morph toward a concentric circle centered at (0,0)
      const maxAxisHalf = Math.max(infield.length, infield.width) / 2;
      targetOuterR = maxAxisHalf + cumulativeDepth;
      const rawMorph = Math.min(1, Math.max(0, tier.concentricMorph));
      effectiveMorph = isFirstTier ? rawMorph * 0.35 : rawMorph;
    }

    const blendedOuterR = Math.max(
      tierInnerR + Math.max(2, tier.radialDepth * 0.5),
      pureShapeOuterR * (1 - effectiveMorph) + targetOuterR * effectiveMorph
    );

    if (tier.id === targetTier.id) {
      return {
        innerRadius: Number(tierInnerR.toFixed(3)),
        outerRadius: Number(blendedOuterR.toFixed(3)),
      };
    }

    currentOuterR = blendedOuterR;
  }

  return {
    innerRadius: Number(infieldR.toFixed(3)),
    outerRadius: Number((infieldR + targetTier.radialDepth).toFixed(3)),
  };
}

/**
 * Computes the normal-ray distances (dIn, dOut) along an outward normal ray `P + d * n`
 * leaving the infield edge at 90°, across all tiers cleanly (supporting both 'infield-shape'
 * and 'concentric-circle' morph modes).
 */
export function getTierNormalDistancesAtPoint(
  infield: InfieldConfig,
  allTiers: StandTier[],
  targetTier: StandTier,
  px: number,
  py: number,
  nx: number,
  ny: number,
  isCornerMiter = false
): { dIn: number; dOut: number; miterScale: number } {
  const sortedTiers = [...allTiers].sort((a, b) => a.level - b.level);
  const a = Math.max(10, infield.length / 2);
  const b = Math.max(10, infield.width / 2);
  const maxAxisHalf = Math.max(a, b);
  const maxAxisNorm = Math.max(1e-4, Math.max(Math.abs(nx), Math.abs(ny)));
  const miterScale = isCornerMiter ? 1 / maxAxisNorm : 1;

  let currentOuterD = 0;
  let cumulativeDepth = 0;

  for (const tier of sortedTiers) {
    const isFirstTier = tier.level === 1;
    const tierInnerD = isFirstTier ? 0 : currentOuterD + Math.max(0, tier.innerOffset);
    cumulativeDepth += (isFirstTier ? 0 : Math.max(0, tier.innerOffset)) + tier.radialDepth;

    const pureShapeOuterD = tierInnerD + tier.radialDepth;
    const morphMode = tier.morphMode || 'concentric-circle';

    let targetOuterD: number;
    let effectiveMorph: number;

    if (morphMode === 'infield-shape') {
      effectiveMorph = Math.min(1, Math.max(0, tier.concentricMorph));
      if (infield.shape === 'ellipse') {
        const A = a + cumulativeDepth;
        const B = b + cumulativeDepth;
        const qa = (nx * nx) / (A * A) + (ny * ny) / (B * B);
        const qb = (px * nx) / (A * A) + (py * ny) / (B * B);
        const qc = (px * px) / (A * A) + (py * py) / (B * B) - 1;
        const disc = Math.max(0, qb * qb - qa * qc);
        targetOuterD = qa > 1e-9 ? (-qb + Math.sqrt(disc)) / qa : cumulativeDepth;
      } else if (isCornerMiter) {
        // Sharp corner (r=0) mitered to meet expanded rectangle sides cleanly
        targetOuterD = cumulativeDepth * miterScale;
      } else {
        targetOuterD = cumulativeDepth;
      }
    } else {
      const targetCircleR = maxAxisHalf + cumulativeDepth;
      const pDotN = px * nx + py * ny;
      const pSq = px * px + py * py;
      const disc = Math.max(0, pDotN * pDotN + targetCircleR * targetCircleR - pSq);
      targetOuterD = Math.max(tierInnerD + 2, -pDotN + Math.sqrt(disc));
      const rawMorph = Math.min(1, Math.max(0, tier.concentricMorph));
      effectiveMorph = isFirstTier ? rawMorph * 0.35 : rawMorph;
    }

    const blendedOuterD = Math.max(
      tierInnerD + Math.max(2, tier.radialDepth * 0.5),
      pureShapeOuterD * (1 - effectiveMorph) + targetOuterD * effectiveMorph
    );

    if (tier.id === targetTier.id) {
      return {
        dIn: Number(tierInnerD.toFixed(4)),
        dOut: Number(blendedOuterD.toFixed(4)),
        miterScale: morphMode === 'infield-shape' && isCornerMiter ? miterScale : 1,
      };
    }

    currentOuterD = blendedOuterD;
  }

  return { dIn: 0, dOut: targetTier.radialDepth, miterScale: 1 };
}

/**
 * Generates exact 90°-perpendicular-to-infield-edge extrusion samples across a sector's
 * perimeter range `[startFrac, endFrac]`, cleanly resolving smooth corner transitions
 * and sharp rectangle/square miter corners.
 */
export function getSectorNormalSamples(
  infield: InfieldConfig,
  allTiers: StandTier[],
  tier: StandTier,
  sectorOrRange: StandSector | { startAngleDeg: number; endAngleDeg: number },
  minSteps = 12
): SectorNormalSample[] {
  const isFullSector = 'id' in sectorOrRange;
  const sector = isFullSector ? (sectorOrRange as StandSector) : undefined;
  const { startFrac, endFrac } = getSectorPerimFracs(
    infield,
    tier,
    sector,
    sectorOrRange.startAngleDeg,
    sectorOrRange.endAngleDeg
  );

  const totalPerim = getInfieldPerimeterMeters(infield);
  const customOffset = sector?.customRadialOffset || 0;
  const customDepth = sector?.customRadialDepth;

  const makeSample = (
    px: number,
    py: number,
    nx: number,
    ny: number,
    isCornerMiter = false
  ): SectorNormalSample => {
    const { dIn, dOut, miterScale } = getTierNormalDistancesAtPoint(
      infield,
      allTiers,
      tier,
      px,
      py,
      nx,
      ny,
      isCornerMiter
    );
    const effScale =
      isCornerMiter &&
      (tier.morphMode || 'concentric-circle') === 'infield-shape' &&
      tier.concentricMorph > 0.5
        ? miterScale
        : 1;
    const effDIn = dIn + customOffset * effScale;
    const effDOut = customDepth ? effDIn + customDepth * effScale : dOut;
    const perpRun = Math.max(
      1,
      effScale > 1 ? (effDOut - effDIn) / effScale : effDOut - effDIn
    );
    return {
      baseX: px,
      baseY: py,
      nx,
      ny,
      dIn: effDIn,
      dOut: effDOut,
      inX: Number((px + effDIn * nx).toFixed(2)),
      inY: Number((py + effDIn * ny).toFixed(2)),
      outX: Number((px + effDOut * nx).toFixed(2)),
      outY: Number((py + effDOut * ny).toFixed(2)),
      perpRun,
    };
  };

  // Start & end boundary points (supporting explicit corner normal rays if cut splits a sharp corner)
  const rawStart = getInfieldPointAndNormalAtFrac(infield, startFrac, 'start');
  const pStart: InfieldPerimeterPoint =
    sector?.startNormalRad !== undefined
      ? {
          x: rawStart.x,
          y: rawStart.y,
          nx: Math.cos(sector.startNormalRad),
          ny: Math.sin(sector.startNormalRad),
        }
      : rawStart;
  const rawEnd = getInfieldPointAndNormalAtFrac(infield, endFrac, 'end');
  const pEnd: InfieldPerimeterPoint =
    sector?.endNormalRad !== undefined
      ? {
          x: rawEnd.x,
          y: rawEnd.y,
          nx: Math.cos(sector.endNormalRad),
          ny: Math.sin(sector.endNormalRad),
        }
      : rawEnd;

  // Compute constant half-gap (in meters) shifted strictly parallel to each seam's 90° normal ray
  const startBaseDist = getTierNormalDistancesAtPoint(
    infield,
    allTiers,
    tier,
    pStart.x,
    pStart.y,
    pStart.nx,
    pStart.ny,
    sector?.startNormalRad !== undefined
  );
  const midApproxD = (startBaseDist.dIn + startBaseDist.dOut) / 2;
  const rawInnerChord = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
  const midApproxChord = Math.hypot(
    pEnd.x + midApproxD * pEnd.nx - (pStart.x + midApproxD * pStart.nx),
    pEnd.y + midApproxD * pEnd.ny - (pStart.y + midApproxD * pStart.ny)
  );
  const sectorRefWidth = Math.max(
    0.5,
    (endFrac - startFrac) * totalPerim,
    rawInnerChord,
    midApproxChord
  );
  const gapHalfM = Math.min(0.3, sectorRefWidth * 0.12);

  const tStartX = -pStart.ny;
  const tStartY = pStart.nx;
  const startSample = makeSample(
    pStart.x + gapHalfM * tStartX,
    pStart.y + gapHalfM * tStartY,
    pStart.nx,
    pStart.ny,
    sector?.startNormalRad !== undefined
  );

  const tEndX = -pEnd.ny;
  const tEndY = pEnd.nx;
  const endSample = makeSample(
    pEnd.x - gapHalfM * tEndX,
    pEnd.y - gapHalfM * tEndY,
    pEnd.nx,
    pEnd.ny,
    sector?.endNormalRad !== undefined
  );

  const isInsideParallelSeamWalls = (sp: SectorNormalSample): boolean => {
    const pastStartIn =
      (sp.inX - startSample.inX) * tStartX + (sp.inY - startSample.inY) * tStartY;
    const beforeEndIn =
      (endSample.inX - sp.inX) * tEndX + (endSample.inY - sp.inY) * tEndY;
    const pastStartOut =
      (sp.outX - startSample.outX) * tStartX + (sp.outY - startSample.outY) * tStartY;
    const beforeEndOut =
      (endSample.outX - sp.outX) * tEndX + (endSample.outY - sp.outY) * tEndY;
    return (
      pastStartIn > 0.04 &&
      beforeEndIn > 0.04 &&
      pastStartOut > 0.04 &&
      beforeEndOut > 0.04
    );
  };

  const samples: SectorNormalSample[] = [startSample];

  // Special case: sector lies purely inside a single sharp rectangle/square corner fan
  if (
    Math.abs(endFrac - startFrac) < 1e-5 &&
    sector?.startNormalRad !== undefined &&
    sector?.endNormalRad !== undefined &&
    sector.endNormalRad > sector.startNormalRad
  ) {
    const intSteps = Math.max(3, minSteps);
    for (let i = 1; i < intSteps; i++) {
      const rad =
        sector.startNormalRad +
        ((sector.endNormalRad - sector.startNormalRad) * i) / intSteps;
      const sp = makeSample(pStart.x, pStart.y, Math.cos(rad), Math.sin(rad), true);
      if (isInsideParallelSeamWalls(sp)) {
        samples.push(sp);
      }
    }
    samples.push(endSample);
    return samples;
  }

  // Interior fractions strictly inside the trimmed parallel corridor walls
  const trimFrac = (gapHalfM + 0.15) / Math.max(40, totalPerim);
  const uIntA = sector?.startNormalRad !== undefined ? startFrac + 1e-4 : startFrac + trimFrac;
  const uIntB = sector?.endNormalRad !== undefined ? endFrac - 1e-4 : endFrac - trimFrac;

  if (uIntB > uIntA + 1e-4) {
    if (infield.shape === 'circle' || infield.shape === 'ellipse') {
      const intSteps = Math.max(2, minSteps - 2);
      for (let i = 1; i < intSteps; i++) {
        const u = uIntA + ((uIntB - uIntA) * i) / intSteps;
        const pt = getInfieldPointAndNormalAtFrac(infield, u);
        const sp = makeSample(pt.x, pt.y, pt.nx, pt.ny, false);
        if (isInsideParallelSeamWalls(sp)) {
          samples.push(sp);
        }
      }
      samples.push(endSample);
      return samples;
    }

    const { a, b, rEff, vHalf, hSpan, vSpan, qArc, totalPerimeter } =
      getNormalizedShapeBox(infield);
    const L = totalPerimeter || 1;
    const s1 = vHalf;
    const s2 = s1 + qArc;
    const s3 = s2 + hSpan;
    const s4 = s3 + qArc;
    const s5 = s4 + vSpan;
    const s6 = s5 + qArc;
    const s7 = s6 + hSpan;
    const s8 = s7 + qArc;

    interface SharpCornerDef {
      u: number;
      x: number;
      y: number;
      preNx: number;
      preNy: number;
      postNx: number;
      postNy: number;
      preRad: number;
      postRad: number;
    }

    const sharpCorners: SharpCornerDef[] =
      rEff === 0
        ? [
            { u: s1 / L, x: a, y: b, preNx: 1, preNy: 0, postNx: 0, postNy: 1, preRad: 0, postRad: Math.PI / 2 },
            { u: s3 / L, x: -a, y: b, preNx: 0, preNy: 1, postNx: -1, postNy: 0, preRad: Math.PI / 2, postRad: Math.PI },
            { u: s5 / L, x: -a, y: -b, preNx: -1, preNy: 0, postNx: 0, postNy: -1, preRad: Math.PI, postRad: 1.5 * Math.PI },
            { u: s7 / L, x: a, y: -b, preNx: 0, preNy: -1, postNx: 1, postNy: 0, preRad: 1.5 * Math.PI, postRad: 2 * Math.PI },
          ]
        : [];

    // If sector starts inside a sharp corner fan, complete the remainder of that corner first
    if (rEff === 0 && sector?.startNormalRad !== undefined) {
      const startCorner = sharpCorners.find((c) => Math.abs(c.u - startFrac) < 1e-4);
      if (startCorner && startCorner.postRad > sector.startNormalRad + 1e-4) {
        const cornerSub = 4;
        for (let k = 1; k < cornerSub; k++) {
          const rad =
            sector.startNormalRad +
            ((startCorner.postRad - sector.startNormalRad) * k) / cornerSub;
          const mit = makeSample(
            startCorner.x,
            startCorner.y,
            Math.cos(rad),
            Math.sin(rad),
            true
          );
          if (isInsideParallelSeamWalls(mit)) samples.push(mit);
        }
        const post = makeSample(
          startCorner.x,
          startCorner.y,
          startCorner.postNx,
          startCorner.postNy,
          false
        );
        if (isInsideParallelSeamWalls(post)) samples.push(post);
      }
    }

    const transitionUs =
      rEff > 0
        ? [s1 / L, s2 / L, s3 / L, s4 / L, s5 / L, s6 / L, s7 / L, s8 / L]
        : sharpCorners.map((c) => c.u);

    const rawUs: number[] = [];
    const intSteps = Math.max(2, minSteps - 2);
    for (let i = 1; i < intSteps; i++) {
      rawUs.push(uIntA + ((uIntB - uIntA) * i) / intSteps);
    }
    for (const tu of transitionUs) {
      if (tu > startFrac + trimFrac * 0.5 && tu < endFrac - trimFrac * 0.5) {
        rawUs.push(tu);
      }
    }
    rawUs.sort((x, y) => x - y);

    const dedupedUs: number[] = [];
    for (const u of rawUs) {
      const nearCorner = sharpCorners.find((c) => Math.abs(c.u - u) < 1e-4);
      const val = nearCorner ? nearCorner.u : u;
      if (dedupedUs.length === 0 || val - dedupedUs[dedupedUs.length - 1] > 1e-4) {
        dedupedUs.push(val);
      }
    }

    for (const u of dedupedUs) {
      const corner = sharpCorners.find(
        (c) =>
          Math.abs(c.u - u) < 1e-4 &&
          u > startFrac + trimFrac * 0.5 &&
          u < endFrac - trimFrac * 0.5
      );
      if (corner) {
        const pre = makeSample(corner.x, corner.y, corner.preNx, corner.preNy, false);
        if (isInsideParallelSeamWalls(pre)) samples.push(pre);
        const isPureShape =
          (tier.morphMode || 'concentric-circle') === 'infield-shape' &&
          tier.concentricMorph >= 0.95;
        const alphas = isPureShape
          ? [Math.PI / 4]
          : [Math.PI / 8, Math.PI / 4, (3 * Math.PI) / 8];
        for (const alpha of alphas) {
          const nx = corner.preNx * Math.cos(alpha) + corner.postNx * Math.sin(alpha);
          const ny = corner.preNy * Math.cos(alpha) + corner.postNy * Math.sin(alpha);
          const mit = makeSample(corner.x, corner.y, nx, ny, true);
          if (isInsideParallelSeamWalls(mit)) samples.push(mit);
        }
        const post = makeSample(corner.x, corner.y, corner.postNx, corner.postNy, false);
        if (isInsideParallelSeamWalls(post)) samples.push(post);
      } else {
        const pt = getInfieldPointAndNormalAtFrac(infield, u);
        const sp = makeSample(pt.x, pt.y, pt.nx, pt.ny, false);
        if (isInsideParallelSeamWalls(sp)) {
          samples.push(sp);
        }
      }
    }

    // If sector ends inside a sharp corner fan, enter the start of that corner before endSample
    if (rEff === 0 && sector?.endNormalRad !== undefined) {
      const endCorner = sharpCorners.find((c) => Math.abs(c.u - endFrac) < 1e-4);
      if (endCorner && sector.endNormalRad > endCorner.preRad + 1e-4) {
        const pre = makeSample(
          endCorner.x,
          endCorner.y,
          endCorner.preNx,
          endCorner.preNy,
          false
        );
        if (isInsideParallelSeamWalls(pre)) samples.push(pre);
        const cornerSub = 4;
        for (let k = 1; k < cornerSub; k++) {
          const rad =
            endCorner.preRad + ((sector.endNormalRad - endCorner.preRad) * k) / cornerSub;
          const mit = makeSample(
            endCorner.x,
            endCorner.y,
            Math.cos(rad),
            Math.sin(rad),
            true
          );
          if (isInsideParallelSeamWalls(mit)) samples.push(mit);
        }
      }
    }
  }

  samples.push(endSample);
  return samples;
}

/**
 * Generates or synchronizes the radial sectors of a StandTier whenever `sectorCount`,
 * `infield` shape, or tier dimensions change, preserving existing sector overrides where possible.
 * Slices sectors strictly at 90° perpendicular to the infield edge while balancing block areas
 * across straight segments and curved/corner sections.
 */
export function syncTierSectors(
  tier: StandTier,
  infield?: InfieldConfig,
  allTiers?: StandTier[]
): StandSector[] {
  const count = Math.max(1, Math.min(72, Math.round(tier.sectorCount)));
  const boundaries: SectorBoundaryAnchor[] = infield
    ? computeEqualAreaSectorBoundaries(infield, tier, allTiers || [tier])
    : Array.from({ length: count + 1 }, (_, i) => ({
        frac: i / count,
        angleDeg: Number(((i * 360) / count).toFixed(2)),
      }));

  const nextSectors: StandSector[] = [];

  for (let i = 0; i < count; i++) {
    const startAnchor = boundaries[i];
    const endAnchor = boundaries[i + 1];
    const startAngleDeg = startAnchor.angleDeg;
    const endAngleDeg = endAnchor.angleDeg;
    const startPerimFrac = startAnchor.frac;
    const endPerimFrac = endAnchor.frac;
    const startNormalRad = startAnchor.normalRad;
    const endNormalRad = endAnchor.normalRad;
    const existing = tier.sectors[i];

    const defaultRiser = Number(
      (tier.defaultRowPitch * Math.tan(tier.defaultSlopeDeg * DEG_TO_RAD)).toFixed(3)
    );

    const hasExit =
      tier.defaultExitCount > 0 &&
      i % Math.max(1, Math.round(count / Math.min(count, tier.defaultExitCount))) === 0;

    if (existing) {
      const useCustom = existing.useCustomOverrides;
      const rows = existing.rows !== undefined ? existing.rows : tier.defaultRows;
      const rowPitch = existing.rowPitch !== undefined ? existing.rowPitch : tier.defaultRowPitch;
      const slopeDeg = existing.slopeDeg !== undefined ? existing.slopeDeg : tier.defaultSlopeDeg;
      const riserHeight = Number((rowPitch * Math.tan(slopeDeg * DEG_TO_RAD)).toFixed(3));

      nextSectors.push({
        ...existing,
        sectorIndex: i,
        name: existing.name || `${tier.level}F-${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`,
        startAngleDeg,
        endAngleDeg,
        startPerimFrac,
        endPerimFrac,
        startNormalRad,
        endNormalRad,
        rows,
        rowPitch,
        slopeDeg,
        riserHeight,
        seatSpacing: existing.seatSpacing !== undefined ? existing.seatSpacing : tier.defaultSeatSpacing,
        guardrail: useCustom ? existing.guardrail : { ...tier.defaultGuardrail },
      });
    } else {
      const sectorCode = `${tier.level}F-${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`;
      nextSectors.push({
        id: `${tier.id}-sec-${i + 1}`,
        sectorIndex: i,
        name: sectorCode,
        startAngleDeg,
        endAngleDeg,
        startPerimFrac,
        endPerimFrac,
        startNormalRad,
        endNormalRad,
        fillType: tier.defaultFillType,
        useCustomOverrides: false,
        rows: tier.defaultRows,
        rowPitch: tier.defaultRowPitch,
        riserHeight: defaultRiser,
        slopeDeg: tier.defaultSlopeDeg,
        seatSpacing: tier.defaultSeatSpacing,
        vomitory: {
          id: `${tier.id}-vom-${i + 1}`,
          position: hasExit ? 'center' : 'none',
          width: 3.2,
          rowSpan: Math.min(6, Math.max(2, Math.floor(tier.defaultRows * 0.4))),
          startRow: Math.max(1, Math.floor(tier.defaultRows * 0.25)),
        },
        guardrail: { ...tier.defaultGuardrail },
        vipBoxRooms: tier.defaultFillType === 'vip-box' ? 3 : 0,
      });
    }
  }

  return nextSectors;
}

/**
 * Computes the exact 2D polygon area (in square meters) of a StandSector.
 */
export function calculateSectorPolygonArea(
  infield: InfieldConfig,
  allTiers: StandTier[],
  tier: StandTier,
  sector: StandSector
): number {
  const pts = buildSectorAnnulusPoints(
    infield,
    allTiers,
    tier,
    sector.startAngleDeg,
    sector.endAngleDeg,
    16,
    sector
  );
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Number((Math.abs(sum) / 2).toFixed(2));
}

/**
 * Calculates the seating capacity of an InfieldSeatModule (either flat or sloped bleacher).
 */
export function calculateInfieldModuleCapacity(mod: InfieldSeatModule): number {
  const effectiveWidth = Math.max(1, mod.width - mod.aisleWidth);
  const seatsPerRow = Math.max(1, Math.floor(effectiveWidth / Math.max(0.42, mod.seatSpacing)));
  const maxRowsByDepth = Math.max(1, Math.floor(mod.depth / Math.max(0.65, mod.rowPitch)));
  const actualRows = Math.min(mod.rows, maxRowsByDepth);
  return seatsPerRow * actualRows;
}

/**
 * Calculates the seating capacity of a single 90°-extruded StandSector.
 */
export function calculateSectorCapacity(
  infield: InfieldConfig,
  allTiers: StandTier[],
  tier: StandTier,
  sector: StandSector
): number {
  // If sector is deleted or converted into an open void, major vehicular tunnel, or solid wall, it has 0 regular seating capacity
  if (
    sector.isDeleted ||
    sector.fillType === 'empty-void' ||
    sector.fillType === 'tunnel-exit' ||
    sector.fillType === 'solid-wall'
  ) {
    return 0;
  }

  if (sector.fillType === 'vip-box') {
    const rooms = Math.max(1, sector.vipBoxRooms || 3);
    const seatsPerRoom = Math.max(8, Math.round((sector.rows * 6) / Math.max(0.55, sector.seatSpacing)));
    return rooms * seatsPerRoom;
  }

  const { startFrac, endFrac } = getSectorPerimFracs(infield, tier, sector);
  const midFrac = (startFrac + endFrac) / 2;
  const rawStart = getInfieldPointAndNormalAtFrac(infield, startFrac, 'start');
  const pStart: InfieldPerimeterPoint =
    sector.startNormalRad !== undefined
      ? {
          x: rawStart.x,
          y: rawStart.y,
          nx: Math.cos(sector.startNormalRad),
          ny: Math.sin(sector.startNormalRad),
        }
      : rawStart;
  const rawEnd = getInfieldPointAndNormalAtFrac(infield, endFrac, 'end');
  const pEnd: InfieldPerimeterPoint =
    sector.endNormalRad !== undefined
      ? {
          x: rawEnd.x,
          y: rawEnd.y,
          nx: Math.cos(sector.endNormalRad),
          ny: Math.sin(sector.endNormalRad),
        }
      : rawEnd;
  const pMid: InfieldPerimeterPoint =
    Math.abs(endFrac - startFrac) < 1e-5 &&
    sector.startNormalRad !== undefined &&
    sector.endNormalRad !== undefined
      ? {
          x: rawStart.x,
          y: rawStart.y,
          nx: Math.cos((sector.startNormalRad + sector.endNormalRad) / 2),
          ny: Math.sin((sector.startNormalRad + sector.endNormalRad) / 2),
        }
      : getInfieldPointAndNormalAtFrac(infield, midFrac);

  const { dIn, dOut } = getTierNormalDistancesAtPoint(
    infield,
    allTiers,
    tier,
    pMid.x,
    pMid.y,
    pMid.nx,
    pMid.ny
  );
  const effDIn = dIn + (sector.customRadialOffset || 0);
  const effDOut = sector.customRadialDepth ? effDIn + sector.customRadialDepth : dOut;

  // Inner frontage width along the infield perimeter plus Steiner normal turning expansion
  const totalPerim = getInfieldPerimeterMeters(infield);
  const innerWidth = Math.max(0, (endFrac - startFrac) * totalPerim);
  const phiStart = Math.atan2(pStart.ny, pStart.nx);
  const phiEnd = Math.atan2(pEnd.ny, pEnd.nx);
  let deltaPhi = phiEnd - phiStart;
  if (deltaPhi < 0) deltaPhi += 2 * Math.PI;
  if (deltaPhi > Math.PI * 1.5) deltaPhi = Math.max(0.01, (sector.endAngleDeg - sector.startAngleDeg) * DEG_TO_RAD);

  let totalSeats = 0;
  const rows = Math.max(1, sector.rows);
  const depthStep = Math.max(0.1, (effDOut - effDIn) / rows);

  for (let r = 0; r < rows; r++) {
    const rowD = effDIn + (r + 0.5) * depthStep;
    const rawRowWidth = innerWidth + deltaPhi * rowD;
    const usableArcLength = Math.max(0, rawRowWidth - tier.radialAisleWidth);

    let vomitoryDeduction = 0;
    if (
      sector.vomitory &&
      sector.vomitory.enabled !== false &&
      sector.vomitory.position !== 'none' &&
      r + 1 >= sector.vomitory.startRow &&
      r + 1 < sector.vomitory.startRow + (sector.vomitory.rowSpan || 3)
    ) {
      const multiplier = sector.vomitory.position === 'dual' ? 2 : 1;
      vomitoryDeduction = sector.vomitory.width * multiplier;
    }

    const netArcLength = Math.max(0, usableArcLength - vomitoryDeduction);
    const rowSeats = Math.floor(netArcLength / Math.max(0.45, sector.seatSpacing));
    totalSeats += rowSeats;
  }

  return totalSeats;
}

/**
 * Computes the complete Cross-Section profile and Architectural Sightline C-Values
 * along the cutting plane at `schema.sightlineConfig.sectionAngleDeg`.
 *
 * Standard Architectural Sightline C-Value formula:
 *   C = D * (N + R) / (D + T) - R
 * where:
 *   D = horizontal distance from focal point to row (i-1)
 *   T = horizontal tread depth (rowPitch) between row (i-1) and row i
 *   R = vertical height of row (i-1) eye above the focal point
 *   N = vertical riser height between row (i-1) and row i
 */
export function calculateCrossSectionAndSightlines(schema: StadiumSchema): {
  focalRadiusM: number;
  rows: SightlineRowResult[];
  idealParabolicCurve: Array<{ radiusM: number; elevationM: number }>;
} {
  const { infield, standTiers, sightlineConfig } = schema;
  const angleDeg = ((sightlineConfig.sectionAngleDeg % 360) + 360) % 360;
  const infieldOuterR = getInfieldOuterRadiusAtAngle(infield, angleDeg);

  // Focal point distance from stadium center (0,0) along the section angle
  const pitchEdgeApprox = Math.max(8, infieldOuterR - infield.safetyMargin);
  const focalRadiusM = Number(
    Math.max(5, pitchEdgeApprox - sightlineConfig.focalPointOffsetFromPitchEdge).toFixed(2)
  );

  const sortedTiers = [...standTiers].sort((a, b) => a.level - b.level);
  const results: SightlineRowResult[] = [];

  for (const tier of sortedTiers) {
    // Find the sector intersected by angleDeg
    const matchedSector =
      tier.sectors.find(
        (s) => angleDeg >= s.startAngleDeg && angleDeg < s.endAngleDeg
      ) || tier.sectors[0];

    if (!matchedSector || matchedSector.isDeleted || matchedSector.fillType === 'empty-void') continue;

    const { innerRadius, outerRadius } = getTierRadiiAtAngle(infield, sortedTiers, tier, angleDeg);
    const effInnerR = innerRadius + (matchedSector.customRadialOffset || 0);
    const effOuterR = matchedSector.customRadialDepth
      ? effInnerR + matchedSector.customRadialDepth
      : outerRadius;
    const sectorRadialDepth = Math.max(2, effOuterR - effInnerR);

    const rowCount = Math.max(1, matchedSector.rows);
    const treadDepth = matchedSector.customRadialDepth
      ? Number((sectorRadialDepth / rowCount).toFixed(3))
      : Math.max(0.65, matchedSector.rowPitch);
    const slopeRad = matchedSector.slopeDeg * DEG_TO_RAD;
    const riserHeight = Number((treadDepth * Math.tan(slopeRad)).toFixed(4));

    for (let r = 1; r <= rowCount; r++) {
      const rowRadiusM = effInnerR + (r - 1) * treadDepth;
      const distToFocalM = Math.max(1.5, rowRadiusM - focalRadiusM);
      const treadElevationM = tier.baseElevation + (r - 1) * riserHeight;
      const eyeElevationM = treadElevationM + sightlineConfig.spectatorEyeHeight;

      // Sightline C-Value calculation relative to the row directly in front
      const prevDistToFocalM = Math.max(0.8, distToFocalM - treadDepth);
      const prevEyeElevationM =
        r === 1
          ? Math.max(0.8, eyeElevationM - riserHeight)
          : eyeElevationM - riserHeight;

      // C = D * (N + R) / (D + T) - R  (converted to millimeters)
      const cValueMeters =
        (prevDistToFocalM * (riserHeight + prevEyeElevationM)) /
          (prevDistToFocalM + treadDepth) -
        prevEyeElevationM;
      const cValueMm = Number((cValueMeters * 1000).toFixed(1));

      const sightlineAngleDeg = Number(
        (Math.atan2(eyeElevationM, distToFocalM) * RAD_TO_DEG).toFixed(1)
      );

      let compliance: SightlineRowResult['compliance'] = 'optimal';
      if (cValueMm >= 120) {
        compliance = 'optimal';
      } else if (cValueMm >= sightlineConfig.targetCValueMm) {
        compliance = 'acceptable';
      } else if (cValueMm >= 60) {
        compliance = 'marginal';
      } else {
        compliance = 'obstructed';
      }

      results.push({
        tierId: tier.id,
        tierLevel: tier.level,
        tierName: tier.name,
        sectorId: matchedSector.id,
        fillType: matchedSector.fillType,
        rowIndex: r,
        radiusM: Number(rowRadiusM.toFixed(2)),
        horizontalDistToFocalM: Number(distToFocalM.toFixed(2)),
        treadElevationM: Number(treadElevationM.toFixed(2)),
        eyeElevationM: Number(eyeElevationM.toFixed(2)),
        riserHeightM: Number(riserHeight.toFixed(3)),
        treadDepthM: Number(treadDepth.toFixed(2)),
        cValueMm,
        sightlineAngleDeg,
        compliance,
      });
    }
  }

  // Generate the theoretical Ideal Iso-C Parabolic Sightline Curve for comparison
  const idealParabolicCurve: Array<{ radiusM: number; elevationM: number }> = [];
  if (results.length > 0) {
    const firstRow = results[0];
    const lastRow = results[results.length - 1];
    const targetCM = sightlineConfig.targetCValueMm / 1000;
    const avgTread = 0.85;

    let currD = Math.max(2, firstRow.horizontalDistToFocalM);
    let currEyeZ = firstRow.eyeElevationM;
    const maxD = lastRow.horizontalDistToFocalM + 4;

    while (currD <= maxD) {
      idealParabolicCurve.push({
        radiusM: Number((focalRadiusM + currD).toFixed(2)),
        elevationM: Number(Math.max(0, currEyeZ - sightlineConfig.spectatorEyeHeight).toFixed(2)),
      });
      // Next riser N required to maintain constant C-value targetCM:
      // N = (currEyeZ + targetCM) * (avgTread / currD) + targetCM
      const requiredN = (currEyeZ + targetCM) * (avgTread / currD) + targetCM;
      currEyeZ += requiredN;
      currD += avgTread;
    }
  }

  return {
    focalRadiusM,
    rows: results,
    idealParabolicCurve,
  };
}

/**
 * Computes overall stadium capacity, footprint dimensions, VIP metrics, and sightline KPIs.
 */
export function calculateEngineeringSummary(schema: StadiumSchema): EngineeringSummary {
  let infieldFlatCapacity = 0;
  let infieldSlopedCapacity = 0;

  for (const mod of schema.infieldModules) {
    const cap = calculateInfieldModuleCapacity(mod);
    if (mod.type === 'sloped') {
      infieldSlopedCapacity += cap;
    } else {
      infieldFlatCapacity += cap;
    }
  }

  let standardStandCapacity = 0;
  let vipBoxCapacity = 0;
  let totalVipRooms = 0;
  let totalSafetyExits = 0;

  for (const tier of schema.standTiers) {
    for (const sector of tier.sectors) {
      const cap = calculateSectorCapacity(schema.infield, schema.standTiers, tier, sector);
      if (sector.fillType === 'vip-box') {
        vipBoxCapacity += cap;
        totalVipRooms += sector.vipBoxRooms || 3;
      } else {
        standardStandCapacity += cap;
      }
      if (sector.vomitory && sector.vomitory.enabled !== false) {
        if (sector.vomitory.position === 'dual') {
          totalSafetyExits += 2;
        } else if (sector.vomitory.position !== 'none') {
          totalSafetyExits += 1;
        }
      }
    }
  }

  const totalCapacity =
    infieldFlatCapacity + infieldSlopedCapacity + standardStandCapacity + vipBoxCapacity;

  // Compute outer footprint along X (0°) and Y (90°)
  let maxRadiusX = getInfieldOuterRadiusAtAngle(schema.infield, 0);
  let maxRadiusY = getInfieldOuterRadiusAtAngle(schema.infield, 90);

  for (const tier of schema.standTiers) {
    const rx = getTierRadiiAtAngle(schema.infield, schema.standTiers, tier, 0).outerRadius;
    const ry = getTierRadiiAtAngle(schema.infield, schema.standTiers, tier, 90).outerRadius;
    if (rx > maxRadiusX) maxRadiusX = rx;
    if (ry > maxRadiusY) maxRadiusY = ry;
  }

  const { rows: sightlineRows } = calculateCrossSectionAndSightlines(schema);
  let maxBowlElevationM = 0;
  let minCValueMm = sightlineRows.length > 0 ? Infinity : 0;
  let sumCValueMm = 0;
  let compliantCount = 0;

  for (const row of sightlineRows) {
    if (row.treadElevationM > maxBowlElevationM) {
      maxBowlElevationM = row.treadElevationM;
    }
    if (row.cValueMm < minCValueMm) {
      minCValueMm = row.cValueMm;
    }
    sumCValueMm += row.cValueMm;
    if (row.cValueMm >= schema.sightlineConfig.targetCValueMm) {
      compliantCount++;
    }
  }

  const avgCValueMm =
    sightlineRows.length > 0 ? Number((sumCValueMm / sightlineRows.length).toFixed(1)) : 0;
  const cValueComplianceRate =
    sightlineRows.length > 0
      ? Number(((compliantCount / sightlineRows.length) * 100).toFixed(1))
      : 100;

  return {
    totalCapacity,
    infieldFlatCapacity,
    infieldSlopedCapacity,
    standardStandCapacity,
    vipBoxCapacity,
    totalVipRooms,
    totalSafetyExits,
    outermostFootprintLengthM: Number((maxRadiusX * 2).toFixed(1)),
    outermostFootprintWidthM: Number((maxRadiusY * 2).toFixed(1)),
    maxBowlElevationM: Number(maxBowlElevationM.toFixed(1)),
    minCValueMm: minCValueMm === Infinity ? 0 : minCValueMm,
    avgCValueMm,
    cValueComplianceRate,
  };
}

/**
 * Generates an SVG polygon point array for a StandSector extruded strictly at 90° perpendicular
 * to the infield edge.
 */
export function buildSectorAnnulusPoints(
  infield: InfieldConfig,
  allTiers: StandTier[],
  tier: StandTier,
  startAngleDeg: number,
  endAngleDeg: number,
  steps = 12,
  sector?: StandSector
): Array<{ x: number; y: number }> {
  const samples = getSectorNormalSamples(
    infield,
    allTiers,
    tier,
    sector || { startAngleDeg, endAngleDeg },
    steps
  );
  const pts: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < samples.length; i++) {
    pts.push({ x: samples[i].outX, y: samples[i].outY });
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    pts.push({ x: samples[i].inX, y: samples[i].inY });
  }

  return pts;
}

/**
 * Generates a closed loop of points representing the outer perimeter of the Infield.
 */
export function buildInfieldPerimeterPoints(
  infield: InfieldConfig,
  steps = 96
): Array<{ x: number; y: number }> {
  const rawAngles: number[] = [];
  for (let i = 0; i < steps; i++) {
    rawAngles.push((i / steps) * 360);
  }
  for (const fa of getShapeFeatureAngles(infield, 0)) {
    if (fa > 0 && fa < 360) rawAngles.push(fa);
  }
  rawAngles.sort((a, b) => a - b);

  const pts: Array<{ x: number; y: number }> = [];
  let prevAng = -999;
  for (const ang of rawAngles) {
    if (ang - prevAng < 0.05) continue;
    prevAng = ang;
    const r = getInfieldOuterRadiusAtAngle(infield, ang);
    const rad = ang * DEG_TO_RAD;
    pts.push({
      x: Number((r * Math.cos(rad)).toFixed(2)),
      y: Number((r * Math.sin(rad)).toFixed(2)),
    });
  }
  return pts;
}

/**
 * Generates a standard ASCII AutoCAD DXF (Drawing Interchange Format) file from the StadiumSchema
 * with dedicated engineering layers: INFIELD, PITCH, INFIELD_SEATS, TIER_1..N, VIP_BOXES, VOMITORIES.
 */
export function generateStadiumDXF(schema: StadiumSchema): string {
  const lines: string[] = [];
  const pushPair = (code: number, value: string | number) => {
    lines.push(String(code));
    lines.push(String(value));
  };

  // HEADER SECTION
  pushPair(0, 'SECTION');
  pushPair(2, 'HEADER');
  pushPair(9, '$ACADVER');
  pushPair(1, 'AC1009'); // AutoCAD R12 DXF for maximum universal CAD compatibility
  pushPair(9, '$INSUNITS');
  pushPair(70, 6); // 6 = Meters
  pushPair(0, 'ENDSEC');

  // ENTITIES SECTION
  pushPair(0, 'SECTION');
  pushPair(2, 'ENTITIES');

  const addClosedPolyline = (layer: string, color: number, pts: Array<{ x: number; y: number }>) => {
    if (pts.length < 2) return;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      pushPair(0, 'LINE');
      pushPair(8, layer);
      pushPair(62, color);
      pushPair(10, p1.x.toFixed(3));
      pushPair(20, (-p1.y).toFixed(3));
      pushPair(30, '0.0');
      pushPair(11, p2.x.toFixed(3));
      pushPair(21, (-p2.y).toFixed(3));
      pushPair(31, '0.0');
    }
  };

  // 1. Infield Outer Perimeter
  const infieldPts = buildInfieldPerimeterPoints(schema.infield, 72);
  addClosedPolyline('INFIELD_BOUNDARY', 3, infieldPts); // Green

  // 2. Pitch / Court Inner Boundary (Oriented by pitchOrientationDeg)
  if (schema.infield.coreMode !== 'stage') {
    const px = schema.infield.pitchLength / 2;
    const py = schema.infield.pitchWidth / 2;
    const pOriRad = (schema.infield.pitchOrientationDeg || 0) * DEG_TO_RAD;
    const cosP = Math.cos(pOriRad);
    const sinP = Math.sin(pOriRad);
    const pitchPts = [
      { x: -px * cosP - (-py) * sinP, y: -px * sinP + (-py) * cosP },
      { x: px * cosP - (-py) * sinP, y: px * sinP + (-py) * cosP },
      { x: px * cosP - py * sinP, y: px * sinP + py * cosP },
      { x: -px * cosP - py * sinP, y: -px * sinP + py * cosP },
    ];
    addClosedPolyline('PITCH_MARKING', 2, pitchPts);
  }

  // 2b. Concert Stage Deck & Structures (When in stage or hybrid mode)
  if (schema.infield.coreMode === 'stage' || schema.infield.coreMode === 'hybrid') {
    const stageGeo = buildStageGeometry(schema.infield);
    addClosedPolyline('STAGE_MAIN_DECK', 1, stageGeo.stageDeck); // Red / Orange
    if (stageGeo.catwalk) {
      addClosedPolyline('STAGE_CATWALK_RUNWAY', 1, stageGeo.catwalk);
    }
    if (stageGeo.fohConsole) {
      addClosedPolyline('STAGE_FOH_BOOTH', 4, stageGeo.fohConsole); // Cyan
    }
    for (const tower of stageGeo.soundTowers) {
      addClosedPolyline('STAGE_SOUND_TOWER', 6, tower);
    }
  }

  // 3. Infield Modular Seat Blocks
  for (const mod of schema.infieldModules) {
    const hw = mod.width / 2;
    const hd = mod.depth / 2;
    const rad = mod.rotationDeg * DEG_TO_RAD;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
      { lx: -hw, ly: -hd },
      { lx: hw, ly: -hd },
      { lx: hw, ly: hd },
      { lx: -hw, ly: hd },
    ].map(({ lx, ly }) => ({
      x: mod.x + lx * cos - ly * sin,
      y: mod.y + lx * sin + ly * cos,
    }));
    addClosedPolyline(
      mod.type === 'sloped' ? 'INFIELD_SLOPED_SEATS' : 'INFIELD_FLAT_SEATS',
      mod.type === 'sloped' ? 30 : 4,
      corners
    );
  }

  // 4. Stand Tiers & Radial Sectors
  for (const tier of schema.standTiers) {
    for (const sector of tier.sectors) {
      if (sector.isDeleted || sector.fillType === 'empty-void') {
        // Void sector opening
        const pts = buildSectorAnnulusPoints(
          schema.infield,
          schema.standTiers,
          tier,
          sector.startAngleDeg,
          sector.endAngleDeg,
          6,
          sector
        );
        addClosedPolyline(`TIER_${tier.level}_VOID_OPENING`, 8, pts); // Gray dashed
        continue;
      }

      const pts = buildSectorAnnulusPoints(
        schema.infield,
        schema.standTiers,
        tier,
        sector.startAngleDeg,
        sector.endAngleDeg,
        8,
        sector
      );

      let layerName = `TIER_${tier.level}_STAND`;
      let colorCode = 5; // Blue
      if (sector.fillType === 'vip-box') {
        layerName = `TIER_${tier.level}_VIP_BOX`;
        colorCode = 2; // Yellow
      } else if (sector.fillType === 'tunnel-exit') {
        layerName = `TIER_${tier.level}_TUNNEL_PORTAL`;
        colorCode = 3; // Green
      } else if (sector.fillType === 'solid-wall') {
        layerName = `TIER_${tier.level}_SOLID_WALL`;
        colorCode = 7; // White
      }

      addClosedPolyline(layerName, colorCode, pts);
    }
  }

  pushPair(0, 'ENDSEC');
  pushPair(0, 'EOF');
  return lines.join('\n');
}

/**
 * Generates an SVG polygon path string for a radial sector ring between startAngleDeg and endAngleDeg.
 */
export function buildStageGeometry(infield: InfieldConfig): {
  stageDeck: Array<{ x: number; y: number }>;
  catwalk: Array<{ x: number; y: number }> | null;
  fohConsole: Array<{ x: number; y: number }> | null;
  backdropLine: Array<{ x: number; y: number }>;
  soundTowers: Array<Array<{ x: number; y: number }>>;
} {
  const cfg = infield.stageConfig || {
    type: 'end-stage',
    orientationDeg: 90,
    width: 36,
    depth: 18,
    height: 2.0,
    catwalkLength: 14,
    catwalkWidth: 4,
    fohEnabled: true,
    fohDistance: 32,
    fohWidth: 6,
    fohDepth: 4,
    backdropHeight: 12,
  };

  const oriRad = cfg.orientationDeg * DEG_TO_RAD;
  const cosO = Math.cos(oriRad);
  const sinO = Math.sin(oriRad);

  const toWorld = (lx: number, ly: number, stageCenterYOffset = 0) => {
    let cx = 0;
    let cy = 0;
    if (cfg.type === 'end-stage') {
      const backDist = Math.max(10, (infield.width / 2) * 0.42);
      cx = -backDist * sinO;
      cy = backDist * cosO;
    }
    const wx = cx + (lx * cosO - (ly + stageCenterYOffset) * sinO);
    const wy = cy + (lx * sinO + (ly + stageCenterYOffset) * cosO);
    return { x: Number(wx.toFixed(2)), y: Number(wy.toFixed(2)) };
  };

  const hw = cfg.width / 2;
  const hd = cfg.depth / 2;

  const stageDeck = [
    toWorld(-hw, -hd),
    toWorld(hw, -hd),
    toWorld(hw, hd),
    toWorld(-hw, hd),
  ];

  const backdropLine = [
    toWorld(-hw * 1.08, -hd),
    toWorld(hw * 1.08, -hd),
  ];

  let catwalk: Array<{ x: number; y: number }> | null = null;
  if (cfg.catwalkLength > 1) {
    const chw = cfg.catwalkWidth / 2;
    catwalk = [
      toWorld(-chw, hd),
      toWorld(chw, hd),
      toWorld(chw, hd + cfg.catwalkLength),
      toWorld(-chw, hd + cfg.catwalkLength),
    ];
  }

  let fohConsole: Array<{ x: number; y: number }> | null = null;
  if (cfg.fohEnabled && cfg.fohDistance > 5) {
    const fhw = cfg.fohWidth / 2;
    const fhd = cfg.fohDepth / 2;
    const fohY = hd + cfg.fohDistance;
    fohConsole = [
      toWorld(-fhw, fohY - fhd),
      toWorld(fhw, fohY - fhd),
      toWorld(fhw, fohY + fhd),
      toWorld(-fhw, fohY + fhd),
    ];
  }

  const towerSpan = hw + 3.5;
  const soundTowers = [
    [
      toWorld(-towerSpan - 1.5, hd - 1.5),
      toWorld(-towerSpan + 1.5, hd - 1.5),
      toWorld(-towerSpan + 1.5, hd + 1.5),
      toWorld(-towerSpan - 1.5, hd + 1.5),
    ],
    [
      toWorld(towerSpan - 1.5, hd - 1.5),
      toWorld(towerSpan + 1.5, hd - 1.5),
      toWorld(towerSpan + 1.5, hd + 1.5),
      toWorld(towerSpan - 1.5, hd + 1.5),
    ],
  ];

  return { stageDeck, catwalk, fohConsole, backdropLine, soundTowers };
}

/**
 * Generates a standalone vector CAD Blueprint SVG string for engineering documentation.
 */
export function generateStadiumSVG(schema: StadiumSchema): string {
  const summary = calculateEngineeringSummary(schema);
  const viewSpan = Math.max(summary.outermostFootprintLengthM, summary.outermostFootprintWidthM) * 1.25;
  const half = viewSpan / 2;

  const infieldPts = buildInfieldPerimeterPoints(schema.infield, 96)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  const sectorPolygons: string[] = [];
  for (const tier of schema.standTiers) {
    for (const sector of tier.sectors) {
      if (sector.isDeleted || sector.fillType === 'empty-void') continue;

      const pts = buildSectorAnnulusPoints(
        schema.infield,
        schema.standTiers,
        tier,
        sector.startAngleDeg,
        sector.endAngleDeg,
        10,
        sector
      )
        .map((p) => `${p.x},${p.y}`)
        .join(' ');
      const stroke =
        sector.fillType === 'vip-box'
          ? '#F59E0B'
          : sector.fillType === 'tunnel-exit'
          ? '#10B981'
          : sector.fillType === 'solid-wall'
          ? '#64748B'
          : '#06B6D4';
      const fill =
        sector.fillType === 'vip-box'
          ? 'rgba(245,158,11,0.16)'
          : sector.fillType === 'tunnel-exit'
          ? 'rgba(16,185,129,0.15)'
          : sector.fillType === 'solid-wall'
          ? 'rgba(100,116,139,0.25)'
          : 'rgba(6,182,212,0.12)';
      sectorPolygons.push(
        `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="0.4" />`
      );
    }
  }

  const moduleRects = schema.infieldModules
    .map(
      (m) =>
        `<g transform="translate(${m.x}, ${m.y}) rotate(${m.rotationDeg})">
          <rect x="${-m.width / 2}" y="${-m.depth / 2}" width="${m.width}" height="${m.depth}" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="0.35" />
        </g>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${viewSpan} ${viewSpan}" width="1200" height="1200" style="background:#07090E">
  <title>${schema.name} - CAD Blueprint</title>
  <g stroke="#1E293B" stroke-width="0.2">
    <line x1="${-half}" y1="0" x2="${half}" y2="0" />
    <line x1="0" y1="${-half}" x2="0" y2="${half}" />
  </g>
  <polygon points="${infieldPts}" fill="rgba(16,185,129,0.08)" stroke="#10B981" stroke-width="0.6" />
  <rect x="${-schema.infield.pitchLength / 2}" y="${-schema.infield.pitchWidth / 2}" width="${schema.infield.pitchLength}" height="${schema.infield.pitchWidth}" fill="none" stroke="#34D399" stroke-width="0.4" stroke-dasharray="1.5,1" />
  ${moduleRects}
  ${sectorPolygons.join('\n  ')}
</svg>`;
}

/**
 * Safely parses and validates an imported JSON Stadium Schema,
 * normalizing legacy versions and populating any missing default fields.
 */
export function validateStadiumSchema(rawJson: unknown): {
  valid: boolean;
  error?: string;
  schema?: StadiumSchema;
} {
  if (!rawJson || typeof rawJson !== 'object') {
    return { valid: false, error: '输入数据不是有效的 JSON 对象' };
  }

  const data = rawJson as Partial<StadiumSchema>;

  if (!data.infield || typeof data.infield !== 'object') {
    return { valid: false, error: 'Schema 缺少必要的 infield (内场配置) 数据' };
  }

  if (!Array.isArray(data.standTiers) || data.standTiers.length === 0) {
    return { valid: false, error: 'Schema 缺少必要的 standTiers (看台楼层) 数据' };
  }

  // Normalize Infield defaults
  const normalizedInfield: InfieldConfig = {
    shape: data.infield.shape || 'rounded-rect',
    coreMode: data.infield.coreMode || 'sports',
    length: Math.max(30, Number(data.infield.length) || 120),
    width: Math.max(20, Number(data.infield.width) || 80),
    cornerRadius: Number(data.infield.cornerRadius) || 0,
    sportPreset: data.infield.sportPreset || 'soccer',
    pitchOrientationDeg: Number(data.infield.pitchOrientationDeg ?? 0),
    pitchLength: Number(data.infield.pitchLength) || 105,
    pitchWidth: Number(data.infield.pitchWidth) || 68,
    safetyMargin: Number(data.infield.safetyMargin) || 8,
    surfaceType: data.infield.surfaceType || 'natural-turf',
    stageConfig: {
      type: data.infield.stageConfig?.type || 'end-stage',
      orientationDeg: Number(data.infield.stageConfig?.orientationDeg ?? 90),
      width: Number(data.infield.stageConfig?.width) || 36,
      depth: Number(data.infield.stageConfig?.depth) || 18,
      height: Number(data.infield.stageConfig?.height) || 2.0,
      catwalkLength: Number(data.infield.stageConfig?.catwalkLength ?? 12),
      catwalkWidth: Number(data.infield.stageConfig?.catwalkWidth ?? 4),
      fohEnabled: Boolean(data.infield.stageConfig?.fohEnabled ?? true),
      fohDistance: Number(data.infield.stageConfig?.fohDistance ?? 32),
      fohWidth: Number(data.infield.stageConfig?.fohWidth ?? 6),
      fohDepth: Number(data.infield.stageConfig?.fohDepth ?? 4),
      backdropHeight: Number(data.infield.stageConfig?.backdropHeight ?? 12),
    },
  };

  // Normalize StandTiers and Sectors
  const baseTiers: StandTier[] = data.standTiers.map((t, idx) => {
    const level = idx + 1;
    return {
      id: t.id || `tier-${level}`,
      level,
      name: t.name || `${level}层看台 (${level}F Bowl)`,
      innerOffset: level === 1 ? 0 : Number(t.innerOffset ?? 2.5),
      radialDepth: Number(t.radialDepth) || 20,
      baseElevation: Number(t.baseElevation) || (level === 1 ? 0.9 : 12.0),
      sectorCount: Number(t.sectorCount) || 16,
      defaultFillType: t.defaultFillType || 'standard',
      defaultRows: Number(t.defaultRows) || 24,
      defaultRowPitch: Number(t.defaultRowPitch) || 0.85,
      defaultSlopeDeg: Number(t.defaultSlopeDeg) || 24,
      defaultSeatSpacing: Number(t.defaultSeatSpacing) || 0.5,
      defaultExitCount: Number(t.defaultExitCount) || 16,
      radialAisleWidth: Number(t.radialAisleWidth) || 1.8,
      defaultGuardrail: t.defaultGuardrail || {
        frontRailEnabled: true,
        frontRailHeight: 1.1,
        rearWallEnabled: true,
        rearWallHeight: 1.2,
        aisleHandrailEnabled: true,
        material: 'tempered-glass',
      },
      morphMode:
        t.morphMode === 'infield-shape' || t.morphMode === 'concentric-circle'
          ? t.morphMode
          : 'infield-shape',
      concentricMorph: Number(t.concentricMorph ?? 0.2),
      sectors: Array.isArray(t.sectors) ? t.sectors : [],
    };
  });

  const normalizedTiers: StandTier[] = baseTiers.map((base) => ({
    ...base,
    sectors: syncTierSectors(base, normalizedInfield, baseTiers),
  }));

  const normalizedSchema: StadiumSchema = {
    schemaVersion: '2.0.0-STADIACAD',
    id: data.id || `stadium-${Date.now()}`,
    name: data.name || '导入的体育场馆工程方案',
    code: data.code || `STD-IMP-${Date.now().toString().slice(-4)}`,
    description: data.description || '用户导入的标准球场CAD/3D工程方案',
    updatedAt: new Date().toISOString(),
    gridSystem: data.gridSystem || {
      enabled: true,
      snapToGrid: true,
      gridSize: 2,
      showPolarGrid: true,
      polarAngleStepDeg: 15,
      showDimensions: true,
      showVomitories: true,
      showGuardrails: true,
    },
    infield: normalizedInfield,
    infieldModules: Array.isArray(data.infieldModules) ? data.infieldModules : [],
    standTiers: normalizedTiers,
    sightlineConfig: data.sightlineConfig || {
      sectionAngleDeg: 90,
      focalPointOffsetFromPitchEdge: 2,
      spectatorEyeHeight: 1.15,
      targetCValueMm: 90,
      showIdealParabolicCurve: true,
    },
  };

  return { valid: true, schema: normalizedSchema };
}

/**
 * Returns an ID guaranteed not to collide with any entry in existingIds.
 */
export function makeUniqueId(baseId: string, existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  const cleanBase = baseId.trim() || 'item';
  if (!used.has(cleanBase)) return cleanBase;
  let suffix = 2;
  while (used.has(`${cleanBase}-${suffix}`)) {
    suffix += 1;
  }
  return `${cleanBase}-${suffix}`;
}

/**
 * Deduplicates SavedStadiumProject entries by projectId and revisionId
 * so React list keys stay unique even after repeated imports or legacy storage restores.
 */
export function deduplicateSavedProjects(
  projects: SavedStadiumProject[]
): SavedStadiumProject[] {
  const seenProjectIds = new Set<string>();
  const result: SavedStadiumProject[] = [];

  for (const proj of projects) {
    if (!proj || typeof proj !== 'object' || !proj.currentSchema) continue;
    const baseProjId = proj.projectId || proj.currentSchema.id || 'proj';
    const uniqueProjId = makeUniqueId(baseProjId, seenProjectIds);
    seenProjectIds.add(uniqueProjId);

    const seenRevisionIds = new Set<string>();
    const rawRevisions: SavedStadiumRevision[] = Array.isArray(proj.revisions)
      ? proj.revisions
      : [];
    const dedupedRevisions = rawRevisions.map((rev, idx) => {
      const uniqueRevId = makeUniqueId(
        rev.revisionId || `rev-${idx + 1}`,
        seenRevisionIds
      );
      seenRevisionIds.add(uniqueRevId);
      return uniqueRevId === rev.revisionId ? rev : { ...rev, revisionId: uniqueRevId };
    });

    const normalizedCurrentSchema =
      proj.currentSchema.id === uniqueProjId
        ? proj.currentSchema
        : { ...proj.currentSchema, id: uniqueProjId };

    result.push({
      ...proj,
      projectId: uniqueProjId,
      currentSchema: normalizedCurrentSchema,
      revisions: dedupedRevisions,
    });
  }

  return result;
}

