import React, { useEffect, useState } from 'react';
import {
  InfieldConfig,
  InfieldSeatModule,
  SavedStadiumProject,
  StadiumSchema,
  StandSector,
  StandTier,
  VomitoryExitConfig,
} from './types/stadium';
import {
  calculateEngineeringSummary,
  deduplicateSavedProjects,
  DEG_TO_RAD,
  makeUniqueId,
  syncTierSectors,
} from './utils/stadiumEngine';
import { createInitialSavedProjects } from './data/presets';
import { CadCanvas2D, SelectedEntity } from './components/CadCanvas2D';
import { CrossSectionView } from './components/CrossSectionView';
import { StadiumPreview3D } from './components/StadiumPreview3D';
import { PropertyInspector } from './components/PropertyInspector';
import { SchemaAndHistoryModal } from './components/SchemaAndHistoryModal';
import {
  GripVertical,
  History,
  Plus,
  Save,
  Upload,
} from 'lucide-react';

const STORAGE_KEY = 'stadiacad_saved_projects_beijing_v4';

export type WorkspaceViewMode = '2d' | 'section' | 'split-2d-section' | '3d';

export default function App() {
  const [projects, setProjects] = useState<SavedStadiumProject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.some(
            (p: SavedStadiumProject) =>
              p.projectId === 'std-new-gongti' ||
              p.projectId === 'std-beijing-bird-nest' ||
              p.projectId === 'std-wukesong-arena'
          )
        ) {
          return deduplicateSavedProjects(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
    return deduplicateSavedProjects(createInitialSavedProjects());
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => projects[0]?.projectId || 'std-new-gongti'
  );

  const [schema, setSchema] = useState<StadiumSchema>(() => {
    const found = projects.find((p) => p.projectId === activeProjectId);
    return found ? found.currentSchema : createInitialSavedProjects()[0].currentSchema;
  });

  const [selected, setSelected] = useState<SelectedEntity>({
    type: 'sector',
    tierId: schema.standTiers[0]?.id,
    sectorId: schema.standTiers[0]?.sectors[0]?.id,
  });

  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('2d');
  const [modalMode, setModalMode] = useState<'schema' | 'history' | 'import' | null>(null);
  const [quickSaveToast, setQuickSaveToast] = useState<string | null>(null);

  // Persist projects to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // ignore quota errors
    }
  }, [projects]);

  const summary = calculateEngineeringSummary(schema);

  // Handlers for updating Infield
  const handleUpdateInfield = (patch: Partial<InfieldConfig>) => {
    setSchema((prev) => {
      const nextInfield = { ...prev.infield, ...patch };
      const shapeOrSizeChanged =
        patch.shape !== undefined ||
        patch.length !== undefined ||
        patch.width !== undefined ||
        patch.cornerRadius !== undefined;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        infield: nextInfield,
        standTiers: shapeOrSizeChanged
          ? prev.standTiers.map((t) => ({
              ...t,
              sectors: syncTierSectors(t, nextInfield, prev.standTiers),
            }))
          : prev.standTiers,
      };
    });
  };

  // Handlers for Infield Modular Seating (Flat & Sloped)
  const handleAddInfieldModule = (
    type: 'flat' | 'sloped',
    customX?: number,
    customY?: number
  ) => {
    const newId = `inf-mod-${Date.now().toString().slice(-4)}`;
    const idx = schema.infieldModules.length + 1;
    const newMod: InfieldSeatModule = {
      id: newId,
      name:
        type === 'sloped'
          ? `内场模块化斜坡座椅 #${idx}`
          : `内场模块化平面坐席 #${idx}`,
      type,
      x: customX ?? (idx % 2 === 0 ? 18 : -18),
      y: customY ?? (idx % 3 === 0 ? 22 : -22),
      width: type === 'sloped' ? 32 : 20,
      depth: type === 'sloped' ? 9 : 14,
      rotationDeg: 0,
      rows: type === 'sloped' ? 10 : 12,
      seatSpacing: 0.52,
      rowPitch: 0.85,
      baseElevation: type === 'sloped' ? 0.2 : 0,
      slopeDeg: type === 'sloped' ? 15 : 0,
      aisleWidth: 1.8,
      color: type === 'sloped' ? '#F59E0B' : '#10B981',
    };

    setSchema((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      infieldModules: [...prev.infieldModules, newMod],
    }));
    setSelected({ type: 'infield-module', moduleId: newId });
  };

  const handleUpdateInfieldModule = (
    id: string,
    patch: Partial<InfieldSeatModule>
  ) => {
    setSchema((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      infieldModules: prev.infieldModules.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    }));
  };

  const handleDeleteInfieldModule = (id: string) => {
    setSchema((prev) => {
      const nextMods = prev.infieldModules.filter((m) => m.id !== id);
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        infieldModules: nextMods,
      };
    });
    setSelected({ type: 'infield' });
  };

  // Handlers for Concentric Stand Tiers
  const handleAddTier = () => {
    const nextLevel = schema.standTiers.length + 1;
    const prevTier = schema.standTiers[schema.standTiers.length - 1];
    const prevTopElevation = prevTier
      ? prevTier.baseElevation +
        prevTier.defaultRows *
          prevTier.defaultRowPitch *
          Math.tan(prevTier.defaultSlopeDeg * DEG_TO_RAD) +
        3.5
      : 1.0;

    const newTierBase: StandTier = {
      id: `tier-${Date.now().toString().slice(-4)}`,
      level: nextLevel,
      name: `${nextLevel}层外围环状看台 (${nextLevel}F Bowl Tier)`,
      innerOffset: nextLevel === 1 ? 0 : 2.5,
      radialDepth: 20,
      baseElevation: Number(prevTopElevation.toFixed(1)),
      sectorCount: prevTier ? prevTier.sectorCount : 16,
      defaultFillType: 'standard',
      defaultRows: 22,
      defaultRowPitch: 0.85,
      defaultSlopeDeg: Math.min(35, (prevTier?.defaultSlopeDeg || 20) + 4),
      defaultSeatSpacing: 0.5,
      defaultExitCount: prevTier ? prevTier.sectorCount : 16,
      radialAisleWidth: 1.8,
      defaultGuardrail: {
        frontRailEnabled: true,
        frontRailHeight: 1.15,
        rearWallEnabled: true,
        rearWallHeight: 1.5,
        aisleHandrailEnabled: true,
        material: 'steel-balustrade',
      },
      morphMode: prevTier?.morphMode || 'infield-shape',
      concentricMorph: Math.min(0.95, (prevTier?.concentricMorph || 0.75) + 0.1),
      sectors: [],
    };
    const newTier: StandTier = {
      ...newTierBase,
      sectors: syncTierSectors(newTierBase, schema.infield, [
        ...schema.standTiers,
        newTierBase,
      ]),
    };

    setSchema((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      standTiers: [...prev.standTiers, newTier],
    }));
    setSelected({ type: 'tier', tierId: newTier.id });
  };

  const handleUpdateTier = (tierId: string, patch: Partial<StandTier>) => {
    setSchema((prev) => {
      const updatedTiers = prev.standTiers.map((t) => {
        if (t.id !== tierId) return t;
        const merged: StandTier = {
          ...t,
          ...patch,
          innerOffset: t.level === 1 ? 0 : patch.innerOffset ?? t.innerOffset,
        };

        // When tier-level slope changes, propagate to all sectors in this tier
        if (patch.defaultSlopeDeg !== undefined) {
          const newSlope = patch.defaultSlopeDeg;
          merged.sectors = merged.sectors.map((s) => ({
            ...s,
            slopeDeg: newSlope,
            riserHeight: Number(
              (s.rowPitch * Math.tan(newSlope * DEG_TO_RAD)).toFixed(3)
            ),
          }));
        }

        // When tier-level row pitch changes, propagate to all sectors in this tier
        if (patch.defaultRowPitch !== undefined) {
          const newPitch = patch.defaultRowPitch;
          merged.sectors = merged.sectors.map((s) => ({
            ...s,
            rowPitch: newPitch,
            riserHeight: Number(
              (newPitch * Math.tan(s.slopeDeg * DEG_TO_RAD)).toFixed(3)
            ),
          }));
        }

        // When tier-level row count changes, propagate to all sectors in this tier
        if (patch.defaultRows !== undefined) {
          merged.sectors = merged.sectors.map((s) => ({
            ...s,
            rows: patch.defaultRows!,
          }));
        }

        // When tier-level seat spacing changes, propagate to all sectors in this tier
        if (patch.defaultSeatSpacing !== undefined) {
          merged.sectors = merged.sectors.map((s) => ({
            ...s,
            seatSpacing: patch.defaultSeatSpacing!,
          }));
        }

        // If defaultFillType changed specifically, apply to non-overridden sectors
        if (patch.defaultFillType) {
          merged.sectors = merged.sectors.map((s) =>
            s.useCustomOverrides ? s : { ...s, fillType: patch.defaultFillType! }
          );
        }

        return merged;
      });

      const targetLevel =
        prev.standTiers.find((t) => t.id === tierId)?.level ?? 1;
      const radialGeometryChanged =
        patch.radialDepth !== undefined ||
        patch.innerOffset !== undefined ||
        patch.morphMode !== undefined ||
        patch.concentricMorph !== undefined;

      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        standTiers: updatedTiers.map((t) =>
          t.id === tierId || (radialGeometryChanged && t.level >= targetLevel)
            ? {
                ...t,
                sectors: syncTierSectors(t, prev.infield, updatedTiers),
              }
            : t
        ),
      };
    });
  };

  const handleDeleteTier = (tierId: string) => {
    setSchema((prev) => {
      if (prev.standTiers.length <= 1) return prev;
      const filtered = prev.standTiers
        .filter((t) => t.id !== tierId)
        .map((t, i) => ({
          ...t,
          level: i + 1,
          innerOffset: i === 0 ? 0 : t.innerOffset,
        }));
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        standTiers: filtered,
      };
    });
    setSelected({ type: 'infield' });
  };

  // Handlers for Individual Radial Sectors
  const handleUpdateSector = (
    tierId: string,
    sectorId: string,
    patch: Partial<StandSector>
  ) => {
    setSchema((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      standTiers: prev.standTiers.map((t) => {
        if (t.id !== tierId) return t;
        return {
          ...t,
          sectors: t.sectors.map((s) => {
            if (s.id !== sectorId) return s;
            const updated = { ...s, ...patch };
            updated.riserHeight = Number(
              (updated.rowPitch * Math.tan(updated.slopeDeg * DEG_TO_RAD)).toFixed(3)
            );
            return updated;
          }),
        };
      }),
    }));
  };

  const handleApplySectorToAllInTier = (
    tierId: string,
    sourceSector: StandSector
  ) => {
    setSchema((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      standTiers: prev.standTiers.map((t) => {
        if (t.id !== tierId) return t;
        return {
          ...t,
          defaultRows: sourceSector.rows,
          defaultRowPitch: sourceSector.rowPitch,
          defaultSlopeDeg: sourceSector.slopeDeg,
          defaultSeatSpacing: sourceSector.seatSpacing,
          sectors: t.sectors.map((s) => ({
            ...s,
            fillType: sourceSector.fillType,
            rows: sourceSector.rows,
            rowPitch: sourceSector.rowPitch,
            slopeDeg: sourceSector.slopeDeg,
            riserHeight: sourceSector.riserHeight,
            seatSpacing: sourceSector.seatSpacing,
            vipBoxRooms: sourceSector.vipBoxRooms,
            vomitory: {
              ...sourceSector.vomitory,
              id: `${s.id}-vom`,
            },
            useCustomOverrides: true,
          })),
        };
      }),
    }));
  };

  const handleApplyVomitoryToAllInTier = (
    tierId: string,
    vomitoryConfig: VomitoryExitConfig
  ) => {
    const targetTier = schema.standTiers.find((t) => t.id === tierId);
    setSchema((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      standTiers: prev.standTiers.map((t) => {
        if (t.id !== tierId) return t;
        return {
          ...t,
          sectors: t.sectors.map((s) => ({
            ...s,
            vomitory: {
              ...vomitoryConfig,
              id: `${s.id}-vom`,
            },
            useCustomOverrides: true,
          })),
        };
      }),
    }));
    const count = targetTier?.sectors.length || 0;
    setQuickSaveToast(`已将出入口配置同步至 ${targetTier?.name || '当前楼层'} 全部 ${count} 块看台`);
    setTimeout(() => setQuickSaveToast(null), 3000);
  };

  // Drag-and-Drop onto 2D CAD Canvas
  const handleDropNewItem = (
    itemType: 'flat-seat' | 'sloped-seat' | 'new-tier' | 'vip-sector-convert',
    worldX: number,
    worldY: number
  ) => {
    if (itemType === 'flat-seat') {
      handleAddInfieldModule('flat', worldX, worldY);
    } else if (itemType === 'sloped-seat') {
      handleAddInfieldModule('sloped', worldX, worldY);
    } else if (itemType === 'new-tier') {
      handleAddTier();
    } else if (itemType === 'vip-sector-convert') {
      const targetTier =
        schema.standTiers.find((t) => t.id === selected.tierId) ||
        schema.standTiers[0];
      const targetSec =
        targetTier?.sectors.find((s) => s.id === selected.sectorId) ||
        targetTier?.sectors[0];
      if (targetTier && targetSec) {
        handleUpdateSector(targetTier.id, targetSec.id, {
          fillType: targetSec.fillType === 'vip-box' ? 'standard' : 'vip-box',
          vipBoxRooms: 4,
          useCustomOverrides: true,
        });
      }
    }
  };

  // Save Project / Revision History
  const handleSaveRevision = (
    projectName: string,
    note: string,
    asNewProject: boolean
  ) => {
    const now = new Date().toISOString();
    const updatedSchema: StadiumSchema = {
      ...schema,
      name: projectName,
      updatedAt: now,
    };
    const curSummary = calculateEngineeringSummary(updatedSchema);
    const newRev = {
      revisionId: `rev-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      note,
      totalCapacity: curSummary.totalCapacity,
      tierCount: updatedSchema.standTiers.length,
      infieldShape: updatedSchema.infield.shape,
      schema: JSON.parse(JSON.stringify(updatedSchema)),
    };

    if (asNewProject) {
      const newProjId = makeUniqueId(
        `proj-${Date.now().toString(36)}`,
        projects.map((p) => p.projectId)
      );
      const newCode = `STD-CAD-${projects.length + 1}`;
      const newProj: SavedStadiumProject = {
        projectId: newProjId,
        name: projectName,
        code: newCode,
        createdAt: now,
        updatedAt: now,
        currentSchema: { ...updatedSchema, id: newProjId, code: newCode },
        revisions: [newRev],
      };
      setProjects((prev) => deduplicateSavedProjects([newProj, ...prev]));
      setActiveProjectId(newProjId);
      setSchema(newProj.currentSchema);
    } else {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.projectId !== activeProjectId) return p;
          const uniqueRevId = makeUniqueId(
            newRev.revisionId,
            p.revisions.map((r) => r.revisionId)
          );
          return {
            ...p,
            name: projectName,
            updatedAt: now,
            currentSchema: updatedSchema,
            revisions: [{ ...newRev, revisionId: uniqueRevId }, ...p.revisions],
          };
        })
      );
      setSchema(updatedSchema);
    }
  };

  const handleQuickSave = () => {
    handleSaveRevision(
      schema.name,
      `快速保存快照 (${schema.standTiers.length}层看台 · ${summary.totalCapacity.toLocaleString()}席)`,
      false
    );
    setQuickSaveToast(`已保存当前方案至历史记录 (${new Date().toLocaleTimeString('zh-CN')})`);
    setTimeout(() => setQuickSaveToast(null), 2600);
  };

  const handleImportSchema = (importedSchema: StadiumSchema) => {
    const sum = calculateEngineeringSummary(importedSchema);
    const baseProjId = importedSchema.id || `proj-${Date.now().toString(36)}`;
    const newProjId = makeUniqueId(
      baseProjId,
      projects.map((p) => p.projectId)
    );
    const normalizedImportedSchema: StadiumSchema = {
      ...importedSchema,
      id: newProjId,
    };
    const newProj: SavedStadiumProject = {
      projectId: newProjId,
      name: normalizedImportedSchema.name,
      code: normalizedImportedSchema.code,
      createdAt: normalizedImportedSchema.updatedAt,
      updatedAt: normalizedImportedSchema.updatedAt,
      currentSchema: normalizedImportedSchema,
      revisions: [
        {
          revisionId: `rev-imp-${Date.now().toString(36)}`,
          timestamp: normalizedImportedSchema.updatedAt,
          note: `用户导入外部工程 Schema 方案 (${normalizedImportedSchema.standTiers.length}层看台 · ${sum.totalCapacity.toLocaleString()}席)`,
          totalCapacity: sum.totalCapacity,
          tierCount: normalizedImportedSchema.standTiers.length,
          infieldShape: normalizedImportedSchema.infield.shape,
          schema: JSON.parse(JSON.stringify(normalizedImportedSchema)),
        },
      ],
    };

    setProjects((prev) => deduplicateSavedProjects([newProj, ...prev]));
    setActiveProjectId(newProjId);
    setSchema(normalizedImportedSchema);
    setSelected({
      type: 'infield',
    });
    setQuickSaveToast(`已成功导入并载入方案「${normalizedImportedSchema.name}」`);
    setTimeout(() => setQuickSaveToast(null), 3000);
  };

  const handleRestoreBackup = (importedProjects: SavedStadiumProject[]) => {
    if (!Array.isArray(importedProjects) || importedProjects.length === 0) return;
    const cleaned = deduplicateSavedProjects(importedProjects);
    if (cleaned.length === 0) return;
    setProjects(cleaned);
    const first = cleaned[0];
    setActiveProjectId(first.projectId);
    setSchema(first.currentSchema);
    setSelected({ type: 'infield' });
    setQuickSaveToast(`已成功恢复全部工程数据库 (${cleaned.length}个场馆)`);
    setTimeout(() => setQuickSaveToast(null), 3500);
  };

  return (
    <div className="h-screen w-screen bg-[#07090E] text-slate-100 flex flex-col overflow-hidden">
      {/* =================================================================
          TOP BAR CONTRACT: 3 ZONES (Brand — 4 Nav Links — 1 Primary Action)
         ================================================================= */}
      <header className="h-13 px-5 bg-[#0B0E17] border-b border-slate-800 flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single Text Element Wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setViewMode('2d');
          }}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          StadiaCAD
        </a>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav className="flex items-center gap-6 text-xs font-medium text-slate-300">
          <a
            href="#2d-cad"
            onClick={(e) => {
              e.preventDefault();
              setViewMode('2d');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              viewMode === '2d'
                ? 'text-cyan-400 underline underline-offset-4 decoration-cyan-400'
                : ''
            }`}
          >
            2D平面布局
          </a>
          <a
            href="#cross-section"
            onClick={(e) => {
              e.preventDefault();
              setViewMode('section');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              viewMode === 'section'
                ? 'text-cyan-400 underline underline-offset-4 decoration-cyan-400'
                : ''
            }`}
          >
            横截面视线分析
          </a>
          <a
            href="#split-view"
            onClick={(e) => {
              e.preventDefault();
              setViewMode('split-2d-section');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              viewMode === 'split-2d-section'
                ? 'text-cyan-400 underline underline-offset-4 decoration-cyan-400'
                : ''
            }`}
          >
            平面与剖面双视窗
          </a>
          <a
            href="#3d-preview"
            onClick={(e) => {
              e.preventDefault();
              setViewMode('3d');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
              viewMode === '3d'
                ? 'text-cyan-400 underline underline-offset-4 decoration-cyan-400'
                : ''
            }`}
          >
            3D场景渲染
          </a>
          <a
            href="#history"
            onClick={(e) => {
              e.preventDefault();
              setModalMode('history');
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 py-1"
          >
            历史方案库
          </a>
          <a
            href="#import"
            onClick={(e) => {
              e.preventDefault();
              setModalMode('import');
            }}
            className="hover:text-purple-300 text-purple-400 font-semibold transition-colors whitespace-nowrap shrink-0 py-1 flex items-center gap-1"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入Schema</span>
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setModalMode('schema')}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            导出Schema与CAD图纸
          </button>
        </div>
      </header>

      {/* =================================================================
          MAIN 3-COLUMN ENGINEERING WORKSPACE
         ================================================================= */}
      <main className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN (265px): Modular Drag Palette + Concentric Layer Tree + History Quick Switch */}
        <aside className="w-[265px] shrink-0 bg-[#0F1420] border-r border-slate-800 flex flex-col overflow-hidden select-none">
          {/* Active Project & Preset Switcher */}
          <div className="p-3 border-b border-slate-800 space-y-2 bg-[#0B0E17]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">当前场馆工程档案</span>
              <button
                type="button"
                onClick={() => setModalMode('history')}
                className="text-cyan-400 hover:underline flex items-center gap-1"
              >
                <History className="w-3 h-3" />
                <span>版本库 ({projects.length})</span>
              </button>
            </div>

            <select
              aria-label="切换场馆工程预设或历史方案"
              value={activeProjectId}
              onChange={(e) => {
                const proj = projects.find((p) => p.projectId === e.target.value);
                if (proj) {
                  setActiveProjectId(proj.projectId);
                  setSchema(proj.currentSchema);
                  setSelected({
                    type: 'sector',
                    tierId: proj.currentSchema.standTiers[0]?.id,
                    sectorId: proj.currentSchema.standTiers[0]?.sectors[0]?.id,
                  });
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-medium truncate"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={handleQuickSave}
                className="py-1.5 px-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                title="保存方案最新修订"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存</span>
              </button>
              <button
                type="button"
                onClick={() => setModalMode('import')}
                className="py-1.5 px-1.5 rounded bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                title="导入外部Schema或恢复工程库"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>导入</span>
              </button>
              <button
                type="button"
                onClick={() => setModalMode('schema')}
                className="py-1.5 px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors whitespace-nowrap"
                title="查看完整JSON Schema与导出DXF"
              >
                Schema
              </button>
            </div>

            {quickSaveToast && (
              <div className="text-[11px] text-emerald-400 font-mono truncate">
                ✓ {quickSaveToast}
              </div>
            )}
          </div>

          {/* Modular Drag & Drop Component Palette */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                模块化组件库 (可拖拽至画布)
              </span>
              <span className="text-[11px] font-mono text-slate-500">Drag / Click</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <div
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/stadiacad-tool', 'flat-seat')
                }
                onClick={() => handleAddInfieldModule('flat')}
                role="button"
                tabIndex={0}
                className="p-2 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 flex items-center justify-between cursor-grab active:cursor-grabbing transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <div>
                    <div className="font-medium text-emerald-300">
                      + 内场平面坐席模块
                    </div>
                    <div className="text-[11px] text-slate-400">
                      支持网格自动对齐与旋转
                    </div>
                  </div>
                </div>
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
              </div>

              <div
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/stadiacad-tool', 'sloped-seat')
                }
                onClick={() => handleAddInfieldModule('sloped')}
                role="button"
                tabIndex={0}
                className="p-2 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 flex items-center justify-between cursor-grab active:cursor-grabbing transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <div>
                    <div className="font-medium text-amber-300">
                      + 内场模块化斜坡座椅
                    </div>
                    <div className="text-[11px] text-slate-400">
                      带倾角可拆卸阶梯活动看台
                    </div>
                  </div>
                </div>
                <Plus className="w-3.5 h-3.5 text-amber-400" />
              </div>

              <div
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/stadiacad-tool', 'new-tier')
                }
                onClick={handleAddTier}
                role="button"
                tabIndex={0}
                className="p-2 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 flex items-center justify-between cursor-grab active:cursor-grabbing transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <div>
                    <div className="font-medium text-cyan-300">
                      + 外扩同心看台楼层
                    </div>
                    <div className="text-[11px] text-slate-400">
                      按中心圆点辐射切分看台块
                    </div>
                  </div>
                </div>
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
              </div>
            </div>
          </div>

          {/* Inside-Out Concentric Layer Hierarchy Tree */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                由内向外分层结构树 (Layers)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                1+{schema.standTiers.length}层
              </span>
            </div>

            {/* Layer 0: Core Infield */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelected({ type: 'infield' })}
                className={`w-full text-left p-2 rounded border transition-colors flex items-center justify-between ${
                  selected.type === 'infield'
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200 font-semibold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <span>0F 核心内场 ({schema.infield.shape})</span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {schema.infield.length}×{schema.infield.width}m
                </span>
              </button>

              {/* Infield Modular Seats Sub-list */}
              <div className="pl-3 space-y-1 border-l border-slate-800 ml-2">
                {schema.infieldModules.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() =>
                      setSelected({ type: 'infield-module', moduleId: mod.id })
                    }
                    className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between transition-colors ${
                      selected.type === 'infield-module' &&
                      selected.moduleId === mod.id
                        ? 'bg-slate-800 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{mod.name}</span>
                    <span className="font-mono shrink-0">
                      {mod.type === 'sloped' ? `${mod.slopeDeg}°斜` : '平层'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Layers 1..N: Concentric Stand Tiers */}
            {schema.standTiers
              .slice()
              .sort((a, b) => a.level - b.level)
              .map((tier) => {
                const isTierSel =
                  selected.type === 'tier' && selected.tierId === tier.id;
                const vipCount = tier.sectors.filter(
                  (s) => s.fillType === 'vip-box'
                ).length;

                return (
                  <div key={tier.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSelected({ type: 'tier', tierId: tier.id })
                      }
                      className={`w-full text-left p-2 rounded border transition-colors ${
                        isTierSel
                          ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200 font-semibold'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{tier.name}</span>
                        <span className="font-mono text-[11px] text-cyan-400 shrink-0">
                          {tier.sectorCount}块
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {tier.level === 1 ? '内圈与内场重合 · ' : ''}
                        坡度{tier.defaultSlopeDeg}° · {tier.defaultRows}排
                        {vipCount > 0 ? ` · 含${vipCount}块包厢` : ''}
                      </div>
                    </button>
                  </div>
                );
              })}
          </div>
        </aside>

        {/* CENTER COLUMN: Interactive Viewport Stage (2D CAD / Cross-Section / Split / 3D) */}
        <section className="flex-1 flex flex-col overflow-hidden bg-[#07090E]">
          {/* Workspace Sub-Toolbar: Unboxed Engineering Metadata + View Mode Segmented Switch */}
          <div className="px-4 py-2 bg-[#0F1420] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {/* Clean Unboxed Metadata with · Separators (Zero-Pill Discipline) */}
            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono tabular-nums flex-wrap">
              <span>
                总席位 <strong className="text-emerald-400">{summary.totalCapacity.toLocaleString()}</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                内场平层/斜坡 <strong className="text-slate-100">{summary.infieldFlatCapacity + summary.infieldSlopedCapacity}</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                普通看台 <strong className="text-cyan-400">{summary.standardStandCapacity.toLocaleString()}</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                VIP包厢 <strong className="text-amber-400">{summary.vipBoxCapacity.toLocaleString()}席 ({summary.totalVipRooms}间)</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                安全出口 <strong className="text-slate-100">{summary.totalSafetyExits}处</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                视线最低C值 <strong className={summary.minCValueMm >= 90 ? 'text-emerald-400' : 'text-amber-400'}>{summary.minCValueMm}mm ({summary.cValueComplianceRate}%合规)</strong>
              </span>
            </div>

            {/* Interactive View Mode Segmented Controls */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded">
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === '2d'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2D CAD总图
              </button>
              <button
                type="button"
                onClick={() => setViewMode('section')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'section'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                横截面视线C值
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split-2d-section')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'split-2d-section'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2D+剖面联动
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === '3d'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3D场景渲染
              </button>
            </div>
          </div>

          {/* Viewport Stage */}
          <div className="flex-1 overflow-hidden relative">
            {viewMode === '2d' && (
              <CadCanvas2D
                schema={schema}
                selected={selected}
                onSelect={setSelected}
                onUpdateInfieldModule={handleUpdateInfieldModule}
                onDropNewItem={handleDropNewItem}
                onChangeSectionAngle={(ang) =>
                  setSchema((prev) => ({
                    ...prev,
                    sightlineConfig: {
                      ...prev.sightlineConfig,
                      sectionAngleDeg: ang,
                    },
                  }))
                }
                onToggleGridOption={(key) =>
                  setSchema((prev) => ({
                    ...prev,
                    gridSystem: {
                      ...prev.gridSystem,
                      [key]: !prev.gridSystem[key],
                    },
                  }))
                }
              />
            )}

            {viewMode === 'section' && (
              <CrossSectionView
                schema={schema}
                onUpdateSightlineConfig={(patch) =>
                  setSchema((prev) => ({
                    ...prev,
                    sightlineConfig: { ...prev.sightlineConfig, ...patch },
                  }))
                }
                onUpdateTierSlopeOrPitch={(tierId, patch) =>
                  handleUpdateTier(tierId, patch)
                }
              />
            )}

            {viewMode === 'split-2d-section' && (
              <div className="w-full h-full grid grid-rows-2 divide-y divide-slate-800">
                <div className="overflow-hidden">
                  <CadCanvas2D
                    schema={schema}
                    selected={selected}
                    onSelect={setSelected}
                    onUpdateInfieldModule={handleUpdateInfieldModule}
                    onDropNewItem={handleDropNewItem}
                    onChangeSectionAngle={(ang) =>
                      setSchema((prev) => ({
                        ...prev,
                        sightlineConfig: {
                          ...prev.sightlineConfig,
                          sectionAngleDeg: ang,
                        },
                      }))
                    }
                    onToggleGridOption={(key) =>
                      setSchema((prev) => ({
                        ...prev,
                        gridSystem: {
                          ...prev.gridSystem,
                          [key]: !prev.gridSystem[key],
                        },
                      }))
                    }
                  />
                </div>
                <div className="overflow-hidden">
                  <CrossSectionView
                    schema={schema}
                    onUpdateSightlineConfig={(patch) =>
                      setSchema((prev) => ({
                        ...prev,
                        sightlineConfig: { ...prev.sightlineConfig, ...patch },
                      }))
                    }
                    onUpdateTierSlopeOrPitch={(tierId, patch) =>
                      handleUpdateTier(tierId, patch)
                    }
                  />
                </div>
              </div>
            )}

            {viewMode === '3d' && <StadiumPreview3D schema={schema} />}
          </div>
        </section>

        {/* RIGHT COLUMN (370px): Contextual Property Inspector */}
        <PropertyInspector
          schema={schema}
          selected={selected}
          onSelect={setSelected}
          onUpdateInfield={handleUpdateInfield}
          onAddInfieldModule={handleAddInfieldModule}
          onUpdateInfieldModule={handleUpdateInfieldModule}
          onDeleteInfieldModule={handleDeleteInfieldModule}
          onAddTier={handleAddTier}
          onUpdateTier={handleUpdateTier}
          onDeleteTier={handleDeleteTier}
          onUpdateSector={handleUpdateSector}
          onApplySectorToAllInTier={handleApplySectorToAllInTier}
          onApplyVomitoryToAllInTier={handleApplyVomitoryToAllInTier}
        />
      </main>

      {/* Schema & CAD Export / Historical Revisions Modal */}
      <SchemaAndHistoryModal
        mode={modalMode}
        onClose={() => setModalMode(null)}
        schema={schema}
        projects={projects}
        activeProjectId={activeProjectId}
        onSaveRevision={handleSaveRevision}
        onLoadSchema={(proj, loadedSchema) => {
          setActiveProjectId(proj.projectId);
          setSchema(JSON.parse(JSON.stringify(loadedSchema)));
          setSelected({
            type: 'sector',
            tierId: loadedSchema.standTiers[0]?.id,
            sectorId: loadedSchema.standTiers[0]?.sectors[0]?.id,
          });
        }}
        onDeleteProject={(projId) => {
          setProjects((prev) => {
            const next = prev.filter((p) => p.projectId !== projId);
            if (projId === activeProjectId && next.length > 0) {
              setActiveProjectId(next[0].projectId);
              setSchema(next[0].currentSchema);
            }
            return next;
          });
        }}
        onImportSchema={handleImportSchema}
        onRestoreBackup={handleRestoreBackup}
      />
    </div>
  );
}
