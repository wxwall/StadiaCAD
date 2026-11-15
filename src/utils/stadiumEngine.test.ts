import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStageGeometry,
  calculateCrossSectionAndSightlines,
  calculateEngineeringSummary,
  calculateInfieldModuleCapacity,
  calculateSectorCapacity,
  calculateSectorPolygonArea,
  computeInfieldShapeSectorAngles,
  deduplicateSavedProjects,
  generateStadiumDXF,
  generateStadiumSVG,
  getInfieldOuterRadiusAtAngle,
  getInfieldPerimeterMeters,
  getInfieldPointAndNormalAtFrac,
  getSectorNormalSamples,
  getTierRadiiAtAngle,
  makeUniqueId,
  snapToGridValue,
  syncTierSectors,
  validateStadiumSchema,
} from './stadiumEngine';
import {
  createBirdNestStadiumSchema,
  createDefaultSoccerStadiumSchema,
  createIndoorArenaSchema,
  createInitialSavedProjects,
  createNewGongtiStadiumSchema,
  createOlympicOvalStadiumSchema,
  createWukesongArenaSchema,
} from '../data/presets';

test('Tier 1 inner ring strictly coincides with Infield outer perimeter across all 5 infield shapes', () => {
  const schema = createDefaultSoccerStadiumSchema();
  const tier1 = schema.standTiers.find((t) => t.level === 1)!;
  const shapes = ['ellipse', 'circle', 'square', 'rectangle', 'rounded-rect'] as const;

  for (const shape of shapes) {
    schema.infield.shape = shape;
    schema.infield.length = 140;
    schema.infield.width = 100;
    schema.infield.cornerRadius = 20;

    for (let angle = 0; angle < 360; angle += 15) {
      const infieldOuterR = getInfieldOuterRadiusAtAngle(schema.infield, angle);
      const { innerRadius, outerRadius } = getTierRadiiAtAngle(
        schema.infield,
        schema.standTiers,
        tier1,
        angle
      );
      assert.equal(
        Number(infieldOuterR.toFixed(3)),
        innerRadius,
        `Tier 1 innerRadius must equal infield outer radius at ${angle}° for shape ${shape}`
      );
      assert.ok(outerRadius > innerRadius, 'Tier 1 outerRadius must be larger than innerRadius');
    }
  }
});

test('Radial sector division slices 360 degrees from center (0,0) and preserves sector overrides', () => {
  const schema = createDefaultSoccerStadiumSchema();
  const tier1 = { ...schema.standTiers[0], sectorCount: 24 };
  const synced = syncTierSectors(tier1);

  assert.equal(synced.length, 24);
  assert.equal(synced[0].startAngleDeg, 0);
  assert.equal(synced[0].endAngleDeg, 15);
  assert.equal(synced[23].startAngleDeg, 345);
  assert.equal(synced[23].endAngleDeg, 360);
});

test('Infield flat and sloped seating modules snap to grid and compute capacities accurately', () => {
  assert.equal(snapToGridValue(13.4, 2, true), 14);
  assert.equal(snapToGridValue(13.4, 5, true), 15);
  assert.equal(snapToGridValue(13.4, 2, false), 13.4);

  const schema = createDefaultSoccerStadiumSchema();
  const slopedMod = schema.infieldModules.find((m) => m.type === 'sloped')!;
  const flatMod = schema.infieldModules.find((m) => m.type === 'flat')!;

  const slopedCap = calculateInfieldModuleCapacity(slopedMod);
  const flatCap = calculateInfieldModuleCapacity(flatMod);

  assert.ok(slopedCap > 100, 'Sloped infield module should have > 100 seats');
  assert.ok(flatCap > 50, 'Flat infield module should have > 50 seats');
});

test('Cross-section and Sightline C-Value analysis computes rows, elevations, and parabolic curve', () => {
  const soccer = createDefaultSoccerStadiumSchema();
  const analysis = calculateCrossSectionAndSightlines(soccer);

  assert.ok(analysis.focalRadiusM > 10);
  assert.ok(analysis.rows.length > 40, 'Should compute sightlines across all 3 tiers');
  assert.ok(analysis.idealParabolicCurve.length > 10, 'Should generate ideal parabolic curve');

  // Verify elevation increases across tiers
  const tier1Rows = analysis.rows.filter((r) => r.tierLevel === 1);
  const tier3Rows = analysis.rows.filter((r) => r.tierLevel === 3);
  assert.ok(tier1Rows.length > 0 && tier3Rows.length > 0);
  assert.ok(
    tier3Rows[0].treadElevationM > tier1Rows[tier1Rows.length - 1].treadElevationM,
    'Tier 3 base elevation must exceed Tier 1 top row elevation'
  );
});

