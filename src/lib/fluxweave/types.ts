export type Vec3 = [number, number, number];
export type Rgba = [number, number, number, number];

export type Pose = {
  xyz: Vec3;
  rpy: Vec3;
};

export type JointType = "fixed" | "revolute" | "continuous" | "prismatic";

export type MeshAsset = {
  id: string;
  fileName: string;
  linkName: string;
  meshName: string;
  visualOrigin: Pose;
  color: Rgba;
  mass?: number;
};

export type JointLimit = {
  lower: number;
  upper: number;
  effort: number;
  velocity: number;
};

export type AssemblyJoint = {
  id: string;
  name: string;
  type: JointType;
  parent: string;
  child: string;
  origin: Pose;
  axis: Vec3;
  limit: JointLimit;
};

export type FluxProject = {
  robotName: string;
  assets: MeshAsset[];
  joints: AssemblyJoint[];
};
