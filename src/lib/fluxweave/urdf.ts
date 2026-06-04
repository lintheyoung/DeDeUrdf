import type { AssemblyJoint, FluxProject, Pose, Rgba, Vec3 } from "./types";

const XML_ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPE_LOOKUP[char]);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.000000";
  }
  return value.toFixed(6);
}

function formatVec3(values: Vec3): string {
  return values.map(formatNumber).join(" ");
}

function formatRgba(values: Rgba): string {
  return values.map((value) => (Number.isFinite(value) ? value.toFixed(3) : "1.000")).join(" ");
}

function originLine(pose: Pose, indent: string): string {
  return `${indent}<origin xyz="${formatVec3(pose.xyz)}" rpy="${formatVec3(pose.rpy)}"/>`;
}

type GenerateUrdfOptions = {
  meshPathPrefix?: string;
};

function linkLines(asset: FluxProject["assets"][number], options: Required<GenerateUrdfOptions>): string[] {
  const linkName = escapeXml(asset.linkName);
  const meshName = escapeXml(asset.meshName || asset.fileName);
  const meshPath = `${options.meshPathPrefix}${meshName}`;
  const materialName = `${linkName}_mat`;
  return [
    `  <link name="${linkName}">`,
    "    <visual>",
    originLine(asset.visualOrigin, "      "),
    "      <geometry>",
    `        <mesh filename="${meshPath}"/>`,
    "      </geometry>",
    `      <material name="${materialName}">`,
    `        <color rgba="${formatRgba(asset.color)}"/>`,
    "      </material>",
    "    </visual>",
    "    <collision>",
    originLine(asset.visualOrigin, "      "),
    "      <geometry>",
    `        <mesh filename="${meshPath}"/>`,
    "      </geometry>",
    "    </collision>",
    "  </link>",
  ];
}

function jointLines(joint: AssemblyJoint): string[] {
  const lines = [
    `  <joint name="${escapeXml(joint.name)}" type="${joint.type}">`,
    `    <parent link="${escapeXml(joint.parent)}"/>`,
    `    <child link="${escapeXml(joint.child)}"/>`,
    originLine(joint.origin, "    "),
    `    <axis xyz="${formatVec3(joint.axis)}"/>`,
  ];

  if (joint.type === "revolute" || joint.type === "prismatic") {
    lines.push(
      `    <limit lower="${formatNumber(joint.limit.lower)}" upper="${formatNumber(joint.limit.upper)}" effort="${formatNumber(joint.limit.effort)}" velocity="${formatNumber(joint.limit.velocity)}"/>`,
    );
  }

  if (joint.type === "continuous") {
    lines.push(
      `    <limit effort="${formatNumber(joint.limit.effort)}" velocity="${formatNumber(joint.limit.velocity)}"/>`,
    );
  }

  lines.push("  </joint>");
  return lines;
}

export function generateUrdf(project: FluxProject, options: GenerateUrdfOptions = {}): string {
  const resolvedOptions = {
    meshPathPrefix: options.meshPathPrefix ?? "meshes/",
  };
  const robotName = escapeXml(project.robotName.trim() || "dedeurdf_robot");
  const lines = ['<?xml version="1.0"?>', `<robot name="${robotName}">`];

  for (const asset of project.assets) {
    lines.push(...linkLines(asset, resolvedOptions));
  }

  for (const joint of project.joints) {
    lines.push(...jointLines(joint));
  }

  lines.push("</robot>");
  return `${lines.join("\n")}\n`;
}