test('Engineering summary and CAD DXF / SVG blueprint exports succeed for all preset stadiums', () => {
  const presets = [
    createDefaultSoccerStadiumSchema(),
    createOlympicOvalStadiumSchema(),
    createIndoorArenaSchema(),
  ];

  for (const preset of presets) {
    const summary = calculateEngineeringSummary(preset);
    assert.ok(summary.totalCapacity > 5000, `Preset ${preset.name} must have > 5000 seats`);
    assert.equal(
      summary.totalCapacity,
      summary.infieldFlatCapacity +
        summary.infieldSlopedCapacity +
        summary.standardStandCapacity +
        summary.vipBoxCapacity
    );

    const dxf = generateStadiumDXF(preset);
    assert.ok(dxf.includes('SECTION') && dxf.includes('INFIELD_BOUNDARY') && dxf.includes('EOF'));

    const svg = generateStadiumSVG(preset);
    assert.ok(svg.startsWith('<?xml') && svg.includes('<svg') && svg.includes('</svg>'));
  }
});

test('Deleted, empty-void, tunnel-exit, and solid-wall sectors have 0 seats, while standard/vip compute capacity', () => {
  const schema = createDefaultSoccerStadiumSchema();
  const tier1 = schema.standTiers[0];
  const sec = tier1.sectors[0];

  const standardCap = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, {
    ...sec,
    fillType: 'standard',
  });
  assert.ok(standardCap > 50, 'Standard sector must have capacity > 50');

  const voidCap = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, {
    ...sec,
    fillType: 'empty-void',
  });
  assert.equal(voidCap, 0, 'Empty void sector must have 0 capacity');

  const deletedCap = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, {
    ...sec,
    isDeleted: true,
  });
  assert.equal(deletedCap, 0, 'Deleted sector must have 0 capacity');

  const tunnelCap = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, {
    ...sec,
    fillType: 'tunnel-exit',
  });
  assert.equal(tunnelCap, 0, 'Tunnel exit sector must have 0 capacity');

  const wallCap = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, {
    ...sec,
    fillType: 'solid-wall',
  });
  assert.equal(wallCap, 0, 'Solid wall sector must have 0 capacity');
});

test('buildStageGeometry produces oriented main deck, catwalk, FOH, and backdrop structures', () => {
  const schema = createDefaultSoccerStadiumSchema();
  schema.infield.coreMode = 'stage';
  schema.infield.stageConfig = {
    type: 'thrust-stage',
    orientationDeg: 90,
    width: 36,
    depth: 20,
    height: 2.0,
    catwalkLength: 15,
    catwalkWidth: 4,
    fohEnabled: true,
    fohDistance: 30,
    fohWidth: 8,
    fohDepth: 5,
    backdropHeight: 12,
  };

  const geo = buildStageGeometry(schema.infield);
  assert.equal(geo.stageDeck.length, 4, 'Main stage deck must have 4 quad corners');
  assert.ok(geo.catwalk && geo.catwalk.length === 4, 'Thrust stage must have 4-point catwalk quad');
  assert.ok(geo.fohConsole && geo.fohConsole.length === 4, 'FOH booth must have 4-point console quad');
  assert.equal(geo.backdropLine.length, 2, 'Backdrop LED frame must have 2 endpoints');
  assert.equal(geo.soundTowers.length, 2, 'Must have 2 sound delay towers');
});

test('validateStadiumSchema correctly parses, validates, and normalizes imported stadium schemas', () => {
  const validSchema = createDefaultSoccerStadiumSchema();
  const res1 = validateStadiumSchema(validSchema);
  assert.equal(res1.valid, true);
  assert.ok(res1.schema);
  assert.equal(res1.schema?.id, validSchema.id);

  // Missing infield error handling
  const res2 = validateStadiumSchema({ name: 'Invalid' });
  assert.equal(res2.valid, false);
  assert.ok(res2.error?.includes('infield'));

  // Backward-compatibility normalization of legacy JSON
  const legacy = {
    name: 'Legacy 1990 Bowl',
    infield: {
      shape: 'circle',
      length: 120,
      width: 120,
    },
    standTiers: [
      {
        level: 1,
        radialDepth: 20,
        sectorCount: 12,
      },
    ],
  };
  const res3 = validateStadiumSchema(legacy);
  assert.equal(res3.valid, true);
  assert.equal(res3.schema?.infield.coreMode, 'sports');
  assert.equal(res3.schema?.infield.pitchOrientationDeg, 0);
  assert.ok(res3.schema?.infield.stageConfig);
  assert.equal(res3.schema?.standTiers[0].sectors.length, 12);
});

