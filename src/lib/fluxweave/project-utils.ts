import JSZip from "jszip";

import type { AssemblyJoint, FluxProject, JointType, MeshAsset, Pose, Vec3 } from "./types";
import { generateUrdf } from "./urdf";

export type BrowserMeshAsset = MeshAsset & {
  file: File | null;
  objectUrl: string | null;
  sourcePath?: string;
  size: number;
};

export type BrowserFluxProject = Omit<FluxProject, "assets"> & {
  assets: BrowserMeshAsset[];
};

export type EditableJointField = "lower" | "upper" | "effort" | "velocity";

export const DEFAULT_POSE: Pose = {
  xyz: [0, 0, 0],
  rpy: [0, 0, 0],
};

export const DEFAULT_AXIS: Vec3 = [0, 0, 1];

export const JOINT_TYPES: JointType[] = ["fixed", "revolute", "continuous", "prismatic"];

type UnknownRecord = Record<string, unknown>;

type FluxWeaveGraphProject = {
  project_name?: unknown;
  graph: {
    nodes: unknown[];
  };
};

export function sanitizeRobotName(name: unknown): string {
  const rawName = typeof name === "string" ? name : "";
  const cleaned = rawName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "dedeurdf_robot";
}

export function sanitizeLinkName(name: unknown, fallback = "link"): string {
  const rawName = typeof name === "string" ? name : "";
  const base = rawName.replace(/\.[^.]+$/, "");
  const cleaned = base
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

export function createBrowserAsset(file: File, index: number): BrowserMeshAsset {
  const linkName = index === 0 ? "base_link" : sanitizeLinkName(file.name, `link${index}`);
  const hue = (index * 59) % 360;
  return {
    id: crypto.randomUUID(),
    file,
    objectUrl: URL.createObjectURL(file),
    size: file.size,
    fileName: file.name,
    linkName,
    meshName: file.name,
    visualOrigin: {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    },
    color: hslToRgba(hue, 0.52, 0.58),
    mass: 0,
  };
}

export function createInitialProject(): BrowserFluxProject {
  return {
    robotName: "dedeurdf_robot",
    assets: [],
    joints: [],
  };
}

export function importSerializableProject(project: unknown): BrowserFluxProject {
  if (isSavedFluxProject(project)) {
    return importSavedProject(project);
  }
  if (isFluxWeaveGraphProject(project)) {
    return importFluxWeaveGraphProject(project);
  }
  throw new Error("不支持的项目 JSON 格式");
}

function importSavedProject(project: FluxProject): BrowserFluxProject {
  return {
    robotName: sanitizeRobotName(project.robotName),
    assets: project.assets.map((asset, index) => ({
      id: asset.id || crypto.randomUUID(),
      file: null,
      objectUrl: null,
      size: 0,
      fileName: asset.fileName || asset.meshName || `link${index}.stl`,
      linkName: asset.linkName || (index === 0 ? "base_link" : `link${index}`),
      meshName: asset.meshName || asset.fileName || `link${index}.stl`,
      visualOrigin: asset.visualOrigin ?? DEFAULT_POSE,
      color: asset.color ?? hslToRgba((index * 59) % 360, 0.52, 0.58),
      mass: asset.mass ?? 0,
    })),
    joints: project.joints.map((joint) => ({
      ...joint,
      id: joint.id || crypto.randomUUID(),
    })),
  };
}

function importFluxWeaveGraphProject(project: FluxWeaveGraphProject): BrowserFluxProject {
  const rawNodes = project.graph.nodes.filter(isRecord);
  const partNodes = new Map<string, { uid: string; name: string; linkName: string; meshName: string; sourcePath: string }>();

  for (const node of rawNodes) {
    const uid = stringValue(node.uid);
    if (!uid) {
      continue;
    }
    const type = stringValue(node.type);
    const name = stringValue(node.name) || uid;
    const linkName = sanitizeLinkName(node.link_name ?? name, type === "base" ? "world" : name);
    if (type === "part") {
      const sourcePath = normalizePath(stringValue(node.stl_path));
      const meshName = basename(sourcePath, `${sanitizeLinkName(name, uid)}.stl`);
      partNodes.set(uid, { uid, name, linkName, meshName, sourcePath });
    }
  }

  const assets = Array.from(partNodes.values()).map((part, index): BrowserMeshAsset => ({
    id: part.uid,
    file: null,
    objectUrl: null,
    size: 0,
    fileName: part.meshName,
    linkName: part.linkName,
    meshName: part.meshName,
    sourcePath: part.sourcePath,
    visualOrigin: {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    },
    color: hslToRgba((index * 59) % 360, 0.52, 0.58),
    mass: 0,
  }));

  const joints = rawNodes
    .filter((node) => stringValue(node.type) === "connector")
    .map((node, index): AssemblyJoint | null => {
      const parentUid = bindingNodeUid(node.parent_binding);
      const childUid = bindingNodeUid(node.child_binding);
      const parentPart = partNodes.get(parentUid);
      const childPart = partNodes.get(childUid);
      if (!parentPart || !childPart) {
        return null;
      }

      const origin = computeFluxWeaveJointOrigin(node);
      const axis = normalizeOrFallback(vec3Value(node.parent_axis, DEFAULT_AXIS), [1, 0, 0]);

      return {
        id: stringValue(node.uid) || crypto.randomUUID(),
        name: sanitizeLinkName(node.joint_name ?? node.name, `joint${index + 1}`),
        type: jointTypeValue(node.joint_type),
        parent: parentPart.linkName,
        child: childPart.linkName,
        origin,
        axis,
        limit: {
          lower: numberValue(node.joint_limit_lower, -Math.PI),
          upper: numberValue(node.joint_limit_upper, Math.PI),
          effort: Math.max(0, numberValue(node.joint_effort, 0)),
          velocity: Math.max(0, numberValue(node.joint_velocity, 0)),
        },
      };
    })
    .filter((joint): joint is AssemblyJoint => joint !== null);

  return {
    robotName: sanitizeRobotName(project.project_name),
    assets,
    joints,
  };
}

export function missingMeshNames(project: BrowserFluxProject): string[] {
  return project.assets.filter((asset) => !asset.file).map((asset) => asset.meshName || asset.fileName);
}

export function bindFilesToImportedProject(project: BrowserFluxProject, files: File[]): BrowserFluxProject {
  const fileByName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const fileByRelativePath = new Map<string, File>();
  for (const file of files) {
    const relativePath = normalizePath(file.webkitRelativePath);
    if (relativePath) {
      fileByRelativePath.set(relativePath.toLowerCase(), file);
    }
  }
  return {
    ...project,
    assets: project.assets.map((asset, index) => {
      const sourcePath = normalizePath(asset.sourcePath);
      const file =
        findFileByRelativePath(fileByRelativePath, sourcePath) ??
        fileByName.get(asset.meshName.toLowerCase()) ??
        fileByName.get(asset.fileName.toLowerCase());
      if (!file) {
        return asset;
      }
      if (asset.objectUrl) {
        URL.revokeObjectURL(asset.objectUrl);
      }
      return {
        ...asset,
        file,
        objectUrl: URL.createObjectURL(file),
        size: file.size,
        fileName: file.name,
        meshName: file.name,
        linkName: asset.linkName || (index === 0 ? "base_link" : sanitizeLinkName(file.name, `link${index}`)),
      };
    }),
  };
}

export async function importProjectFolderFiles(files: File[]): Promise<BrowserFluxProject> {
  return importProjectFiles(files, "文件夹里没有找到可识别的项目 JSON");
}

export async function importProjectZipFile(file: File): Promise<BrowserFluxProject> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files = await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map(async (entry) => {
        const blob = await entry.async("blob");
        const zipFile = new File([blob], basename(entry.name, "asset"), { type: fileTypeForPath(entry.name) });
        Object.defineProperty(zipFile, "webkitRelativePath", {
          configurable: true,
          value: normalizePath(entry.name),
        });
        return zipFile;
      }),
  );

  return importProjectFiles(files, "ZIP 里没有找到可识别的项目 JSON");
}

