import React from 'react';
import {
  GuardrailConfig,
  InfieldConfig,
  InfieldSeatModule,
  InfieldShapeType,
  StadiumSchema,
  StandSector,
  StandSectorFillType,
  StandTier,
  TierMorphMode,
  VomitoryExitConfig,
  VomitoryPositionType,
} from '../types/stadium';
import { SelectedEntity } from './CadCanvas2D';
import {
  calculateInfieldModuleCapacity,
  calculateSectorCapacity,
  DEG_TO_RAD,
  getInfieldPerimeterMeters,
} from '../utils/stadiumEngine';
import {
  Building2,
  Compass,
  CopyCheck,
  DoorOpen,
  Layers,
  Lock,
  Music,
  Plus,
  RotateCcw,
  Shield,
  Sliders,
  Trash2,
} from 'lucide-react';

interface PropertyInspectorProps {
  schema: StadiumSchema;
  selected: SelectedEntity;
  onSelect: (sel: SelectedEntity) => void;
  onUpdateInfield: (patch: Partial<InfieldConfig>) => void;
  onAddInfieldModule: (type: 'flat' | 'sloped') => void;
  onUpdateInfieldModule: (id: string, patch: Partial<InfieldSeatModule>) => void;
  onDeleteInfieldModule: (id: string) => void;
  onAddTier: () => void;
  onUpdateTier: (tierId: string, patch: Partial<StandTier>) => void;
  onDeleteTier: (tierId: string) => void;
  onUpdateSector: (
    tierId: string,
    sectorId: string,
    patch: Partial<StandSector>
  ) => void;
  onApplySectorToAllInTier: (tierId: string, sourceSector: StandSector) => void;
  onApplyVomitoryToAllInTier?: (tierId: string, vomitory: VomitoryExitConfig) => void;
}

