export type InfieldShapeType =
  | 'ellipse'
  | 'circle'
  | 'square'
  | 'rectangle'
  | 'rounded-rect';

export type InfieldSeatModuleType = 'flat' | 'sloped';

export interface InfieldSeatModule {
  id: string;
  name: string;
  type: InfieldSeatModuleType;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotationDeg: number;
  rows: number;
  seatSpacing: number;
  rowPitch: number;
  baseElevation: number;
  slopeDeg: number;
  aisleWidth: number;
  color?: string;
}

export type StandSectorFillType =
  | 'standard'       // 普通坐席看台
  | 'vip-box'        // VIP商务包厢
  | 'tunnel-exit'    // 大型车行/马拉松通道门/固定出口
  | 'solid-wall'     // 实体山墙/设备功能房/记分台
  | 'empty-void';     // 镂空/删除不建看台(马蹄形/开口/缺角)

export type VomitoryPositionType = 'center' | 'left' | 'right' | 'dual' | 'custom' | 'none';

export type TierMorphMode = 'concentric-circle' | 'infield-shape';

export type InfieldCoreMode = 'sports' | 'stage' | 'hybrid';

export type InfieldStageType =
  | 'end-stage'      // 端台 (主舞台偏一侧)
  | 'center-stage'   // 四面台 (中心演艺台)
  | 'thrust-stage'   // T台 / 延伸步道台
  | 'festival-stage'; // 巨型音乐节/综合演艺舞台

export interface InfieldStageConfig {
  type: InfieldStageType;
  /** Direction facing in degrees (e.g. 90° = faces South, 0° = faces East, 270° = faces North) */
  orientationDeg: number;
  /** Stage deck width in meters (along local X) */
  width: number;
  /** Stage deck depth in meters (along local Y) */
  depth: number;
  /** Stage elevation above ground in meters (typically 1.5m - 2.5m) */
  height: number;
  /** Catwalk / T-runway length extending from stage center in meters (0 for none) */
  catwalkLength: number;
  /** Catwalk width in meters */
  catwalkWidth: number;
  /** Whether Front-of-House (FOH) audio mixing / lighting console booth is placed */
  fohEnabled: boolean;
  /** Distance from stage center to FOH console in meters */
  fohDistance: number;
  /** FOH console enclosure width in meters */
  fohWidth: number;
  /** FOH console enclosure depth in meters */
  fohDepth: number;
  /** Height of backdrop / LED giant screen frame in meters */
  backdropHeight: number;
}

export interface InfieldConfig {
  shape: InfieldShapeType;
  /** Infield core mode: Sports field, Concert stage, or Hybrid */
  coreMode: InfieldCoreMode;
  /** Outer length (X axis or major axis) of the infield perimeter in meters */
  length: number;
  /** Outer width (Y axis or minor axis) of the infield perimeter in meters */
  width: number;
  /** Corner radius in meters (applicable to rounded-rect, or fillet on square/rect) */
  cornerRadius: number;
  /** Inner pitch/court markings preset */
  sportPreset: 'soccer' | 'track-field' | 'basketball-arena' | 'concert-stage' | 'custom';
  /** Orientation angle of the sports pitch markings in degrees (e.g. 0° = East-West, 90° = North-South) */
  pitchOrientationDeg: number;
  /** Pitch/stage inner length in meters */
  pitchLength: number;
  /** Pitch/stage inner width in meters */
  pitchWidth: number;
  /** Safety run-off buffer width in meters */
  safetyMargin: number;
  /** Surface color/material */
  surfaceType: 'natural-turf' | 'synthetic-track' | 'hardwood-court' | 'modular-deck';
  /** Concert / Performance stage setup parameters */
  stageConfig: InfieldStageConfig;
}

export interface GuardrailConfig {
  frontRailEnabled: boolean;
  /** Front parapet + safety railing height in meters (typically 1.10m) */
  frontRailHeight: number;
  rearWallEnabled: boolean;
  /** Rear perimeter wall/rail height in meters (typically 1.20m - 1.50m) */
  rearWallHeight: number;
  aisleHandrailEnabled: boolean;
  /** Material specification */
  material: 'tempered-glass' | 'steel-balustrade' | 'concrete-parapet';
}

