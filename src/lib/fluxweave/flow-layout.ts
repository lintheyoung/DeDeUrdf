import type { NodeChange, XYPosition } from "@xyflow/react";

import type { AssemblyJoint, MeshAsset } from "./types";

export type FlowNodePositions = Record<string, XYPosition>;

export function defaultFlowNodePosition(index: number): XYPosition {
  return {
    x: index * 230,
    y: index % 2 === 0 ? 20 : 140,
  };
}

export function applyFlowNodePositionChanges(current: FlowNodePositions, changes: NodeChange[]): FlowNodePositions {
  let next = current;
  for (const change of changes) {
    if (change.type !== "position" || !change.position) {
      continue;
    }
    if (next === current) {
      next = { ...current };
    }
    next[change.id] = { x: change.position.x, y: change.position.y };
  }
  return next;
}

export function reconnectAssemblyJoint(
  joints: AssemblyJoint[],
  assets: MeshAsset[],
  jointId: string,
  sourceAssetId?: string | null,
  targetAssetId?: string | null,
): AssemblyJoint[] {
  if (!sourceAssetId || !targetAssetId || sourceAssetId === targetAssetId) {
    return joints;
  }

  const parentAsset = assets.find((asset) => asset.id === sourceAssetId);
  const childAsset = assets.find((asset) => asset.id === targetAssetId);
  const existingJoint = joints.find((joint) => joint.id === jointId);

  if (!parentAsset || !childAsset || !existingJoint) {
    return joints;
  }

  const parent = parentAsset.linkName;
  const child = childAsset.linkName;

  if (joints.some((joint) => joint.id !== jointId && joint.child === child)) {
    return joints;
  }

  if (wouldCreateCycle(joints, jointId, parent, child)) {
    return joints;
  }

  if (existingJoint.parent === parent && existingJoint.child === child) {
    return joints;
  }

  return joints.map((joint) => (joint.id === jointId ? { ...joint, parent, child } : joint));
}

function wouldCreateCycle(joints: AssemblyJoint[], replacedJointId: string, parent: string, child: string) {
  const childrenByParent = new Map<string, string[]>();

  for (const joint of joints) {
    if (joint.id === replacedJointId) {
      continue;
    }
    const children = childrenByParent.get(joint.parent) ?? [];
    children.push(joint.child);
    childrenByParent.set(joint.parent, children);
  }

  const stack = [child];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const link = stack.pop();
    if (!link || visited.has(link)) {
      continue;
    }
    if (link === parent) {
      return true;
    }
    visited.add(link);
    stack.push(...(childrenByParent.get(link) ?? []));
  }

  return false;
}
