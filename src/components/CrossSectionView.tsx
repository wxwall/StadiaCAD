import React, { useState } from 'react';
import { SightlineRowResult, StadiumSchema } from '../types/stadium';
import {
  calculateCrossSectionAndSightlines,
  DEG_TO_RAD,
  getInfieldOuterRadiusAtAngle,
  getTierRadiiAtAngle,
} from '../utils/stadiumEngine';
import { CheckCircle2, Compass, Eye, Sliders, TrendingUp, AlertTriangle } from 'lucide-react';

interface CrossSectionViewProps {
  schema: StadiumSchema;
  onUpdateSightlineConfig: (
    patch: Partial<StadiumSchema['sightlineConfig']>
  ) => void;
  onUpdateTierSlopeOrPitch?: (
    tierId: string,
    patch: { defaultSlopeDeg?: number; defaultRowPitch?: number; baseElevation?: number }
  ) => void;
}

export const CrossSectionView: React.FC<CrossSectionViewProps> = ({
  schema,
  onUpdateSightlineConfig,
  onUpdateTierSlopeOrPitch,
}) => {
  const [hoveredRow, setHoveredRow] = useState<SightlineRowResult | null>(null);
  const { focalRadiusM, rows, idealParabolicCurve } =
    calculateCrossSectionAndSightlines(schema);

  const angleDeg = schema.sightlineConfig.sectionAngleDeg;
  const infieldOuterR = getInfieldOuterRadiusAtAngle(schema.infield, angleDeg);
  const sortedTiers = [...schema.standTiers].sort((a, b) => a.level - b.level);

  const maxR =
    rows.length > 0 ? Math.max(...rows.map((r) => r.radiusM)) + 16 : infieldOuterR + 40;
  const maxZ =
    rows.length > 0
      ? Math.max(...rows.map((r) => r.eyeElevationM), 28) + 8
      : 32;

  // SVG coordinate helpers: X in [0 .. maxR], Y inverted from maxZ down to -4
  const padLeft = 14;
  const viewW = maxR + padLeft + 12;
  const viewH = maxZ + 14;
  const toSvgX = (r: number) => Number((padLeft + r).toFixed(2));
  const toSvgY = (z: number) => Number((maxZ - z + 4).toFixed(2));

  // Ideal Parabolic Polyline
  const parabolicPointsStr = idealParabolicCurve
    .map((pt) => `${toSvgX(pt.radiusM)},${toSvgY(pt.elevationM)}`)
    .join(' ');

  // Compute compliance stats for this section
  const compliantRows = rows.filter(
    (r) => r.cValueMm >= schema.sightlineConfig.targetCValueMm
  ).length;
  const compliancePct =
    rows.length > 0 ? ((compliantRows / rows.length) * 100).toFixed(1) : '100.0';
  const minC = rows.length > 0 ? Math.min(...rows.map((r) => r.cValueMm)) : 0;
  const maxC = rows.length > 0 ? Math.max(...rows.map((r) => r.cValueMm)) : 0;

  return (
    <div
      data-testid="cross-section-view"
      className="w-full h-full bg-[#07090E] flex flex-col overflow-hidden select-none"
    >
      {/* Top Section Calibration Toolbar */}
      <div className="px-4 py-2 bg-[#0F1420] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 font-semibold whitespace-nowrap shrink-0">
            <Eye className="w-4 h-4 shrink-0" />
            <span>A-A&apos; 横截面视线与坡度分析</span>
          </div>
          <span className="text-slate-700">|</span>

          {/* Quick Azimuth Presets */}
          <div className="flex items-center gap-1">
            {[
              { label: '0° 东看台', deg: 0 },
              { label: '45° 角区', deg: 45 },
              { label: '90° 南看台', deg: 90 },
              { label: '180° 西看台', deg: 180 },
              { label: '270° 北看台', deg: 270 },
            ].map((p) => (
              <button
                key={p.deg}
                type="button"
                onClick={() => onUpdateSightlineConfig({ sectionAngleDeg: p.deg })}
                className={`px-2 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  Math.round(angleDeg) === p.deg
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target C-Value & Parabolic Curve Controls */}
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-slate-300 whitespace-nowrap shrink-0">
            <span>剖切角:</span>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(angleDeg)}
              onChange={(e) =>
                onUpdateSightlineConfig({ sectionAngleDeg: Number(e.target.value) })
              }
              className="w-20 accent-cyan-400"
            />
            <span className="font-mono tabular-nums text-cyan-400 w-9">
              {Math.round(angleDeg)}°
            </span>
          </label>

          <label className="flex items-center gap-1.5 text-slate-300 whitespace-nowrap shrink-0">
            <span>C值标准:</span>
            <select
              aria-label="合规C值标准"
              value={schema.sightlineConfig.targetCValueMm}
              onChange={(e) =>
                onUpdateSightlineConfig({ targetCValueMm: Number(e.target.value) })
              }
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
            >
              <option value={60}>≥ 60 mm (极限)</option>
              <option value={90}>≥ 90 mm (FIFA良)</option>
              <option value={120}>≥ 120 mm (FIFA优)</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              onUpdateSightlineConfig({
                showIdealParabolicCurve: !schema.sightlineConfig.showIdealParabolicCurve,
              })
            }
            className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              schema.sightlineConfig.showIdealParabolicCurve
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>等C值理想抛物线对比</span>
          </button>
        </div>
      </div>

      {/* Main Engineering Cross-Section SVG Canvas */}
      <div className="flex-1 relative min-h-[280px] border-b border-slate-800 bg-[#07090E] flex flex-col">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full flex-1"
        >
          {/* Elevation Grid Lines (Every 5m Z and 10m R) */}
          {Array.from({ length: Math.floor(maxZ / 5) + 1 }, (_, i) => i * 5).map((z) => (
            <g key={`z-${z}`}>
              <line
                x1={toSvgX(0)}
                y1={toSvgY(z)}
                x2={toSvgX(maxR)}
                y2={toSvgY(z)}
                stroke={z === 0 ? '#334155' : '#131C2E'}
                strokeWidth={z === 0 ? '0.35' : '0.18'}
              />
              <text
                x={toSvgX(0) - 1.5}
                y={toSvgY(z)}
                fill="#64748B"
                fontSize="1.8"
                textAnchor="end"
                dominantBaseline="middle"
                className="font-mono"
              >
                {z === 0 ? '±0.0m' : `+${z}m`}
              </text>
            </g>
          ))}

          {Array.from({ length: Math.floor(maxR / 20) + 1 }, (_, i) => i * 20).map((r) => (
            <g key={`r-${r}`}>
              <line
                x1={toSvgX(r)}
                y1={toSvgY(0)}
                x2={toSvgX(r)}
                y2={toSvgY(maxZ)}
                stroke="#131C2E"
                strokeWidth="0.18"
              />
              <text
                x={toSvgX(r)}
                y={toSvgY(0) + 2.8}
                fill="#64748B"
                fontSize="1.8"
                textAnchor="middle"
                className="font-mono"
              >
                R={r}m
              </text>
            </g>
          ))}

          {/* Infield Slab & Pitch Focal Point Marker */}
          <line
            x1={toSvgX(0)}
            y1={toSvgY(0)}
            x2={toSvgX(infieldOuterR)}
            y2={toSvgY(0)}
            stroke="#10B981"
            strokeWidth="0.8"
          />
          <text
            x={toSvgX(focalRadiusM * 0.42)}
            y={toSvgY(0) - 1.6}
            fill="#10B981"
            fontSize="2.0"
            textAnchor="middle"
            className="font-mono"
          >
            内场核心场地 (R={infieldOuterR.toFixed(1)}m)
          </text>

          {/* Focal Point (Sightline Target on Touchline) */}
          <g transform={`translate(${toSvgX(focalRadiusM)}, ${toSvgY(0)})`}>
            <circle cx="0" cy="0" r="1.1" fill="#F43F5E" />
            <text
              x="0"
              y="-3.8"
              fill="#FDA4AF"
              fontSize="2.0"
              fontWeight="600"
              textAnchor="middle"
              className="font-mono"
            >
              视线焦点 F (R={focalRadiusM}m)
            </text>
          </g>

          {/* Sightline Rays from Sampled Rows to Focal Point */}
          {rows
            .filter(
              (r, idx) =>
                r.rowIndex === 1 ||
                r.rowIndex === Math.ceil(r.rowIndex / 2) ||
                idx % 4 === 0 ||
                hoveredRow?.rowIndex === r.rowIndex
            )
            .map((r) => {
              const isHovered =
                hoveredRow &&
                hoveredRow.tierId === r.tierId &&
                hoveredRow.rowIndex === r.rowIndex;
              const rayColor =
                r.compliance === 'optimal'
                  ? '#10B981'
                  : r.compliance === 'acceptable'
                  ? '#06B6D4'
                  : r.compliance === 'marginal'
                  ? '#F59E0B'
                  : '#F43F5E';

              return (
                <line
                  key={`ray-${r.tierId}-${r.rowIndex}`}
                  x1={toSvgX(r.radiusM)}
                  y1={toSvgY(r.eyeElevationM)}
                  x2={toSvgX(focalRadiusM)}
                  y2={toSvgY(0)}
                  stroke={rayColor}
                  strokeWidth={isHovered ? '0.45' : '0.18'}
                  strokeOpacity={isHovered ? '0.95' : '0.32'}
                  strokeDasharray={isHovered ? 'none' : '1.2,0.8'}
                />
              );
            })}

          {/* Stepped Concrete Bowl Structure per Tier */}
          {sortedTiers.map((tier) => {
            const tierRows = rows.filter((r) => r.tierId === tier.id);
            if (tierRows.length === 0) return null;

            // Build stepped riser/tread polyline
            const stepPts: string[] = [];
            const first = tierRows[0];
            stepPts.push(`${toSvgX(first.radiusM)},${toSvgY(first.treadElevationM)}`);

            for (let i = 0; i < tierRows.length; i++) {
              const cur = tierRows[i];
              const nextR = cur.radiusM + cur.treadDepthM;
              // Horizontal tread
              stepPts.push(`${toSvgX(nextR)},${toSvgY(cur.treadElevationM)}`);
              // Vertical riser to next row
              if (i + 1 < tierRows.length) {
                stepPts.push(`${toSvgX(nextR)},${toSvgY(tierRows[i + 1].treadElevationM)}`);
              }
            }

            const last = tierRows[tierRows.length - 1];
            const lastOuterR = last.radiusM + last.treadDepthM;

            // Under-bowl structural slab polygon
            const slabPts = [
              ...stepPts,
              `${toSvgX(lastOuterR)},${toSvgY(last.treadElevationM - 1.6)}`,
              `${toSvgX(first.radiusM)},${toSvgY(Math.max(0, first.treadElevationM - 1.2))}`,
            ].join(' ');

            return (
              <g key={tier.id}>
                <polygon
                  points={slabPts}
                  fill="rgba(30, 41, 59, 0.78)"
                  stroke="#475569"
                  strokeWidth="0.25"
                />
                <polyline
                  points={stepPts.join(' ')}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="0.45"
                />

                {/* Front Parapet Guardrail */}
                {tier.defaultGuardrail.frontRailEnabled && (
                  <line
                    x1={toSvgX(first.radiusM)}
                    y1={toSvgY(first.treadElevationM)}
                    x2={toSvgX(first.radiusM)}
                    y2={toSvgY(first.treadElevationM + tier.defaultGuardrail.frontRailHeight)}
                    stroke="#22D3EE"
                    strokeWidth="0.45"
                  />
                )}

                {/* Rear Safety Wall / Guardrail */}
                {tier.defaultGuardrail.rearWallEnabled && (
                  <line
                    x1={toSvgX(lastOuterR)}
                    y1={toSvgY(last.treadElevationM)}
                    x2={toSvgX(lastOuterR)}
                    y2={toSvgY(last.treadElevationM + tier.defaultGuardrail.rearWallHeight)}
                    stroke="#F59E0B"
                    strokeWidth="0.5"
                  />
                )}

                {/* Tier Annotation Callout */}
                <text
                  x={toSvgX((first.radiusM + lastOuterR) / 2)}
                  y={toSvgY((first.treadElevationM + last.treadElevationM) / 2 + 3.2)}
                  fill="#E2E8F0"
                  fontSize="2.1"
                  fontWeight="600"
                  textAnchor="middle"
                  className="font-mono"
                >
                  {tier.level}F ({tier.defaultSlopeDeg}°坡度 · {tierRows.length}排)
                </text>
              </g>
            );
          })}

          {/* Spectator Eye Points along the Bowl */}
          {rows.map((r) => {
            const dotColor =
              r.compliance === 'optimal'
                ? '#10B981'
                : r.compliance === 'acceptable'
                ? '#06B6D4'
                : r.compliance === 'marginal'
                ? '#F59E0B'
                : '#F43F5E';

            return (
              <circle
                key={`eye-${r.tierId}-${r.rowIndex}`}
                cx={toSvgX(r.radiusM + r.treadDepthM * 0.4)}
                cy={toSvgY(r.eyeElevationM)}
                r={
                  hoveredRow?.tierId === r.tierId && hoveredRow?.rowIndex === r.rowIndex
                    ? '0.75'
                    : '0.38'
                }
                fill={dotColor}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRow(r)}
              />
            );
          })}

          {/* Ideal Iso-C Parabolic Curve Overlay */}
          {schema.sightlineConfig.showIdealParabolicCurve && parabolicPointsStr && (
            <g className="pointer-events-none">
              <polyline
                points={parabolicPointsStr}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="0.5"
                strokeDasharray="1.8,1.0"
              />
              {idealParabolicCurve.length > 2 && (
                <text
                  x={toSvgX(idealParabolicCurve[idealParabolicCurve.length - 1].radiusM - 4)}
                  y={toSvgY(idealParabolicCurve[idealParabolicCurve.length - 1].elevationM + 1.8)}
                  fill="#FBBF24"
                  fontSize="2.0"
                  textAnchor="end"
                  className="font-mono"
                >
                  等C值({schema.sightlineConfig.targetCValueMm}mm)理想抛物线基准
                </text>
              )}
            </g>
          )}
        </svg>

        {/* Quick Live Tier Slope & Elevation Adjuster Strip */}
        {onUpdateTierSlopeOrPitch && (
          <div className="px-4 py-2 bg-[#0B0E17]/95 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                剖面各层坡度实时调校:
              </span>
              {sortedTiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded"
                >
                  <span className="font-mono text-cyan-300 font-semibold">
                    {tier.level}F坡度
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={37}
                    step={0.5}
                    value={tier.defaultSlopeDeg}
                    onChange={(e) =>
                      onUpdateTierSlopeOrPitch(tier.id, {
                        defaultSlopeDeg: Number(e.target.value),
                      })
                    }
                    className="w-20 accent-cyan-400"
                  />
                  <span className="font-mono tabular-nums text-slate-200 w-10">
                    {tier.defaultSlopeDeg}°
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 font-mono tabular-nums">
              <span>
                最低C值: <strong className={minC >= 90 ? 'text-emerald-400' : 'text-amber-400'}>{minC}mm</strong>
              </span>
              <span>
                最高C值: <strong className="text-cyan-400">{maxC}mm</strong>
              </span>
              <span>
                剖面合规率: <strong className="text-emerald-400">{compliancePct}%</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Split: C-Value Curve Graph + Row-by-Row Inspection Table */}
      <div className="h-56 grid grid-cols-1 lg:grid-cols-12 bg-[#0B0E17]">
        {/* Left 5 cols: C-Value Distribution Curve across Rows */}
        <div className="lg:col-span-5 border-r border-slate-800 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              各排视线 C 值分布曲线 (mm)
            </span>
            <span className="text-xs font-mono text-slate-400">
              标准线: {schema.sightlineConfig.targetCValueMm}mm
            </span>
          </div>

          <div className="flex-1 flex items-end gap-0.5 pt-3 pb-1 px-1 border-b border-slate-800 relative">
            {/* Target threshold line */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-emerald-500/60 pointer-events-none"
              style={{
                bottom: `${Math.min(90, Math.max(10, (schema.sightlineConfig.targetCValueMm / 220) * 100))}%`,
              }}
            />
            {rows.map((r, i) => {
              const heightPct = Math.min(100, Math.max(8, (r.cValueMm / 220) * 100));
              const barColor =
                r.compliance === 'optimal'
                  ? 'bg-emerald-500'
                  : r.compliance === 'acceptable'
                  ? 'bg-cyan-500'
                  : r.compliance === 'marginal'
                  ? 'bg-amber-500'
                  : 'bg-rose-500';
              return (
                <div
                  key={`${r.tierId}-${r.rowIndex}-${i}`}
                  onMouseEnter={() => setHoveredRow(r)}
                  style={{ height: `${heightPct}%` }}
                  className={`flex-1 min-w-[3px] rounded-t-xs transition-opacity hover:opacity-100 opacity-85 cursor-pointer ${barColor}`}
                  title={`${r.tierLevel}F 第${r.rowIndex}排: C=${r.cValueMm}mm`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 font-mono whitespace-nowrap">
            <span>● ≥120mm 优等</span>
            <span>● ≥90mm 合规</span>
            <span>▲ 60-89mm 临界</span>
            <span>✖ &lt;60mm 受阻</span>
          </div>
        </div>

        {/* Right 7 cols: Row-by-Row Engineering Table */}
        <div className="lg:col-span-7 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-[#0F1420]">
            <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">
              剖面排距、阶高与视线C值明细表 (共 {rows.length} 排)
            </span>
            {hoveredRow && (
              <span className="text-xs font-mono text-cyan-400 whitespace-nowrap truncate">
                当前选中: {hoveredRow.tierLevel}F 第{hoveredRow.rowIndex}排 · C={hoveredRow.cValueMm}mm · 俯角={hoveredRow.sightlineAngleDeg}°
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums whitespace-nowrap">
              <thead className="bg-slate-900/90 text-slate-400 sticky top-0">
                <tr>
                  <th className="py-1.5 px-2 font-medium">层</th>
                  <th className="py-1.5 px-1.5 font-medium">排号</th>
                  <th className="py-1.5 px-1.5 font-medium text-right">极径R(m)</th>
                  <th className="py-1.5 px-1.5 font-medium text-right">排距T(m)</th>
                  <th className="py-1.5 px-1.5 font-medium text-right">阶高N(m)</th>
                  <th className="py-1.5 px-1.5 font-medium text-right">标高(m)</th>
                  <th className="py-1.5 px-1.5 font-medium text-right">C值(mm)</th>
                  <th className="py-1.5 px-2 font-medium text-right">判定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {rows.map((r) => (
                  <tr
                    key={`${r.tierId}-${r.rowIndex}`}
                    onMouseEnter={() => setHoveredRow(r)}
                    className="hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-1 px-2 text-cyan-300">{r.tierLevel}F</td>
                    <td className="py-1 px-1.5">第{r.rowIndex}排</td>
                    <td className="py-1 px-1.5 text-right">{r.radiusM.toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right">{r.treadDepthM.toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right">{r.riserHeightM.toFixed(3)}</td>
                    <td className="py-1 px-1.5 text-right">{r.eyeElevationM.toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right font-semibold">{r.cValueMm}</td>
                    <td className="py-1 px-2 text-right">
                      {r.compliance === 'optimal' && (
                        <span className="text-emerald-400">● 优等</span>
                      )}
                      {r.compliance === 'acceptable' && (
                        <span className="text-cyan-400">● 合规</span>
                      )}
                      {r.compliance === 'marginal' && (
                        <span className="text-amber-400">▲ 临界</span>
                      )}
                      {r.compliance === 'obstructed' && (
                        <span className="text-rose-400">✖ 受阻</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