test('Beijing 3 landmark stadium project archives (Bird\'s Nest, Wukesong, New Gongti) satisfy structural specifications', () => {
  const birdNest = createBirdNestStadiumSchema();
  const wukesong = createWukesongArenaSchema();
  const gongti = createNewGongtiStadiumSchema();

  // 1. Bird's Nest
  assert.equal(birdNest.id, 'std-beijing-bird-nest');
  assert.equal(birdNest.infield.shape, 'ellipse');
  assert.equal(birdNest.standTiers.length, 3);
  assert.equal(birdNest.standTiers[0].innerOffset, 0);
  const bnSummary = calculateEngineeringSummary(birdNest);
  assert.ok(bnSummary.totalCapacity > 80000, `Bird's Nest capacity should exceed 80,000, got ${bnSummary.totalCapacity}`);
  // Check Marathon tunnel on Tier 1 and Torch vista void on Tier 3
  const marathonSector = birdNest.standTiers[0].sectors.find((s) => s.fillType === 'tunnel-exit');
  assert.ok(marathonSector, 'Bird\'s Nest must have a marathon tunnel exit portal');
  const torchVoidSector = birdNest.standTiers[2].sectors.find((s) => s.fillType === 'empty-void');
  assert.ok(torchVoidSector, 'Bird\'s Nest Tier 3 must have a torch vista empty void');

  // 2. Wukesong Arena
  assert.equal(wukesong.id, 'std-wukesong-arena');
  assert.equal(wukesong.infield.shape, 'square');
  assert.equal(wukesong.standTiers.length, 2);
  assert.equal(wukesong.standTiers[0].innerOffset, 0);
  assert.equal(wukesong.infieldModules.length, 4, 'Wukesong must have 4 infield seating modules');
  const wksSummary = calculateEngineeringSummary(wukesong);
  assert.ok(wksSummary.totalCapacity > 15000, `Wukesong capacity should exceed 15,000, got ${wksSummary.totalCapacity}`);
  assert.equal(wksSummary.totalVipRooms, 48, 'Wukesong must feature 48 luxury VIP suite rooms');

  // 3. New Gongti Stadium
  assert.equal(gongti.id, 'std-new-gongti');
  assert.equal(gongti.infield.shape, 'rounded-rect');
  assert.equal(gongti.standTiers.length, 4, 'New Gongti must have 4 tiers');
  assert.equal(gongti.standTiers[0].innerOffset, 0);
  assert.equal(gongti.infield.pitchOrientationDeg, 90, 'FIFA North-South orientation');
  assert.equal(gongti.infield.safetyMargin, 8.5, 'European close sightline safety margin');
  const gtSummary = calculateEngineeringSummary(gongti);
  assert.ok(gtSummary.totalCapacity > 60000, `New Gongti capacity should exceed 60,000, got ${gtSummary.totalCapacity}`);
  const southFanSector = gongti.standTiers[0].sectors.find((s) => s.name.includes('南看台·国安死忠'));
  assert.ok(southFanSector, 'New Gongti must designate the South Fan Stand for Guo\'an Ultra Fans');

  // 4. Initial saved project library
  const savedProjects = createInitialSavedProjects();
  assert.equal(savedProjects.length, 3);
  assert.equal(savedProjects[0].projectId, 'std-new-gongti');
  assert.equal(savedProjects[1].projectId, 'std-beijing-bird-nest');
  assert.equal(savedProjects[2].projectId, 'std-wukesong-arena');
  for (const proj of savedProjects) {
    assert.ok(proj.revisions.length >= 1);
    assert.ok(proj.revisions[0].totalCapacity > 15000);
  }
});

