import { bindFilesToImportedProject, importSerializableProject, type BrowserFluxProject } from "./project-utils";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const MUJOCO_EXAMPLE = {
  label: "MuJoCo RSReBot",
  projectUrl: "/examples/rsrebot-mujoco/RSReBot_fluxweave_dm_project.json",
  meshBaseUrl: "/examples/rsrebot-mujoco/metadata_stl",
  meshNames: ["base.stl", "link1.stl", "link2.stl", "link3.stl", "link4.stl", "link5.stl", "link6.stl", "end.stl"],
} as const;

export async function loadMujocoExampleProject(fetcher: FetchLike = fetch): Promise<BrowserFluxProject> {
  const projectResponse = await fetcher(MUJOCO_EXAMPLE.projectUrl);
  if (!projectResponse.ok) {
    throw new Error(`示例项目 JSON 加载失败：${projectResponse.status}`);
  }

  const project = importSerializableProject(await projectResponse.json());
  const files = await Promise.all(
    MUJOCO_EXAMPLE.meshNames.map(async (meshName) => {
      const meshResponse = await fetcher(`${MUJOCO_EXAMPLE.meshBaseUrl}/${meshName}`);
      if (!meshResponse.ok) {
        throw new Error(`示例 STL 加载失败：${meshName}`);
      }
      return new File([await meshResponse.blob()], meshName, { type: "model/stl" });
    }),
  );

  return bindFilesToImportedProject(project, files);
}