export interface VomitoryExitConfig {
  id: string;
  position: VomitoryPositionType;
  /** Width of safety portal in meters (e.g. 1.8m - 6.0m) */
  width: number;
  /** Height/row span of portal (how many rows it cuts through, e.g. 1 - 8 rows) */
  rowSpan: number;
  /** Target row index where the vomitory opens (1-based) */
  startRow: number;
  /** Custom angular offset percentage within the sector (-40% to +40%, 0 is center) */
  angularOffsetPct?: number;
  /** Whether the exit is actively enabled in this sector */
  enabled?: boolean;
}

export interface StandSector {
  id: string;
  sectorIndex: number;
  name: string;
  /** Start angle in degrees (0 = East/+X, counter-clockwise in CAD polar coords) */
  startAngleDeg: number;
  /** End angle in degrees */
  endAngleDeg: number;
  /** Normalized infield perimeter fraction [0..1] for 90°-normal sector slicing */
  startPerimFrac?: number;
  /** Normalized infield perimeter end fraction [0..1] for 90°-normal sector slicing */
  endPerimFrac?: number;
  /** Optional explicit outward normal angle (radians) at start seam when a cut lands on a sharp corner */
  startNormalRad?: number;
  /** Optional explicit outward normal angle (radians) at end seam when a cut lands on a sharp corner */
  endNormalRad?: number;
  /** Fill type: Ordinary Stand, VIP Skybox, Vehicle/Marathon Tunnel, Solid Wall, or Empty Void/Deleted */
  fillType: StandSectorFillType;
  /** Whether this sector is explicitly deleted / voided (horseshoe / U-shape opening) */
  isDeleted?: boolean;
  /** Custom inner radius offset in meters (for trimming or indenting stand boundary) */
  customRadialOffset?: number;
  /** Custom radial depth in meters (for partial stands or uneven perimeter walls) */
  customRadialDepth?: number;
  /** Whether this sector overrides tier-level defaults */
  useCustomOverrides: boolean;
  /** Number of seating rows in this sector */
  rows: number;
  /** Horizontal row depth (tread depth / 排距) in meters (e.g. 0.80m - 1.20m) */
  rowPitch: number;
  /** Vertical riser height per row (阶高) in meters (derived or explicit) */
  riserHeight: number;
  /** Rake/slope angle in degrees (坡度, e.g. 18° - 34°) */
  slopeDeg: number;
  /** Seat lateral spacing (座椅密度/座宽) in meters (e.g. 0.48m - 0.85m for VIP) */
  seatSpacing: number;
  /** Safety exit / vomitory configuration for this sector */
  vomitory: VomitoryExitConfig;
  /** Guardrail settings for this sector */
  guardrail: GuardrailConfig;
  /** Number of VIP suite rooms if fillType === 'vip-box' */
  vipBoxRooms: number;
  /** Custom label or notes */
  notes?: string;
}

export interface StandTier {
  id: string;
  /** Floor level (1 = 1st tier locked to infield outer edge, 2 = 2nd tier, etc.) */
  level: number;
  name: string;
  /**
   * Inner offset from the infield perimeter in meters.
   * Note: For level === 1, innerOffset is strictly 0 so Tier 1 inner ring coincides with Infield outer ring!
   */
  innerOffset: number;
  /** Default concentric radial depth of this tier in meters */
  radialDepth: number;
  /** Base elevation (Z height in meters) where row 1 of this tier begins */
  baseElevation: number;
  /** Number of radial sectors dividing the 360° bowl */
  sectorCount: number;
  /** Default fill type for sectors in this tier */
  defaultFillType: StandSectorFillType;
  /** Default number of rows */
  defaultRows: number;
  /** Default row pitch (tread depth) in meters */
  defaultRowPitch: number;
  /** Default slope angle in degrees */
  defaultSlopeDeg: number;
  /** Default seat spacing (lateral width per seat) in meters */
  defaultSeatSpacing: number;
  /** Total number of exits/vomitories around this tier */
  defaultExitCount: number;
  /** Radial gap/aisle width between adjacent sectors in meters */
  radialAisleWidth: number;
  /** Default guardrail parameters */
  defaultGuardrail: GuardrailConfig;
  /** Shape morphing target mode: 2-choice between 'infield-shape' or 'concentric-circle' */
  morphMode?: TierMorphMode;
  /** Morph factor (0 = raw polar offset, 1 = 100% pure target geometry: concentric circle or infield geometric shape) */
  concentricMorph: number;
  /** Individual sectors radiating from center (0,0) */
  sectors: StandSector[];
}

