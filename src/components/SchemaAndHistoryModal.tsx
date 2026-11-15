import React, { useEffect, useRef, useState } from 'react';
import { SavedStadiumProject, StadiumSchema } from '../types/stadium';
import {
  calculateEngineeringSummary,
  generateStadiumDXF,
  generateStadiumSVG,
  validateStadiumSchema,
} from '../utils/stadiumEngine';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Database,
  Download,
  FileCode,
  FolderKanban,
  History,
  PlusCircle,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface SchemaAndHistoryModalProps {
  mode: 'schema' | 'history' | 'import' | null;
  onClose: () => void;
  schema: StadiumSchema;
  projects: SavedStadiumProject[];
  activeProjectId: string;
  onSaveRevision: (projectName: string, note: string, asNewProject: boolean) => void;
  onLoadSchema: (project: SavedStadiumProject, schemaToLoad: StadiumSchema) => void;
  onDeleteProject: (projectId: string) => void;
  onImportSchema: (importedSchema: StadiumSchema) => void;
  onRestoreBackup: (importedProjects: SavedStadiumProject[]) => void;
}

export const SchemaAndHistoryModal: React.FC<SchemaAndHistoryModalProps> = ({
  mode,
  onClose,
  schema,
  projects,
  activeProjectId,
  onSaveRevision,
  onLoadSchema,
  onDeleteProject,
  onImportSchema,
  onRestoreBackup,
}) => {
  const [activeTab, setActiveTab] = useState<'schema' | 'history' | 'import'>(
    mode || 'schema'
  );
  const [copied, setCopied] = useState(false);
  const [projectName, setProjectName] = useState(schema.name);
  const [revisionNote, setRevisionNote] = useState(
    '二次优化看台分块密度与剖面C值视线参数'
  );
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Import state
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [validatedSchema, setValidatedSchema] = useState<StadiumSchema | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode) {
      setActiveTab(mode);
      setProjectName(schema.name);
    }
  }, [mode, schema.name]);

  if (!mode) return null;

  const summary = calculateEngineeringSummary(schema);
  const fullExportPayload = {
    ...schema,
    engineeringSummary: summary,
  };
  const jsonString = JSON.stringify(fullExportPayload, null, 2);

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    navigator.clipboard?.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = (asNew: boolean) => {
    const cleanName = projectName.trim() || schema.name;
    const cleanNote =
      revisionNote.trim() || `保存于 ${new Date().toLocaleTimeString('zh-CN')}`;
    onSaveRevision(cleanName, cleanNote, asNew);
    setSaveSuccessMsg(
      asNew
        ? `已新建场馆档案「${cleanName}」并记入历史库`
        : `已保存「${cleanName}」最新修订版本`
    );
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Export full database backup file
  const handleExportDatabaseBackup = () => {
    const backup = {
      backupVersion: '2.0.0-STADIACAD-DATABASE',
      exportedAt: new Date().toISOString(),
      projectCount: projects.length,
      projects,
    };
    downloadFile(
      JSON.stringify(backup, null, 2),
      `stadiacad_database_backup_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
  };

  // Validate JSON string
  const handleParseAndValidate = (text: string) => {
    setImportJsonText(text);
    setImportError(null);
    setValidatedSchema(null);

    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);
      // Check if it's a database backup file
      if (parsed && Array.isArray(parsed.projects)) {
        setImportError(
          `检测到此文件为「工程数据库备份」包含 ${parsed.projects.length} 个场馆，请使用下方的「恢复全部工程库」功能导入。`
        );
        return;
      }

      const res = validateStadiumSchema(parsed);
      if (!res.valid || !res.schema) {
        setImportError(res.error || 'Schema 数据格式校验失败');
      } else {
        setValidatedSchema(res.schema);
      }
    } catch (err) {
      setImportError(`JSON 语法解析错误: ${(err as Error).message}`);
    }
  };

  // Handle file drop / file pick
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleParseAndValidate(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle database backup restore
  const handleBackupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.projects)
          ? parsed.projects
          : null;
        if (!list || list.length === 0) {
          alert('未能识别有效的工程数据库备份文件');
          return;
        }
        onRestoreBackup(list);
        setImportSuccessMsg(`成功恢复并载入 ${list.length} 个历史场馆工程数据库！`);
        setTimeout(() => setImportSuccessMsg(null), 3500);
      } catch (err) {
        alert(`解析数据库文件失败: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const executeImport = () => {
    if (!validatedSchema) return;
    onImportSchema(validatedSchema);
    setImportSuccessMsg(`成功导入「${validatedSchema.name}」并已载入工作区！`);
    setTimeout(() => {
      setImportSuccessMsg(null);
      onClose();
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="标准球场Schema与CAD施工图工程中心"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-5xl max-h-[88vh] bg-[#0F1420] border border-slate-700 rounded-lg flex flex-col overflow-hidden">
        {/* Modal Header & Navigation Tabs */}
        <div className="px-5 py-3 bg-[#0B0E17] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tracking-tight text-slate-100">
              StadiaCAD 工程中心
            </span>
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('schema')}
                className={`py-1 px-3 rounded flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'schema'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>1. Schema与CAD图纸导出</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`py-1 px-3 rounded flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>2. 档案保存与历史记录 ({projects.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`py-1 px-3 rounded flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'import'
                    ? 'bg-purple-500/20 text-purple-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>3. 导入Schema / 打开工程</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================
            TAB 1: STANDARD SCHEMA & CAD / DXF / SVG / 3D EXPORT
           ============================================================ */}
        {activeTab === 'schema' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            {/* Left 5 cols: Engineering Summary & Export Actions */}
            <div className="lg:col-span-5 p-5 border-r border-slate-800 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  工程导出与三维场景对接说明
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  当前场馆已按照 <code className="text-cyan-300">2.0.0-STADIACAD</code>{' '}
                  标准架构实时编译，包含内场几何参数、模块化斜坡/平面坐席、演艺舞台与球场朝向、看台分块（含实墙与车行门）、VIP包厢与视线剖面数据，可直接驱动 AutoCAD 图纸生成与 WebGL 三维渲染。
                </p>
              </div>

              {/* Engineering Key Metrics Table */}
              <div className="bg-[#0B0E17] border border-slate-800 rounded p-3.5 space-y-2 text-xs font-mono tabular-nums">
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">场馆总设计坐席:</span>
                  <strong className="text-emerald-400">
                    {summary.totalCapacity.toLocaleString()} 席
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">内场核心模式:</span>
                  <span className="text-cyan-300">
                    {schema.infield.coreMode === 'sports'
                      ? `球场模式 (${schema.infield.pitchOrientationDeg || 0}°)`
                      : schema.infield.coreMode === 'stage'
                      ? `舞台模式 (朝向 ${schema.infield.stageConfig?.orientationDeg || 90}°)`
                      : '综合双模 (球场+舞台)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">内场平层 / 斜坡坐席:</span>
                  <span className="text-slate-200">
                    {summary.infieldFlatCapacity} / {summary.infieldSlopedCapacity} 席
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">标准看台 / VIP包厢席:</span>
                  <span className="text-slate-200">
                    {summary.standardStandCapacity.toLocaleString()} /{' '}
                    {summary.vipBoxCapacity.toLocaleString()} 席 ({summary.totalVipRooms}间套房)
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">看台总楼层 / 分区:</span>
                  <span className="text-slate-200">
                    {schema.standTiers.length} 层 ·{' '}
                    {schema.standTiers.reduce((acc, t) => acc + t.sectors.length, 0)} 个辐射扇区
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">外轮廓几何外径:</span>
                  <span className="text-slate-200">
                    {summary.outermostFootprintLengthM} m × {summary.outermostFootprintWidthM} m
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">最高檐口标高 / 疏散口:</span>
                  <span className="text-slate-200">
                    +{summary.maxBowlElevationM} m / {summary.totalSafetyExits} 处出口
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">视线 C 值合格率:</span>
                  <span
                    className={
                      summary.cValueComplianceRate >= 85
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400 font-bold'
                    }
                  >
                    {summary.cValueComplianceRate}% (均值 {summary.avgCValueMm} mm)
                  </span>
                </div>
              </div>

              {/* Direct File Download Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      generateStadiumDXF(schema),
                      `${schema.code}_AutoCAD_R12.dxf`,
                      'application/dxf'
                    )
                  }
                  className="w-full py-2.5 px-4 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>导出标准 AutoCAD DXF 图纸 (.dxf)</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        generateStadiumSVG(schema),
                        `${schema.code}_Blueprint.svg`,
                        'image/svg+xml'
                      )
                    }
                    className="py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>导出矢量蓝图 (.svg)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(jsonString, `${schema.code}_Schema.json`, 'application/json')
                    }
                    className="py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>下载Schema (.json)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right 7 cols: Code Preview with Copy */}
            <div className="lg:col-span-7 bg-[#07090E] p-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 text-xs">
                <span className="font-mono text-slate-400">
                  {schema.name} · {schema.code} · Schema 2.0.0
                </span>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors font-mono"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">已复制到剪贴板</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制代码</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="flex-1 overflow-auto mt-2 p-3 font-mono text-[11px] leading-relaxed text-slate-300 bg-slate-950/90 rounded border border-slate-800/90 select-all">
                {jsonString}
              </pre>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 2: PROJECT ARCHIVE & REVISION TIMELINE
           ============================================================ */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            {/* Left 5 cols: Save Form */}
            <div className="lg:col-span-5 p-5 border-r border-slate-800 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  保存当前场馆方案版本
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  每次对看台坡度、分块划分或内场模块调整后，均可保存为新修订版（Revision）或独立新场馆工程，便于方案对比与回滚调取。
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <label className="space-y-1 block">
                  <span className="text-slate-300 font-medium">场馆工程名称</span>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="输入场馆名称..."
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-slate-300 font-medium">
                    本次修订说明 / 施工图备注
                  </span>
                  <textarea
                    rows={3}
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="记录本次看台坡度、包厢或内场模块的调整内容..."
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                  />
                </label>

                <div className="grid grid-cols-1 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSave(false)}
                    className="py-2.5 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>保存为当前场馆新修订版本</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    className="py-2 px-4 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4 text-cyan-400" />
                    <span>另存为独立新场馆项目</span>
                  </button>
                </div>

                {saveSuccessMsg && (
                  <div className="p-2.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                )}

                {/* Database Backup Export */}
                <div className="pt-4 border-t border-slate-800/80 space-y-2">
                  <span className="text-slate-400 font-medium block">
                    工程数据库备份导出
                  </span>
                  <button
                    type="button"
                    onClick={handleExportDatabaseBackup}
                    className="w-full py-2 px-3 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                    <span>备份导出全部场馆数据库 (.json)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right 7 cols: Saved Stadiums & Historical Revisions List */}
            <div className="lg:col-span-7 p-5 overflow-y-auto space-y-4 bg-[#07090E]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-cyan-400" />
                  <span>已保存场馆档案与历史版本库 ({projects.length} 个场馆)</span>
                </h3>
              </div>

              <div className="space-y-3">
                {projects.map((proj) => {
                  const isCurrent = proj.projectId === activeProjectId;
                  return (
                    <div
                      key={proj.projectId}
                      className={`p-3.5 rounded border transition-colors ${
                        isCurrent
                          ? 'bg-[#0F1420] border-cyan-500/60'
                          : 'bg-[#0F1420]/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-100">
                              {proj.name}
                            </span>
                            {isCurrent && (
                              <span className="text-[11px] font-mono text-cyan-400">
                                · 当前编辑中
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-slate-400 mt-0.5">
                            编号: {proj.code} · 共 {proj.revisions.length} 个历史版本 · 最近更新:{' '}
                            {new Date(proj.updatedAt).toLocaleString('zh-CN')}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onLoadSchema(proj, proj.currentSchema);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium whitespace-nowrap shrink-0"
                          >
                            调取最新方案
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadFile(
                                generateStadiumDXF(proj.currentSchema),
                                `${proj.code}_latest.dxf`,
                                'application/dxf'
                              )
                            }
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono whitespace-nowrap shrink-0"
                            title="直接导出该场馆最新CAD施工图"
                          >
                            导出DXF
                          </button>
                          {projects.length > 1 && (
                            <button
                              type="button"
                              aria-label={`删除项目 ${proj.name}`}
                              onClick={() => onDeleteProject(proj.projectId)}
                              className="p-1 text-slate-500 hover:text-rose-400 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Revision Timeline */}
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                        {proj.revisions.map((rev) => (
                          <div
                            key={rev.revisionId}
                            className="flex items-center justify-between text-xs bg-slate-900/70 px-2.5 py-1.5 rounded"
                          >
                            <div className="truncate pr-3">
                              <span className="font-mono text-slate-400 mr-2">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {new Date(rev.timestamp).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="text-slate-200">{rev.note}</span>
                              <span className="font-mono text-emerald-400 ml-2">
                                ({rev.totalCapacity.toLocaleString()}席 · {rev.tierCount}层)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onLoadSchema(proj, rev.schema);
                                onClose();
                              }}
                              className="shrink-0 px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 text-[11px] flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>回滚调取</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 3: IMPORT SCHEMA / RESTORE DATABASE BACKUP
           ============================================================ */}
        {activeTab === 'import' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            {/* Left 6 cols: Upload file & paste JSON */}
            <div className="lg:col-span-6 p-5 border-r border-slate-800 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span>导入本地 Schema 文件或恢复数据库</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  支持上传先前导出的球场工程 Schema（.json）文件，或直接粘贴 JSON 字符串。系统将自动进行标准化校验并无缝载入 2D CAD 与 3D 渲染器进行二次编辑。
                </p>
              </div>

              {/* Drag & Drop File Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      handleParseAndValidate(ev.target?.result as string);
                    };
                    reader.readAsText(file);
                  }
                }}
                className="p-5 border-2 border-dashed border-slate-700 hover:border-purple-400 bg-slate-950/60 hover:bg-purple-500/5 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors text-center"
              >
                <Upload className="w-7 h-7 text-purple-400 mb-2" />
                <div className="text-xs font-semibold text-slate-200">
                  点击选择或拖拽本地 Schema 文件 (.json)
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  支持 StadiaCAD 标准工程方案与跨版本兼容解析
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Direct Paste JSON Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">直接粘贴 JSON 文本</span>
                  {importJsonText && (
                    <button
                      type="button"
                      onClick={() => handleParseAndValidate('')}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      清空
                    </button>
                  )}
                </div>
                <textarea
                  rows={8}
                  value={importJsonText}
                  onChange={(e) => handleParseAndValidate(e.target.value)}
                  placeholder="在此直接粘贴先前导出的球场 StadiumSchema JSON 内容..."
                  className="w-full bg-slate-950 border border-slate-700 rounded p-3 font-mono text-xs text-slate-200 leading-relaxed placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Error Alert */}
              {importError && (
                <div className="p-3 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{importError}</div>
                </div>
              )}

              {/* Database Full Backup Restore */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>整库导入 / 恢复全部工程数据库</span>
                </div>
                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>选择数据库备份文件恢复全部场馆...</span>
                </button>
                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleBackupFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Right 6 cols: Preview Validated Schema & Import Action */}
            <div className="lg:col-span-6 bg-[#07090E] p-5 flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center justify-between">
                  <span>Schema 规范校验与导入预览</span>
                  {validatedSchema && (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>格式校验通过</span>
                    </span>
                  )}
                </h3>

                {validatedSchema ? (
                  <div className="space-y-3">
                    <div className="bg-[#0F1420] border border-emerald-500/40 rounded p-4 space-y-2 text-xs">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-base font-semibold text-slate-100">
                            {validatedSchema.name}
                          </div>
                          <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                            编号: {validatedSchema.code} · 版本: {validatedSchema.schemaVersion}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[11px]">
                          待导入方案
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 font-mono text-slate-300">
                        <div>
                          内场几何:{' '}
                          <span className="text-cyan-300">
                            {validatedSchema.infield.shape} ({validatedSchema.infield.length}m×{validatedSchema.infield.width}m)
                          </span>
                        </div>
                        <div>
                          核心模式:{' '}
                          <span className="text-pink-300">
                            {validatedSchema.infield.coreMode || 'sports'}
                          </span>
                        </div>
                        <div>
                          看台楼层:{' '}
                          <span className="text-cyan-300">
                            {validatedSchema.standTiers.length} 层环状看台
                          </span>
                        </div>
                        <div>
                          预测总容量:{' '}
                          <span className="text-emerald-400 font-bold">
                            {calculateEngineeringSummary(validatedSchema).totalCapacity.toLocaleString()} 席
                          </span>
                        </div>
                      </div>

                      <div className="text-slate-400 text-[11px] leading-relaxed pt-1">
                        {validatedSchema.description}
                      </div>
                    </div>

                    <div className="p-3 rounded bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
                      💡 提示: 导入后系统将自动为此场馆建立新工程档案并持久化至浏览器数据库，原有的其他场馆方案均保留在历史库中。
                    </div>
                  </div>
                ) : (
                  <div className="h-64 border border-dashed border-slate-800 rounded flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
                    <Code2 className="w-8 h-8 text-slate-600 mb-2" />
                    <div>请在左侧上传文件或粘贴 JSON 数据</div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      解析成功后将在此展示场馆几何尺寸、看台楼层及坐席容量预览
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Area */}
              <div className="space-y-2 pt-4 border-t border-slate-800">
                {importSuccessMsg && (
                  <div className="p-2.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{importSuccessMsg}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!validatedSchema}
                  onClick={executeImport}
                  className={`w-full py-3 px-4 rounded font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                    validatedSchema
                      ? 'bg-purple-500 hover:bg-purple-400 text-white shadow-lg cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>立即导入此场馆并载入工作区 (加入工程数据库)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