async function importProjectFiles(files: File[], missingProjectMessage: string): Promise<BrowserFluxProject> {
  const jsonCandidates = files.filter((file) => file.name.toLowerCase().endsWith(".json"));
  const stlFiles = files.filter((file) => file.name.toLowerCase().endsWith(".stl"));
  const importedProjects: Array<{ file: File; project: BrowserFluxProject }> = [];

  for (const file of jsonCandidates) {
    try {
      const payload = JSON.parse(await file.text());
      importedProjects.push({ file, project: importSerializableProject(payload) });
    } catch {
      // Ignore unrelated JSON files in a selected project folder.
    }
  }

  const best = importedProjects.sort(compareImportedProjectCandidates)[0];
  if (!best) {
    throw new Error(missingProjectMessage);
  }

  return bindFilesToImportedProject(best.project, stlFiles);
}

export function buildChainJoints(assets: MeshAsset[], existing: AssemblyJoint[]): AssemblyJoint[] {
  if (assets.length < 2) {
    return [];
  }

  return assets.slice(1).map((asset, index) => {
    const parentAsset = assets[index];
    const previous = existing.find((joint) => joint.child === asset.linkName) ?? existing[index];
    return {
      id: previous?.id ?? crypto.randomUUID(),
      name: previous?.name || `joint${index + 1}`,
      type: previous?.type || "revolute",
      parent: parentAsset.linkName,
      child: asset.linkName,
      origin: previous?.origin ?? { ...DEFAULT_POSE, xyz: [0, 0, index === 0 ? 0.08 : 0] },
      axis: previous?.axis ?? [...DEFAULT_AXIS],
      limit: previous?.limit ?? {
        lower: -3.14,
        upper: 3.14,
        effort: 10,
        velocity: 10,
      },
    };
  });
}