test('Stand inclination angle relative to ground remains strictly constant when radial depth is lengthened', () => {
  const schema = createNewGongtiStadiumSchema();
  const tier1 = schema.standTiers[0];
  const sector = tier1.sectors[0];
  const targetSlopeDeg = sector.slopeDeg; // e.g. 24°
  const targetSlopeTan = Math.tan(targetSlopeDeg * (Math.PI / 180));

  const depthsToTest = [10, 20, 35, 60, 90];

  for (const depth of depthsToTest) {
    const customizedSector = {
      ...sector,
      customRadialDepth: depth,
      useCustomOverrides: true,
    };

    // Calculate cross section sightline rows
    const modifiedSchema = {
      ...schema,
      standTiers: [
        {
          ...tier1,
          sectors: tier1.sectors.map((s, idx) => (idx === 0 ? customizedSector : s)),
        },
        ...schema.standTiers.slice(1),
      ],
      sightlineConfig: {
        ...schema.sightlineConfig,
        sectionAngleDeg: (sector.startAngleDeg + sector.endAngleDeg) / 2,
      },
    };

    const section = calculateCrossSectionAndSightlines(modifiedSchema);
    const tier1Rows = section.rows.filter((r) => r.tierLevel === 1);
    assert.ok(tier1Rows.length > 0);

    // Verify tread/riser ratio matches tan(targetSlopeDeg)
    for (const r of tier1Rows) {
      const rowSlopeTan = r.riserHeightM / r.treadDepthM;
      assert.ok(
        Math.abs(rowSlopeTan - targetSlopeTan) < 0.01,
        `Row slope tangent ${rowSlopeTan} must equal tan(${targetSlopeDeg}°) = ${targetSlopeTan}`
      );
    }

    // Verify total rise divided by radial depth equals tan(targetSlopeDeg)
    const rise = depth * targetSlopeTan;
    const computedAngle = Math.atan(rise / depth) * (180 / Math.PI);
    assert.ok(
      Math.abs(computedAngle - targetSlopeDeg) < 0.001,
      `Calculated 3D ground angle ${computedAngle}° must equal target slope ${targetSlopeDeg}°`
    );
  }
});

test('Sector vomitory safety exits support custom dimensions, location, and tier-wide batch synchronization', () => {
  const schema = createNewGongtiStadiumSchema();
  const tier1 = schema.standTiers[0];
  const sector0 = tier1.sectors[0];

  // 1. Initial sector capacity without vomitory
  const noExitSector = {
    ...sector0,
    vomitory: {
      ...sector0.vomitory,
      position: 'none' as const,
      enabled: false,
    },
  };
  const capWithoutExit = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, noExitSector);

  // 2. Add custom vomitory with 3.2m width, spanning 4 rows starting from row 5
  const customExitSector = {
    ...sector0,
    vomitory: {
      id: 'vom-custom-1',
      position: 'center' as const,
      width: 3.2,
      startRow: 5,
      rowSpan: 4,
      angularOffsetPct: 15,
      enabled: true,
    },
  };
  const capWithCustomExit = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, customExitSector);
  assert.ok(
    capWithCustomExit < capWithoutExit,
    `Capacity with custom exit (${capWithCustomExit}) must be less than without exit (${capWithoutExit})`
  );

  // 3. Test Dual exit: double width deduction
  const dualExitSector = {
    ...customExitSector,
    vomitory: {
      ...customExitSector.vomitory,
      position: 'dual' as const,
    },
  };
  const capWithDualExit = calculateSectorCapacity(schema.infield, schema.standTiers, tier1, dualExitSector);
  assert.ok(
    capWithDualExit < capWithCustomExit,
    `Dual exit capacity (${capWithDualExit}) must be less than single exit (${capWithCustomExit})`
  );

  // 4. Batch sync: Apply custom vomitory to all sectors in tier 1
  const updatedTier1Sectors = tier1.sectors.map((s) => ({
    ...s,
    vomitory: {
      ...customExitSector.vomitory,
      id: `vom-${s.id}`,
    },
  }));

  assert.equal(updatedTier1Sectors.length, tier1.sectors.length);
  for (const s of updatedTier1Sectors) {
    assert.equal(s.vomitory.width, 3.2);
    assert.equal(s.vomitory.startRow, 5);
    assert.equal(s.vomitory.rowSpan, 4);
    assert.equal(s.vomitory.angularOffsetPct, 15);
    assert.equal(s.vomitory.position, 'center');
    assert.equal(s.vomitory.enabled, true);
  }

  // 5. Verify total safety exits count in stadium stats
  const updatedSchema = {
    ...schema,
    standTiers: [
      {
        ...tier1,
        sectors: updatedTier1Sectors,
      },
      ...schema.standTiers.slice(1),
    ],
  };

  const stats = calculateEngineeringSummary(updatedSchema);
  // Tier 1 has updatedTier1Sectors.length exits (all 'center')
  assert.ok(stats.totalSafetyExits >= updatedTier1Sectors.length);
});

