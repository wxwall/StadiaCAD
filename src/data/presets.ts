import { InfieldConfig, SavedStadiumProject, StadiumSchema, StandTier } from '../types/stadium';
import { calculateEngineeringSummary, syncTierSectors } from '../utils/stadiumEngine';

function buildTierWithSectors(
  tierBase: Omit<StandTier, 'sectors'>,
  infield?: InfieldConfig,
  prevTiers: StandTier[] = []
): StandTier {
  const temp: StandTier = { ...tierBase, sectors: [] };
  const sectors = syncTierSectors(temp, infield, [...prevTiers, temp]);
  return { ...temp, sectors };
}

/**
 * 1. 北京国家体育场 (鸟巢体育中心) - Beijing National Stadium "Bird's Nest"
 * 2008年北京奥运会主体育场，奥林匹克400米综合田径+足球椭圆形马鞍巨碗，91,000座设计容量。
 */
export function createBirdNestStadiumSchema(): StadiumSchema {
  const infield: InfieldConfig = {
    shape: 'ellipse',
    coreMode: 'hybrid',
    length: 188,
    width: 118,
    cornerRadius: 0,
    sportPreset: 'track-field',
    pitchOrientationDeg: 90,
    pitchLength: 105,
    pitchWidth: 68,
    safetyMargin: 15,
    surfaceType: 'synthetic-track',
    stageConfig: {
      type: 'festival-stage',
      orientationDeg: 90,
      width: 52,
      depth: 28,
      height: 2.4,
      catwalkLength: 32,
      catwalkWidth: 4.5,
      fohEnabled: true,
      fohDistance: 55,
      fohWidth: 12,
      fohDepth: 7,
      backdropHeight: 18,
    },
  };

  const tier1 = buildTierWithSectors(
    {
      id: 'bn-tier-1',
      level: 1,
      name: '一层首层大碗看台 (1F Lower Bowl)',
      innerOffset: 0, // Strictly coincides with 400m track outer perimeter
      radialDepth: 24,
      baseElevation: 1.0,
      sectorCount: 24,
      defaultFillType: 'standard',
      defaultRows: 28,
      defaultRowPitch: 0.85,
      defaultSlopeDeg: 23,
      defaultSeatSpacing: 0.5,
      defaultExitCount: 24,
      radialAisleWidth: 2.0,
      defaultGuardrail: {
        frontRailEnabled: true,
        frontRailHeight: 1.1,
        rearWallEnabled: true,
        rearWallHeight: 1.25,
        aisleHandrailEnabled: true,
        material: 'concrete-parapet',
      },
      morphMode: 'infield-shape',
      concentricMorph: 0.85,
    },
    infield
  );

  // Sector 0 on Tier 1 as Marathon / vehicle main gate
  tier1.sectors = tier1.sectors.map((s, idx) => {
    if (idx === 0) {
      return {
        ...s,
        name: '北侧马拉松/车行主进场门 (Marathon Gate)',
        fillType: 'tunnel-exit' as const,
        useCustomOverrides: true,
      };
    }
    return s;
  });

  const tier2 = buildTierWithSectors({
    id: 'bn-tier-2',
    level: 2,
    name: '二层贵宾包厢与俱乐部层 (2F VIP Skybox Ring)',
    innerOffset: 2.8,
    radialDepth: 10,
    baseElevation: 14.0,
    sectorCount: 24,
    defaultFillType: 'standard',
    defaultRows: 5,
    defaultRowPitch: 1.35,
    defaultSlopeDeg: 27,
    defaultSeatSpacing: 0.72,
    defaultExitCount: 12,
    radialAisleWidth: 1.5,
    defaultGuardrail: {
      frontRailEnabled: true,
      frontRailHeight: 1.15,
      rearWallEnabled: true,
      rearWallHeight: 1.5,
      aisleHandrailEnabled: true,
      material: 'tempered-glass',
    },
    morphMode: 'infield-shape',
    concentricMorph: 0.9,
  }, infield, [tier1]);

  // East & West side sectors as VIP boxes
  tier2.sectors = tier2.sectors.map((s, idx) => {
    const mid = (s.startAngleDeg + s.endAngleDeg) / 2;
    const isSideline = (mid >= 45 && mid <= 135) || (mid >= 225 && mid <= 315);
    return {
      ...s,
      fillType: isSideline ? 'vip-box' : 'standard',
      vipBoxRooms: isSideline ? 4 : 0,
      rows: isSideline ? 4 : 8,
      rowPitch: isSideline ? 1.35 : 0.88,
      slopeDeg: 27,
      useCustomOverrides: true,
      name: `2F-鸟巢贵宾包厢-${String.fromCharCode(65 + (idx % 26))}`,
    };
  });

  const tier3 = buildTierWithSectors({
    id: 'bn-tier-3',
    level: 3,
    name: '三层高区马鞍形看台 (3F Upper Saddle Bowl)',
    innerOffset: 3.2,
    radialDepth: 34,
    baseElevation: 22.0,
    sectorCount: 32,
    defaultFillType: 'standard',
    defaultRows: 38,
    defaultRowPitch: 0.85,
    defaultSlopeDeg: 34,
    defaultSeatSpacing: 0.5,
    defaultExitCount: 32,
    radialAisleWidth: 2.2,
    defaultGuardrail: {
      frontRailEnabled: true,
      frontRailHeight: 1.2,
      rearWallEnabled: true,
      rearWallHeight: 1.8,
      aisleHandrailEnabled: true,
      material: 'steel-balustrade',
    },
    morphMode: 'infield-shape',
    concentricMorph: 0.9,
  }, infield, [tier1, tier2]);

  // Sector 0 on Tier 3 as Olympic Torch & Scoreboard open vista void
  tier3.sectors = tier3.sectors.map((s, idx) => {
    if (idx === 0) {
      return {
        ...s,
        name: '北侧火炬台与天际线观景镂空区 (Torch Vista)',
        fillType: 'empty-void' as const,
        isDeleted: true,
        useCustomOverrides: true,
      };
    }
    return s;
  });

  return {
    schemaVersion: '2.0.0-STADIACAD',
    id: 'std-beijing-bird-nest',
    name: '北京国家体育场 (鸟巢体育中心)',
    code: 'BJ-NST-2008-01',
    description:
      '2008年北京奥运会主体育场（国家体育场·鸟巢），拥有91,000标准座席。采用奥林匹克400米综合田径+足球椭圆形马鞍巨碗造型，首层看台与跑道完全无缝重合，北侧设马拉松拱门车行主进场门通道，二层设全景贵宾VIP包厢层，三层为高坡度全景马鞍形大看台（北侧顶部预留火炬台与记分牌景观通透开洞），支持国际田联/FIFA综合赛事与十万人级演艺音乐节多模态转场。',
    updatedAt: new Date().toISOString(),
    gridSystem: {
      enabled: true,
      snapToGrid: true,
      gridSize: 5,
      showPolarGrid: true,
      polarAngleStepDeg: 15,
      showDimensions: true,
      showVomitories: true,
      showGuardrails: true,
    },
    infield,
    infieldModules: [
      {
        id: 'bn-mod-1',
        name: '内场中央演艺VIP平面方阵 A',
        type: 'flat',
        x: 0,
        y: 0,
        width: 26,
        depth: 38,
        rotationDeg: 0,
        rows: 36,
        seatSpacing: 0.55,
        rowPitch: 0.9,
        baseElevation: 0,
        slopeDeg: 0,
        aisleWidth: 2.0,
        color: '#06B6D4',
      },
      {
        id: 'bn-mod-2',
        name: '内场南侧演艺斜坡看台 B',
        type: 'sloped',
        x: 0,
        y: 36,
        width: 32,
        depth: 12,
        rotationDeg: 180,
        rows: 12,
        seatSpacing: 0.55,
        rowPitch: 0.9,
        baseElevation: 0.2,
        slopeDeg: 14,
        aisleWidth: 2.2,
        color: '#F59E0B',
      },
    ],
    standTiers: [tier1, tier2, tier3],
    sightlineConfig: {
      sectionAngleDeg: 90,
      focalPointOffsetFromPitchEdge: 4,
      spectatorEyeHeight: 1.15,
      targetCValueMm: 90,
      showIdealParabolicCurve: true,
    },
  };
}