export function toSerializableProject(project: BrowserFluxProject): FluxProject {
  return {
    robotName: sanitizeRobotName(project.robotName),
    assets: project.assets.map((asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      linkName: asset.linkName,
      meshName: asset.meshName,
      visualOrigin: asset.visualOrigin,
      color: asset.color,
      mass: asset.mass,
    })),
    joints: project.joints,
  };
}

export async function exportProjectZip(project: BrowserFluxProject): Promise<Blob> {
  const zip = new JSZip();
  const serializable = toSerializableProject(project);
  zip.file("project.fluxweave.json", JSON.stringify(serializable, null, 2));
  zip.file(`urdf/${sanitizeRobotName(project.robotName)}.urdf`, generateUrdf(serializable));

  const meshFolder = zip.folder("meshes");
  if (!meshFolder) {
    throw new Error("Unable to create meshes folder");
  }
  for (const asset of project.assets) {
    if (asset.file) {
      meshFolder.file(asset.meshName, await asset.file.arrayBuffer());
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export async function exportMujocoUrdfZip(project: BrowserFluxProject): Promise<Blob> {
  const zip = new JSZip();
  const serializable = toSerializableProject(project);
  const robotName = sanitizeRobotName(project.robotName);
  zip.file("project.fluxweave.json", JSON.stringify(serializable, null, 2));
  zip.file(`urdf/${robotName}_mujoco.urdf`, generateUrdf(serializable, { meshPathPrefix: "../meshes/" }));
  zip.file("README_mujoco.txt", mujocoReadme(robotName));

  const meshFolder = zip.folder("meshes");
  if (!meshFolder) {
    throw new Error("Unable to create meshes folder");
  }
  for (const asset of project.assets) {
    if (asset.file) {
      meshFolder.file(asset.meshName, await stlArrayBufferForMujoco(asset.file));
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export async function exportEditableProjectZip(project: BrowserFluxProject): Promise<Blob> {
  const zip = new JSZip();
  zip.file("project.fluxweave.json", JSON.stringify(toSerializableProject(project), null, 2));

  const meshFolder = zip.folder("meshes");
  if (!meshFolder) {
    throw new Error("Unable to create meshes folder");
  }
  for (const asset of project.assets) {
    if (asset.file) {
      meshFolder.file(asset.meshName, await asset.file.arrayBuffer());
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSavedFluxProject(value: unknown): value is FluxProject {
  return isRecord(value) && Array.isArray(value.assets) && Array.isArray(value.joints);
}

function isFluxWeaveGraphProject(value: unknown): value is FluxWeaveGraphProject {
  return isRecord(value) && isRecord(value.graph) && Array.isArray(value.graph.nodes);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec3Value(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }
  return [
    numberValue(value[0], fallback[0]),
    numberValue(value[1], fallback[1]),
    numberValue(value[2], fallback[2]),
  ];
}

function basename(path: string, fallback: string): string {
  const fileName = path.split(/[\\/]/).pop()?.trim();
  return fileName || fallback;
}

function fileTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".stl")) {
    return "model/stl";
  }
  return "application/octet-stream";
}

function normalizePath(path: unknown): string {
  if (typeof path !== "string") {
    return "";
  }
  return path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function findFileByRelativePath(fileByRelativePath: Map<string, File>, sourcePath: string): File | undefined {
  if (!sourcePath) {
    return undefined;
  }
  const normalizedSource = sourcePath.toLowerCase();
  const directMatch = fileByRelativePath.get(normalizedSource);
  if (directMatch) {
    return directMatch;
  }
  for (const [relativePath, file] of fileByRelativePath) {
    if (relativePath.endsWith(`/${normalizedSource}`)) {
      return file;
    }
  }
  return undefined;
}

function compareImportedProjectCandidates(
  left: { file: File; project: BrowserFluxProject },
  right: { file: File; project: BrowserFluxProject },
): number {
  return projectCandidateScore(right) - projectCandidateScore(left);
}

function projectCandidateScore(candidate: { file: File; project: BrowserFluxProject }): number {
  const relativePath = normalizePath(candidate.file.webkitRelativePath).toLowerCase();
  const name = candidate.file.name.toLowerCase();
  let score = candidate.project.assets.length * 10 + candidate.project.joints.length;
  if (name === "project.fluxweave.json") {
    score += 1000;
  }
  if (name.includes("_dm_project")) {
    score += 100;
  }
  if (relativePath.includes("/metadata_stl/")) {
    score -= 10;
  }
  return score;
}

async function stlArrayBufferForMujoco(file: File): Promise<ArrayBuffer> {
  const source = await file.arrayBuffer();
  if (isBinaryStl(source)) {
    return source;
  }
  return asciiStlToBinary(source, file.name);
}

function isBinaryStl(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) {
    return false;
  }
  const triangleCount = new DataView(buffer).getUint32(80, true);
  return buffer.byteLength === 84 + triangleCount * 50;
}

function asciiStlToBinary(buffer: ArrayBuffer, fileName: string): ArrayBuffer {
  const text = new TextDecoder().decode(buffer);
  const triangles: Array<{ normal: Vec3; vertices: [Vec3, Vec3, Vec3] }> = [];
  let normal: Vec3 = [0, 0, 0];
  let vertices: Vec3[] = [];

  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 5 && parts[0] === "facet" && parts[1] === "normal") {
      normal = [numberValue(parts[2], 0), numberValue(parts[3], 0), numberValue(parts[4], 0)];
      vertices = [];
      continue;
    }
    if (parts.length === 4 && parts[0] === "vertex") {
      vertices.push([numberValue(parts[1], 0), numberValue(parts[2], 0), numberValue(parts[3], 0)]);
      if (vertices.length === 3) {
        triangles.push({ normal, vertices: [vertices[0], vertices[1], vertices[2]] });
        vertices = [];
      }
    }
  }

  if (triangles.length === 0) {
    throw new Error(`${fileName} 没有可导出的 STL 三角面`);
  }

  const output = new ArrayBuffer(84 + triangles.length * 50);
  const bytes = new Uint8Array(output);
  bytes.set(new TextEncoder().encode("DeDeUrdf MuJoCo binary STL").slice(0, 80));
  const view = new DataView(output);
  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const triangle of triangles) {
    for (const value of [...triangle.normal, ...triangle.vertices[0], ...triangle.vertices[1], ...triangle.vertices[2]]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return output;
}

function mujocoReadme(robotName: string): string {
  return `MuJoCo-ready DeDeUrdf URDF package

Use after unzipping this package:

python - <<'PY'
import mujoco
model = mujoco.MjModel.from_xml_path("urdf/${robotName}_mujoco.urdf")
print(model.nbody, model.njnt, model.ngeom)
PY

Notes:
- URDF mesh paths are written as ../meshes/*.stl relative to the urdf/ folder.
- STL files are exported as binary STL for MuJoCo compatibility.
- This package contains geometry and joints. Add actuators/inertials separately if you need closed-loop control.
`;
}

function bindingNodeUid(binding: unknown): string {
  if (!isRecord(binding)) {
    return "";
  }
  return stringValue(binding.node_uid);
}

function jointTypeValue(value: unknown): JointType {
  const raw = stringValue(value);
  return JOINT_TYPES.includes(raw as JointType) ? (raw as JointType) : "fixed";
}

function computeFluxWeaveJointOrigin(node: UnknownRecord): Pose {
  let parentAxis = normalize(vec3Value(node.parent_axis, DEFAULT_AXIS));
  let childAxis = normalize(vec3Value(node.child_axis, parentAxis));
  if (length(parentAxis) < 1e-9) {
    parentAxis = [1, 0, 0];
  }
  if (length(childAxis) < 1e-9) {
    childAxis = parentAxis;
  }

  const alignRotation = rotationBetween(childAxis, parentAxis);
  const parentPoint = vec3Value(node.parent_local_xyz, DEFAULT_POSE.xyz);
  const childPoint = vec3Value(node.child_local_xyz, DEFAULT_POSE.xyz);
  const baseTranslation = subtract(parentPoint, multiplyMatrixVector(alignRotation, childPoint));
  const offsetMatrix = matrixFromXyzRpy(
    vec3Value(node.offset_xyz, DEFAULT_POSE.xyz),
    vec3Value(node.offset_rpy, DEFAULT_POSE.rpy),
  );
  const baseMatrix = matrixFromRotationTranslation(alignRotation, baseTranslation);
  const relativeMatrix = multiplyMatrix4(baseMatrix, offsetMatrix);

  return {
    xyz: roundVec3([relativeMatrix[0][3], relativeMatrix[1][3], relativeMatrix[2][3]]),
    rpy: roundVec3(matrixToRpy(rotationFromMatrix4(relativeMatrix))),
  };
}

function normalizeOrFallback(value: Vec3, fallback: Vec3): Vec3 {
  const normalized = normalize(value);
  return length(normalized) < 1e-9 ? [...fallback] : roundVec3(normalized);
}

function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: Vec3): Vec3 {
  const norm = length(value);
  if (norm < 1e-9) {
    return [0, 0, 0];
  }
  return [value[0] / norm, value[1] / norm, value[2] / norm];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function rotationBetween(from: Vec3, to: Vec3): number[][] {
  const source = normalize(from);
  const target = normalize(to);
  const cosine = dot(source, target);
  if (cosine > 1 - 1e-9) {
    return identity3();
  }
  if (cosine < -1 + 1e-9) {
    let axis = cross(source, [1, 0, 0]);
    if (length(axis) < 1e-9) {
      axis = cross(source, [0, 1, 0]);
    }
    return rotationAbout(axis, Math.PI);
  }

  const axis = normalize(cross(source, target));
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const skew = [
    [0, -axis[2], axis[1]],
    [axis[2], 0, -axis[0]],
    [-axis[1], axis[0], 0],
  ];
  const skewSquared = multiplyMatrix3(skew, skew);
  return addMatrix3(addMatrix3(identity3(), scaleMatrix3(skew, sine)), scaleMatrix3(skewSquared, 1 - cosine));
}

function rotationAbout(axis: Vec3, angle: number): number[][] {
  const [x, y, z] = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const oneMinusCosine = 1 - cosine;
  return [
    [
      x * x * oneMinusCosine + cosine,
      x * y * oneMinusCosine - z * sine,
      x * z * oneMinusCosine + y * sine,
    ],
    [
      y * x * oneMinusCosine + z * sine,
      y * y * oneMinusCosine + cosine,
      y * z * oneMinusCosine - x * sine,
    ],
    [
      z * x * oneMinusCosine - y * sine,
      z * y * oneMinusCosine + x * sine,
      z * z * oneMinusCosine + cosine,
    ],
  ];
}

function matrixFromXyzRpy(xyz: Vec3, rpy: Vec3): number[][] {
  return matrixFromRotationTranslation(rotationFromRpy(rpy), xyz);
}

function rotationFromRpy(rpy: Vec3): number[][] {
  const [roll, pitch, yaw] = rpy;
  const cx = Math.cos(roll);
  const sx = Math.sin(roll);
  const cy = Math.cos(pitch);
  const sy = Math.sin(pitch);
  const cz = Math.cos(yaw);
  const sz = Math.sin(yaw);

  const rotX = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const rotY = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rotZ = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];

  return multiplyMatrix3(multiplyMatrix3(rotZ, rotY), rotX);
}

function matrixToRpy(rotation: number[][]): Vec3 {
  const sy = Math.sqrt(rotation[0][0] * rotation[0][0] + rotation[1][0] * rotation[1][0]);
  const singular = sy < 1e-9;
  if (!singular) {
    return [
      Math.atan2(rotation[2][1], rotation[2][2]),
      Math.atan2(-rotation[2][0], sy),
      Math.atan2(rotation[1][0], rotation[0][0]),
    ];
  }
  return [Math.atan2(-rotation[1][2], rotation[1][1]), Math.atan2(-rotation[2][0], sy), 0];
}

function matrixFromRotationTranslation(rotation: number[][], translation: Vec3): number[][] {
  return [
    [rotation[0][0], rotation[0][1], rotation[0][2], translation[0]],
    [rotation[1][0], rotation[1][1], rotation[1][2], translation[1]],
    [rotation[2][0], rotation[2][1], rotation[2][2], translation[2]],
    [0, 0, 0, 1],
  ];
}

function rotationFromMatrix4(matrix: number[][]): number[][] {
  return [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]],
    [matrix[2][0], matrix[2][1], matrix[2][2]],
  ];
}

function multiplyMatrixVector(matrix: number[][], vector: Vec3): Vec3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function identity3(): number[][] {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

function addMatrix3(left: number[][], right: number[][]): number[][] {
  return left.map((row, rowIndex) => row.map((value, columnIndex) => value + right[rowIndex][columnIndex]));
}

function scaleMatrix3(matrix: number[][], scalar: number): number[][] {
  return matrix.map((row) => row.map((value) => value * scalar));
}

function multiplyMatrix3(left: number[][], right: number[][]): number[][] {
  return left.map((row) =>
    right[0].map((_, columnIndex) =>
      row.reduce((sum, value, innerIndex) => sum + value * right[innerIndex][columnIndex], 0),
    ),
  );
}

function multiplyMatrix4(left: number[][], right: number[][]): number[][] {
  return left.map((row) =>
    right[0].map((_, columnIndex) =>
      row.reduce((sum, value, innerIndex) => sum + value * right[innerIndex][columnIndex], 0),
    ),
  );
}

function roundVec3(value: Vec3): Vec3 {
  return value.map((entry) => {
    if (Math.abs(entry) < 1e-12) {
      return 0;
    }
    return Number(entry.toFixed(12));
  }) as Vec3;
}

function hslToRgba(hue: number, saturation: number, lightness: number): [number, number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;
  return [
    Number((red + match).toFixed(3)),
    Number((green + match).toFixed(3)),
    Number((blue + match).toFixed(3)),
    1,
  ];
}