test('Adjusting stand tier slope propagates to all sectors and immediately updates 2D cross-section and 3D elevations', () => {
  const schema = createNewGongtiStadiumSchema();
  const tier1 = schema.standTiers[0];
  const initialSlope = tier1.defaultSlopeDeg; // 24°
  assert.equal(initialSlope, 24);

  // Initial cross section
  const initialSection = calculateCrossSectionAndSightlines(schema);
  const initialT1Rows = initialSection.rows.filter((r) => r.tierId === tier1.id);
  assert.ok(initialT1Rows.length > 0);
  const initialLastRow = initialT1Rows[initialT1Rows.length - 1];

  // User changes tier slope from 24° to 34° (steep rake)
  const targetSlope = 34;
  const updatedTier = {
    ...tier1,
    defaultSlopeDeg: targetSlope,
    sectors: tier1.sectors.map((s) => ({
      ...s,
      slopeDeg: targetSlope,
      riserHeight: Number((s.rowPitch * Math.tan(targetSlope * (Math.PI / 180))).toFixed(3)),
    })),
  };

  const updatedSchema = {
    ...schema,
    standTiers: [updatedTier, ...schema.standTiers.slice(1)],
  };

  // 1. All sectors must have updated slopeDeg = 34°
  for (const s of updatedTier.sectors) {
    assert.equal(s.slopeDeg, 34);
    assert.ok(s.riserHeight > 0.45); // At 34°, riser height is roughly 0.84 * tan(34°) = 0.566m
  }

  // 2. 2D Cross-section must immediately reflect the new slope and higher elevations
  const updatedSection = calculateCrossSectionAndSightlines(updatedSchema);
  const updatedT1Rows = updatedSection.rows.filter((r) => r.tierId === tier1.id);
  assert.ok(updatedT1Rows.length > 0);
  const updatedLastRow = updatedT1Rows[updatedT1Rows.length - 1];

  // At 34°, top row elevation must be significantly higher than at 24°
  assert.ok(
    updatedLastRow.treadElevationM > initialLastRow.treadElevationM + 2.0,
    `Updated top row elevation (${updatedLastRow.treadElevationM}m) must be > 2m higher than initial (${initialLastRow.treadElevationM}m)`
  );

  // 3. 3D geometry tan(slopeDeg) calculation
  const slopeTan = Math.tan(targetSlope * (Math.PI / 180));
  const radialSpan = tier1.radialDepth;
  const expectedRise = radialSpan * slopeTan;
  assert.ok(
    expectedRise > radialSpan * Math.tan(24 * (Math.PI / 180)) + 3.0,
    '3D outer rim rise must be substantially higher with 34° slope'
  );
});

test('Sectors are sliced evenly along infield perimeter shape instead of uniform circular angles', () => {
  const schema = createNewGongtiStadiumSchema(); // rounded-rect 125m x 86m, r=18
  const tier1 = schema.standTiers[0];
  const synced = syncTierSectors({ ...tier1, sectorCount: 20 }, schema.infield);

  assert.equal(synced.length, 20);
  assert.equal(synced[0].startAngleDeg, 0);
  assert.equal(synced[5].startAngleDeg, 90);
  assert.equal(synced[10].startAngleDeg, 180);
  assert.equal(synced[15].startAngleDeg, 270);
  assert.equal(synced[19].endAngleDeg, 360);

  // For a 125 x 86 rounded-rect, East sector (around 0°) is farther from (0,0) than North sector (around 90°),
  // so equal infield perimeter arc length means North sector spans a WIDER central angle than East sector!
  const eastSpanDeg = synced[0].endAngleDeg - synced[0].startAngleDeg;
  const northSpanDeg = synced[4].endAngleDeg - synced[4].startAngleDeg;
  assert.ok(
    northSpanDeg > eastSpanDeg + 3,
    `North sector span (${northSpanDeg}°) should be wider than East sector span (${eastSpanDeg}°) to maintain uniform infield frontage`
  );

  // Verify perimeter helper matches total length
  const perim = getInfieldPerimeterMeters(schema.infield);
  assert.ok(perim > 380 && perim < 410, `New Gongti perimeter expected ~391m, got ${perim}`);

  // Verify circle still yields exact equal 18° sectors
  const circleAngles = computeInfieldShapeSectorAngles(
    { ...schema.infield, shape: 'circle', length: 100, width: 100 },
    20
  );
  assert.equal(circleAngles[1], 18);
  assert.equal(circleAngles[2], 36);
});

