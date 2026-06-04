import { describe, expect, it } from "vitest";

import { computeAssemblyLinkMatrices } from "./assembly";
import type { AssemblyJoint, MeshAsset } from "./types";

const baseAsset: MeshAsset = {
  id: "base",
  fileName: "base.stl",
  linkName: "base_link",
  meshName: "base.stl",
  visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
  color: [1, 0, 0, 1],
};

const link1Asset: MeshAsset = {
  id: "link1",
  fileName: "link1.stl",
  linkName: "link1",
  meshName: "link1.stl",
  visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
  color: [0, 1, 0, 1],
};

const link2Asset: MeshAsset = {
  id: "link2",
  fileName: "link2.stl",
  linkName: "link2",
  meshName: "link2.stl",
  visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
  color: [0, 0, 1, 1],
};

describe("assembly transforms", () => {
  it("accumulates joint origins from parent links to child links", () => {
    const joints: AssemblyJoint[] = [
      {
        id: "joint1",
        name: "joint1",
        type: "revolute",
        parent: "base_link",
        child: "link1",
        origin: { xyz: [1, 0, 0], rpy: [0, 0, 0] },
        axis: [0, 0, 1],
        limit: { lower: -1, upper: 1, effort: 1, velocity: 1 },
      },
      {
        id: "joint2",
        name: "joint2",
        type: "revolute",
        parent: "link1",
        child: "link2",
        origin: { xyz: [0, 2, 0], rpy: [0, 0, 0] },
        axis: [0, 0, 1],
        limit: { lower: -1, upper: 1, effort: 1, velocity: 1 },
      },
    ];

    const matrices = computeAssemblyLinkMatrices([baseAsset, link1Asset, link2Asset], joints);

    expect(matrixPosition(matrices.get("base_link"))).toEqual([0, 0, 0]);
    expect(matrixPosition(matrices.get("link1"))).toEqual([1, 0, 0]);
    expect(matrixPosition(matrices.get("link2"))).toEqual([1, 2, 0]);
  });

  it("uses URDF roll-pitch-yaw order when accumulating child origins", () => {
    const joints: AssemblyJoint[] = [
      {
        id: "joint1",
        name: "joint1",
        type: "fixed",
        parent: "base_link",
        child: "link1",
        origin: { xyz: [0, 0, 0], rpy: [0, 0, Math.PI / 2] },
        axis: [0, 0, 1],
        limit: { lower: 0, upper: 0, effort: 0, velocity: 0 },
      },
      {
        id: "joint2",
        name: "joint2",
        type: "fixed",
        parent: "link1",
        child: "link2",
        origin: { xyz: [1, 0, 0], rpy: [0, 0, 0] },
        axis: [0, 0, 1],
        limit: { lower: 0, upper: 0, effort: 0, velocity: 0 },
      },
    ];

    const matrices = computeAssemblyLinkMatrices([baseAsset, link1Asset, link2Asset], joints);

    expectRounded(matrixPosition(matrices.get("link2"))).toEqual([0, 1, 0]);
  });

  it("matches URDF rpy order for combined roll and pitch rotations", () => {
    const joints: AssemblyJoint[] = [
      {
        id: "joint1",
        name: "joint1",
        type: "fixed",
        parent: "base_link",
        child: "link1",
        origin: { xyz: [0, 0, 0], rpy: [Math.PI, -Math.PI / 2, 0] },
        axis: [0, 0, 1],
        limit: { lower: 0, upper: 0, effort: 0, velocity: 0 },
      },
      {
        id: "joint2",
        name: "joint2",
        type: "fixed",
        parent: "link1",
        child: "link2",
        origin: { xyz: [-1, 0, 0], rpy: [0, 0, 0] },
        axis: [0, 0, 1],
        limit: { lower: 0, upper: 0, effort: 0, velocity: 0 },
      },
    ];

    const matrices = computeAssemblyLinkMatrices([baseAsset, link1Asset, link2Asset], joints);

    expectRounded(matrixPosition(matrices.get("link2"))).toEqual([0, 0, -1]);
  });
});

function matrixPosition(matrix: ReturnType<typeof computeAssemblyLinkMatrices> extends Map<string, infer T> ? T | undefined : never) {
  if (!matrix) {
    return null;
  }
  const elements = matrix.elements;
  return [elements[12], elements[13], elements[14]];
}

function expectRounded(values: number[] | null) {
  return expect(values?.map((value) => (Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12)))));
}
