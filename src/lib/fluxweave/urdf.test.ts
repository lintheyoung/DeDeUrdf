import { describe, expect, it } from "vitest";

import { generateUrdf } from "./urdf";
import type { FluxProject } from "./types";

describe("generateUrdf", () => {
  it("exports links, mesh references, joint origins, axes, and limits", () => {
    const project: FluxProject = {
      robotName: "rsrebot_demo",
      assets: [
        {
          id: "base",
          fileName: "base.stl",
          linkName: "base_link",
          meshName: "base.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [0.8, 0.8, 0.8, 1],
          mass: 1,
        },
        {
          id: "link1",
          fileName: "link1.stl",
          linkName: "link1",
          meshName: "link1.stl",
          visualOrigin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
          color: [0.4, 0.6, 0.9, 1],
          mass: 0.5,
        },
      ],
      joints: [
        {
          id: "joint1",
          name: "joint1",
          type: "revolute",
          parent: "base_link",
          child: "link1",
          origin: { xyz: [0, 0, 0.085], rpy: [0, 0, 0] },
          axis: [0, 0, 1],
          limit: {
            lower: -2.8,
            upper: 2.8,
            effort: 27,
            velocity: 50,
          },
        },
      ],
    };

    const xml = generateUrdf(project);

    expect(xml).toContain('<robot name="rsrebot_demo">');
    expect(xml).toContain('<link name="base_link">');
    expect(xml).toContain('<mesh filename="meshes/base.stl"/>');
    expect(xml).toContain('<joint name="joint1" type="revolute">');
    expect(xml).toContain('<parent link="base_link"/>');
    expect(xml).toContain('<child link="link1"/>');
    expect(xml).toContain('<origin xyz="0.000000 0.000000 0.085000" rpy="0.000000 0.000000 0.000000"/>');
    expect(xml).toContain('<axis xyz="0.000000 0.000000 1.000000"/>');
    expect(xml).toContain('<limit lower="-2.800000" upper="2.800000" effort="27.000000" velocity="50.000000"/>');
  });
});