test('2-choice morphMode switches accurately between infield-shape expansion and concentric-circle morphing', () => {
  const schema = createDefaultSoccerStadiumSchema();
  schema.infield.shape = 'rectangle';
  schema.infield.length = 120; // half a = 60
  schema.infield.width = 80; // half b = 40
  schema.infield.cornerRadius = 0;

  const baseTier = {
    ...schema.standTiers[0],
    level: 1,
    innerOffset: 0,
    radialDepth: 20,
    concentricMorph: 1.0,
  };

  // Mode 1: 'infield-shape' (100%) expands sharp 120x80 rectangle by 20m -> sharp 160x120 rectangle (a=80, b=60)
  const infieldShapeTier = { ...baseTier, morphMode: 'infield-shape' as const };
  const rEastShape = getTierRadiiAtAngle(schema.infield, [infieldShapeTier], infieldShapeTier, 0);
  const rNorthShape = getTierRadiiAtAngle(schema.infield, [infieldShapeTier], infieldShapeTier, 90);
  const cornerAngle = Math.atan2(60, 80) * (180 / Math.PI);
  const rCornerShape = getTierRadiiAtAngle(
    schema.infield,
    [infieldShapeTier],
    infieldShapeTier,
    cornerAngle
  );

  assert.equal(rEastShape.outerRadius, 80);
  assert.equal(rNorthShape.outerRadius, 60);
  assert.ok(
    Math.abs(rCornerShape.outerRadius - 100) < 0.05,
    `Rectangle corner (80,60) outerRadius must be 100m, got ${rCornerShape.outerRadius}`
  );

  // Mode 2: 'concentric-circle' (100%) on Tier 2 morphs outer perimeter into pure circle centered at (0,0)
  const tier2Circle = {
    ...schema.standTiers[1],
    level: 2,
    innerOffset: 2,
    radialDepth: 15,
    morphMode: 'concentric-circle' as const,
    concentricMorph: 1.0,
  };
  const tiersForCircle = [infieldShapeTier, tier2Circle];
  const rEastCircle = getTierRadiiAtAngle(schema.infield, tiersForCircle, tier2Circle, 0);
  const rNorthCircle = getTierRadiiAtAngle(schema.infield, tiersForCircle, tier2Circle, 90);
  // Cumulative depth = 20 + 2 + 15 = 37; maxAxisHalf = 60 -> pure circle outerRadius = 97m everywhere!
  assert.equal(rEastCircle.outerRadius, 97);
  assert.equal(rNorthCircle.outerRadius, 97);
});

