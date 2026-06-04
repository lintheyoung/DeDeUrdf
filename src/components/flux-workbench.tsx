"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  type Connection,
  type NodeChange,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Download, FileCode2, FileUp, FolderOpen, Link2, PackageOpen, RotateCcw, Save, Settings2 } from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";

import { StlScene } from "@/components/stl-scene";
import { APP_NAME, PRIVACY_SUMMARY } from "@/lib/app-info";
import {
  applyFlowNodePositionChanges,
  defaultFlowNodePosition,
  reconnectAssemblyJoint,
  type FlowNodePositions,
} from "@/lib/fluxweave/flow-layout";
import { loadMujocoExampleProject } from "@/lib/fluxweave/mujoco-example";
import {
  buildChainJoints,
  bindFilesToImportedProject,
  createBrowserAsset,
  createInitialProject,
  downloadBlob,
  exportEditableProjectZip,
  exportMujocoUrdfZip,
  exportProjectZip,
  importProjectFolderFiles,
  importProjectZipFile,
  importSerializableProject,
  JOINT_TYPES,
  missingMeshNames,
  sanitizeRobotName,
  toSerializableProject,
  type BrowserFluxProject,
} from "@/lib/fluxweave/project-utils";
import type { AssemblyJoint, FluxProject, JointType, MeshAsset, Rgba, Vec3 } from "@/lib/fluxweave/types";
import { generateUrdf } from "@/lib/fluxweave/urdf";

function PartNode({ data }: NodeProps<Node<{ label: string; detail: string }>>) {
  return (
    <div className="min-w-40 cursor-grab rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-sm active:cursor-grabbing">
      <Handle type="target" position={Position.Left} className="!border-slate-100 !bg-emerald-500" />
      <div className="font-semibold text-slate-900">{data.label}</div>
      <div className="mt-1 text-slate-500">{data.detail}</div>
      <Handle type="source" position={Position.Right} className="!border-slate-100 !bg-sky-500" />
    </div>
  );
}

const nodeTypes = {
  part: PartNode,
};

const directoryInputProps = {
  directory: "",
  webkitdirectory: "",
} as Record<string, string>;

