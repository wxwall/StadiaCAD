import React, { useEffect, useRef, useState } from 'react';
import { StadiumSchema } from '../types/stadium';
import {
  buildInfieldPerimeterPoints,
  buildStageGeometry,
  DEG_TO_RAD,
  getInfieldPointAndNormalAtFrac,
  getSectorNormalSamples,
  getSectorPerimFracs,
  getTierNormalDistancesAtPoint,
} from '../utils/stadiumEngine';
import { Box, Eye, Layers, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface StadiumPreview3DProps {
  schema: StadiumSchema;
}

interface Poly3D {
  pts: Array<{ x: number; y: number; z: number }>;
  fill: string;
  stroke: string;
  lineWidth?: number;
}

export const StadiumPreview3D: React.FC<StadiumPreview3DProps> = ({ schema }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [azimuthDeg, setAzimuthDeg] = useState<number>(38);
  const [pitchDeg, setPitchDeg] = useState<number>(56);
  const [cameraScale, setCameraScale] = useState<number>(2.1);
  const [renderMode, setRenderMode] = useState<'solid' | 'wireframe' | 'vip-highlight'>('solid');
  const [showSectionPlane, setShowSectionPlane] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragLast, setDragLast] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 960;
    const height = canvas.clientHeight || 600;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#07090E';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height * 0.56;

    const az = azimuthDeg * DEG_TO_RAD;
    const el = pitchDeg * DEG_TO_RAD;
    const cosAz = Math.cos(az);
    const sinAz = Math.sin(az);
    const cosEl = Math.cos(el);
    const sinEl = Math.sin(el);

    const project = (x: number, y: number, z: number) => {
      // Rotate in XY plane by azimuth
      const rx = x * cosAz - y * sinAz;
      const ry = x * sinAz + y * cosAz;
      // Tilt by elevation angle (Z is vertical up)
      const sx = cx + rx * cameraScale;
      const sy = cy + (ry * cosEl - z * sinEl * 1.45) * cameraScale;
      const depth = ry * sinEl + z * cosEl;
      return { sx, sy, depth };
    };

    // 1. Draw 3D Ground Reference Grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.65)';
    ctx.lineWidth = 1;
    for (let g = -160; g <= 160; g += 20) {
      const p1 = project(g, -160, 0);
      const p2 = project(g, 160, 0);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();

      const q1 = project(-160, g, 0);
      const q2 = project(160, g, 0);
      ctx.beginPath();
      ctx.moveTo(q1.sx, q1.sy);
      ctx.lineTo(q2.sx, q2.sy);
      ctx.stroke();
    }

    // 2. Draw Infield Ground Surface
    const infPts = buildInfieldPerimeterPoints(schema.infield, 72);
    ctx.beginPath();
    infPts.forEach((p, idx) => {
      const pr = project(p.x, p.y, 0.1);
      if (idx === 0) ctx.moveTo(pr.sx, pr.sy);
      else ctx.lineTo(pr.sx, pr.sy);
    });
    ctx.closePath();
    ctx.fillStyle =
      renderMode === 'wireframe'
        ? 'rgba(16, 185, 129, 0.03)'
        : schema.infield.surfaceType === 'synthetic-track'
        ? 'rgba(180, 83, 9, 0.28)'
        : 'rgba(16, 185, 129, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Inner Pitch / Court Rectangle (Rotated by pitchOrientationDeg)
    if (schema.infield.coreMode === 'sports' || schema.infield.coreMode === 'hybrid') {
      const px = schema.infield.pitchLength / 2;
      const py = schema.infield.pitchWidth / 2;
      const radPitch = (schema.infield.pitchOrientationDeg || 0) * DEG_TO_RAD;
      const cosP = Math.cos(radPitch);
      const sinP = Math.sin(radPitch);
      const rot = (lx: number, ly: number) => ({
        x: lx * cosP - ly * sinP,
        y: lx * sinP + ly * cosP,
      });

      const c1 = rot(-px, -py);
      const c2 = rot(px, -py);
      const c3 = rot(px, py);
      const c4 = rot(-px, py);

      const pitchCorners = [
        project(c1.x, c1.y, 0.15),
        project(c2.x, c2.y, 0.15),
        project(c3.x, c3.y, 0.15),
        project(c4.x, c4.y, 0.15),
      ];
      ctx.beginPath();
      pitchCorners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.sx, c.sy) : ctx.lineTo(c.sx, c.sy)));
      ctx.closePath();
      ctx.fillStyle =
        renderMode === 'wireframe' ? 'transparent' : 'rgba(16, 185, 129, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // Collect 3D Polygons for Depth-Sorted Painter's Algorithm
    const polys: Poly3D[] = [];

    // 2.5 Add 3D Concert / Performance Stage Components
    if (schema.infield.coreMode === 'stage' || schema.infield.coreMode === 'hybrid') {
      const stageGeo = buildStageGeometry(schema.infield);
      const stageH = Math.max(1.2, schema.infield.stageConfig?.height || 2.0);

      // Stage Deck Top Surface
      polys.push({
        pts: stageGeo.stageDeck.map((p) => ({ x: p.x, y: p.y, z: stageH })),
        fill:
          renderMode === 'wireframe'
            ? 'rgba(236, 72, 153, 0.08)'
            : 'rgba(236, 72, 153, 0.72)',
        stroke: '#F43F5E',
        lineWidth: 1.2,
      });

      // Stage Front Skirt
      polys.push({
        pts: [
          { x: stageGeo.stageDeck[0].x, y: stageGeo.stageDeck[0].y, z: 0 },
          { x: stageGeo.stageDeck[1].x, y: stageGeo.stageDeck[1].y, z: 0 },
          { x: stageGeo.stageDeck[1].x, y: stageGeo.stageDeck[1].y, z: stageH },
          { x: stageGeo.stageDeck[0].x, y: stageGeo.stageDeck[0].y, z: stageH },
        ],
        fill: 'rgba(30, 27, 75, 0.88)',
        stroke: '#EC4899',
        lineWidth: 1.0,
      });

      // Catwalk Runway
      if (stageGeo.catwalk) {
        polys.push({
          pts: stageGeo.catwalk.map((p) => ({ x: p.x, y: p.y, z: stageH })),
          fill:
            renderMode === 'wireframe'
              ? 'rgba(244, 63, 94, 0.1)'
              : 'rgba(244, 63, 94, 0.8)',
          stroke: '#FB7185',
          lineWidth: 1.1,
        });
      }

      // Backdrop Giant LED Screen Wall
      const bdH = stageH + Math.max(6, schema.infield.stageConfig?.backdropHeight || 12);
      polys.push({
        pts: [
          { x: stageGeo.backdropLine[0].x, y: stageGeo.backdropLine[0].y, z: stageH },
          { x: stageGeo.backdropLine[1].x, y: stageGeo.backdropLine[1].y, z: stageH },
          { x: stageGeo.backdropLine[1].x, y: stageGeo.backdropLine[1].y, z: bdH },
          { x: stageGeo.backdropLine[0].x, y: stageGeo.backdropLine[0].y, z: bdH },
        ],
        fill:
          renderMode === 'wireframe'
            ? 'rgba(225, 29, 72, 0.15)'
            : 'rgba(225, 29, 72, 0.75)',
        stroke: '#FDA4AF',
        lineWidth: 1.4,
      });

      // FOH Audio/Lighting Booth
      if (stageGeo.fohConsole) {
        polys.push({
          pts: stageGeo.fohConsole.map((p) => ({ x: p.x, y: p.y, z: 0.8 })),
          fill: 'rgba(139, 92, 246, 0.75)',
          stroke: '#C4B5FD',
          lineWidth: 1.0,
        });
      }
    }

    // 3. Add Infield Modular Seat Blocks (Flat & Sloped 3D Wedges)
    for (const mod of schema.infieldModules) {
      const hw = mod.width / 2;
      const hd = mod.depth / 2;
      const rad = mod.rotationDeg * DEG_TO_RAD;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);

      const toWorld = (lx: number, ly: number, lz: number) => ({
        x: mod.x + lx * cosR - ly * sinR,
        y: mod.y + lx * sinR + ly * cosR,
        z: lz,
      });

      const zFront = mod.baseElevation + 0.3;
      const zBack =
        mod.type === 'sloped'
          ? zFront + mod.depth * Math.tan(mod.slopeDeg * DEG_TO_RAD)
          : zFront + 0.4;

      const pFL = toWorld(-hw, -hd, zFront);
      const pFR = toWorld(hw, -hd, zFront);
      const pBR = toWorld(hw, hd, zBack);
      const pBL = toWorld(-hw, hd, zBack);

      polys.push({
        pts: [pFL, pFR, pBR, pBL],
        fill:
          renderMode === 'wireframe'
            ? 'rgba(245, 158, 11, 0.05)'
            : mod.type === 'sloped'
            ? 'rgba(245, 158, 11, 0.62)'
            : 'rgba(16, 185, 129, 0.55)',
        stroke: mod.type === 'sloped' ? '#FBBF24' : '#34D399',
        lineWidth: 1.1,
      });
    }

    // 4. Add Multi-Floor Concentric Stand Sectors
    const sortedTiers = [...schema.standTiers].sort((a, b) => a.level - b.level);

    for (const tier of sortedTiers) {
      for (const sector of tier.sectors) {
        // If sector is deleted or an empty void, omit to create realistic open horseshoe / U-opening / vista!
        if (sector.isDeleted || sector.fillType === 'empty-void') {
          continue;
        }

        const isTunnel = sector.fillType === 'tunnel-exit';
        const isWall = sector.fillType === 'solid-wall';
        const isVip = sector.fillType === 'vip-box';

        const zInner = tier.baseElevation;
        const slopeRad = sector.slopeDeg * DEG_TO_RAD;
        const slopeTan = Math.tan(slopeRad);

        const { startFrac, endFrac } = getSectorPerimFracs(schema.infield, tier, sector);
        const spanFrac = Math.max(0, endFrac - startFrac);
        const midFrac = (startFrac + endFrac) / 2;
        const isCornerWedge =
          spanFrac < 1e-4 &&
          sector.startNormalRad !== undefined &&
          sector.endNormalRad !== undefined;
        const midCornerRad = isCornerWedge
          ? (sector.startNormalRad! + sector.endNormalRad!) / 2
          : 0;

        // Tunnel Portal Roadway (Strictly 90° perpendicular to infield edge)
        if (isTunnel) {
          const rawMidPt = getInfieldPointAndNormalAtFrac(schema.infield, midFrac);
          const midPt = isCornerWedge
            ? {
                x: rawMidPt.x,
                y: rawMidPt.y,
                nx: Math.cos(midCornerRad),
                ny: Math.sin(midCornerRad),
              }
            : rawMidPt;
          const midDist = getTierNormalDistancesAtPoint(
            schema.infield,
            sortedTiers,
            tier,
            midPt.x,
            midPt.y,
            midPt.nx,
            midPt.ny,
            isCornerWedge
          );
          const inD = midDist.dIn + (sector.customRadialOffset || 0);
          const outD = sector.customRadialDepth ? inD + sector.customRadialDepth : midDist.dOut;
          const tx = -midPt.ny;
          const ty = midPt.nx;
          const hw = 3.2;
          polys.push({
            pts: [
              { x: midPt.x + inD * midPt.nx - hw * tx, y: midPt.y + inD * midPt.ny - hw * ty, z: 0.1 },
              { x: midPt.x + inD * midPt.nx + hw * tx, y: midPt.y + inD * midPt.ny + hw * ty, z: 0.1 },
              { x: midPt.x + outD * midPt.nx + hw * tx, y: midPt.y + outD * midPt.ny + hw * ty, z: 0.1 },
              { x: midPt.x + outD * midPt.nx - hw * tx, y: midPt.y + outD * midPt.ny - hw * ty, z: 0.1 },
            ],
            fill: 'rgba(16, 185, 129, 0.45)',
            stroke: '#10B981',
            lineWidth: 1.2,
          });
          continue;
        }

        const samples = getSectorNormalSamples(schema.infield, sortedTiers, tier, sector, 4);
        const subSteps = Math.max(1, samples.length - 1);

        // Solid Concrete Facade Wall
        if (isWall) {
          for (let s = 0; s < subSteps; s++) {
            const s1 = samples[s];
            const s2 = samples[s + 1];
            const zOut1 = zInner + s1.perpRun * slopeTan;
            const zOut2 = zInner + s2.perpRun * slopeTan;
            polys.push({
              pts: [
                { x: s1.inX, y: s1.inY, z: zInner },
                { x: s2.inX, y: s2.inY, z: zInner },
                { x: s2.outX, y: s2.outY, z: zOut2 + 2.5 },
                { x: s1.outX, y: s1.outY, z: zOut1 + 2.5 },
              ],
              fill: 'rgba(71, 85, 105, 0.85)',
              stroke: '#94A3B8',
              lineWidth: 1.0,
            });
          }
          continue;
        }

        for (let s = 0; s < subSteps; s++) {
          const s1 = samples[s];
          const s2 = samples[s + 1];

          // Height of outer rim is computed from perpendicular run * tan(slopeDeg),
          // preserving exact constant inclination angle sector.slopeDeg across straight & curved sides.
          const zOuter1 = zInner + s1.perpRun * slopeTan;
          const zOuter2 = zInner + s2.perpRun * slopeTan;

          const pIn1 = { x: s1.inX, y: s1.inY, z: zInner };
          const pIn2 = { x: s2.inX, y: s2.inY, z: zInner };
          const pOut2 = { x: s2.outX, y: s2.outY, z: zOuter2 };
          const pOut1 = { x: s1.outX, y: s1.outY, z: zOuter1 };

          // Bowl Seating Slope Surface
          let fillStyle = 'rgba(6, 182, 212, 0.42)';
          let strokeStyle = '#0891B2';

          if (renderMode === 'wireframe') {
            fillStyle = 'rgba(6, 182, 212, 0.04)';
            strokeStyle = isVip ? '#F59E0B' : '#22D3EE';
          } else if (isVip) {
            fillStyle = 'rgba(245, 158, 11, 0.65)';
            strokeStyle = '#FBBF24';
          } else if (renderMode === 'vip-highlight') {
            fillStyle =
              tier.level === 1
                ? 'rgba(14, 165, 233, 0.35)'
                : tier.level === 2
                ? 'rgba(56, 189, 248, 0.45)'
                : 'rgba(99, 102, 241, 0.45)';
          } else {
            fillStyle =
              tier.level === 1
                ? 'rgba(6, 182, 212, 0.42)'
                : tier.level === 2
                ? 'rgba(14, 165, 233, 0.48)'
                : 'rgba(56, 189, 248, 0.52)';
          }

          polys.push({
            pts: [pIn1, pIn2, pOut2, pOut1],
            fill: fillStyle,
            stroke: strokeStyle,
            lineWidth: 0.9,
          });

          // Side Edge Closure Panels for customized sectors (watertight solid wedge)
          if ((sector.customRadialDepth || sector.customRadialOffset) && s === 0) {
            polys.push({
              pts: [
                pIn1,
                pOut1,
                { ...pOut1, z: zInner },
                { ...pIn1, z: zInner },
              ],
              fill: 'rgba(15, 23, 42, 0.85)',
              stroke: isVip ? '#F59E0B' : '#0891B2',
              lineWidth: 0.9,
            });
          }
          if ((sector.customRadialDepth || sector.customRadialOffset) && s === subSteps - 1) {
            polys.push({
              pts: [
                pIn2,
                pOut2,
                { ...pOut2, z: zInner },
                { ...pIn2, z: zInner },
              ],
              fill: 'rgba(15, 23, 42, 0.85)',
              stroke: isVip ? '#F59E0B' : '#0891B2',
              lineWidth: 0.9,
            });
          }

          // Rear Perimeter Safety Guardrail / Facade Wall
          if (sector.guardrail.rearWallEnabled && s === Math.floor(subSteps / 2)) {
            const wallH = sector.guardrail.rearWallHeight;
            polys.push({
              pts: [
                pOut1,
                pOut2,
                { ...pOut2, z: zOuter2 + wallH },
                { ...pOut1, z: zOuter1 + wallH },
              ],
              fill:
                renderMode === 'wireframe'
                  ? 'transparent'
                  : 'rgba(15, 23, 42, 0.78)',
              stroke: isVip ? '#F59E0B' : '#38BDF8',
              lineWidth: 0.8,
            });
          }
        }

        // 3D Vomitory & Safety Exit Portals (Oriented perpendicularly inward toward infield)
        if (
          !isTunnel &&
          !isWall &&
          sector.vomitory &&
          sector.vomitory.position !== 'none' &&
          sector.vomitory.enabled !== false
        ) {
          const offsetFrac = ((sector.vomitory.angularOffsetPct || 0) / 100) * spanFrac;
          const vomFracs: number[] = [];

          if (sector.vomitory.position === 'center') {
            vomFracs.push(midFrac + offsetFrac);
          } else if (sector.vomitory.position === 'left') {
            vomFracs.push(startFrac + spanFrac * 0.28 + offsetFrac);
          } else if (sector.vomitory.position === 'right') {
            vomFracs.push(startFrac + spanFrac * 0.72 + offsetFrac);
          } else if (sector.vomitory.position === 'dual') {
            vomFracs.push(
              startFrac + spanFrac * 0.25 + offsetFrac,
              startFrac + spanFrac * 0.75 + offsetFrac
            );
          } else if (sector.vomitory.position === 'custom') {
            vomFracs.push(midFrac + offsetFrac);
          }

          for (const vFrac of vomFracs) {
            const rawVPt = getInfieldPointAndNormalAtFrac(schema.infield, vFrac);
            const vPt = isCornerWedge
              ? {
                  x: rawVPt.x,
                  y: rawVPt.y,
                  nx: Math.cos(
                    midCornerRad +
                      ((sector.vomitory.angularOffsetPct || 0) / 100) *
                        (sector.endNormalRad! - sector.startNormalRad!)
                  ),
                  ny: Math.sin(
                    midCornerRad +
                      ((sector.vomitory.angularOffsetPct || 0) / 100) *
                        (sector.endNormalRad! - sector.startNormalRad!)
                  ),
                }
              : rawVPt;
            const vDist = getTierNormalDistancesAtPoint(
              schema.infield,
              sortedTiers,
              tier,
              vPt.x,
              vPt.y,
              vPt.nx,
              vPt.ny,
              isCornerWedge
            );
            const effInD = vDist.dIn + (sector.customRadialOffset || 0);
            const effOutD = sector.customRadialDepth ? effInD + sector.customRadialDepth : vDist.dOut;
            const totalDepthSpan = Math.max(1, effOutD - effInD);
            const totalRows = Math.max(1, sector.rows || 1);
            const rowPitch = totalDepthSpan / totalRows;

            const startRow = Math.max(1, sector.vomitory.startRow || 1);
            const rowSpan = Math.max(1, sector.vomitory.rowSpan || 3);
            const dStart = effInD + Math.min(totalDepthSpan - 1.2, Math.max(0, (startRow - 1) * rowPitch));
            const depthM = Math.max(1.8, Math.min(totalDepthSpan, rowSpan * rowPitch));
            const dEnd = Math.min(effOutD, dStart + depthM);

            const portalWidth = Math.max(1.2, sector.vomitory.width || 2.4);
            const hw = portalWidth / 2;
            const tx = -vPt.ny;
            const ty = vPt.nx;

            const zAtStart = zInner + (dStart - effInD) * slopeTan;
            const zAtEnd = zInner + (dEnd - effInD) * slopeTan;
            const zWalkway = zAtStart + 0.08;

            // 1. Walkway Floor Quad (Recessed emerald evacuation corridor)
            const fInL = {
              x: vPt.x + dStart * vPt.nx - hw * tx,
              y: vPt.y + dStart * vPt.ny - hw * ty,
              z: zWalkway,
            };
            const fInR = {
              x: vPt.x + dStart * vPt.nx + hw * tx,
              y: vPt.y + dStart * vPt.ny + hw * ty,
              z: zWalkway,
            };
            const fOutR = {
              x: vPt.x + dEnd * vPt.nx + hw * tx,
              y: vPt.y + dEnd * vPt.ny + hw * ty,
              z: zWalkway,
            };
            const fOutL = {
              x: vPt.x + dEnd * vPt.nx - hw * tx,
              y: vPt.y + dEnd * vPt.ny - hw * ty,
              z: zWalkway,
            };

            polys.push({
              pts: [fInL, fInR, fOutR, fOutL],
              fill: 'rgba(5, 150, 105, 0.88)',
              stroke: '#34D399',
              lineWidth: 1.0,
            });

            // 2. Back Portal Wall (Tunnel opening into concourse)
            const pWallBL = fOutL;
            const pWallBR = fOutR;
            const pWallTR = { ...fOutR, z: zAtEnd + 1.2 };
            const pWallTL = { ...fOutL, z: zAtEnd + 1.2 };

            polys.push({
              pts: [pWallBL, pWallBR, pWallTR, pWallTL],
              fill: 'rgba(2, 6, 23, 0.95)',
              stroke: '#10B981',
              lineWidth: 1.2,
            });

            // 3. Left Retaining Side Parapet Wall
            const sLTIn = { ...fInL, z: zAtStart + 0.5 };
            const sLTOut = { ...fOutL, z: zAtEnd + 0.5 };
            polys.push({
              pts: [fInL, fOutL, sLTOut, sLTIn],
              fill: 'rgba(15, 23, 42, 0.92)',
              stroke: '#38BDF8',
              lineWidth: 0.8,
            });

            // 4. Right Retaining Side Parapet Wall
            const sRTIn = { ...fInR, z: zAtStart + 0.5 };
            const sRTOut = { ...fOutR, z: zAtEnd + 0.5 };
            polys.push({
              pts: [fInR, fOutR, sRTOut, sRTIn],
              fill: 'rgba(15, 23, 42, 0.92)',
              stroke: '#38BDF8',
              lineWidth: 0.8,
            });
          }
        }
      }
    }

    // Sort 3D polygons back-to-front by average projected depth
    const projectedPolys = polys
      .map((poly) => {
        const projPts = poly.pts.map((pt) => project(pt.x, pt.y, pt.z));
        const avgDepth =
          projPts.reduce((acc, p) => acc + p.depth, 0) / projPts.length;
        return { ...poly, projPts, avgDepth };
      })
      .sort((a, b) => a.avgDepth - b.avgDepth);

    for (const poly of projectedPolys) {
      ctx.beginPath();
      poly.projPts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      });
      ctx.closePath();
      ctx.fillStyle = poly.fill;
      ctx.fill();
      ctx.strokeStyle = poly.stroke;
      ctx.lineWidth = poly.lineWidth || 1;
      ctx.stroke();
    }

    // 5. Draw 3D Cross-Section Cutting Plane A-A'
    if (showSectionPlane) {
      const secRad = schema.sightlineConfig.sectionAngleDeg * DEG_TO_RAD;
      const R = 155;
      const sxEnd = R * Math.cos(secRad);
      const syEnd = R * Math.sin(secRad);
      const c0 = project(0, 0, 0);
      const c1 = project(sxEnd, syEnd, 0);
      const c2 = project(sxEnd, syEnd, 36);
      const c3 = project(0, 0, 36);

      ctx.beginPath();
      ctx.moveTo(c0.sx, c0.sy);
      ctx.lineTo(c1.sx, c1.sy);
      ctx.lineTo(c2.sx, c2.sy);
      ctx.lineTo(c3.sx, c3.sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(244, 63, 94, 0.14)';
      ctx.fill();
      ctx.strokeStyle = '#F43F5E';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [schema, azimuthDeg, pitchDeg, cameraScale, renderMode, showSectionPlane]);

  return (
    <div
      data-testid="stadium-preview-3d"
      className="relative w-full h-full bg-[#07090E] flex flex-col overflow-hidden select-none"
    >
      {/* Top 3D Viewport Controls */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-[#0F1420]/95 border border-slate-800 px-3 py-1.5 rounded pointer-events-auto">
          <Box className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-mono text-cyan-400 font-semibold whitespace-nowrap shrink-0">
            3D 看台空间预览
          </span>
          <span className="text-slate-700 mx-0.5 shrink-0">·</span>
          {(
            [
              { id: 'solid', label: '实体分层渲染' },
              { id: 'wireframe', label: 'CAD三维线框' },
              { id: 'vip-highlight', label: '包厢/坡度热力' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setRenderMode(m.id)}
              className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                renderMode === m.id
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {m.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowSectionPlane((v) => !v)}
            className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
              showSectionPlane
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            A-A&apos; 剖切面({schema.sightlineConfig.sectionAngleDeg}°)
          </button>
        </div>

        <div className="flex items-center gap-1 bg-[#0F1420]/95 border border-slate-800 px-2.5 py-1 rounded pointer-events-auto text-xs shrink-0">
          <button
            type="button"
            onClick={() => setCameraScale((s) => Math.max(0.9, Number((s - 0.25).toFixed(2))))}
            className="p-1 text-slate-300 hover:text-white rounded shrink-0"
            title="缩小3D视图"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-slate-300 px-1 whitespace-nowrap shrink-0">
            视角 {Math.round(azimuthDeg)}° / 俯仰 {Math.round(pitchDeg)}°
          </span>
          <button
            type="button"
            onClick={() => setCameraScale((s) => Math.min(4.5, Number((s + 0.25).toFixed(2))))}
            className="p-1 text-slate-300 hover:text-white rounded shrink-0"
            title="放大3D视图"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAzimuthDeg(38);
              setPitchDeg(56);
              setCameraScale(2.1);
            }}
            className="px-2 py-1 text-slate-300 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>重置镜头</span>
          </button>
        </div>
      </div>

      {/* Interactive 3D Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          setIsDragging(true);
          setDragLast({ x: e.clientX, y: e.clientY });
        }}
        onPointerMove={(e) => {
          if (!isDragging) return;
          const dx = e.clientX - dragLast.x;
          const dy = e.clientY - dragLast.y;
          setAzimuthDeg((a) => (a + dx * 0.45 + 360) % 360);
          setPitchDeg((p) => Math.min(85, Math.max(18, p + dy * 0.35)));
          setDragLast({ x: e.clientX, y: e.clientY });
        }}
        onPointerUp={() => setIsDragging(false)}
        onWheel={(e) => {
          e.preventDefault();
          setCameraScale((s) =>
            Math.min(4.8, Math.max(0.8, Number((s * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))))
          );
        }}
        className="w-full h-full flex-1 cursor-grab active:cursor-grabbing"
      />

      {/* Bottom 3D Legend & Orbit Sliders */}
      <div className="h-9 bg-[#0B0E17] border-t border-slate-800 px-3 flex items-center justify-between gap-4 text-xs text-slate-400 overflow-x-auto">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <span>左键拖拽旋转，滚轮缩放</span>
          <label className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span>水平环绕:</span>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(azimuthDeg)}
              onChange={(e) => setAzimuthDeg(Number(e.target.value))}
              className="w-20 accent-cyan-400"
            />
          </label>
          <label className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span>俯视倾角:</span>
            <input
              type="range"
              min={18}
              max={85}
              value={Math.round(pitchDeg)}
              onChange={(e) => setPitchDeg(Number(e.target.value))}
              className="w-20 accent-cyan-400"
            />
          </label>
        </div>
        <div className="flex items-center gap-3 font-mono whitespace-nowrap shrink-0">
          <span className="text-emerald-400">■ 内场与平层席</span>
          <span className="text-amber-400">■ VIP包厢 &amp; 斜坡看台</span>
          <span className="text-cyan-400">■ 1F-{schema.standTiers.length}F 同心看台</span>
        </div>
      </div>
    </div>
  );
};