test('Stand sectors slice strictly at 90 degrees perpendicular to infield edges across tiers and morph modes', () => {
  const schema = createNewGongtiStadiumSchema(); // rounded-rect 125x86, r=18
  // Force clean straight sides for rounded-rect and rectangle tests
  const rectInfield = {
    ...schema.infield,
    shape: 'rectangle' as const,
    length: 120, // a = 60
    width: 80, // b = 40
    cornerRadius: 0,
  };

  const tier1 = {
    ...schema.standTiers[0],
    level: 1,
    innerOffset: 0,
    radialDepth: 20,
    sectorCount: 20, // perimeter = 400m -> 20m per sector
    morphMode: 'infield-shape' as const,
    concentricMorph: 1.0,
  };
  const tier2Circle = {
    ...schema.standTiers[1],
    level: 2,
    innerOffset: 2,
    radialDepth: 16,
    sectorCount: 20,
    morphMode: 'concentric-circle' as const,
    concentricMorph: 1.0,
  };

  const syncedT1 = syncTierSectors(tier1, rectInfield, [tier1, tier2Circle]);
  const syncedT2 = syncTierSectors(tier2Circle, rectInfield, [tier1, tier2Circle]);
  const tiers = [
    { ...tier1, sectors: syncedT1 },
    { ...tier2Circle, sectors: syncedT2 },
  ];

  // Pick a sector strictly on the South straight edge (u in (0.10, 0.40), i.e., y = +40)
  // Both start seam and end seam MUST be strictly vertical (inX === outX, 90° to horizontal South edge)
  const southSecT1 = syncedT1.find(
    (s) => (s.startPerimFrac ?? 0) > 0.105 && (s.endPerimFrac ?? 0) <= 0.395
  )!;
  assert.ok(southSecT1, 'Found sector strictly on South straight edge');
  const samplesT1 = getSectorNormalSamples(rectInfield, tiers, tiers[0], southSecT1, 6);
  const seamStartT1 = samplesT1[0];
  const seamEndT1 = samplesT1[samplesT1.length - 1];
  assert.ok(Math.abs(seamStartT1.inY - 40) < 0.05, 'South sector inner edge lies at y = 40');
  assert.ok(Math.abs(seamStartT1.outX - seamStartT1.inX) < 0.02, 'South sector start seam must be strictly 90° vertical');
  assert.ok(Math.abs(seamEndT1.outX - seamEndT1.inX) < 0.02, 'South sector end seam must be strictly 90° vertical');

  // Even on Tier 2 in 'concentric-circle' morphMode, the seam between sectors still cuts at 90° to the infield edge!
  const southSecT2 = syncedT2.find(
    (s) => (s.startPerimFrac ?? 0) > 0.105 && (s.endPerimFrac ?? 0) <= 0.395
  )!;
  assert.ok(southSecT2, 'Found Tier 2 sector strictly on South straight edge');
  const samplesT2 = getSectorNormalSamples(rectInfield, tiers, tiers[1], southSecT2, 6);
  const seamStartT2 = samplesT2[0];
  const seamEndT2 = samplesT2[samplesT2.length - 1];
  assert.ok(
    Math.abs(seamStartT2.outX - seamStartT2.inX) < 0.02,
    `Tier 2 start seam in concentric-circle mode must still cut at 90° (got inX=${seamStartT2.inX}, outX=${seamStartT2.outX})`
  );
  assert.ok(
    Math.abs(seamEndT2.outX - seamEndT2.inX) < 0.02,
    `Tier 2 end seam in concentric-circle mode must still cut at 90° (got inX=${seamEndT2.inX}, outX=${seamEndT2.outX})`
  );
  // Check Tier 2 outer points lie on concentric circle R = 60 + 20 + 2 + 16 = 98m
  assert.ok(
    Math.abs(Math.hypot(seamStartT2.outX, seamStartT2.outY) - 98) < 0.15,
    'Tier 2 outer rim in concentric-circle mode lies on 98m circle'
  );

  // Check miter corner wrapping on sharp rectangle: sector spanning u in [0.05, 0.15] wraps SE corner (60, 40) -> outer (80, 60)
  const cornerTier = {
    ...tier1,
    sectorCount: 10, // sector 1 spans u in [0.1, 0.2], sector 0 wraps [0.0, 0.1]... wait sectorCount=5 -> sector 0 spans [0, 0.2] covering u=0.10 corner!
  };
  const cornerSynced = syncTierSectors({ ...cornerTier, sectorCount: 5 }, rectInfield);
  const cornerSamples = getSectorNormalSamples(rectInfield, [cornerTier], cornerTier, cornerSynced[0], 6);
  const hasMiterVertex = cornerSamples.some(
    (s) => Math.abs(s.outX - 80) < 0.1 && Math.abs(s.outY - 60) < 0.1
  );
  assert.ok(hasMiterVertex, 'Sharp rectangle sector crossing SE corner must emit exact miter outer vertex (80, 60)');

  // Check Ellipse 90° orthogonality: (out - in) dot tangent === 0
  const ellipseInfield = {
    ...rectInfield,
    shape: 'ellipse' as const,
    length: 140, // a = 70
    width: 100, // b = 50
  };
  const aE = 70;
  const bE = 50;
  for (const frac of [0.08, 0.17, 0.33, 0.62]) {
    const pt = getInfieldPointAndNormalAtFrac(ellipseInfield, frac);
    // Tangent of ellipse x^2/a^2 + y^2/b^2 = 1 at (x, y) is (-y / b^2, x / a^2)
    const tx = -pt.y / (bE * bE);
    const ty = pt.x / (aE * aE);
    const tLen = Math.hypot(tx, ty);
    const dot = (pt.nx * tx + pt.ny * ty) / tLen;
    assert.ok(Math.abs(dot) < 1e-3, `Ellipse normal at frac=${frac} must be strictly 90° to tangent (dot=${dot})`);
  }

  // Check that adjacent sector gaps stay strictly parallel & constant-width (~0.60m) on outer tiers (no V-shaped flare!)
  const wukesong = createWukesongArenaSchema();
  const wksOuterTier = wukesong.standTiers[wukesong.standTiers.length - 1];
  for (let i = 0; i < wksOuterTier.sectors.length - 1; i++) {
    const sA = getSectorNormalSamples(wukesong.infield, wukesong.standTiers, wksOuterTier, wksOuterTier.sectors[i], 8);
    const sB = getSectorNormalSamples(wukesong.infield, wukesong.standTiers, wksOuterTier, wksOuterTier.sectors[i + 1], 8);
    const endA = sA[sA.length - 1];
    const startB = sB[0];
    const innerGap = Math.hypot(startB.inX - endA.inX, startB.inY - endA.inY);
    const outerGap = Math.hypot(startB.outX - endA.outX, startB.outY - endA.outY);
    assert.ok(
      Math.abs(outerGap - innerGap) < 0.12,
      `Wukesong outer tier sector seam ${i}-${i + 1} gap must stay parallel (inner=${innerGap.toFixed(3)}m, outer=${outerGap.toFixed(3)}m)`
    );
    // Verify opposing seam edges are parallel (|cross product| of unit vectors < 1e-3)
    const vAx = endA.outX - endA.inX;
    const vAy = endA.outY - endA.inY;
    const vBx = startB.outX - startB.inX;
    const vBy = startB.outY - startB.inY;
    const sinAngle = Math.abs(vAx * vBy - vAy * vBx) / (Math.hypot(vAx, vAy) * Math.hypot(vBx, vBy));
    assert.ok(sinAngle < 0.01, `Wukesong sector seam ${i}-${i + 1} opposing edges must be parallel (sin=${sinAngle})`);
  }

  const gongti = createNewGongtiStadiumSchema();
  const gtOuterTier = gongti.standTiers[gongti.standTiers.length - 1];
  for (let i = 0; i < gtOuterTier.sectors.length - 1; i++) {
    const sA = getSectorNormalSamples(gongti.infield, gongti.standTiers, gtOuterTier, gtOuterTier.sectors[i], 8);
    const sB = getSectorNormalSamples(gongti.infield, gongti.standTiers, gtOuterTier, gtOuterTier.sectors[i + 1], 8);
    const endA = sA[sA.length - 1];
    const startB = sB[0];
    const innerGap = Math.hypot(startB.inX - endA.inX, startB.inY - endA.inY);
    const outerGap = Math.hypot(startB.outX - endA.outX, startB.outY - endA.outY);
    assert.ok(
      Math.abs(outerGap - innerGap) < 0.12,
      `New Gongti 4F sector seam ${i}-${i + 1} gap must stay parallel (inner=${innerGap.toFixed(3)}m, outer=${outerGap.toFixed(3)}m)`
    );
  }
});

