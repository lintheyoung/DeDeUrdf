import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMujocoExampleProject, MUJOCO_EXAMPLE } from "./mujoco-example";

describe("MuJoCo example loader", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    });
  });

  it("loads the MuJoCo RSReBot example project and binds its STL files", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path === MUJOCO_EXAMPLE.projectUrl) {
        return Response.json({
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
        });
      }

      const meshName = MUJOCO_EXAMPLE.meshNames.find((item) => path.endsWith(`/${item}`));
      if (meshName) {
        return new Response(new Blob([`solid ${meshName}\nendsolid ${meshName}\n`], { type: "model/stl" }));
      }

      return new Response("not found", { status: 404 });
    });

    const project = await loadMujocoExampleProject(fetcher);

    expect(project.robotName).toBe("RSReBot_fluxweave_dm");
    expect(project.assets.map((asset) => asset.file?.name)).toEqual(["base.stl", "link1.stl"]);
    expect(project.assets.map((asset) => asset.objectUrl)).toEqual(["blob:base.stl", "blob:link1.stl"]);
    expect(project.joints[0]).toMatchObject({
      name: "joint1",
      parent: "base_link",
      child: "link1",
    });
  });

  it("keeps the bundled MuJoCo joint1 height aligned with the measured CAD value", async () => {
    const json = JSON.parse(
      await readFile(
        new URL("../../../public/examples/rsrebot-mujoco/RSReBot_fluxweave_dm_project.json", import.meta.url),
        "utf8",
      ),
    );

    const joint1 = json.graph.nodes.find((node: { uid?: string }) => node.uid === "conn_joint1");

    expect(joint1.parent_local_xyz).toEqual([-0.00008416, 0, 0.0868]);
  });
});