/**
 * 2. 华熙LIVE·五棵松体育馆 (凯迪拉克中心) - Beijing Wukesong / Cadillac Arena
 * 2008奥运篮球馆与2022冬奥冰球馆，国内顶尖18,000座室内综合演艺体育馆。
 */
export function createWukesongArenaSchema(): StadiumSchema {
  const infield: InfieldConfig = {
    shape: 'square',
    coreMode: 'sports',
    length: 68,
    width: 68,
    cornerRadius: 14,
    sportPreset: 'basketball-arena',
    pitchOrientationDeg: 0,
    pitchLength: 28,
    pitchWidth: 15,
    safetyMargin: 7,
    surfaceType: 'hardwood-court',
    stageConfig: {
      type: 'center-stage',
      orientationDeg: 0,
      width: 22,
      depth: 22,
      height: 1.8,
      catwalkLength: 10,
      catwalkWidth: 3.2,
      fohEnabled: true,
      fohDistance: 18,
      fohWidth: 6,
      fohDepth: 4,
      backdropHeight: 9,
    },
  };

  const tier1 = buildTierWithSectors(
    {
      id: 'wks-tier-1',
      level: 1,
      name: '一层活动伸缩与固定池座 (1F Lower Bowl)',
      innerOffset: 0, // Coincides with core court perimeter
      radialDepth: 20,
      baseElevation: 0.8,
      sectorCount: 16,
      defaultFillType: 'standard',
      defaultRows: 26,
      defaultRowPitch: 0.85,
      defaultSlopeDeg: 25.5,
      defaultSeatSpacing: 0.48,
      defaultExitCount: 16,
      radialAisleWidth: 1.6,
      defaultGuardrail: {
        frontRailEnabled: true,
        frontRailHeight: 1.05,
        rearWallEnabled: true,
        rearWallHeight: 1.2,
        aisleHandrailEnabled: true,
        material: 'tempered-glass',
      },
      morphMode: 'infield-shape',
      concentricMorph: 0.85,
    },
    infield
  );

  const tier2 = buildTierWithSectors(
    {
      id: 'wks-tier-2',
      level: 2,
      name: '二层环绕式商务包厢与俱乐部 (2F Luxury Suites Ring)',
      innerOffset: 2.2,
      radialDepth: 14,
      baseElevation: 9.6,
      sectorCount: 16,
      defaultFillType: 'vip-box',
      defaultRows: 8,
      defaultRowPitch: 1.15,
      defaultSlopeDeg: 29,
      defaultSeatSpacing: 0.65,
      defaultExitCount: 16,
      radialAisleWidth: 1.5,
      defaultGuardrail: {
        frontRailEnabled: true,
        frontRailHeight: 1.1,
        rearWallEnabled: true,
        rearWallHeight: 1.4,
        aisleHandrailEnabled: true,
        material: 'tempered-glass',
      },
      morphMode: 'infield-shape',
      concentricMorph: 0.9,
    },
    infield,
    [tier1]
  );

  // Configure 48 luxury suites across the 16 sectors (3 suites per sector)
  tier2.sectors = tier2.sectors.map((s, idx) => ({
    ...s,
    fillType: 'vip-box',
    vipBoxRooms: 3,
    rows: 8,
    rowPitch: 1.15,
    slopeDeg: 29,
    useCustomOverrides: true,
    name: `2F-五棵松包厢-${idx + 1}号`,
  }));

  return {
    schemaVersion: '2.0.0-STADIACAD',
    id: 'std-wukesong-arena',
    name: '华熙LIVE·五棵松体育馆 (凯迪拉克中心)',
    code: 'BJ-WKS-2008-02',
    description:
      '北京2008年奥运会篮球馆及2022年冬奥会冰球馆，国内顶尖18,000座室内综合演艺体育馆。采用高紧凑正方形圆角核心内场，支持6小时内完成NBA级篮球场地与国际标准冰球场（60m×26m）快速转换，内场四向配备模块化电动伸缩斜坡看台，二层设环形豪华包厢层（48间五星级商务套房），支持四面中心舞台或三面台顶级演唱会布局。',
    updatedAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    gridSystem: {
      enabled: true,
      snapToGrid: true,
      gridSize: 2,
      showPolarGrid: true,
      polarAngleStepDeg: 22.5,
      showDimensions: true,
      showVomitories: true,
      showGuardrails: true,
    },
    infield,
    infieldModules: [
      {
        id: 'wks-mod-1',
        name: '内场北侧篮架后活动斜坡看台 A',
        type: 'sloped',
        x: 0,
        y: -19,
        width: 28,
        depth: 11,
        rotationDeg: 0,
        rows: 13,
        seatSpacing: 0.5,
        rowPitch: 0.85,
        baseElevation: 0.1,
        slopeDeg: 16,
        aisleWidth: 1.6,
        color: '#F59E0B',
      },
      {
        id: 'wks-mod-2',
        name: '内场南侧篮架后活动斜坡看台 B',
        type: 'sloped',
        x: 0,
        y: 19,
        width: 28,
        depth: 11,
        rotationDeg: 180,
        rows: 13,
        seatSpacing: 0.5,
        rowPitch: 0.85,
        baseElevation: 0.1,
        slopeDeg: 16,
        aisleWidth: 1.6,
        color: '#F59E0B',
      },
      {
        id: 'wks-mod-3',
        name: '内场东侧场边活动斜坡看台 C',
        type: 'sloped',
        x: 18,
        y: 0,
        width: 11,
        depth: 28,
        rotationDeg: 90,
        rows: 12,
        seatSpacing: 0.5,
        rowPitch: 0.85,
        baseElevation: 0.1,
        slopeDeg: 15,
        aisleWidth: 1.6,
        color: '#F59E0B',
      },
      {
        id: 'wks-mod-4',
        name: '内场西侧场边VIP平层坐席 D',
        type: 'flat',
        x: -17,
        y: 0,
        width: 7,
        depth: 28,
        rotationDeg: 90,
        rows: 5,
        seatSpacing: 0.6,
        rowPitch: 0.95,
        baseElevation: 0,
        slopeDeg: 0,
        aisleWidth: 1.2,
        color: '#10B981',
      },
    ],
    standTiers: [tier1, tier2],
    sightlineConfig: {
      sectionAngleDeg: 0,
      focalPointOffsetFromPitchEdge: 1,
      spectatorEyeHeight: 1.15,
      targetCValueMm: 90,
      showIdealParabolicCurve: true,
    },
  };
}