test('deduplicateSavedProjects and makeUniqueId prevent duplicate projectId and revisionId React keys', () => {
  assert.equal(makeUniqueId('std-new-gongti', ['std-new-gongti']), 'std-new-gongti-2');
  assert.equal(
    makeUniqueId('std-new-gongti', ['std-new-gongti', 'std-new-gongti-2']),
    'std-new-gongti-3'
  );

  const initial = createInitialSavedProjects();
  const gongti = initial.find((p) => p.projectId === 'std-new-gongti')!;
  assert.ok(gongti);

  // Simulate corrupted localStorage / repeated schema import producing duplicate std-new-gongti + duplicate revisionId
  const duplicatedInput = [
    {
      ...gongti,
      revisions: [
        gongti.revisions[0],
        { ...gongti.revisions[0], note: 'Duplicate rev id' },
      ],
    },
    ...initial,
  ];

  const cleaned = deduplicateSavedProjects(duplicatedInput);
  assert.equal(cleaned.length, duplicatedInput.length);

  const projIds = cleaned.map((p) => p.projectId);
  assert.equal(new Set(projIds).size, projIds.length, 'All projectIds must be strictly unique');
  assert.ok(projIds.includes('std-new-gongti'));
  assert.ok(projIds.includes('std-new-gongti-2'));
  assert.equal(cleaned[1].currentSchema.id, cleaned[1].projectId);

  const firstRevIds = cleaned[0].revisions.map((r) => r.revisionId);
  assert.equal(new Set(firstRevIds).size, firstRevIds.length, 'All revisionIds must be strictly unique');
});

test('Equal-area 90-degree slicing keeps sector areas balanced between straight edges and curved corners', () => {
  const assertUniformAreas = (
    label: string,
    schema: ReturnType<typeof createNewGongtiStadiumSchema>,
    maxRatio = 1.15
  ) => {
    for (const tier of schema.standTiers) {
      const areas = tier.sectors.map((sec) =>
        calculateSectorPolygonArea(schema.infield, schema.standTiers, tier, sec)
      );
      const minA = Math.min(...areas);
      const maxA = Math.max(...areas);
      const ratio = maxA / Math.max(1, minA);
      assert.ok(
        ratio <= maxRatio,
        `${label} Tier ${tier.level} sector areas must stay balanced (min=${minA}m2, max=${maxA}m2, ratio=${ratio.toFixed(3)})`
      );
    }
  };

  assertUniformAreas('New Gongti (rounded-rect)', createNewGongtiStadiumSchema(), 1.12);
  assertUniformAreas('Wukesong (rounded-square)', createWukesongArenaSchema(), 1.12);
  assertUniformAreas('Birds Nest (ellipse)', createBirdNestStadiumSchema(), 1.12);

  // Also test sharp rectangle (r=0) and concentric-circle morphMode
  const base = createNewGongtiStadiumSchema();
  const sharpRectInfield = {
    ...base.infield,
    shape: 'rectangle' as const,
    length: 120,
    width: 80,
    cornerRadius: 0,
  };
  const sharpTiersBase = base.standTiers.slice(0, 2).map((t) => ({
    ...t,
    morphMode: t.level === 2 ? ('concentric-circle' as const) : ('infield-shape' as const),
    concentricMorph: 1.0,
  }));
  const sharpTiers = sharpTiersBase.map((t) => ({
    ...t,
    sectors: syncTierSectors(t, sharpRectInfield, sharpTiersBase),
  }));
  assertUniformAreas(
    'Sharp Rectangle + Concentric-Circle T2',
    { ...base, infield: sharpRectInfield, standTiers: sharpTiers },
    1.15
  );
});