export interface GridSystemConfig {
  enabled: boolean;
  snapToGrid: boolean;
  /** Cartesian grid step in meters (e.g., 2m, 5m, 10m) */
  gridSize: number;
  /** Show polar radial rays and concentric reference rings */
  showPolarGrid: boolean;
  /** Polar angular step in degrees (e.g., 15° or 30°) */
  polarAngleStepDeg: number;
  /** Show CAD dimension callouts */
  showDimensions: boolean;
  /** Show safety exits & vomitory icons */
  showVomitories: boolean;
  /** Show guardrails in 2D/3D */
  showGuardrails: boolean;
}

export interface SightlineAnalysisConfig {
  /** Azimuth angle of the cutting plane A-A' in degrees (0 - 360) */
  sectionAngleDeg: number;
  /** Distance from center (0,0) to focal point (e.g., touchline / boundary line) along the section ray, or auto-derived from pitch edge */
  focalPointOffsetFromPitchEdge: number;
  /** Eye height of seated spectator above row tread in meters (standard 1.15m) */
  spectatorEyeHeight: number;
  /** Target minimum C-value in millimeters (FIFA standard: 90mm minimum, 120mm optimal) */
  targetCValueMm: number;
  /** Show ideal parabolic iso-C curve overlay in cross-section view */
  showIdealParabolicCurve: boolean;
}

export interface SightlineRowResult {
  tierId: string;
  tierLevel: number;
  tierName: string;
  sectorId: string;
  fillType: StandSectorFillType;
  rowIndex: number;
  /** Horizontal distance from stadium center (0,0) in meters */
  radiusM: number;
  /** Horizontal distance from focal point (touchline) in meters */
  horizontalDistToFocalM: number;
  /** Elevation of row tread (Z) in meters */
  treadElevationM: number;
  /** Elevation of spectator eye (Z + eyeHeight) in meters */
  eyeElevationM: number;
  /** Riser height N to this row in meters */
  riserHeightM: number;
  /** Tread depth T of this row in meters */
  treadDepthM: number;
  /** Architectural Sightline C-Value in millimeters */
  cValueMm: number;
  /** Sightline depression angle to focal point in degrees */
  sightlineAngleDeg: number;
  /** Compliance status */
  compliance: 'optimal' | 'acceptable' | 'marginal' | 'obstructed';
}

export interface EngineeringSummary {
  totalCapacity: number;
  infieldFlatCapacity: number;
  infieldSlopedCapacity: number;
  standardStandCapacity: number;
  vipBoxCapacity: number;
  totalVipRooms: number;
  totalSafetyExits: number;
  outermostFootprintLengthM: number;
  outermostFootprintWidthM: number;
  maxBowlElevationM: number;
  minCValueMm: number;
  avgCValueMm: number;
  cValueComplianceRate: number;
}

export interface StadiumSchema {
  schemaVersion: '2.0.0-STADIACAD';
  id: string;
  name: string;
  code: string;
  description: string;
  updatedAt: string;
  gridSystem: GridSystemConfig;
  infield: InfieldConfig;
  infieldModules: InfieldSeatModule[];
  standTiers: StandTier[];
  sightlineConfig: SightlineAnalysisConfig;
}

export interface SavedStadiumRevision {
  revisionId: string;
  timestamp: string;
  note: string;
  totalCapacity: number;
  tierCount: number;
  infieldShape: InfieldShapeType;
  schema: StadiumSchema;
}

export interface SavedStadiumProject {
  projectId: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  currentSchema: StadiumSchema;
  revisions: SavedStadiumRevision[];
}