/**
 * 3. 北京工人体育场 (新工体·专业足球场) - New Beijing Workers' Stadium
 * 北京国安主场，68,000座特级国际专业足球场，四层大碗看台，南看台死忠专属区，8.5米极限触地视距。
 */
export function createNewGongtiStadiumSchema(): StadiumSchema {
  const infield: InfieldConfig = {
    shape: 'rounded-rect',
    coreMode: 'sports',
    length: 125,
    width: 86,
    cornerRadius: 18,
    sportPreset: 'soccer',
    pitchOrientationDeg: 90, // FIFA North-South 90° orientation
    pitchLength: 105,
    pitchWidth: 68,
    safetyMargin: 8.5, // 8.5m touchline gap: first row is right at pitch boundary
    surfaceType: 'natural-turf',
    stageConfig: {
      type: 'end-stage',
      orientationDeg: 90,
      width: 38,
      depth: 22,
      height: 2.0,
      catwalkLength: 18,
      catwalkWidth: 3.2,
      fohEnabled: true,
      fohDistance: 38,
      fohWidth: 8,
      fohDepth: 5,
      backdropHeight: 14,
    },
  };

  const tier1 = buildTierWithSectors(
    {
      id: 'gt-tier-1',
      level: 1,
      name: '一层近景大碗看台 (1F Lower Bowl)',
      innerOffset: 0, // Strictly 0 offset: coincides with natural turf boundary
      radialDepth: 20,
      baseElevation: 0.8,
      sectorCount: 20,
      defaultFillType: 'standard',
      defaultRows: 22,
      defaultRowPitch: 0.84,
      defaultSlopeDeg: 24,
      defaultSeatSpacing: 0.5,
      defaultExitCount: 20,
      radialAisleWidth: 1.8,
      defaultGuardrail: {
        frontRailEnabled: true,
        frontRailHeight: 1.1,
        rearWallEnabled: true,
        rearWallHeight: 1.25,
        aisleHandrailEnabled: true,
        material: 'tempered-glass',
      },
      morphMode: 'infield-shape',
      concentricMorph: 0.9,
    },
    infield
  );

  // South sectors (around 270° south goal) designated for Guo'an Ultra Fans
  tier1.sectors = tier1.sectors.map((s, idx) => {
    const mid = (s.startAngleDeg + s.endAngleDeg) / 2;
    const isSouthGoal = mid >= 240 && mid <= 300;
    if (isSouthGoal) {
      return {
        ...s,
        name: `南看台·国安死忠御林军专属看台 (${idx + 1}区)`,
        useCustomOverrides: true,
      };
    }
    return s;
  });

  const tier2 = buildTierWithSectors({
    id: 'gt-tier-2',
    level: 2,
    name: '二层环廊商务包厢与贵宾层 (2F VIP Skybox Ring)',
    innerOffset: 2.2,
    radialDepth: 8,
    baseElevation: 11.2,
    sectorCount: 20,
    defaultFillType: 'vip-box',
    defaultRows: 4,
    defaultRowPitch: 1.35,
    defaultSlopeDeg: 28,
    defaultSeatSpacing: 0.72,
    defaultExitCount: 10,
    radialAisleWidth: 1.4,
    defaultGuardrail: {
      frontRailEnabled: true,
      frontRailHeight: 1.15,
      rearWallEnabled: true,
      rearWallHeight: 1.5,
      aisleHandrailEnabled: true,
      material: 'tempered-glass',
    },
    morphMode: 'infield-shape',
    concentricMorph: 0.9,
  }, infield, [tier1]);

  // East & West sideline sectors on Tier 2 configured with 4 VIP suites
  tier2.sectors = tier2.sectors.map((s, idx) => {
    const mid = (s.startAngleDeg + s.endAngleDeg) / 2;
    const isSideline = (mid >= 45 && mid <= 135) || (mid >= 225 && mid <= 315);
    return {
      ...s,
      fillType: isSideline ? 'vip-box' : 'standard',
      vipBoxRooms: isSideline ? 4 : 0,
      rows: isSideline ? 4 : 8,
      rowPitch: isSideline ? 1.35 : 0.88,
      slopeDeg: 28,
      useCustomOverrides: true,
      name: `2F-新工体商务包厢-${String.fromCharCode(65 + (idx % 26))}`,
    };
  });

  const tier3 = buildTierWithSectors({
    id: 'gt-tier-3',
    level: 3,
    name: '三层中区全景看台 (3F Middle Bowl)',
    innerOffset: 2.6,
    radialDepth: 15,
    baseElevation: 16.2,
    sectorCount: 20,
    defaultFillType: 'standard',
    defaultRows: 16,
    defaultRowPitch: 0.85,
    defaultSlopeDeg: 30.5,
    defaultSeatSpacing: 0.5,
    defaultExitCount: 20,
    radialAisleWidth: 1.8,
    defaultGuardrail: {
      frontRailEnabled: true,
      frontRailHeight: 1.15,
      rearWallEnabled: true,
      rearWallHeight: 1.5,
      aisleHandrailEnabled: true,
      material: 'steel-balustrade',
    },
    morphMode: 'infield-shape',
    concentricMorph: 0.9,
  }, infield, [tier1, tier2]);

  const tier4 = buildTierWithSectors({
    id: 'gt-tier-4',
    level: 4,
    name: '四层高区俯瞰大看台 (4F Upper Bowl)',
    innerOffset: 3.0,
    radialDepth: 22,
    baseElevation: 25.2,
    sectorCount: 28,
    defaultFillType: 'standard',
    defaultRows: 24,
    defaultRowPitch: 0.85,
    defaultSlopeDeg: 34, // Steep 34° slope for European-style intimidating atmosphere
    defaultSeatSpacing: 0.5,
    defaultExitCount: 28,
    radialAisleWidth: 2.0,
    defaultGuardrail: {
      frontRailEnabled: true,
      frontRailHeight: 1.2,
      rearWallEnabled: true,
      rearWallHeight: 1.8,
      aisleHandrailEnabled: true,
      material: 'steel-balustrade',
    },
    morphMode: 'infield-shape',
    concentricMorph: 0.9,
  }, infield, [tier1, tier2, tier3]);

  return {
    schemaVersion: '2.0.0-STADIACAD',
    id: 'std-new-gongti',
    name: '北京工人体育场 (新工体·专业足球场)',
    code: 'BJ-GTI-2023-03',
    description:
      '北京国安足球俱乐部主场，特级国际专业足球场，设计容量68,000座。采用英超式经典圆角长方形内场，无田径跑道，一层大碗看台内圈与草皮严格0间距贴合（第一排看台距球场边线仅8.5米，超近观赛视距）；拥有四层立体大碗看台，南侧专门打造御林军死忠球迷大看台，二层全环绕VIP商务包厢与贵宾坐席，FIFA标准南北向（90°）专业足球场布局。',
    updatedAt: new Date().toISOString(),
    gridSystem: {
      enabled: true,
      snapToGrid: true,
      gridSize: 2,
      showPolarGrid: true,
      polarAngleStepDeg: 18,
      showDimensions: true,
      showVomitories: true,
      showGuardrails: true,
    },
    infield,
    infieldModules: [
      {
        id: 'gt-mod-1',
        name: '西侧主客队技术区替补席与官员区',
        type: 'flat',
        x: -38,
        y: 0,
        width: 28,
        depth: 5,
        rotationDeg: 90,
        rows: 4,
        seatSpacing: 0.6,
        rowPitch: 0.95,
        baseElevation: 0,
        slopeDeg: 0,
        aisleWidth: 1.4,
        color: '#10B981',
      },
      {
        id: 'gt-mod-2',
        name: '东侧场边高级草坪坐席区',
        type: 'flat',
        x: 38,
        y: 0,
        width: 28,
        depth: 5,
        rotationDeg: 90,
        rows: 4,
        seatSpacing: 0.6,
        rowPitch: 0.95,
        baseElevation: 0,
        slopeDeg: 0,
        aisleWidth: 1.4,
        color: '#10B981',
      },
      {
        id: 'gt-mod-3',
        name: '南看台前区应急可拆卸斜坡看台',
        type: 'sloped',
        x: 0,
        y: 38,
        width: 32,
        depth: 7,
        rotationDeg: 180,
        rows: 7,
        seatSpacing: 0.52,
        rowPitch: 0.85,
        baseElevation: 0.2,
        slopeDeg: 14,
        aisleWidth: 1.6,
        color: '#F59E0B',
      },
    ],
    standTiers: [tier1, tier2, tier3, tier4],
    sightlineConfig: {
      sectionAngleDeg: 90,
      focalPointOffsetFromPitchEdge: 2,
      spectatorEyeHeight: 1.15,
      targetCValueMm: 90,
      showIdealParabolicCurve: true,
    },
  };
}