export function FluxWorkbench() {
  const [project, setProject] = useState<BrowserFluxProject>(() => createInitialProject());
  const [flowNodePositions, setFlowNodePositions] = useState<FlowNodePositions>({});
  const [isLoadingExample, setIsLoadingExample] = useState(false);
  const [previewMode, setPreviewMode] = useState<"assembly" | "part">("assembly");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const selectedAsset = project.assets.find((asset) => asset.id === selectedAssetId) ?? project.assets[0] ?? null;
  const selectedJoint = project.joints.find((joint) => joint.id === selectedJointId) ?? project.joints[0] ?? null;
  const missingMeshes = useMemo(() => missingMeshNames(project), [project]);

  const urdfText = useMemo(() => generateUrdf(toSerializableProject(project)), [project]);

  const flowNodes = useMemo<Node[]>(() => {
    return project.assets.map((asset, index) => ({
      id: asset.id,
      type: "part",
      position: flowNodePositions[asset.id] ?? defaultFlowNodePosition(index),
      data: {
        label: asset.linkName,
        detail: asset.meshName,
      },
      selected: asset.id === selectedAsset?.id,
    }));
  }, [flowNodePositions, project.assets, selectedAsset?.id]);

  const flowEdges = useMemo<Edge[]>(() => {
    return project.joints.map((joint) => {
      const parent = project.assets.find((asset) => asset.linkName === joint.parent);
      const child = project.assets.find((asset) => asset.linkName === joint.child);
      return {
        id: joint.id,
        source: parent?.id ?? joint.parent,
        target: child?.id ?? joint.child,
        label: joint.name,
        reconnectable: true,
        type: "smoothstep",
        interactionWidth: 24,
        selected: joint.id === selectedJoint?.id,
        labelStyle: {
          fill: joint.id === selectedJoint?.id ? "#047857" : "#475569",
          pointerEvents: "none",
        },
        labelBgStyle: {
          fill: "#ffffff",
          fillOpacity: 0.86,
          pointerEvents: "none",
        },
        style: {
          stroke: joint.id === selectedJoint?.id ? "#10b981" : "#64748b",
          strokeWidth: joint.id === selectedJoint?.id ? 2.5 : 1.5,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
  }, [project.assets, project.joints, selectedJoint?.id]);

  function syncJoints(nextAssets: MeshAsset[], existing = project.joints) {
    return buildChainJoints(nextAssets, existing);
  }

  function updateFlowNodes(changes: NodeChange[]) {
    setFlowNodePositions((current) => applyFlowNodePositionChanges(current, changes));
  }

  function reconnectJoint(edge: Edge, connection: Connection) {
    setProject((current) => {
      const nextJoints = reconnectAssemblyJoint(current.joints, current.assets, edge.id, connection.source, connection.target);
      if (nextJoints === current.joints) {
        return current;
      }
      return {
        ...current,
        joints: nextJoints,
      };
    });
    setSelectedJointId(edge.id);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".stl"));
    if (files.length === 0) {
      return;
    }

    const uploadedAssets = files.map((file, index) => createBrowserAsset(file, project.assets.length + index));
    setProject((current) => {
      const nextAssets = [...current.assets, ...uploadedAssets];
      return {
        ...current,
        assets: nextAssets,
        joints: buildChainJoints(nextAssets, current.joints),
      };
    });
    setSelectedAssetId((current) => current ?? uploadedAssets[0]?.id ?? null);
    event.target.value = "";
  }

  async function handleProjectImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imported = file.name.toLowerCase().endsWith(".zip")
        ? await importProjectZipFile(file)
        : importSerializableProject(JSON.parse(await file.text()) as FluxProject);
      for (const asset of project.assets) {
        if (asset.objectUrl) {
          URL.revokeObjectURL(asset.objectUrl);
        }
      }
      setProject(imported);
      setFlowNodePositions({});
      setSelectedAssetId(imported.assets[0]?.id ?? null);
      setSelectedJointId(imported.joints[0]?.id ?? null);
    } catch (error) {
      window.alert(`项目导入失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      event.target.value = "";
    }
  }

  async function handleProjectFolderImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      const imported = await importProjectFolderFiles(files);
      for (const asset of project.assets) {
        if (asset.objectUrl) {
          URL.revokeObjectURL(asset.objectUrl);
        }
      }
      setProject(imported);
      setFlowNodePositions({});
      setSelectedAssetId(imported.assets[0]?.id ?? null);
      setSelectedJointId(imported.joints[0]?.id ?? null);
    } catch (error) {
      window.alert(`项目文件夹导入失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      event.target.value = "";
    }
  }

  function handleMeshBinding(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".stl"));
    if (files.length === 0) {
      return;
    }
    setProject((current) => bindFilesToImportedProject(current, files));
    setSelectedAssetId((current) => current ?? project.assets[0]?.id ?? null);
    event.target.value = "";
  }

  function updateRobotName(robotName: string) {
    setProject((current) => ({ ...current, robotName }));
  }

  function updateAsset(assetId: string, updater: (asset: MeshAsset) => MeshAsset) {
    setProject((current) => {
      const nextAssets = current.assets.map((asset) =>
        asset.id === assetId ? ({ ...asset, ...updater(asset) } as typeof asset) : asset,
      );
      return {
        ...current,
        assets: nextAssets,
        joints: syncJoints(nextAssets, current.joints),
      };
    });
  }

  function updateJoint(jointId: string, updater: (joint: AssemblyJoint) => AssemblyJoint) {
    setProject((current) => ({
      ...current,
      joints: current.joints.map((joint) => (joint.id === jointId ? updater(joint) : joint)),
    }));
  }

  function resetProject() {
    for (const asset of project.assets) {
      if (asset.objectUrl) {
        URL.revokeObjectURL(asset.objectUrl);
      }
    }
    setProject(createInitialProject());
    setFlowNodePositions({});
    setSelectedAssetId(null);
    setSelectedJointId(null);
  }

  async function loadMujocoExample() {
    setIsLoadingExample(true);
    try {
      const imported = await loadMujocoExampleProject();
      for (const asset of project.assets) {
        if (asset.objectUrl) {
          URL.revokeObjectURL(asset.objectUrl);
        }
      }
      setProject(imported);
      setFlowNodePositions({});
      setPreviewMode("assembly");
      setSelectedAssetId(imported.assets[0]?.id ?? null);
      setSelectedJointId(imported.joints[0]?.id ?? null);
    } catch (error) {
      window.alert(`MuJoCo 示例加载失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsLoadingExample(false);
    }
  }

  async function exportZip() {
    const missing = missingMeshNames(project);
    if (missing.length > 0) {
      window.alert(`还有 STL 没有绑定，导出的 zip 会缺少这些 mesh：\n${missing.join("\n")}`);
    }
    const blob = await exportProjectZip(project);
    downloadBlob(blob, `${sanitizeRobotName(project.robotName)}_urdf.zip`);
  }

  async function exportMujocoZip() {
    const missing = missingMeshNames(project);
    if (missing.length > 0) {
      window.alert(`还有 STL 没有绑定，MuJoCo zip 会缺少这些 mesh：\n${missing.join("\n")}`);
    }
    try {
      const blob = await exportMujocoUrdfZip(project);
      downloadBlob(blob, `${sanitizeRobotName(project.robotName)}_mujoco_urdf.zip`);
    } catch (error) {
      window.alert(`MuJoCo ZIP 导出失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  function downloadProjectJson() {
    const payload = JSON.stringify(toSerializableProject(project), null, 2);
    downloadBlob(new Blob([payload], { type: "application/json" }), `${sanitizeRobotName(project.robotName)}.fluxweave.json`);
  }

  async function downloadProjectZip() {
    const missing = missingMeshNames(project);
    if (missing.length > 0) {
      window.alert(`还有 STL 没有绑定，保存的项目 zip 会缺少这些 mesh：\n${missing.join("\n")}`);
    }
    const blob = await exportEditableProjectZip(project);
    downloadBlob(blob, `${sanitizeRobotName(project.robotName)}_project.zip`);
  }

  const canExport = project.assets.length > 0;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-3">
          <div>
            <div className="text-sm font-semibold uppercase text-sky-700">{APP_NAME}</div>
            <h1 className="text-xl font-semibold text-slate-950">URDF 装配与 MuJoCo 导出工作台</h1>
            <p className="mt-0.5 text-xs text-slate-500">{PRIVACY_SUMMARY}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={isLoadingExample}
              onClick={loadMujocoExample}
              type="button"
            >
              <PackageOpen size={16} />
              {isLoadingExample ? "加载中" : "MuJoCo 示例"}
            </button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FolderOpen size={16} />
              导入 JSON/ZIP
              <input
                className="hidden"
                type="file"
                accept=".json,.fluxweave.json,.zip,application/json,application/zip"
                onChange={handleProjectImport}
              />
            </label>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <PackageOpen size={16} />
              导入文件夹
              <input
                className="hidden"
                type="file"
                multiple
                onChange={handleProjectFolderImport}
                {...directoryInputProps}
              />
            </label>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={downloadProjectJson}
              disabled={!canExport}
              type="button"
            >
              <Save size={16} />
              保存 JSON
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={downloadProjectZip}
              disabled={!canExport}
              type="button"
            >
              <PackageOpen size={16} />
              保存项目 ZIP
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={exportZip}
              disabled={!canExport}
              type="button"
            >
              <Download size={16} />
              导出 URDF ZIP
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-700 px-3 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={exportMujocoZip}
              disabled={!canExport}
              type="button"
            >
              <Download size={16} />
              导出 MuJoCo ZIP
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[360px_minmax(560px,1fr)_420px]">
        <section className="space-y-4">
          <Panel title="项目" icon={<PackageOpen size={17} />}>
            <label className="text-xs font-medium text-slate-600" htmlFor="robotName">
              robot name
            </label>
            <input
              id="robotName"
              value={project.robotName}
              onChange={(event) => updateRobotName(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                <FileUp size={16} />
                上传 STL
                <input className="hidden" type="file" accept=".stl" multiple onChange={handleUpload} />
              </label>
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                <FolderOpen size={16} />
                绑定 STL
                <input className="hidden" type="file" accept=".stl" multiple onChange={handleMeshBinding} />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50"
                type="button"
                onClick={resetProject}
              >
                <RotateCcw size={16} />
                重置
              </button>
            </div>
            {missingMeshes.length > 0 ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                已导入项目结构，还需要绑定 STL：{missingMeshes.join(", ")}
              </div>
            ) : null}
          </Panel>

          <Panel title="部件" icon={<Settings2 size={17} />}>
            <div className="space-y-2">
              {project.assets.length === 0 ? (
                <EmptyState text="先上传 base/link STL 文件。第一版会按上传顺序自动组成链式机械臂。" />
              ) : (
                project.assets.map((asset, index) => (
                  <button
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      asset.id === selectedAsset?.id ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{asset.linkName}</span>
                      <span className="text-xs text-slate-500">{asset.file ? `#${index + 1}` : "缺 STL"}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">{asset.fileName}</div>
                  </button>
                ))
              )}
            </div>

            {selectedAsset ? (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                <TextField
                  label="link name"
                  value={selectedAsset.linkName}
                  onChange={(value) => updateAsset(selectedAsset.id, (asset) => ({ ...asset, linkName: value }))}
                />
                <Vec3Field
                  label="visual origin xyz"
                  value={selectedAsset.visualOrigin.xyz}
                  onChange={(value) =>
                    updateAsset(selectedAsset.id, (asset) => ({
                      ...asset,
                      visualOrigin: { ...asset.visualOrigin, xyz: value },
                    }))
                  }
                />
                <Vec3Field
                  label="visual origin rpy"
                  value={selectedAsset.visualOrigin.rpy}
                  onChange={(value) =>
                    updateAsset(selectedAsset.id, (asset) => ({
                      ...asset,
                      visualOrigin: { ...asset.visualOrigin, rpy: value },
                    }))
                  }
                />
                <ColorField
                  value={selectedAsset.color}
                  onChange={(value) => updateAsset(selectedAsset.id, (asset) => ({ ...asset, color: value }))}
                />
              </div>
            ) : null}
          </Panel>
        </section>

        <section className="space-y-4">
          <Panel title="3D STL 预览" icon={<PackageOpen size={17} />} fill>
            <div className="mb-3 inline-flex rounded-md border border-slate-300 bg-white p-1 text-xs font-medium">
              {(["assembly", "part"] as const).map((mode) => (
                <button
                  className={`h-7 rounded px-3 ${
                    previewMode === mode ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  type="button"
                >
                  {mode === "assembly" ? "整机" : "选中部件"}
                </button>
              ))}
            </div>
            <StlScene asset={selectedAsset} mode={previewMode} project={project} />
          </Panel>

          <Panel title="装配节点" icon={<Link2 size={17} />} fill>
            <div className="h-[360px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.35}
                maxZoom={1.5}
                nodesDraggable
                edgesReconnectable
                reconnectRadius={18}
                onNodesChange={updateFlowNodes}
                onReconnect={reconnectJoint}
                onNodeClick={(_, node) => setSelectedAssetId(node.id)}
                onEdgeClick={(_, edge) => setSelectedJointId(edge.id)}
                proOptions={{ hideAttribution: true }}
              >
                <Background />
                <MiniMap pannable zoomable />
                <Controls />
              </ReactFlow>
            </div>
          </Panel>
        </section>

        <section className="space-y-4">
          <Panel title="关节" icon={<Link2 size={17} />}>
            {project.joints.length === 0 ? (
              <EmptyState text="上传至少两个 STL 后会自动生成 joint。" />
            ) : (
              <div className="space-y-2">
                {project.joints.map((joint) => (
                  <button
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      joint.id === selectedJoint?.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    key={joint.id}
                    type="button"
                    onClick={() => setSelectedJointId(joint.id)}
                  >
                    <div className="font-medium text-slate-900">{joint.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {joint.parent} {"->"} {joint.child}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedJoint ? (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                <TextField
                  label="joint name"
                  value={selectedJoint.name}
                  onChange={(value) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, name: value }))}
                />
                <label className="block text-xs font-medium text-slate-600">
                  joint type
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-500"
                    value={selectedJoint.type}
                    onChange={(event) =>
                      updateJoint(selectedJoint.id, (joint) => ({ ...joint, type: event.target.value as JointType }))
                    }
                  >
                    {JOINT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <Vec3Field
                  label="origin xyz"
                  value={selectedJoint.origin.xyz}
                  onChange={(value) =>
                    updateJoint(selectedJoint.id, (joint) => ({ ...joint, origin: { ...joint.origin, xyz: value } }))
                  }
                />
                <Vec3Field
                  label="origin rpy"
                  value={selectedJoint.origin.rpy}
                  onChange={(value) =>
                    updateJoint(selectedJoint.id, (joint) => ({ ...joint, origin: { ...joint.origin, rpy: value } }))
                  }
                />
                <Vec3Field
                  label="axis"
                  value={selectedJoint.axis}
                  onChange={(value) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, axis: value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  {(["lower", "upper", "effort", "velocity"] as const).map((field) => (
                    <NumberField
                      key={field}
                      label={field}
                      value={selectedJoint.limit[field]}
                      onChange={(value) =>
                        updateJoint(selectedJoint.id, (joint) => ({
                          ...joint,
                          limit: { ...joint.limit, [field]: value },
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="URDF 预览" icon={<FileCode2 size={17} />} fill>
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
              {urdfText}
            </pre>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({
  children,
  fill = false,
  icon,
  title,
}: {
  children: React.ReactNode;
  fill?: boolean;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${fill ? "p-3" : "p-4"}`}>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">{text}</div>;
}

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
        type="number"
        step="0.001"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Vec3Field({ label, onChange, value }: { label: string; onChange: (value: Vec3) => void; value: Vec3 }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {value.map((item, index) => (
          <input
            className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
            key={index}
            type="number"
            step="0.001"
            value={Number.isFinite(item) ? item : 0}
            onChange={(event) => {
              const next = [...value] as Vec3;
              next[index] = Number(event.target.value);
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ColorField({ onChange, value }: { onChange: (value: Rgba) => void; value: Rgba }) {
  const hex = `#${value
    .slice(0, 3)
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;
  return (
    <label className="block text-xs font-medium text-slate-600">
      color
      <input
        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2"
        type="color"
        value={hex}
        onChange={(event) => {
          const raw = event.target.value.replace("#", "");
          onChange([
            parseInt(raw.slice(0, 2), 16) / 255,
            parseInt(raw.slice(2, 4), 16) / 255,
            parseInt(raw.slice(4, 6), 16) / 255,
            value[3],
          ]);
        }}
      />
    </label>
  );
}
