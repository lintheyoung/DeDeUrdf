import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import type { AssemblyJoint, MeshAsset, Pose } from "./types";

export function poseToMatrix(pose: Pose): Matrix4 {
  const matrix = new Matrix4();
  matrix.compose(
    new Vector3(...pose.xyz),
    new Quaternion().setFromEuler(new Euler(pose.rpy[0], pose.rpy[1], pose.rpy[2], "ZYX")),
    new Vector3(1, 1, 1),
  );
  return matrix;
}

export function computeAssemblyLinkMatrices(assets: MeshAsset[], joints: AssemblyJoint[]): Map<string, Matrix4> {
  const matrices = new Map<string, Matrix4>();
  const assetLinks = new Set(assets.map((asset) => asset.linkName));
  const childLinks = new Set(joints.map((joint) => joint.child));
  const roots = assets.filter((asset) => !childLinks.has(asset.linkName));

  for (const root of roots.length > 0 ? roots : assets.slice(0, 1)) {
    matrices.set(root.linkName, new Matrix4());
  }

  const pending = [...joints];
  let progressed = true;
  while (pending.length > 0 && progressed) {
    progressed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const joint = pending[index];
      const parentMatrix = matrices.get(joint.parent);
      if (!parentMatrix || !assetLinks.has(joint.child)) {
        continue;
      }
      matrices.set(joint.child, parentMatrix.clone().multiply(poseToMatrix(joint.origin)));
      pending.splice(index, 1);
      progressed = true;
    }
  }

  for (const asset of assets) {
    if (!matrices.has(asset.linkName)) {
      matrices.set(asset.linkName, new Matrix4());
    }
  }

  return matrices;
}

export function computeAssetMeshMatrix(asset: MeshAsset, linkMatrix: Matrix4): Matrix4 {
  return linkMatrix.clone().multiply(poseToMatrix(asset.visualOrigin));
}