// Aliases for 100% backward compatibility
export const createDefaultSoccerStadiumSchema = createNewGongtiStadiumSchema;
export const createOlympicOvalStadiumSchema = createBirdNestStadiumSchema;
export const createIndoorArenaSchema = createWukesongArenaSchema;

export function createInitialSavedProjects(): SavedStadiumProject[] {
  const gongti = createNewGongtiStadiumSchema();
  const birdNest = createBirdNestStadiumSchema();
  const wukesong = createWukesongArenaSchema();

  const sumGongti = calculateEngineeringSummary(gongti);
  const sumBirdNest = calculateEngineeringSummary(birdNest);
  const sumWukesong = calculateEngineeringSummary(wukesong);

  return [
    {
      projectId: gongti.id,
      name: gongti.name,
      code: gongti.code,
      createdAt: gongti.updatedAt,
      updatedAt: gongti.updatedAt,
      currentSchema: gongti,
      revisions: [
        {
          revisionId: 'rev-gt-101',
          timestamp: gongti.updatedAt,
          note: `V1.0 新工体6.8万座专业足球场施工标准方案（四层下沉大碗看台 · 南看台死忠专属区 · 8.5m极致视距 · ${sumGongti.totalCapacity.toLocaleString()}席）`,
          totalCapacity: sumGongti.totalCapacity,
          tierCount: gongti.standTiers.length,
          infieldShape: gongti.infield.shape,
          schema: JSON.parse(JSON.stringify(gongti)),
        },
      ],
    },
    {
      projectId: birdNest.id,
      name: birdNest.name,
      code: birdNest.code,
      createdAt: birdNest.updatedAt,
      updatedAt: birdNest.updatedAt,
      currentSchema: birdNest,
      revisions: [
        {
          revisionId: 'rev-bn-201',
          timestamp: birdNest.updatedAt,
          note: `V1.0 北京国家体育场(鸟巢)9.1万座工程方案（400m椭圆田径底盘 + 三层马鞍看台 + 马拉松通道与火炬观景口 · ${sumBirdNest.totalCapacity.toLocaleString()}席）`,
          totalCapacity: sumBirdNest.totalCapacity,
          tierCount: birdNest.standTiers.length,
          infieldShape: birdNest.infield.shape,
          schema: JSON.parse(JSON.stringify(birdNest)),
        },
      ],
    },
    {
      projectId: wukesong.id,
      name: wukesong.name,
      code: wukesong.code,
      createdAt: wukesong.updatedAt,
      updatedAt: wukesong.updatedAt,
      currentSchema: wukesong,
      revisions: [
        {
          revisionId: 'rev-wks-301',
          timestamp: wukesong.updatedAt,
          note: `V1.0 华熙LIVE·五棵松1.8万座篮球/冰球综合方案（正方圆角内场 + 四向模块伸缩斜坡看台 + 48间环形包厢 · ${sumWukesong.totalCapacity.toLocaleString()}席）`,
          totalCapacity: sumWukesong.totalCapacity,
          tierCount: wukesong.standTiers.length,
          infieldShape: wukesong.infield.shape,
          schema: JSON.parse(JSON.stringify(wukesong)),
        },
      ],
    },
  ];
}
