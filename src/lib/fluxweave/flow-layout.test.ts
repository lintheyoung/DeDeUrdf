import { describe, expect, it } from "vitest";

import { applyFlowNodePositionChanges, defaultFlowNodePosition, reconnectAssemblyJoint } from "./flow-layout";
import type { AssemblyJoint, MeshAsset } from "./types";

const zeroPose = { xyz: [0, 0, 0], rpy: [0, 0, 0] } as const;
const defaultLimit = { lower: -1, upper: 1, effort: 1, velocity: 1 };

function asset(id: string, linkName: string): MeshAsset {
  return {
    id,
    fileName: `${linkName}.stl`,
    linkName,
    meshName: `${linkName}.stl`,
    visualOrigin: { xyz: [...zeroPose.xyz], rpy: [...zeroPose.rpy] },
    color: [1, 1, 1, 1],
  };
}

function joint(id: string, parent: string, child: string): AssemblyJoint {
  return {
    id,
    name: id,
    type: "revolute",
    parent,
    child,
    origin: { xyz: [...zeroPose.xyz], rpy: [...zeroPose.rpy] },
    axis: [0, 0, 1],
    limit: defaultLimit,
  };
}

describe("flow layout", () => {
  it("creates the existing staggered default positions", () => {
    expect(defaultFlowNodePosition(0)).toEqual({ x: 0, y: 20 });
    expect(defaultFlowNodePosition(1)).toEqual({ x: 230, y: 140 });
    expect(defaultFlowNodePosition(2)).toEqual({ x: 460, y: 20 });
  });

  it("stores dragged node positions while preserving other positions", () => {
    const positions = applyFlowNodePositionChanges(
      {
        base: { x: 0, y: 20 },
      },
      [
        { id: "base", type: "position", position: { x: 18, y: 42 } },
        { id: "link1", type: "position", position: { x: 245, y: 160 } },
        { id: "ignored", type: "select", selected: true },
      ],
    );

    expect(positions).toEqual({
      base: { x: 18, y: 42 },
      link1: { x: 245, y: 160 },
    });
  });

  it("reconnects a joint from graph asset ids to URDF link names", () => {
    const assets = [asset("asset-base", "base_link"), asset("asset-link1", "link1"), asset("asset-link2", "link2")];
    const joints = [joint("joint1", "base_link", "link1")];

    const next = reconnectAssemblyJoint(joints, assets, "joint1", "asset-link1", "asset-link2");

    expect(next).not.toBe(joints);
    expect(next[0]).toMatchObject({
      parent: "link1",
      child: "link2",
    });
  });

  it("rejects reconnects that would give one child link two parent joints", () => {
    const assets = [asset("asset-base", "base_link"), asset("asset-link1", "link1"), asset("asset-link2", "link2")];
    const joints = [joint("joint1", "base_link", "link1"), joint("joint2", "link1", "link2")];

    const next = reconnectAssemblyJoint(joints, assets, "joint1", "asset-base", "asset-link2");

    expect(next).toBe(joints);
  });

  it("rejects self-reconnects", () => {
    const assets = [asset("asset-base", "base_link"), asset("asset-link1", "link1")];
    const joints = [joint("joint1", "base_link", "link1")];

    const next = reconnectAssemblyJoint(joints, assets, "joint1", "asset-link1", "asset-link1");

    expect(next).toBe(joints);
  });
});