const INFIELD_SHAPES: Array<{ id: InfieldShapeType; label: string; desc: string }> = [
  { id: 'rounded-rect', label: '圆角长方形', desc: '专业足球/橄榄球标准' },
  { id: 'ellipse', label: '椭圆形', desc: '400m综合田径场标准' },
  { id: 'circle', label: '正圆形', desc: '棒垒球/中心演艺剧场' },
  { id: 'rectangle', label: '标准长方形', desc: '紧凑型矩形室内场馆' },
  { id: 'square', label: '正方形(可带圆角)', desc: '搏击/篮球/四面台场馆' },
];

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  schema,
  selected,
  onSelect,
  onUpdateInfield,
  onAddInfieldModule,
  onUpdateInfieldModule,
  onDeleteInfieldModule,
  onAddTier,
  onUpdateTier,
  onDeleteTier,
  onUpdateSector,
  onApplySectorToAllInTier,
  onApplyVomitoryToAllInTier,
}) => {
  const activeTier =
    schema.standTiers.find((t) => t.id === selected.tierId) ||
    schema.standTiers[0];

  const activeSector =
    activeTier?.sectors.find((s) => s.id === selected.sectorId) ||
    activeTier?.sectors[0];

  const activeModule =
    schema.infieldModules.find((m) => m.id === selected.moduleId) ||
    schema.infieldModules[0];

  // Top-level Inspector Mode Tabs
  const activeTab: 'infield' | 'tier' | 'sector' =
    selected.type === 'infield' || selected.type === 'infield-module'
      ? 'infield'
      : selected.type === 'sector'
      ? 'sector'
      : 'tier';

  return (
    <aside className="w-[370px] shrink-0 h-full bg-[#0F1420] border-l border-slate-800 flex flex-col overflow-hidden select-none">
      {/* 3-Mode Inspector Switcher */}
      <div className="p-2 border-b border-slate-800 bg-[#0B0E17] grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onSelect({ type: 'infield' })}
          className={`py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'infield'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>1. 内场与坐席</span>
        </button>
        <button
          type="button"
          onClick={() =>
            onSelect({
              type: 'tier',
              tierId: activeTier?.id || schema.standTiers[0]?.id,
            })
          }
          className={`py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'tier'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>2. 看台楼层</span>
        </button>
        <button
          type="button"
          onClick={() =>
            onSelect({
              type: 'sector',
              tierId: activeTier?.id,
              sectorId: activeSector?.id,
            })
          }
          className={`py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'sector'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>3. 独立分块属性</span>
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* ============================================================
            TAB 1: INFIELD GEOMETRY & MODULAR SEATING (FLAT + SLOPED)
           ============================================================ */}
        {activeTab === 'infield' && (
          <>
            {/* Infield Shape Selection */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  核心内场几何形态 (Infield Core)
                </h3>
                <span className="text-[11px] font-mono text-emerald-400">
                  外圈锚定1F看台
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {INFIELD_SHAPES.map((sh) => (
                  <button
                    key={sh.id}
                    type="button"
                    onClick={() => {
                      const patch: Partial<InfieldConfig> = { shape: sh.id };
                      if (sh.id === 'circle' || sh.id === 'square') {
                        patch.width = schema.infield.length;
                      }
                      if (sh.id === 'rounded-rect' && schema.infield.cornerRadius === 0) {
                        patch.cornerRadius = 20;
                      }
                      onUpdateInfield(patch);
                    }}
                    className={`p-2 rounded border text-left transition-colors ${
                      schema.infield.shape === sh.id
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold">{sh.label}</div>
                    <div className="text-[11px] text-slate-400 truncate">{sh.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Infield Dimensions & Corner Radius */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <h4 className="font-semibold text-slate-200">
                内场外圈尺寸与圆角度数设定
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-400 block">
                    {schema.infield.shape === 'circle'
                      ? '内场直径 D (m)'
                      : schema.infield.shape === 'square'
                      ? '正方形边长 L (m)'
                      : '内场外圈长轴 L (m)'}
                  </span>
                  <input
                    type="number"
                    min={40}
                    max={260}
                    value={schema.infield.length}
                    onChange={(e) => {
                      const val = Math.max(40, Number(e.target.value));
                      if (
                        schema.infield.shape === 'circle' ||
                        schema.infield.shape === 'square'
                      ) {
                        onUpdateInfield({ length: val, width: val });
                      } else {
                        onUpdateInfield({ length: val });
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>

                {schema.infield.shape !== 'circle' &&
                  schema.infield.shape !== 'square' && (
                    <label className="space-y-1">
                      <span className="text-slate-400 block">内场外圈短轴 W (m)</span>
                      <input
                        type="number"
                        min={30}
                        max={220}
                        value={schema.infield.width}
                        onChange={(e) =>
                          onUpdateInfield({
                            width: Math.max(30, Number(e.target.value)),
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                      />
                    </label>
                  )}

                {(schema.infield.shape === 'rounded-rect' ||
                  schema.infield.shape === 'square') && (
                  <label className="space-y-1 col-span-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">圆角半径 / 弧度 R (m)</span>
                      <span className="font-mono text-emerald-400">
                        R = {schema.infield.cornerRadius} m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.floor(
                        Math.min(schema.infield.length, schema.infield.width) * 0.45
                      )}
                      step={1}
                      value={schema.infield.cornerRadius}
                      onChange={(e) =>
                        onUpdateInfield({ cornerRadius: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-400"
                    />
                  </label>
                )}

                <label className="space-y-1">
                  <span className="text-slate-400 block">中心赛场长 (m)</span>
                  <input
                    type="number"
                    min={15}
                    max={160}
                    value={schema.infield.pitchLength}
                    onChange={(e) =>
                      onUpdateInfield({ pitchLength: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-400 block">中心赛场宽 (m)</span>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={schema.infield.pitchWidth}
                    onChange={(e) =>
                      onUpdateInfield({ pitchWidth: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>
              </div>
            </div>

            {/* Infield Core Mode: Sports vs Stage vs Hybrid */}
            <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-pink-400" />
                  <span>内场赛事 / 演艺舞台模式切换</span>
                </h4>
                <span className="text-[11px] font-mono text-cyan-400">
                  {schema.infield.coreMode === 'sports'
                    ? '球场模式'
                    : schema.infield.coreMode === 'stage'
                    ? '舞台模式'
                    : '综合双模'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateInfield({ coreMode: 'sports' })}
                  className={`py-1.5 px-2 rounded border text-xs font-medium transition-colors ${
                    schema.infield.coreMode === 'sports'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  球场模式
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateInfield({ coreMode: 'stage' })}
                  className={`py-1.5 px-2 rounded border text-xs font-medium transition-colors ${
                    schema.infield.coreMode === 'stage'
                      ? 'bg-pink-500/20 border-pink-400 text-pink-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  演艺舞台
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateInfield({ coreMode: 'hybrid' })}
                  className={`py-1.5 px-2 rounded border text-xs font-medium transition-colors ${
                    schema.infield.coreMode === 'hybrid'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  综合双模
                </button>
              </div>

              {/* Sports Field Pitch Orientation and Markings */}
              {(schema.infield.coreMode === 'sports' || schema.infield.coreMode === 'hybrid') && (
                <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium">球场方向 / 旋转角度</span>
                    <span className="font-mono text-emerald-400">
                      {schema.infield.pitchOrientationDeg || 0}°
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateInfield({ pitchOrientationDeg: 0 })}
                      className={`py-1 px-2 rounded border text-xs font-mono transition-colors ${
                        (schema.infield.pitchOrientationDeg || 0) === 0
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      0° 东西向
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateInfield({ pitchOrientationDeg: 90 })}
                      className={`py-1 px-2 rounded border text-xs font-mono transition-colors ${
                        (schema.infield.pitchOrientationDeg || 0) === 90
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      90° 南北向
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateInfield({ pitchOrientationDeg: 45 })}
                      className={`py-1 px-2 rounded border text-xs font-mono transition-colors ${
                        (schema.infield.pitchOrientationDeg || 0) === 45
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      45° 对角斜向
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={5}
                    value={schema.infield.pitchOrientationDeg || 0}
                    onChange={(e) =>
                      onUpdateInfield({ pitchOrientationDeg: Number(e.target.value) })
                    }
                    className="w-full accent-emerald-400"
                  />
                </div>
              )}

              {/* Concert Stage Setup Parameters */}
              {(schema.infield.coreMode === 'stage' || schema.infield.coreMode === 'hybrid') && (
                <div className="p-2.5 rounded bg-slate-900/90 border border-pink-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-pink-300 font-medium">演艺舞台结构与方向</span>
                    <span className="font-mono text-pink-400">
                      朝向 {schema.infield.stageConfig?.orientationDeg || 90}°
                    </span>
                  </div>

                  {/* Stage Facing Direction Quick Selector */}
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { deg: 90, label: '朝南 90°' },
                      { deg: 0, label: '朝东 0°' },
                      { deg: 180, label: '朝西 180°' },
                      { deg: 270, label: '朝北 270°' },
                    ].map((d) => (
                      <button
                        key={d.deg}
                        type="button"
                        onClick={() =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              orientationDeg: d.deg,
                            },
                          })
                        }
                        className={`py-1 px-1 rounded text-[11px] font-mono border text-center transition-colors ${
                          (schema.infield.stageConfig?.orientationDeg ?? 90) === d.deg
                            ? 'bg-pink-500/25 border-pink-400 text-pink-200 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  {/* Stage Type */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'end-stage' as const, label: '端台 (偏一侧)' },
                      { id: 'center-stage' as const, label: '四面中心台' },
                      { id: 'thrust-stage' as const, label: 'T台延伸走道' },
                      { id: 'festival-stage' as const, label: '音乐节超级舞台' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              type: st.id,
                              catwalkLength: st.id === 'thrust-stage' ? 24 : 12,
                            },
                          })
                        }
                        className={`py-1 px-1.5 rounded text-[11px] border text-left transition-colors ${
                          (schema.infield.stageConfig?.type || 'end-stage') === st.id
                            ? 'bg-pink-500/20 border-pink-400 text-pink-200 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* Stage Dimensions */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-400 block">舞台台宽 (m)</span>
                      <input
                        type="number"
                        min={12}
                        max={80}
                        value={schema.infield.stageConfig?.width || 36}
                        onChange={(e) =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              width: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-xs"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-400 block">舞台进深 (m)</span>
                      <input
                        type="number"
                        min={8}
                        max={50}
                        value={schema.infield.stageConfig?.depth || 18}
                        onChange={(e) =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              depth: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-xs"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-400 block">台口高 (m)</span>
                      <input
                        type="number"
                        step={0.1}
                        min={1.0}
                        max={3.5}
                        value={schema.infield.stageConfig?.height || 2.0}
                        onChange={(e) =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              height: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-xs"
                      />
                    </label>
                  </div>

                  {/* Catwalk Runway & Backdrop LED */}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-400 block">T台延伸长 (m)</span>
                      <input
                        type="number"
                        min={0}
                        max={45}
                        value={schema.infield.stageConfig?.catwalkLength || 0}
                        onChange={(e) =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              catwalkLength: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-xs"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-400 block">LED大屏高 (m)</span>
                      <input
                        type="number"
                        min={4}
                        max={24}
                        value={schema.infield.stageConfig?.backdropHeight || 12}
                        onChange={(e) =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              backdropHeight: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-xs"
                      />
                    </label>
                  </div>

                  {/* FOH Booth */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schema.infield.stageConfig?.fohEnabled ?? true}
                        onChange={(e) =>
                          onUpdateInfield({
                            stageConfig: {
                              ...schema.infield.stageConfig,
                              fohEnabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-purple-500"
                      />
                      <span className="text-slate-300">布置FOH调音/灯光总控台</span>
                    </label>
                    <span className="font-mono text-purple-400">
                      距台 {schema.infield.stageConfig?.fohDistance || 32}m
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Dynamic Modular Infield Seating Section */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-100">
                  内场模块化坐席与斜坡座椅 ({schema.infieldModules.length})
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onAddInfieldModule('flat')}
                  className="py-2 px-2.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加平层坐席块</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAddInfieldModule('sloped')}
                  className="py-2 px-2.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加斜坡座椅块</span>
                </button>
              </div>

              {/* Module List Pills */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {schema.infieldModules.map((mod) => {
                  const isSel = activeModule?.id === mod.id;
                  const cap = calculateInfieldModuleCapacity(mod);
                  return (
                    <div
                      key={mod.id}
                      onClick={() =>
                        onSelect({ type: 'infield-module', moduleId: mod.id })
                      }
                      className={`p-2 rounded border flex items-center justify-between cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-slate-800 border-cyan-500/60 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium truncate">{mod.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {mod.type === 'sloped'
                            ? `▲斜坡 ${mod.slopeDeg}°`
                            : '■平层坐席'}{' '}
                          · ({mod.x}m, {mod.y}m) · {cap}席
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`删除 ${mod.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteInfieldModule(mod.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Selected Infield Module Parameter Editor */}
              {activeModule && (
                <div className="p-3 rounded bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-semibold text-cyan-300">
                      正在编辑: {activeModule.name}
                    </span>
                    <span className="font-mono text-emerald-400">
                      {calculateInfieldModuleCapacity(activeModule)} 席
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="space-y-1 col-span-2">
                      <span className="text-slate-400 block">模块名称</span>
                      <input
                        type="text"
                        value={activeModule.name}
                        onChange={(e) =>
                          onUpdateInfieldModule(activeModule.id, {
                            name: e.target.value,
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-slate-400 block">坐席模块类型</span>
                      <select
                        value={activeModule.type}
                        onChange={(e) => {
                          const newType = e.target.value as 'flat' | 'sloped';
                          onUpdateInfieldModule(activeModule.id, {
                            type: newType,
                            slopeDeg: newType === 'sloped' ? 15 : 0,
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                      >
                        <option value="flat">平面坐席模块</option>
                        <option value="sloped">模块化斜坡看台</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-slate-400 block">坡度角 (°)</span>
                      <input
                        type="number"
                        min={0}
                        max={28}
                        disabled={activeModule.type === 'flat'}
                        value={activeModule.slopeDeg}
                        onChange={(e) =>
                          onUpdateInfieldModule(activeModule.id, {
                            slopeDeg: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 disabled:opacity-40"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-slate-400 block">模块宽度 W (m)</span>
                      <input
                        type="number"
                        min={4}
                        max={80}
                        value={activeModule.width}
                        onChange={(e) =>
                          onUpdateInfieldModule(activeModule.id, {
                            width: Math.max(4, Number(e.target.value)),
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-slate-400 block">模块进深 D (m)</span>
                      <input
                        type="number"
                        min={3}
                        max={60}
                        value={activeModule.depth}
                        onChange={(e) =>
                          onUpdateInfieldModule(activeModule.id, {
                            depth: Math.max(3, Number(e.target.value)),
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-slate-400 block">旋转角度 (°)</span>
                      <input
                        type="number"
                        step={15}
                        value={activeModule.rotationDeg}
                        onChange={(e) =>
                          onUpdateInfieldModule(activeModule.id, {
                            rotationDeg: Number(e.target.value) % 360,
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-slate-400 block">座椅排数 (Rows)</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={activeModule.rows}
                        onChange={(e) =>
                          onUpdateInfieldModule(activeModule.id, {
                            rows: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ============================================================
            TAB 2: CONCENTRIC STAND TIERS (GLOBAL FLOOR PROPERTIES)
           ============================================================ */}
        {activeTab === 'tier' && activeTier && (
          <>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  看台楼层与同心辐射划分
                </h3>
                <button
                  type="button"
                  onClick={onAddTier}
                  className="px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新增看台层</span>
                </button>
              </div>

              {/* Tier Selector Strip */}
              <div className="space-y-1.5">
                {schema.standTiers
                  .slice()
                  .sort((a, b) => a.level - b.level)
                  .map((t) => {
                    const isSel = t.id === activeTier.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => onSelect({ type: 'tier', tierId: t.id })}
                        className={`p-2.5 rounded border flex items-center justify-between cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-cyan-500/15 border-cyan-500/60 text-white'
                            : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                        }`}
                      >
                        <div>
                          <div className="font-semibold flex items-center gap-1.5">
                            <span>{t.name}</span>
                            {t.level === 1 && (
                              <span className="text-[11px] font-mono text-emerald-400">
                                · 内圈贴合内场
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {t.sectorCount}块辐射分区 · 坡度{t.defaultSlopeDeg}° · 进深{t.radialDepth}m
                          </div>
                        </div>
                        {schema.standTiers.length > 1 && t.level > 1 && (
                          <button
                            type="button"
                            aria-label={`删除 ${t.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTier(t.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Tier 1 Coincidence Guarantee Notice */}
            {activeTier.level === 1 && (
              <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 flex items-start gap-2">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>一层看台几何约束已锁定：</strong>
                  1F看台内圈边界始终与内场外圈（{schema.infield.shape}）100%重合，修改内场尺寸或圆角会自动同步1F看台内环。
                </div>
              </div>
            )}

            {/* Infield-Shape Slicing & 2-Choice Morph Mode Controls */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <h4 className="font-semibold text-slate-200">
                内场形状分块切分、进深与形态融合
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 col-span-2 bg-slate-900/50 border border-slate-800 p-2.5 rounded">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-medium text-xs">
                      按内场边90°垂直切分块数 (Sectors)
                    </span>
                    <span className="font-mono text-cyan-400 font-semibold text-xs">
                      {activeTier.sectorCount} 块 (约{' '}
                      {(
                        getInfieldPerimeterMeters(schema.infield) /
                        Math.max(1, activeTier.sectorCount)
                      ).toFixed(1)}
                      m/块)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={36}
                    step={2}
                    value={activeTier.sectorCount}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        sectorCount: Number(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    沿当前内场「
                    <span className="text-cyan-300 font-mono">
                      {schema.infield.shape === 'rounded-rect'
                        ? '圆角长方形'
                        : schema.infield.shape === 'rectangle'
                        ? '长方形'
                        : schema.infield.shape === 'square'
                        ? '正方形'
                        : schema.infield.shape === 'ellipse'
                        ? '椭圆形'
                        : '圆形'}
                    </span>
                    」周长 {getInfieldPerimeterMeters(schema.infield)}m 按内场边界法线呈 <strong className="text-cyan-300">90°垂直切分</strong>，并自动按各层外扩面积/外缘等距均衡分块，直边与圆角分块面积基本一致。
                  </div>
                </label>

                <label className="space-y-1 col-span-2">
                  <span className="text-slate-400 block">看台外扩进深 (Radial Depth, m)</span>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={activeTier.radialDepth}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        radialDepth: Math.max(5, Number(e.target.value)),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>

                {/* 2-Choice Morph Mode Selector: Infield Geometric Shape vs Concentric Circle */}
                <div className="col-span-2 space-y-2 bg-slate-900/70 border border-slate-800 p-2.5 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 font-semibold text-xs">
                      外圈形态融合算法 (二选一)
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400">
                      {(activeTier.morphMode || 'concentric-circle') === 'infield-shape'
                        ? '内场几何外扩'
                        : '同心正圆融合'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        {
                          id: 'infield-shape' as TierMorphMode,
                          title: '内场几何形状融合',
                          desc: '随内场矩形/椭圆/圆角轮廓等距外扩',
                        },
                        {
                          id: 'concentric-circle' as TierMorphMode,
                          title: '同心圆形态融合',
                          desc: '以中心原点向标准正同心圆融合',
                        },
                      ] as const
                    ).map((mode) => {
                      const isSelected =
                        (activeTier.morphMode || 'concentric-circle') === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() =>
                            onUpdateTier(activeTier.id, { morphMode: mode.id })
                          }
                          className={`p-2 rounded border text-left transition-all ${
                            isSelected
                              ? 'bg-cyan-500/15 border-cyan-500 text-cyan-200 shadow-sm'
                              : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{mode.title}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isSelected ? 'bg-cyan-400' : 'bg-slate-700'
                              }`}
                            />
                          </div>
                          <div className="text-[10px] opacity-80 mt-0.5 leading-tight">
                            {mode.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Morph Intensity Slider + Number */}
                  <div className="space-y-1 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 text-xs">
                        {(activeTier.morphMode || 'concentric-circle') === 'infield-shape'
                          ? '内场几何形态融合度 (%)'
                          : '同心圆形态融合度 (%)'}
                      </span>
                      <span className="font-mono text-cyan-400 font-bold text-xs">
                        {Math.round(activeTier.concentricMorph * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(activeTier.concentricMorph * 100)}
                        onChange={(e) =>
                          onUpdateTier(activeTier.id, {
                            concentricMorph: Math.min(
                              1,
                              Math.max(0, Number(e.target.value) / 100)
                            ),
                          })
                        }
                        className="flex-1 accent-cyan-400 cursor-pointer h-1.5"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(activeTier.concentricMorph * 100)}
                        onChange={(e) =>
                          onUpdateTier(activeTier.id, {
                            concentricMorph: Math.min(
                              1,
                              Math.max(0, Number(e.target.value) / 100)
                            ),
                          })
                        }
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-right text-xs"
                      />
                    </div>
                  </div>
                </div>

                <label className="space-y-1">
                  <span className="text-slate-400 block">默认看台填充类型</span>
                  <select
                    value={activeTier.defaultFillType}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultFillType: e.target.value as StandSectorFillType,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                  >
                    <option value="standard">普通看台 (Standard)</option>
                    <option value="vip-box">商务包厢 (VIP Box)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-slate-400 block">安全出入口数量</span>
                  <input
                    type="number"
                    min={0}
                    max={activeTier.sectorCount * 2}
                    value={activeTier.defaultExitCount}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultExitCount: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>

                {/* Stand Slope Controls with Real-time 2D/3D Linkage */}
                <div className="space-y-1.5 bg-slate-900/60 border border-slate-800 p-2.5 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      看台坡度角 (Stand Slope)
                    </span>
                    <span className="text-cyan-400 font-mono font-bold text-xs bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded">
                      {activeTier.defaultSlopeDeg}°
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={37}
                      step={0.5}
                      value={activeTier.defaultSlopeDeg}
                      onChange={(e) =>
                        onUpdateTier(activeTier.id, {
                          defaultSlopeDeg: Number(e.target.value),
                        })
                      }
                      className="flex-1 accent-cyan-400 cursor-pointer h-1.5"
                    />
                    <input
                      type="number"
                      min={10}
                      max={37}
                      step={0.5}
                      value={activeTier.defaultSlopeDeg}
                      onChange={(e) =>
                        onUpdateTier(activeTier.id, {
                          defaultSlopeDeg: Number(e.target.value),
                        })
                      }
                      className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-right text-xs"
                    />
                  </div>
                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-1 pt-1">
                    {[
                      { label: '18° 缓坡', val: 18 },
                      { label: '24° 标准', val: 24 },
                      { label: '28° 舒适', val: 28 },
                      { label: '34° 陡坡', val: 34 },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        onClick={() =>
                          onUpdateTier(activeTier.id, { defaultSlopeDeg: btn.val })
                        }
                        className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors ${
                          activeTier.defaultSlopeDeg === btn.val
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-semibold'
                            : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed pt-0.5 flex items-center gap-1">
                    <span className="text-cyan-400">⚡</span>
                    <span>调整此坡度将实时驱动 <strong>2D剖面视线分析</strong> 与 <strong>3D看台倾角</strong> 协同联动。</span>
                  </div>
                </div>

                <label className="space-y-1">
                  <span className="text-slate-400 block">默认坐席排数 (排)</span>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={activeTier.defaultRows}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultRows: Math.max(2, Number(e.target.value)),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-400 block">默认排距 T (m)</span>
                  <input
                    type="number"
                    min={0.75}
                    max={1.6}
                    step={0.02}
                    value={activeTier.defaultRowPitch}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultRowPitch: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-400 block">首排起始标高 Z (m)</span>
                  <input
                    type="number"
                    min={0}
                    max={45}
                    step={0.2}
                    value={activeTier.baseElevation}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        baseElevation: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </label>
              </div>
            </div>

            {/* Guardrail Global Configuration */}
            <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                <span>本层栏杆与安全防护规范 (Guardrails)</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-slate-400 block">前排防坠栏杆高 (m)</span>
                  <input
                    type="number"
                    min={0.9}
                    max={1.5}
                    step={0.05}
                    value={activeTier.defaultGuardrail.frontRailHeight}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultGuardrail: {
                          ...activeTier.defaultGuardrail,
                          frontRailHeight: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-400 block">后沿围护栏杆高 (m)</span>
                  <input
                    type="number"
                    min={1.0}
                    max={2.2}
                    step={0.05}
                    value={activeTier.defaultGuardrail.rearWallHeight}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultGuardrail: {
                          ...activeTier.defaultGuardrail,
                          rearWallHeight: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100"
                  />
                </label>

                <label className="space-y-1 col-span-2">
                  <span className="text-slate-400 block">栏杆工程构造材质</span>
                  <select
                    value={activeTier.defaultGuardrail.material}
                    onChange={(e) =>
                      onUpdateTier(activeTier.id, {
                        defaultGuardrail: {
                          ...activeTier.defaultGuardrail,
                          material: e.target.value as GuardrailConfig['material'],
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                  >
                    <option value="tempered-glass">超白双层夹胶钢化玻璃栏板 (无遮挡视野)</option>
                    <option value="steel-balustrade">装配式不锈钢防攀爬扶手栏杆</option>
                    <option value="concrete-parapet">预制清水混凝土胸墙 + 金属横杆</option>
                  </select>
                </label>
              </div>
            </div>
          </>
        )}

        {/* ============================================================
            TAB 3: INDIVIDUAL SECTOR INSPECTOR (DENSITY, PITCH, EXITS, VIP)
           ============================================================ */}
        {activeTab === 'sector' && activeTier && activeSector && (
          <>
            {/* Quick Tier & Sector Matrix Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  独立看台分块属性 ({activeSector.name})
                </h3>
                <select
                  aria-label="选择看台楼层"
                  value={activeTier.id}
                  onChange={(e) => {
                    const nextT = schema.standTiers.find(
                      (t) => t.id === e.target.value
                    );
                    if (nextT) {
                      onSelect({
                        type: 'sector',
                        tierId: nextT.id,
                        sectorId: nextT.sectors[0]?.id,
                      });
                    }
                  }}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-cyan-300"
                >
                  {schema.standTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.level}F ({t.sectorCount}块)
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Sector Matrix Grid */}
              <div className="grid grid-cols-6 gap-1 pt-1">
                {activeTier.sectors.map((sec) => {
                  const isCur = sec.id === activeSector.id;
                  const isVip = sec.fillType === 'vip-box';
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() =>
                        onSelect({
                          type: 'sector',
                          tierId: activeTier.id,
                          sectorId: sec.id,
                        })
                      }
                      className={`py-1 px-1 rounded font-mono text-[11px] border transition-colors ${
                        isCur
                          ? 'bg-cyan-500 text-slate-950 border-white font-bold'
                          : isVip
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {sec.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sector Summary Bar */}
            <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800 flex items-center justify-between font-mono">
              <div>
                <div className="text-slate-400 text-[11px]">辐射角范围</div>
                <div className="text-slate-100 font-semibold">
                  {activeSector.startAngleDeg}° ~ {activeSector.endAngleDeg}°
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">阶高 N</div>
                <div className="text-cyan-400 font-semibold">
                  {Math.round(
                    activeSector.rowPitch *
                      Math.tan(activeSector.slopeDeg * DEG_TO_RAD) *
                      1000
                  )}{' '}
                  mm
                </div>
              </div>
              <div className="text-right">
                <div className="text-slate-400 text-[11px]">本块容量</div>
                <div className="text-emerald-400 font-semibold">
                  {calculateSectorCapacity(
                    schema.infield,
                    schema.standTiers,
                    activeTier,
                    activeSector
                  )}{' '}
                  席
                </div>
              </div>
            </div>

            {/* Quick Delete / Restore Sector Action */}
            <div className="pt-2">
              {activeSector.isDeleted || activeSector.fillType === 'empty-void' ? (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      isDeleted: false,
                      fillType: 'standard',
                      useCustomOverrides: true,
                    })
                  }
                  className="w-full py-2 px-3 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>恢复此看台分块 (恢复坐席阶梯)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      isDeleted: true,
                      fillType: 'empty-void',
                      useCustomOverrides: true,
                    })
                  }
                  className="w-full py-2 px-3 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>删除本分块 (转为净空镂空/马蹄形)</span>
                </button>
              )}
            </div>

            {/* 5-State Fill Type Switcher */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 block">
                  看台分块功能形态 (5种专业属性)
                </span>
                <span className="text-[11px] font-mono text-cyan-400">
                  {activeSector.fillType}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      fillType: 'standard',
                      isDeleted: false,
                      useCustomOverrides: true,
                    })
                  }
                  className={`py-2 px-2.5 rounded border text-left font-medium transition-colors ${
                    activeSector.fillType === 'standard' && !activeSector.isDeleted
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-semibold text-xs">普通看台</div>
                  <div className="text-[10px] text-slate-400">常规标准阶梯坐席</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      fillType: 'vip-box',
                      isDeleted: false,
                      vipBoxRooms: activeSector.vipBoxRooms || 4,
                      seatSpacing: 0.72,
                      rowPitch: 1.35,
                      useCustomOverrides: true,
                    })
                  }
                  className={`py-2 px-2.5 rounded border text-left font-medium transition-colors ${
                    activeSector.fillType === 'vip-box' && !activeSector.isDeleted
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-semibold text-xs">VIP商务包厢</div>
                  <div className="text-[10px] text-slate-400">独立套房与观赛宽座</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      fillType: 'tunnel-exit',
                      isDeleted: false,
                      useCustomOverrides: true,
                    })
                  }
                  className={`py-2 px-2.5 rounded border text-left font-medium transition-colors ${
                    activeSector.fillType === 'tunnel-exit'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-semibold text-xs">车行/马拉松通道</div>
                  <div className="text-[10px] text-slate-400">大型进场门/应急车道</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      fillType: 'solid-wall',
                      isDeleted: false,
                      useCustomOverrides: true,
                    })
                  }
                  className={`py-2 px-2.5 rounded border text-left font-medium transition-colors ${
                    activeSector.fillType === 'solid-wall'
                      ? 'bg-slate-500/30 border-slate-400 text-slate-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-semibold text-xs">实体山墙/机房</div>
                  <div className="text-[10px] text-slate-400">混凝土山墙/记分台</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      fillType: 'empty-void',
                      isDeleted: true,
                      useCustomOverrides: true,
                    })
                  }
                  className={`col-span-2 py-2 px-2.5 rounded border text-left font-medium transition-colors ${
                    activeSector.fillType === 'empty-void' || activeSector.isDeleted
                      ? 'bg-rose-500/20 border-rose-400 text-rose-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-semibold text-xs text-rose-300">镂空/删除本看台块 (Open Void)</div>
                  <div className="text-[10px] text-slate-400">彻底移除坐席，形成局部开口、U型看台或通透景观通道</div>
                </button>
              </div>
            </div>

            {/* Custom Boundary & Depth Trimming */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              <h4 className="font-semibold text-slate-200">
                看台分块边缘与深度裁切 (CAD自由造型)
              </h4>
              <label className="space-y-1 block">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">分块独立径向深度</span>
                  <div className="flex items-center gap-1.5 font-mono text-cyan-400">
                    <span>
                      {activeSector.customRadialDepth
                        ? `${activeSector.customRadialDepth} m`
                        : `跟随楼层 (${activeTier.radialDepth} m)`}
                    </span>
                    {activeSector.customRadialDepth && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            customRadialDepth: undefined,
                            rows: activeTier.defaultRows,
                          })
                        }
                        className="px-1.5 py-0.5 bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] rounded"
                      >
                        重置
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={4}
                    max={Math.max(120, Math.round(activeTier.radialDepth * 3))}
                    step={1}
                    value={activeSector.customRadialDepth || activeTier.radialDepth}
                    onChange={(e) => {
                      const newDepth = Number(e.target.value);
                      const derivedRows = Math.max(
                        2,
                        Math.round(newDepth / (activeSector.rowPitch || 0.85))
                      );
                      onUpdateSector(activeTier.id, activeSector.id, {
                        customRadialDepth: newDepth,
                        rows: derivedRows,
                        useCustomOverrides: true,
                      });
                    }}
                    className="flex-1 accent-cyan-400"
                  />
                  <input
                    type="number"
                    min={4}
                    max={200}
                    value={activeSector.customRadialDepth || activeTier.radialDepth}
                    onChange={(e) => {
                      const newDepth = Math.max(4, Number(e.target.value));
                      const derivedRows = Math.max(
                        2,
                        Math.round(newDepth / (activeSector.rowPitch || 0.85))
                      );
                      onUpdateSector(activeTier.id, activeSector.id, {
                        customRadialDepth: newDepth,
                        rows: derivedRows,
                        useCustomOverrides: true,
                      });
                    }}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-right text-slate-100"
                  />
                </div>
                <div className="text-[10px] text-slate-400 leading-tight pt-0.5">
                  坡度角严格锁定为 <span className="text-cyan-300 font-mono">{activeSector.slopeDeg}°</span>，拉大深度时高度等比上升，看台与地面夹角恒定不变。
                </div>
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between">
                  <span className="text-slate-300">内圈向外缩退偏移 (m)</span>
                  <span className="font-mono text-amber-400">
                    +{activeSector.customRadialOffset || 0} m
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={0.5}
                  value={activeSector.customRadialOffset || 0}
                  onChange={(e) =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      customRadialOffset: Number(e.target.value),
                      useCustomOverrides: true,
                    })
                  }
                  className="w-full accent-amber-400"
                />
              </label>
            </div>

            {/* Density, Row Spacing, Rows & Slope Sliders */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <h4 className="font-semibold text-slate-200">
                座椅密度、排距与坡度实时微调
              </h4>

              {activeSector.fillType === 'vip-box' && (
                <label className="space-y-1 block">
                  <div className="flex justify-between">
                    <span className="text-amber-300">VIP独立包厢房间数</span>
                    <span className="font-mono text-amber-400">
                      {activeSector.vipBoxRooms || 3} 间
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={activeSector.vipBoxRooms || 3}
                    onChange={(e) =>
                      onUpdateSector(activeTier.id, activeSector.id, {
                        vipBoxRooms: Number(e.target.value),
                        useCustomOverrides: true,
                      })
                    }
                    className="w-full accent-amber-400"
                  />
                </label>
              )}

              <label className="space-y-1 block">
                <div className="flex justify-between">
                  <span className="text-slate-300">座椅横向间距/座宽 (座椅密度)</span>
                  <span className="font-mono text-cyan-400">
                    {activeSector.seatSpacing.toFixed(2)} m / 席
                  </span>
                </div>
                <input
                  type="range"
                  min={0.46}
                  max={0.9}
                  step={0.02}
                  value={activeSector.seatSpacing}
                  onChange={(e) =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      seatSpacing: Number(e.target.value),
                      useCustomOverrides: true,
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between">
                  <span className="text-slate-300">前后排距 (Row Pitch T)</span>
                  <span className="font-mono text-cyan-400">
                    {activeSector.rowPitch.toFixed(2)} m
                  </span>
                </div>
                <input
                  type="range"
                  min={0.76}
                  max={1.5}
                  step={0.02}
                  value={activeSector.rowPitch}
                  onChange={(e) =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      rowPitch: Number(e.target.value),
                      useCustomOverrides: true,
                    })
                  }
                  className="w-full accent-cyan-400"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-400 block">本块排数 (Rows)</span>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={activeSector.rows}
                    onChange={(e) =>
                      onUpdateSector(activeTier.id, activeSector.id, {
                        rows: Math.max(2, Number(e.target.value)),
                        useCustomOverrides: true,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono text-slate-100"
                  />
                </label>

                <div className="space-y-1.5 bg-slate-900/60 border border-slate-800 p-2 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium text-xs">本块看台坡度角 (°)</span>
                    <span className="text-cyan-400 font-mono font-bold text-xs bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded">
                      {activeSector.slopeDeg}°
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={37}
                      step={0.5}
                      value={activeSector.slopeDeg}
                      onChange={(e) =>
                        onUpdateSector(activeTier.id, activeSector.id, {
                          slopeDeg: Number(e.target.value),
                          useCustomOverrides: true,
                        })
                      }
                      className="flex-1 accent-cyan-400 cursor-pointer h-1.5"
                    />
                    <input
                      type="number"
                      min={10}
                      max={37}
                      step={0.5}
                      value={activeSector.slopeDeg}
                      onChange={(e) =>
                        onUpdateSector(activeTier.id, activeSector.id, {
                          slopeDeg: Number(e.target.value),
                          useCustomOverrides: true,
                        })
                      }
                      className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-slate-100 text-right text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Safety Exit / Vomitory Position Configuration */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <DoorOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>看台出入口与安全通道 (Vomitory Exit)</span>
                </div>
                {activeSector.vomitory.position !== 'none' ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    ✓ 已设置出入口
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    未设置出入口
                  </span>
                )}
              </div>

              {/* Add / Remove Vomitory Action */}
              {activeSector.vomitory.position === 'none' ? (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSector(activeTier.id, activeSector.id, {
                      vomitory: {
                        ...activeSector.vomitory,
                        position: 'center',
                        enabled: true,
                        width: 3.2,
                        rowSpan: Math.min(4, Math.max(2, Math.floor(activeSector.rows * 0.25))),
                        startRow: Math.max(1, Math.floor(activeSector.rows * 0.35)),
                        angularOffsetPct: 0,
                      },
                      useCustomOverrides: true,
                    })
                  }
                  className="w-full py-2.5 px-3 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>为此看台分块添加安全出入口 (Add Exit)</span>
                </button>
              ) : (
                <div className="space-y-3 bg-slate-900/90 border border-emerald-500/30 rounded-lg p-3">
                  {/* Orientation Status Banner (Unified radially towards center field) */}
                  <div className="p-2 rounded bg-slate-950/80 border border-slate-800 flex items-start gap-2">
                    <Compass className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed text-slate-300">
                      <strong className="text-emerald-300">朝向状态：</strong>
                      统一径向正对内场中心场地 <span className="font-mono text-cyan-400">(0,0)</span> 原点，通道中轴与疏散方向严格正对中心赛场。
                    </div>
                  </div>

                  {/* Portal Size Controls: Width & Row Span */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="space-y-1 block">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300">出口通宽 (Width)</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {activeSector.vomitory.width.toFixed(1)} m
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1.8}
                          max={6.0}
                          step={0.2}
                          value={activeSector.vomitory.width}
                          onChange={(e) =>
                            onUpdateSector(activeTier.id, activeSector.id, {
                              vomitory: {
                                ...activeSector.vomitory,
                                width: Number(e.target.value),
                              },
                              useCustomOverrides: true,
                            })
                          }
                          className="flex-1 accent-emerald-400"
                        />
                        <input
                          type="number"
                          min={1.8}
                          max={8.0}
                          step={0.1}
                          value={activeSector.vomitory.width}
                          onChange={(e) =>
                            onUpdateSector(activeTier.id, activeSector.id, {
                              vomitory: {
                                ...activeSector.vomitory,
                                width: Math.max(1.0, Number(e.target.value)),
                              },
                              useCustomOverrides: true,
                            })
                          }
                          className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-right text-slate-100"
                        />
                      </div>
                    </label>

                    <label className="space-y-1 block">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300">贯通排数 (Row Span)</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {activeSector.vomitory.rowSpan || 3} 排
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1}
                          max={Math.max(2, Math.min(10, activeSector.rows - 1))}
                          step={1}
                          value={activeSector.vomitory.rowSpan || 3}
                          onChange={(e) =>
                            onUpdateSector(activeTier.id, activeSector.id, {
                              vomitory: {
                                ...activeSector.vomitory,
                                rowSpan: Number(e.target.value),
                              },
                              useCustomOverrides: true,
                            })
                          }
                          className="flex-1 accent-emerald-400"
                        />
                        <input
                          type="number"
                          min={1}
                          max={Math.max(2, activeSector.rows - 1)}
                          value={activeSector.vomitory.rowSpan || 3}
                          onChange={(e) =>
                            onUpdateSector(activeTier.id, activeSector.id, {
                              vomitory: {
                                ...activeSector.vomitory,
                                rowSpan: Math.max(1, Number(e.target.value)),
                              },
                              useCustomOverrides: true,
                            })
                          }
                          className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-right text-slate-100"
                        />
                      </div>
                    </label>
                  </div>

                  {/* Portal Location Controls: Start Row & Presets */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">开口起始排号 (Start Row)</span>
                      <span className="font-mono text-cyan-400 font-semibold">
                        第 {activeSector.vomitory.startRow} 排
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={Math.max(1, activeSector.rows - (activeSector.vomitory.rowSpan || 3) + 1)}
                        step={1}
                        value={activeSector.vomitory.startRow}
                        onChange={(e) =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            vomitory: {
                              ...activeSector.vomitory,
                              startRow: Number(e.target.value),
                            },
                            useCustomOverrides: true,
                          })
                        }
                        className="flex-1 accent-cyan-400"
                      />
                      <input
                        type="number"
                        min={1}
                        max={activeSector.rows}
                        value={activeSector.vomitory.startRow}
                        onChange={(e) =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            vomitory: {
                              ...activeSector.vomitory,
                              startRow: Math.min(activeSector.rows, Math.max(1, Number(e.target.value))),
                            },
                            useCustomOverrides: true,
                          })
                        }
                        className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-right text-slate-100"
                      />
                    </div>

                    {/* Quick Row Presets */}
                    <div className="grid grid-cols-3 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            vomitory: {
                              ...activeSector.vomitory,
                              startRow: 1,
                            },
                            useCustomOverrides: true,
                          })
                        }
                        className="py-1 px-1 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                      >
                        前区 (第1排)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            vomitory: {
                              ...activeSector.vomitory,
                              startRow: Math.max(1, Math.round(activeSector.rows * 0.35)),
                            },
                            useCustomOverrides: true,
                          })
                        }
                        className="py-1 px-1 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                      >
                        中区环廊 ({Math.max(1, Math.round(activeSector.rows * 0.35))}排)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            vomitory: {
                              ...activeSector.vomitory,
                              startRow: Math.max(1, activeSector.rows - (activeSector.vomitory.rowSpan || 3)),
                            },
                            useCustomOverrides: true,
                          })
                        }
                        className="py-1 px-1 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                      >
                        高区 ({Math.max(1, activeSector.rows - (activeSector.vomitory.rowSpan || 3))}排)
                      </button>
                    </div>
                  </div>

                  {/* Portal Horizontal Position & Angular Offset */}
                  <div className="space-y-1.5">
                    <span className="text-slate-300 block">出入口角向/横向方位</span>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { id: 'center' as const, label: '居中单口' },
                        { id: 'left' as const, label: '靠左' },
                        { id: 'right' as const, label: '靠右' },
                        { id: 'dual' as const, label: '左右双口' },
                      ].map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() =>
                            onUpdateSector(activeTier.id, activeSector.id, {
                              vomitory: {
                                ...activeSector.vomitory,
                                position: pos.id,
                              },
                              useCustomOverrides: true,
                            })
                          }
                          className={`py-1.5 px-1 rounded text-[11px] font-medium border text-center transition-colors ${
                            activeSector.vomitory.position === pos.id
                              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>

                    <label className="space-y-1 block pt-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">横向微调偏移 (Offset)</span>
                        <span className="font-mono text-cyan-400">
                          {activeSector.vomitory.angularOffsetPct
                            ? (activeSector.vomitory.angularOffsetPct > 0
                                ? `+${activeSector.vomitory.angularOffsetPct}%`
                                : `${activeSector.vomitory.angularOffsetPct}%`)
                            : '0% (基准对齐)'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-40}
                        max={40}
                        step={5}
                        value={activeSector.vomitory.angularOffsetPct || 0}
                        onChange={(e) =>
                          onUpdateSector(activeTier.id, activeSector.id, {
                            vomitory: {
                              ...activeSector.vomitory,
                              angularOffsetPct: Number(e.target.value),
                            },
                            useCustomOverrides: true,
                          })
                        }
                        className="w-full accent-cyan-400"
                      />
                    </label>
                  </div>

                  {/* Remove Exit Action Button */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSector(activeTier.id, activeSector.id, {
                          vomitory: {
                            ...activeSector.vomitory,
                            position: 'none',
                            enabled: false,
                          },
                          useCustomOverrides: true,
                        })
                      }
                      className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>移除此看台块出入口</span>
                    </button>
                  </div>

                  {/* Apply to All Sectors in Tier Action Button */}
                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        if (onApplyVomitoryToAllInTier) {
                          onApplyVomitoryToAllInTier(activeTier.id, activeSector.vomitory);
                        } else {
                          onApplySectorToAllInTier(activeTier.id, activeSector);
                        }
                      }}
                      className="w-full py-2 px-3 rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <CopyCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>应用此出入口配置到当前楼层全部看台分块</span>
                    </button>
                    <div className="text-[10px] text-slate-400 text-center mt-1">
                      将本块出入口（{activeSector.vomitory.width}m通宽·第{activeSector.vomitory.startRow}排·跨{activeSector.vomitory.rowSpan || 3}排）全环同步至 {activeTier.name} 全部 {activeTier.sectors.length} 块看台
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Batch Sync Action (Full Sector Properties) */}
            <div className="pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => onApplySectorToAllInTier(activeTier.id, activeSector)}
                className="w-full py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <CopyCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>将当前分块全部参数 (排数/排距/密度/出口) 同步至 {activeTier.level}F 全部看台</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
