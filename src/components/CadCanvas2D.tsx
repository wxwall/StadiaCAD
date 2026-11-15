import React, { useRef, useState } from 'react';
import {
  InfieldSeatModule,
  InfieldSeatModuleType,
  StadiumSchema,
  StandSector,
  StandTier,
} from '../types/stadium';
import {
  buildInfieldPerimeterPoints,
  buildSectorAnnulusPoints,
  buildStageGeometry,
  calculateInfieldModuleCapacity,
  calculateSectorCapacity,
  DEG_TO_RAD,
  getInfieldPointAndNormalAtFrac,
  getSectorNormalSamples,
  getSectorPerimFracs,
  getTierNormalDistancesAtPoint,
  getTierRadiiAtAngle,
  RAD_TO_DEG,
  snapToGridValue,
} from '../utils/stadiumEngine';
import {
  Compass,
  Crosshair,
  Grid,
  Layers,
  Maximize2,
  Move,
  RotateCw,
  Scissors,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface SelectedEntity {
  type: 'infield' | 'infield-module' | 'tier' | 'sector';
  tierId?: string;
  sectorId?: string;
  moduleId?: string;
}

interface CadCanvas2DProps {
  schema: StadiumSchema;
  selected: SelectedEntity;
  onSelect: (sel: SelectedEntity) => void;
  onUpdateInfieldModule: (moduleId: string, patch: Partial<InfieldSeatModule>) => void;
  onDropNewItem: (
    itemType: 'flat-seat' | 'sloped-seat' | 'new-tier' | 'vip-sector-convert',
    worldX: number,
    worldY: number
  ) => void;
  onChangeSectionAngle: (angleDeg: number) => void;
  onToggleGridOption: (key: keyof StadiumSchema['gridSystem']) => void;
}

export const CadCanvas2D: React.FC<CadCanvas2DProps> = ({
  schema,
  selected,
  onSelect,
  onUpdateInfieldModule,
  onDropNewItem,
  onChangeSectionAngle,
  onToggleGridOption,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.15);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [draggingSectionLine, setDraggingSectionLine] = useState(false);

  const [cursorWorld, setCursorWorld] = useState<{
    x: number;
    y: number;
    r: number;
    theta: number;
  }>({ x: 0, y: 0, r: 0, theta: 0 });

  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);

  // Convert client mouse position to SVG world meters
  const clientToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const viewWidth = rect.width / zoom;
    const viewHeight = rect.height / zoom;
    const minX = -viewWidth / 2 - pan.x;
    const minY = -viewHeight / 2 - pan.y;

    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;

    const worldX = minX + normX * viewWidth;
    const worldY = minY + normY * viewHeight;
    return { x: worldX, y: worldY };
  };

  const handlePointerDownCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey) || e.target === svgRef.current) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x * zoom, y: e.clientY - pan.y * zoom });
    }
  };

  const handlePointerMoveCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    const w = clientToWorld(e.clientX, e.clientY);
    const r = Math.hypot(w.x, w.y);
    const theta = ((Math.atan2(w.y, w.x) * RAD_TO_DEG) % 360 + 360) % 360;
    setCursorWorld({
      x: Number(w.x.toFixed(1)),
      y: Number(w.y.toFixed(1)),
      r: Number(r.toFixed(1)),
      theta: Number(theta.toFixed(1)),
    });

    if (draggingModuleId) {
      const snappedX = snapToGridValue(
        w.x - dragOffset.dx,
        schema.gridSystem.gridSize,
        schema.gridSystem.snapToGrid
      );
      const snappedY = snapToGridValue(
        w.y - dragOffset.dy,
        schema.gridSystem.gridSize,
        schema.gridSystem.snapToGrid
      );
      onUpdateInfieldModule(draggingModuleId, { x: snappedX, y: snappedY });
      return;
    }

    if (draggingSectionLine) {
      const snappedAngle = schema.gridSystem.snapToGrid
        ? Math.round(theta / 5) * 5
        : Number(theta.toFixed(1));
      onChangeSectionAngle(snappedAngle % 360);
      return;
    }

    if (isPanning) {
      setPan({
        x: (e.clientX - panStart.x) / zoom,
        y: (e.clientY - panStart.y) / zoom,
      });
    }
  };

  const handlePointerUpCanvas = () => {
    setIsPanning(false);
    setDraggingModuleId(null);
    setDraggingSectionLine(false);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.min(8, Math.max(0.45, Number((z * factor).toFixed(2)))));
  };

  const handleDragOver = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOverCanvas) setIsDragOverCanvas(true);
  };

  const handleDragLeave = () => {
    setIsDragOverCanvas(false);
  };

  const handleDrop = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    setIsDragOverCanvas(false);
    const toolType = e.dataTransfer.getData('application/stadiacad-tool') as
      | 'flat-seat'
      | 'sloped-seat'
      | 'new-tier'
      | 'vip-sector-convert';
    if (!toolType) return;

    const w = clientToWorld(e.clientX, e.clientY);
    const snappedX = snapToGridValue(
      w.x,
      schema.gridSystem.gridSize,
      schema.gridSystem.snapToGrid
    );
    const snappedY = snapToGridValue(
      w.y,
      schema.gridSystem.gridSize,
      schema.gridSystem.snapToGrid
    );
    onDropNewItem(toolType, snappedX, snappedY);
  };

  const baseSpan = 360;
  const viewW = baseSpan / zoom;
  const viewH = (baseSpan * 0.72) / zoom;
  const viewBox = `${-viewW / 2 - pan.x} ${-viewH / 2 - pan.y} ${viewW} ${viewH}`;

  const infieldPerimeterPts = buildInfieldPerimeterPoints(schema.infield, 96);
  const infieldPolygonStr = infieldPerimeterPts.map((p) => `${p.x},${p.y}`).join(' ');

  const sortedTiers = [...schema.standTiers].sort((a, b) => a.level - b.level);
  const maxOuterRadius =
    sortedTiers.length > 0
      ? Math.max(
          getTierRadiiAtAngle(schema.infield, sortedTiers, sortedTiers[sortedTiers.length - 1], 0)
            .outerRadius,
          getTierRadiiAtAngle(schema.infield, sortedTiers, sortedTiers[sortedTiers.length - 1], 90)
            .outerRadius
        )
      : Math.max(schema.infield.length, schema.infield.width) / 2;

  const sectionAngleRad = schema.sightlineConfig.sectionAngleDeg * DEG_TO_RAD;
  const sectionLineLen = maxOuterRadius + 28;
  const secX = sectionLineLen * Math.cos(sectionAngleRad);
  const secY = sectionLineLen * Math.sin(sectionAngleRad);

  return (
    <div className="relative w-full h-full bg-[#07090E] overflow-hidden select-none flex flex-col">
      {/* Top CAD Viewport Floating Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 bg-[#0F1420]/95 border border-slate-800 px-2 py-1 rounded pointer-events-auto">
          <span className="text-xs font-mono text-cyan-400 font-medium whitespace-nowrap shrink-0">
            CAD图层
          </span>
          <span className="text-slate-700 shrink-0">·</span>
          <button
            type="button"
            onClick={() => onToggleGridOption('enabled')}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              schema.gridSystem.enabled
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="显示/隐藏正交CAD网格"
          >
            <Grid className="w-3.5 h-3.5 shrink-0" />
            <span>网格({schema.gridSystem.gridSize}m)</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleGridOption('snapToGrid')}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              schema.gridSystem.snapToGrid
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="启用/关闭网格吸附对齐"
          >
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            <span>网格吸附</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleGridOption('showPolarGrid')}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              schema.gridSystem.showPolarGrid
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="显示/隐藏中心放射极坐标轴线"
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>辐射轴线</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleGridOption('showVomitories')}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              schema.gridSystem.showVomitories
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>出入口/栏杆</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleGridOption('showDimensions')}
            className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
              schema.gridSystem.showDimensions
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>尺寸标注</span>
          </button>
        </div>

        {/* Zoom & View Reset */}
        <div className="flex items-center gap-1 bg-[#0F1420]/95 border border-slate-800 px-2 py-1 rounded pointer-events-auto shrink-0">
          <button
            type="button"
            aria-label="缩小画布"
            onClick={() => setZoom((z) => Math.max(0.45, Number((z * 0.85).toFixed(2))))}
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded shrink-0"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono tabular-nums text-slate-300 px-1.5 whitespace-nowrap shrink-0">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="放大画布"
            onClick={() => setZoom((z) => Math.min(8, Number((z * 1.18).toFixed(2))))}
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded shrink-0"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1.15);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded flex items-center gap-1 whitespace-nowrap shrink-0"
            title="重置居中视图"
          >
            <Maximize2 className="w-3 h-3 shrink-0" />
            <span>居中</span>
          </button>
        </div>
      </div>

      {/* Drag-and-drop overlay indicator */}
      {isDragOverCanvas && (
        <div className="absolute inset-4 z-20 border-2 border-dashed border-cyan-400 bg-cyan-500/10 rounded-lg pointer-events-none flex items-center justify-center">
          <div className="bg-[#0F1420] border border-cyan-500/50 px-4 py-2 rounded text-sm text-cyan-200 font-medium">
            松开鼠标以在当前网格坐标 ({cursorWorld.x}m, {cursorWorld.y}m) 放置场馆模块
          </div>
        </div>
      )}

      {/* Main Interactive CAD SVG */}
      <svg
        ref={svgRef}
        data-testid="cad-canvas-2d"
        viewBox={viewBox}
        onPointerDown={handlePointerDownCanvas}
        onPointerMove={handlePointerMoveCanvas}
        onPointerUp={handlePointerUpCanvas}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="w-full h-full cursor-crosshair flex-1"
      >
        <defs>
          {/* Orthogonal CAD Minor & Major Grid Patterns */}
          <pattern
            id="cad-minor-grid"
            width={schema.gridSystem.gridSize}
            height={schema.gridSystem.gridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${schema.gridSystem.gridSize} 0 L 0 0 0 ${schema.gridSystem.gridSize}`}
              fill="none"
              stroke="#131C2E"
              strokeWidth="0.18"
            />
          </pattern>
          <pattern
            id="cad-major-grid"
            width={schema.gridSystem.gridSize * 5}
            height={schema.gridSystem.gridSize * 5}
            patternUnits="userSpaceOnUse"
          >
            <rect
              width={schema.gridSystem.gridSize * 5}
              height={schema.gridSystem.gridSize * 5}
              fill="url(#cad-minor-grid)"
            />
            <path
              d={`M ${schema.gridSystem.gridSize * 5} 0 L 0 0 0 ${schema.gridSystem.gridSize * 5}`}
              fill="none"
              stroke="#1E293B"
              strokeWidth="0.32"
            />
          </pattern>

          {/* VIP Hatch Pattern */}
          <pattern
            id="vip-hatch"
            width="2.5"
            height="2.5"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="2.5" stroke="#F59E0B" strokeWidth="0.35" strokeOpacity="0.45" />
          </pattern>

          {/* Void / Deleted Opening Pattern */}
          <pattern
            id="cad-void-hatch"
            width="4"
            height="4"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke="#EF4444" strokeWidth="0.35" strokeOpacity="0.35" strokeDasharray="1,1" />
          </pattern>

          {/* Solid Wall Concrete Pattern */}
          <pattern
            id="cad-wall-hatch"
            width="3"
            height="3"
            patternTransform="rotate(-45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="3" stroke="#94A3B8" strokeWidth="0.4" strokeOpacity="0.45" />
          </pattern>
        </defs>

        {/* 1. Orthogonal Grid Background */}
        {schema.gridSystem.enabled && (
          <rect x="-1000" y="-1000" width="2000" height="2000" fill="url(#cad-major-grid)" />
        )}

        {/* 2. Polar Radial Alignment Rays & Concentric Reference Circles */}
        {schema.gridSystem.showPolarGrid && (
          <g className="pointer-events-none">
            {[40, 80, 120, 160, 200].map((r) => (
              <circle
                key={r}
                cx={0}
                cy={0}
                r={r}
                fill="none"
                stroke="#1E293B"
                strokeWidth="0.25"
                strokeDasharray="1.5,1.5"
              />
            ))}
            {Array.from(
              { length: Math.round(360 / Math.max(5, schema.gridSystem.polarAngleStepDeg)) },
              (_, idx) => idx * schema.gridSystem.polarAngleStepDeg
            ).map((ang) => {
              const rad = ang * DEG_TO_RAD;
              const R = maxOuterRadius + 24;
              return (
                <g key={ang}>
                  <line
                    x1={0}
                    y1={0}
                    x2={R * Math.cos(rad)}
                    y2={R * Math.sin(rad)}
                    stroke="#1E293B"
                    strokeWidth="0.22"
                    strokeDasharray="2,2"
                  />
                  {ang % 30 === 0 && (
                    <text
                      x={(R + 5) * Math.cos(rad)}
                      y={(R + 5) * Math.sin(rad)}
                      fill="#475569"
                      fontSize="2.8"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="font-mono"
                    >
                      {ang}°
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Principal X / Y Axes through Center (0,0) */}
        <g className="pointer-events-none">
          <line x1="-600" y1="0" x2="600" y2="0" stroke="#334155" strokeWidth="0.35" />
          <line x1="0" y1="-600" x2="0" y2="600" stroke="#334155" strokeWidth="0.35" />
          <circle cx="0" cy="0" r="1.2" fill="#06B6D4" />
        </g>

        {/* 3. Stand Tiers & Radial Sectors (Rendered from outermost or innermost) */}
        {sortedTiers.map((tier: StandTier) => {
          const isTierSelected =
            selected.type === 'tier' && selected.tierId === tier.id;

          return (
            <g key={tier.id}>
              {tier.sectors.map((sector: StandSector) => {
                const isSectorSelected =
                  selected.type === 'sector' &&
                  selected.tierId === tier.id &&
                  selected.sectorId === sector.id;

                const isDeletedOrVoid = sector.isDeleted || sector.fillType === 'empty-void';
                const isTunnel = sector.fillType === 'tunnel-exit';
                const isWall = sector.fillType === 'solid-wall';
                const isVip = sector.fillType === 'vip-box';

                const polyPts = buildSectorAnnulusPoints(
                  schema.infield,
                  sortedTiers,
                  tier,
                  sector.startAngleDeg,
                  sector.endAngleDeg,
                  12,
                  sector
                );
                const polyStr = polyPts.map((p) => `${p.x},${p.y}`).join(' ');

                const { startFrac, endFrac } = getSectorPerimFracs(
                  schema.infield,
                  tier,
                  sector
                );
                const spanFrac = Math.max(0, endFrac - startFrac);
                const midFrac = (startFrac + endFrac) / 2;
                const isCornerWedge =
                  spanFrac < 1e-4 &&
                  sector.startNormalRad !== undefined &&
                  sector.endNormalRad !== undefined;
                const rawMidPt = getInfieldPointAndNormalAtFrac(schema.infield, midFrac);
                const midCornerRad = isCornerWedge
                  ? (sector.startNormalRad! + sector.endNormalRad!) / 2
                  : 0;
                const midPt = isCornerWedge
                  ? {
                      x: rawMidPt.x,
                      y: rawMidPt.y,
                      nx: Math.cos(midCornerRad),
                      ny: Math.sin(midCornerRad),
                    }
                  : rawMidPt;
                const midNormalDist = getTierNormalDistancesAtPoint(
                  schema.infield,
                  sortedTiers,
                  tier,
                  midPt.x,
                  midPt.y,
                  midPt.nx,
                  midPt.ny,
                  isCornerWedge
                );
                const effDIn = midNormalDist.dIn + (sector.customRadialOffset || 0);
                const effDOut = sector.customRadialDepth
                  ? effDIn + sector.customRadialDepth
                  : midNormalDist.dOut;
                const midD = (effDIn + effDOut) / 2;
                const labelX = midPt.x + midD * midPt.nx;
                const labelY = midPt.y + midD * midPt.ny;

                const strokeColor = isSectorSelected
                  ? '#38BDF8'
                  : isDeletedOrVoid
                  ? '#EF4444'
                  : isTunnel
                  ? '#10B981'
                  : isWall
                  ? '#94A3B8'
                  : isVip
                  ? '#F59E0B'
                  : isTierSelected
                  ? '#22D3EE'
                  : '#0E7490';

                const strokeDasharray = isDeletedOrVoid ? '2,1.5' : undefined;

                const fillColor = isSectorSelected
                  ? isDeletedOrVoid
                    ? 'rgba(239, 68, 68, 0.22)'
                    : isVip
                    ? 'rgba(245, 158, 11, 0.35)'
                    : isTunnel
                    ? 'rgba(16, 185, 129, 0.32)'
                    : isWall
                    ? 'rgba(148, 163, 184, 0.32)'
                    : 'rgba(6, 182, 212, 0.32)'
                  : isDeletedOrVoid
                  ? 'rgba(239, 68, 68, 0.08)'
                  : isTunnel
                  ? 'rgba(16, 185, 129, 0.18)'
                  : isWall
                  ? 'rgba(148, 163, 184, 0.16)'
                  : isVip
                  ? 'rgba(245, 158, 11, 0.16)'
                  : tier.level === 1
                  ? 'rgba(6, 182, 212, 0.11)'
                  : tier.level === 2
                  ? 'rgba(14, 165, 233, 0.10)'
                  : 'rgba(56, 189, 248, 0.08)';

                // Compute intermediate row lines along 90°-normal extrusion samples
                const rowStepCount = Math.min(5, Math.max(2, Math.floor(sector.rows / 5)));
                const rowArcLines: string[] = [];
                if (!isDeletedOrVoid && !isTunnel && !isWall) {
                  const rowSamples = getSectorNormalSamples(
                    schema.infield,
                    sortedTiers,
                    tier,
                    sector,
                    10
                  );
                  for (let rIdx = 1; rIdx < rowStepCount; rIdx++) {
                    const frac = rIdx / rowStepCount;
                    const arcPts = rowSamples.map((sp) => {
                      const rx = sp.inX + (sp.outX - sp.inX) * frac;
                      const ry = sp.inY + (sp.outY - sp.inY) * frac;
                      return `${rx.toFixed(2)},${ry.toFixed(2)}`;
                    });
                    rowArcLines.push(arcPts.join(' '));
                  }
                }

                // Vomitory / Safety Exit perimeter fractions
                const vomFracs: number[] = [];
                if (
                  !isDeletedOrVoid &&
                  !isTunnel &&
                  !isWall &&
                  sector.vomitory &&
                  sector.vomitory.position !== 'none' &&
                  sector.vomitory.enabled !== false
                ) {
                  const offsetFrac = ((sector.vomitory.angularOffsetPct || 0) / 100) * spanFrac;
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
                }

                const sectorCap = calculateSectorCapacity(
                  schema.infield,
                  sortedTiers,
                  tier,
                  sector
                );

                return (
                  <g
                    key={sector.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({
                        type: 'sector',
                        tierId: tier.id,
                        sectorId: sector.id,
                      });
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Sector Base Annulus Polygon */}
                    <polygon
                      points={polyStr}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSectorSelected ? '0.9' : '0.45'}
                      strokeDasharray={strokeDasharray}
                    />

                    {/* Void Opening Diagonal Hatch Overlay */}
                    {isDeletedOrVoid && (
                      <polygon
                        points={polyStr}
                        fill="url(#cad-void-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    )}

                    {/* Solid Wall Concrete Hatch Overlay */}
                    {isWall && (
                      <polygon
                        points={polyStr}
                        fill="url(#cad-wall-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    )}

                    {/* VIP Hatch Overlay */}
                    {isVip && !isDeletedOrVoid && (
                      <polygon
                        points={polyStr}
                        fill="url(#vip-hatch)"
                        stroke="none"
                        className="pointer-events-none"
                      />
                    )}

                    {/* Tunnel / Vehicle Portal Ingress/Egress Arrow Markers (Strictly 90° to edge) */}
                    {isTunnel && (
                      <g className="pointer-events-none">
                        <line
                          x1={midPt.x + effDOut * midPt.nx}
                          y1={midPt.y + effDOut * midPt.ny}
                          x2={midPt.x + effDIn * midPt.nx}
                          y2={midPt.y + effDIn * midPt.ny}
                          stroke="#10B981"
                          strokeWidth="0.8"
                          strokeDasharray="1.5,1.5"
                        />
                      </g>
                    )}

                    {/* CAD Row Subdivision Lines */}
                    {rowArcLines.map((pts, idx) => (
                      <polyline
                        key={idx}
                        points={pts}
                        fill="none"
                        stroke={isVip ? '#F59E0B' : '#0891B2'}
                        strokeWidth="0.18"
                        strokeOpacity="0.5"
                        className="pointer-events-none"
                      />
                    ))}

                    {/* Front & Rear Guardrails */}
                    {schema.gridSystem.showGuardrails &&
                      !isDeletedOrVoid &&
                      sector.guardrail.frontRailEnabled && (
                        <circle
                          cx={midPt.x + effDIn * midPt.nx}
                          cy={midPt.y + effDIn * midPt.ny}
                          r="0.5"
                          fill="#22D3EE"
                          className="pointer-events-none"
                        />
                      )}

                    {/* Vomitory / Safety Exit Portals (Oriented perpendicularly inward toward infield) */}
                    {schema.gridSystem.showVomitories &&
                      vomFracs.map((vFrac, vIdx) => {
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
                        const vEffIn = vDist.dIn + (sector.customRadialOffset || 0);
                        const vEffOut = sector.customRadialDepth
                          ? vEffIn + sector.customRadialDepth
                          : vDist.dOut;
                        const startRow = Math.max(1, sector.vomitory.startRow || 1);
                        const rowSpan = Math.max(1, sector.vomitory.rowSpan || 3);
                        const totalRows = Math.max(1, sector.rows || 1);
                        const radialSpan = Math.max(1, vEffOut - vEffIn);

                        const dStart =
                          vEffIn +
                          Math.min(
                            radialSpan - 1.2,
                            Math.max(0, (startRow - 1) * (radialSpan / totalRows))
                          );
                        const depthM = Math.max(
                          1.8,
                          Math.min(radialSpan, rowSpan * (radialSpan / totalRows))
                        );
                        const dCenter = dStart + depthM / 2;
                        const vx = vPt.x + dCenter * vPt.nx;
                        const vy = vPt.y + dCenter * vPt.ny;
                        const vRotDeg = Math.atan2(vPt.ny, vPt.nx) * RAD_TO_DEG;
                        const portalWidth = Math.max(1.2, sector.vomitory.width || 2.4);

                        return (
                          <g
                            key={vIdx}
                            transform={`translate(${vx}, ${vy}) rotate(${vRotDeg})`}
                            className="pointer-events-none"
                          >
                            {/* Portal Passage Floor */}
                            <rect
                              x={-depthM / 2}
                              y={-portalWidth / 2}
                              width={depthM}
                              height={portalWidth}
                              rx="0.2"
                              fill="#030712"
                              stroke="#10B981"
                              strokeWidth="0.4"
                            />
                            {/* Inner Infield Exit Opening Threshold (dotted line facing field) */}
                            <line
                              x1={-depthM / 2}
                              y1={-portalWidth / 2}
                              x2={-depthM / 2}
                              y2={portalWidth / 2}
                              stroke="#34D399"
                              strokeWidth="0.6"
                              strokeDasharray="0.3,0.3"
                            />
                            {/* Outer Concourse Portal Wall (solid line) */}
                            <line
                              x1={depthM / 2}
                              y1={-portalWidth / 2}
                              x2={depthM / 2}
                              y2={portalWidth / 2}
                              stroke="#059669"
                              strokeWidth="0.75"
                            />
                            {/* Safety Direction Arrow (Strictly towards infield -X) */}
                            <polygon
                              points={`${-depthM / 2 + 0.3},0 ${-depthM / 2 + 1.1},${-portalWidth * 0.22} ${-depthM / 2 + 1.1},${-portalWidth * 0.08} ${depthM / 2 - 0.3},${-portalWidth * 0.08} ${depthM / 2 - 0.3},${portalWidth * 0.08} ${-depthM / 2 + 1.1},${portalWidth * 0.08} ${-depthM / 2 + 1.1},${portalWidth * 0.22}`}
                              fill="#10B981"
                              fillOpacity="0.8"
                            />
                            {/* Exit Label Badge */}
                            <text
                              x="0"
                              y={-portalWidth / 2 - 0.4}
                              textAnchor="middle"
                              fill="#34D399"
                              fontSize="0.75"
                              fontWeight="600"
                              fontFamily="monospace"
                            >
                              出口 {portalWidth.toFixed(1)}m
                            </text>
                          </g>
                        );
                      })}

                    {/* Sector Callout Tag */}
                    <g
                      transform={`translate(${labelX}, ${labelY})`}
                      className="pointer-events-none"
                    >
                      <text
                        x="0"
                        y="-1.1"
                        fill={
                          isDeletedOrVoid
                            ? '#EF4444'
                            : isTunnel
                            ? '#34D399'
                            : isWall
                            ? '#CBD5E1'
                            : isVip
                            ? '#FDE68A'
                            : '#E2E8F0'
                        }
                        fontSize="2.4"
                        fontWeight="600"
                        textAnchor="middle"
                        className="font-mono"
                      >
                        {isDeletedOrVoid
                          ? `[已删除] ${sector.name}`
                          : isTunnel
                          ? `${sector.name}·通道`
                          : isWall
                          ? `${sector.name}·实墙`
                          : sector.name}
                      </text>
                      <text
                        x="0"
                        y="1.6"
                        fill={
                          isDeletedOrVoid
                            ? '#F87171'
                            : isTunnel
                            ? '#10B981'
                            : isWall
                            ? '#94A3B8'
                            : isVip
                            ? '#F59E0B'
                            : '#38BDF8'
                        }
                        fontSize="1.9"
                        textAnchor="middle"
                        className="font-mono"
                      >
                        {isDeletedOrVoid
                          ? '镂空净空'
                          : isTunnel
                          ? '车行/进出场'
                          : isWall
                          ? '设备功能房'
                          : isVip
                          ? `VIP·${sectorCap}`
                          : `${sectorCap}席`}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* 4. Infield Outer Perimeter (Strictly Coincides with Tier 1 Inner Ring!) */}
        <g
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ type: 'infield' });
          }}
          className="cursor-pointer"
        >
          <polygon
            points={infieldPolygonStr}
            fill={
              schema.infield.surfaceType === 'synthetic-track'
                ? 'rgba(180, 83, 9, 0.14)'
                : schema.infield.surfaceType === 'hardwood-court'
                ? 'rgba(217, 119, 6, 0.14)'
                : 'rgba(16, 185, 129, 0.09)'
            }
            stroke={selected.type === 'infield' ? '#34D399' : '#10B981'}
            strokeWidth={selected.type === 'infield' ? '1.1' : '0.75'}
          />

          {/* Inner Pitch / Court Markings (Rotated by pitchOrientationDeg) */}
          {(schema.infield.coreMode === 'sports' || schema.infield.coreMode === 'hybrid') && (
            <g
              transform={`rotate(${schema.infield.pitchOrientationDeg || 0})`}
              className="pointer-events-none"
            >
              <rect
                x={-schema.infield.pitchLength / 2}
                y={-schema.infield.pitchWidth / 2}
                width={schema.infield.pitchLength}
                height={schema.infield.pitchWidth}
                fill="rgba(16, 185, 129, 0.08)"
                stroke="#10B981"
                strokeWidth="0.45"
              />
              {/* Center line & center circle */}
              <line
                x1="0"
                y1={-schema.infield.pitchWidth / 2}
                x2="0"
                y2={schema.infield.pitchWidth / 2}
                stroke="#10B981"
                strokeWidth="0.35"
                strokeOpacity="0.7"
              />
              <circle
                cx="0"
                cy="0"
                r={Math.min(9.15, schema.infield.pitchWidth * 0.18)}
                fill="none"
                stroke="#10B981"
                strokeWidth="0.35"
                strokeOpacity="0.7"
              />
              {/* Penalty areas if soccer/track */}
              {(schema.infield.sportPreset === 'soccer' ||
                schema.infield.sportPreset === 'track-field') && (
                <>
                  <rect
                    x={-schema.infield.pitchLength / 2}
                    y={-20.15}
                    width={16.5}
                    height={40.3}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="0.35"
                    strokeOpacity="0.65"
                  />
                  <rect
                    x={schema.infield.pitchLength / 2 - 16.5}
                    y={-20.15}
                    width={16.5}
                    height={40.3}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="0.35"
                    strokeOpacity="0.65"
                  />
                </>
              )}
            </g>
          )}

          {/* Performance Concert Stage Geometry */}
          {(schema.infield.coreMode === 'stage' || schema.infield.coreMode === 'hybrid') && (() => {
            const stageGeo = buildStageGeometry(schema.infield);
            const deckPtsStr = stageGeo.stageDeck.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <g className="pointer-events-none">
                {/* Main Stage Deck */}
                <polygon
                  points={deckPtsStr}
                  fill="rgba(236, 72, 153, 0.24)"
                  stroke="#EC4899"
                  strokeWidth="0.75"
                />
                {/* Stage Front Lip / Spotlight Truss Line */}
                <line
                  x1={stageGeo.stageDeck[0].x}
                  y1={stageGeo.stageDeck[0].y}
                  x2={stageGeo.stageDeck[1].x}
                  y2={stageGeo.stageDeck[1].y}
                  stroke="#F43F5E"
                  strokeWidth="1.2"
                />

                {/* Catwalk Runway */}
                {stageGeo.catwalk && (
                  <polygon
                    points={stageGeo.catwalk.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(244, 63, 94, 0.32)"
                    stroke="#F43F5E"
                    strokeWidth="0.6"
                  />
                )}

                {/* Backdrop LED Screen Line */}
                <line
                  x1={stageGeo.backdropLine[0].x}
                  y1={stageGeo.backdropLine[0].y}
                  x2={stageGeo.backdropLine[1].x}
                  y2={stageGeo.backdropLine[1].y}
                  stroke="#FB7185"
                  strokeWidth="1.8"
                />

                {/* FOH Audio/Lighting Booth */}
                {stageGeo.fohConsole && (
                  <g>
                    <polygon
                      points={stageGeo.fohConsole.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="rgba(139, 92, 246, 0.28)"
                      stroke="#8B5CF6"
                      strokeWidth="0.55"
                      strokeDasharray="1.2,1.0"
                    />
                    <text
                      x={(stageGeo.fohConsole[0].x + stageGeo.fohConsole[1].x) / 2}
                      y={(stageGeo.fohConsole[0].y + stageGeo.fohConsole[2].y) / 2}
                      fill="#C4B5FD"
                      fontSize="1.8"
                      fontWeight="600"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="font-mono"
                    >
                      FOH控台
                    </text>
                  </g>
                )}

                {/* Sound Delay Towers */}
                {stageGeo.soundTowers.map((tower, tIdx) => (
                  <polygon
                    key={tIdx}
                    points={tower.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(245, 158, 11, 0.3)"
                    stroke="#F59E0B"
                    strokeWidth="0.45"
                  />
                ))}

                {/* Stage Center Text Callout */}
                <text
                  x={(stageGeo.stageDeck[0].x + stageGeo.stageDeck[2].x) / 2}
                  y={(stageGeo.stageDeck[0].y + stageGeo.stageDeck[2].y) / 2}
                  fill="#FDF2F8"
                  fontSize="2.4"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-mono"
                >
                  演艺主舞台 (Stage)
                </text>
              </g>
            );
          })()}
        </g>

        {/* 5. Modular Infield Seating Blocks (Flat & Sloped Bleachers - Draggable & Modular) */}
        {schema.infieldModules.map((mod: InfieldSeatModule) => {
          const isModSelected =
            selected.type === 'infield-module' && selected.moduleId === mod.id;
          const cap = calculateInfieldModuleCapacity(mod);
          const isSloped = mod.type === 'sloped';

          return (
            <g
              key={mod.id}
              transform={`translate(${mod.x}, ${mod.y}) rotate(${mod.rotationDeg})`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect({ type: 'infield-module', moduleId: mod.id });
                const w = clientToWorld(e.clientX, e.clientY);
                setDraggingModuleId(mod.id);
                setDragOffset({ dx: w.x - mod.x, dy: w.y - mod.y });
              }}
              className="cursor-move"
            >
              <rect
                x={-mod.width / 2}
                y={-mod.depth / 2}
                width={mod.width}
                height={mod.depth}
                fill={
                  isSloped
                    ? isModSelected
                      ? 'rgba(245, 158, 11, 0.38)'
                      : 'rgba(245, 158, 11, 0.22)'
                    : isModSelected
                    ? 'rgba(16, 185, 129, 0.38)'
                    : 'rgba(16, 185, 129, 0.22)'
                }
                stroke={
                  isModSelected
                    ? '#FFFFFF'
                    : isSloped
                    ? '#F59E0B'
                    : '#10B981'
                }
                strokeWidth={isModSelected ? '0.8' : '0.45'}
                rx="0.6"
              />

              {/* Modular Row Lines inside Infield Block */}
              {Array.from({ length: Math.min(8, mod.rows) }, (_, rIdx) => {
                const ry =
                  -mod.depth / 2 + ((rIdx + 1) / (Math.min(8, mod.rows) + 1)) * mod.depth;
                return (
                  <line
                    key={rIdx}
                    x1={-mod.width / 2 + 0.6}
                    y1={ry}
                    x2={mod.width / 2 - 0.6}
                    y2={ry}
                    stroke={isSloped ? '#FBBF24' : '#34D399'}
                    strokeWidth="0.2"
                    strokeOpacity="0.6"
                  />
                );
              })}

              {/* Label & Slope Indicator */}
              <text
                x="0"
                y="-0.8"
                fill="#F8FAFC"
                fontSize="2.2"
                fontWeight="600"
                textAnchor="middle"
                className="font-mono pointer-events-none"
              >
                {mod.name}
              </text>
              <text
                x="0"
                y="1.8"
                fill={isSloped ? '#FDE68A' : '#A7F3D0'}
                fontSize="1.9"
                textAnchor="middle"
                className="font-mono pointer-events-none"
              >
                {isSloped ? `▲斜坡 ${mod.slopeDeg}° · ${cap}席` : `■平层 · ${cap}席`}
              </text>
            </g>
          );
        })}

        {/* 6. CAD Engineering Dimension Callouts */}
        {schema.gridSystem.showDimensions && (
          <g className="pointer-events-none">
            {/* Infield Length Dimension */}
            <line
              x1={-schema.infield.length / 2}
              y1={schema.infield.width / 2 + 5}
              x2={schema.infield.length / 2}
              y2={schema.infield.width / 2 + 5}
              stroke="#34D399"
              strokeWidth="0.35"
              strokeDasharray="1,1"
            />
            <text
              x="0"
              y={schema.infield.width / 2 + 8.5}
              fill="#34D399"
              fontSize="2.6"
              textAnchor="middle"
              className="font-mono"
            >
              内场外圈总长 L = {schema.infield.length}m (与1F看台内圈重合)
            </text>

            {/* Infield Width Dimension */}
            <text
              x={schema.infield.length / 2 + 4}
              y="0"
              fill="#34D399"
              fontSize="2.5"
              textAnchor="start"
              className="font-mono"
            >
              W={schema.infield.width}m
              {schema.infield.cornerRadius > 0 ? ` (R=${schema.infield.cornerRadius}m)` : ''}
            </text>
          </g>
        )}

        {/* 7. Interactive Cross-Section Cutting Line A-A' */}
        <g>
          <line
            x1="0"
            y1="0"
            x2={secX}
            y2={secY}
            stroke="#F43F5E"
            strokeWidth="0.75"
            strokeDasharray="3,1.5"
            className="pointer-events-none"
          />
          <circle
            cx={secX}
            cy={secY}
            r="3.6"
            fill="#F43F5E"
            stroke="#FFFFFF"
            strokeWidth="0.6"
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDraggingSectionLine(true);
            }}
          />
          <text
            x={secX + (secX >= 0 ? 5 : -5)}
            y={secY}
            fill="#FDA4AF"
            fontSize="3.2"
            fontWeight="700"
            textAnchor={secX >= 0 ? 'start' : 'end'}
            dominantBaseline="middle"
            className="font-mono pointer-events-none"
          >
            A-A&apos; 剖面视线切线 ({schema.sightlineConfig.sectionAngleDeg}°)
          </text>
        </g>
      </svg>

      {/* Bottom CAD Coordinate & Layer Legend Ribbon */}
      <div className="h-8 bg-[#0B0E17] border-t border-slate-800/90 px-3 flex items-center justify-between gap-4 text-xs text-slate-400 overflow-x-auto">
        <div className="flex items-center gap-3 font-mono tabular-nums whitespace-nowrap shrink-0">
          <span>
            X: <strong className="text-slate-200">{cursorWorld.x}m</strong>
          </span>
          <span>
            Y: <strong className="text-slate-200">{cursorWorld.y}m</strong>
          </span>
          <span>
            极径 R: <strong className="text-cyan-400">{cursorWorld.r}m</strong>
          </span>
          <span>
            辐射角 θ: <strong className="text-cyan-400">{cursorWorld.theta}°</strong>
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] whitespace-nowrap shrink-0">
          <span className="text-emerald-400">■ 内场边界(与1F看台内圈重合)</span>
          <span className="text-cyan-400">■ 普通看台</span>
          <span className="text-amber-400">▨ VIP包厢 / 斜坡席</span>
          <span className="text-rose-400">-- A-A&apos; 视线剖切轴</span>
        </div>
      </div>
    </div>
  );
};
