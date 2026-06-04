import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JSZip from "jszip";

import {
  createInitialProject,
  exportEditableProjectZip,
  exportMujocoUrdfZip,
  importProjectFolderFiles,
  importProjectZipFile,
  importSerializableProject,
  missingMeshNames,
} from "./project-utils";
import type { FluxProject } from "./types";

describe("project defaults", () => {
  it("uses a DeDeUrdf robot name for new browser projects", () => {
    expect(createInitialProject().robotName).toBe("dedeurdf_robot");
  });
});

describe("project import", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores a saved project without browser mesh files", () => {
    const savedProject: FluxProject = {
      robotName: "imported_robot",
      assets: [
        {
          id: "base-id",
          fileName: "base.stl",
          linkName: "base_link",
          meshName: "base.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [0.8, 0.8, 0.8, 1],
          mass: 1,
        },
        {
          id: "link1-id",
          fileName: "link1.stl",
          linkName: "link1",
          meshName: "link1.stl",
          visualOrigin: { xyz: [0.01, 0, 0], rpy: [0, 0, 0] },
          color: [0.3, 0.5, 0.9, 1],
          mass: 0.5,
        },
      ],
      joints: [
        {
          id: "joint-id",
          name: "joint1",
          type: "revolute",
          parent: "base_link",
          child: "link1",
          origin: { xyz: [0, 0, 0.08], rpy: [0, 0, 0] },
          axis: [0, 0, 1],
          limit: { lower: -2.8, upper: 2.8, effort: 27, velocity: 50 },
        },
      ],
    };

    const imported = importSerializableProject(savedProject);

    expect(imported.robotName).toBe("imported_robot");
    expect(imported.assets).toHaveLength(2);
    expect(imported.assets[0].linkName).toBe("base_link");
    expect(imported.assets[0].file).toBeNull();
    expect(imported.assets[0].objectUrl).toBeNull();
    expect(imported.joints[0].name).toBe("joint1");
    expect(missingMeshNames(imported)).toEqual(["base.stl", "link1.stl"]);
  });

  it("imports a FluxWeave V3 graph project", () => {
    const fluxWeaveProject = {
      version: "0.0.4",
      project_name: "RSReBot fluxweave dm",
      graph: {
        nodes: [
          { type: "base", uid: "base_root", name: "world", link_name: "world" },
          {
            type: "part",
            uid: "base",
            name: "base",
            link_name: "base_link",
            stl_path: "metadata_stl/base.stl",
          },
          {
            type: "part",
            uid: "link1",
            name: "link1",
            link_name: "link1",
            stl_path: "metadata_stl/link1.stl",
          },
          {
            type: "part",
            uid: "link2",
            name: "link2",
            link_name: "link2",
            stl_path: "metadata_stl/link2.stl",
          },
          {
            type: "connector",
            uid: "conn_world_base",
            name: "world_to_base",
            joint_name: "world_to_base",
            joint_type: "fixed",
            parent_binding: { node_uid: "base_root", point: "root" },
            child_binding: { node_uid: "base", point: "base_root" },
            parent_local_xyz: [0, 0, 0],
            child_local_xyz: [0, 0, 0],
            parent_axis: [0, 0, 1],
            child_axis: [0, 0, 1],
            offset_xyz: [0, 0, 0],
            offset_rpy: [0, 0, 0],
            joint_limit_lower: 0,
            joint_limit_upper: 0,
          },
          {
            type: "connector",
            uid: "conn_joint1",
            name: "joint1",
            joint_name: "joint1",
            joint_type: "revolute",
            parent_binding: { node_uid: "base", point: "joint1_parent" },
            child_binding: { node_uid: "link1", point: "joint1_child" },
            parent_local_xyz: [-0.000084, 0, 0.0868],
            child_local_xyz: [0, 0, 0],
            parent_axis: [0, 0, 1],
            child_axis: [0, 0, 1],
            offset_xyz: [0, 0, 0],
            offset_rpy: [0, 0, 0],
            joint_limit_lower: -2.8,
            joint_limit_upper: 2.8,
            joint_effort: 27,
            joint_velocity: 50,
          },
          {
            type: "connector",
            uid: "conn_joint2",
            name: "joint2",
            joint_name: "joint2",
            joint_type: "revolute",
            parent_binding: { node_uid: "link1", point: "joint2_parent" },
            child_binding: { node_uid: "link2", point: "joint2_child" },
            parent_local_xyz: [0.02, 0.028375, 0.055212],
            child_local_xyz: [0, 0, 0],
            parent_axis: [0, 0, -1],
            child_axis: [0, 0, -1],
            offset_xyz: [0, 0, 0],
            offset_rpy: [-1.5708, 0, 0],
            joint_limit_lower: -3.14,
            joint_limit_upper: 0,
            joint_effort: 27,
            joint_velocity: 50,
          },
        ],
        connections: [],
      },
    };

    const imported = importSerializableProject(fluxWeaveProject as never);

    expect(imported.robotName).toBe("RSReBot_fluxweave_dm");
    expect(imported.assets.map((asset) => asset.meshName)).toEqual(["base.stl", "link1.stl", "link2.stl"]);
    expect(imported.assets.map((asset) => asset.file)).toEqual([null, null, null]);
    expect(imported.joints).toHaveLength(2);
    expect(imported.joints.map((joint) => joint.name)).not.toContain("world_to_base");
    expect(imported.joints[0]).toMatchObject({
      name: "joint1",
      type: "revolute",
      parent: "base_link",
      child: "link1",
      origin: { xyz: [-0.000084, 0, 0.0868], rpy: [0, 0, 0] },
      axis: [0, 0, 1],
      limit: { lower: -2.8, upper: 2.8, effort: 27, velocity: 50 },
    });
    expect(imported.joints[1].origin.xyz).toEqual([0.02, 0.028375, 0.055212]);
    expect(imported.joints[1].origin.rpy[0]).toBeCloseTo(-1.5708);
    expect(imported.joints[1].axis).toEqual([0, 0, -1]);
    expect(missingMeshNames(imported)).toEqual(["base.stl", "link1.stl", "link2.stl"]);
  });

  it("imports a FluxWeave project folder and binds matching STL files", async () => {
    const projectJson = folderFile(
      "RSReBot/RSReBot_fluxweave_dm_project.json",
      JSON.stringify({
        project_name: "RSReBot fluxweave dm",
        graph: {
          nodes: [
            {
              type: "part",
              uid: "base",
              name: "base",
              link_name: "base_link",
              stl_path: "metadata_stl/base.stl",
            },
            {
              type: "part",
              uid: "link1",
              name: "link1",
              link_name: "link1",
              stl_path: "metadata_stl/link1.stl",
            },
            {
              type: "connector",
              uid: "conn_joint1",
              name: "joint1",
              joint_name: "joint1",
              joint_type: "revolute",
              parent_binding: { node_uid: "base", point: "joint1_parent" },
              child_binding: { node_uid: "link1", point: "joint1_child" },
              parent_local_xyz: [0, 0, 0.0868],
              child_local_xyz: [0, 0, 0],
              parent_axis: [0, 0, 1],
              child_axis: [0, 0, 1],
            },
          ],
        },
      }),
    );
    const baseStl = folderFile("RSReBot/metadata_stl/base.stl", "solid base\nendsolid base\n");
    const link1Stl = folderFile("RSReBot/metadata_stl/link1.stl", "solid link1\nendsolid link1\n");
    const duplicateBase = folderFile("RSReBot/meshes/base.stl", "solid duplicate\nendsolid duplicate\n");

    const imported = await importProjectFolderFiles([projectJson, duplicateBase, baseStl, link1Stl]);

    expect(imported.robotName).toBe("RSReBot_fluxweave_dm");
    expect(missingMeshNames(imported)).toEqual([]);
    expect(imported.assets.map((asset) => asset.file?.webkitRelativePath)).toEqual([
      "RSReBot/metadata_stl/base.stl",
      "RSReBot/metadata_stl/link1.stl",
    ]);
    expect(imported.assets.map((asset) => asset.objectUrl)).toEqual(["blob:base.stl", "blob:link1.stl"]);
  });

  it("imports a project zip and binds matching STL files", async () => {
    const zip = new JSZip();
    zip.file(
      "project.fluxweave.json",
      JSON.stringify({
        robotName: "zip_robot",
        assets: [
          {
            id: "base",
            fileName: "base.stl",
            linkName: "base_link",
            meshName: "base.stl",
            visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
            color: [1, 0, 0, 1],
          },
          {
            id: "link1",
            fileName: "link1.stl",
            linkName: "link1",
            meshName: "link1.stl",
            visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
            color: [0, 1, 0, 1],
          },
        ],
        joints: [
          {
            id: "joint1",
            name: "joint1",
            type: "revolute",
            parent: "base_link",
            child: "link1",
            origin: { xyz: [0, 0, 0.0868], rpy: [0, 0, 0] },
            axis: [0, 0, 1],
            limit: { lower: -2.8, upper: 2.8, effort: 27, velocity: 50 },
          },
        ],
      }),
    );
    zip.file("meshes/base.stl", "solid base\nendsolid base\n");
    zip.file("meshes/link1.stl", "solid link1\nendsolid link1\n");

    const blob = await zip.generateAsync({ type: "blob" });
    const imported = await importProjectZipFile(new File([blob], "zip_robot_project.zip"));

    expect(imported.robotName).toBe("zip_robot");
    expect(missingMeshNames(imported)).toEqual([]);
    expect(imported.assets.map((asset) => asset.file?.webkitRelativePath)).toEqual(["meshes/base.stl", "meshes/link1.stl"]);
    expect(imported.assets.map((asset) => asset.objectUrl)).toEqual(["blob:base.stl", "blob:link1.stl"]);
  });

  it("exports an editable project zip that can be imported again", async () => {
    const project = importSerializableProject({
      robotName: "round_trip_robot",
      assets: [
        {
          id: "base",
          fileName: "base.stl",
          linkName: "base_link",
          meshName: "base.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [1, 0, 0, 1],
        },
        {
          id: "link1",
          fileName: "link1.stl",
          linkName: "link1",
          meshName: "link1.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [0, 1, 0, 1],
        },
      ],
      joints: [
        {
          id: "joint1",
          name: "joint1",
          type: "revolute",
          parent: "base_link",
          child: "link1",
          origin: { xyz: [0, 0, 0.0868], rpy: [0, 0, 0] },
          axis: [0, 0, 1],
          limit: { lower: -2.8, upper: 2.8, effort: 27, velocity: 50 },
        },
      ],
    });
    project.assets[0].file = new File(["solid base\nendsolid base\n"], "base.stl");
    project.assets[1].file = new File(["solid link1\nendsolid link1\n"], "link1.stl");

    const blob = await exportEditableProjectZip(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const imported = await importProjectZipFile(new File([blob], "round_trip_robot_project.zip"));

    expect(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(["meshes/base.stl", "meshes/link1.stl", "project.fluxweave.json"]);
    expect(imported.robotName).toBe("round_trip_robot");
    expect(missingMeshNames(imported)).toEqual([]);
    expect(imported.joints[0].origin.xyz).toEqual([0, 0, 0.0868]);
  });

  it("exports a MuJoCo-ready URDF zip with binary STL meshes and parent-relative mesh paths", async () => {
    const project = importSerializableProject({
      robotName: "mujoco_robot",
      assets: [
        {
          id: "base",
          fileName: "base.stl",
          linkName: "base_link",
          meshName: "base.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [1, 0, 0, 1],
        },
        {
          id: "link1",
          fileName: "link1.stl",
          linkName: "link1",
          meshName: "link1.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [0, 1, 0, 1],
        },
      ],
      joints: [
        {
          id: "joint1",
          name: "joint1",
          type: "revolute",
          parent: "base_link",
          child: "link1",
          origin: { xyz: [0, 0, 0.0868], rpy: [0, 0, 0] },
          axis: [0, 0, 1],
          limit: { lower: -2.8, upper: 2.8, effort: 27, velocity: 50 },
        },
      ],
    });
    project.assets[0].file = new File([oneTriangleAsciiStl("base")], "base.stl");
    project.assets[1].file = new File([oneTriangleAsciiStl("link1")], "link1.stl");

    const blob = await exportMujocoUrdfZip(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const urdf = await zip.file("urdf/mujoco_robot_mujoco.urdf")?.async("string");
    const baseMesh = await zip.file("meshes/base.stl")?.async("arraybuffer");

    expect(urdf).toContain('<mesh filename="../meshes/base.stl"/>');
    expect(urdf).toContain('<mesh filename="../meshes/link1.stl"/>');
    expect(urdf).not.toContain('filename="meshes/base.stl"');
    expect(binaryStlTriangleCount(baseMesh)).toBe(1);
    expect(new TextDecoder().decode(baseMesh?.slice(0, 5))).not.toBe("solid");
    expect(await zip.file("README_mujoco.txt")?.async("string")).toContain("mujoco.MjModel.from_xml_path");
  });
});

function folderFile(path: string, contents: string): File {
  const file = new File([contents], path.split("/").pop() ?? path);
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: path,
  });
  return file;
}

function oneTriangleAsciiStl(name: string): string {
  return `solid ${name}
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid ${name}
`;
}

function binaryStlTriangleCount(buffer: ArrayBuffer | undefined): number {
  expect(buffer).toBeDefined();
  const view = new DataView(buffer as ArrayBuffer);
  expect(view.byteLength).toBe(134);
  return view.getUint32(80, true);
}
