"use client";

import { Bounds, Center, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { BufferGeometry, DoubleSide } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { computeAssemblyLinkMatrices, computeAssetMeshMatrix } from "@/lib/fluxweave/assembly";
import type { BrowserFluxProject, BrowserMeshAsset } from "@/lib/fluxweave/project-utils";

const VIEWPORT_CLASS = "h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50";
const SCENE_BACKGROUND = "#f8fafc";
const GRID_CELL_COLOR = "#cbd5e1";
const GRID_SECTION_COLOR = "#94a3b8";

type StlSceneProps = {
  asset: BrowserMeshAsset | null;
  mode: "assembly" | "part";
  project: BrowserFluxProject;
};

function MeshPreview({ asset }: { asset: BrowserMeshAsset }) {
  const geometry = useLoader(STLLoader, asset.objectUrl ?? "") as BufferGeometry;
  return (
    <Center>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={`rgb(${Math.round(asset.color[0] * 255)}, ${Math.round(asset.color[1] * 255)}, ${Math.round(
            asset.color[2] * 255,
          )})`}
          roughness={0.62}
          metalness={0.08}
          side={DoubleSide}
        />
      </mesh>
    </Center>
  );
}

function AssemblyPreview({ project }: { project: BrowserFluxProject }) {
  const visibleAssets = useMemo(() => project.assets.filter((item) => item.objectUrl), [project.assets]);
  const geometries = useLoader(
    STLLoader,
    visibleAssets.map((item) => item.objectUrl ?? ""),
  ) as BufferGeometry[];
  const linkMatrices = useMemo(
    () => computeAssemblyLinkMatrices(project.assets, project.joints),
    [project.assets, project.joints],
  );

  return (
    <Bounds fit clip observe margin={0.82}>
      <group>
        {visibleAssets.map((item, index) => {
          const linkMatrix = linkMatrices.get(item.linkName);
          if (!linkMatrix) {
            return null;
          }
          return (
            <mesh
              castShadow
              geometry={geometries[index]}
              key={item.id}
              matrix={computeAssetMeshMatrix(item, linkMatrix)}
              matrixAutoUpdate={false}
              receiveShadow
            >
              <meshStandardMaterial
                color={`rgb(${Math.round(item.color[0] * 255)}, ${Math.round(item.color[1] * 255)}, ${Math.round(
                  item.color[2] * 255,
                )})`}
                roughness={0.62}
                metalness={0.08}
                side={DoubleSide}
              />
            </mesh>
          );
        })}
      </group>
    </Bounds>
  );
}

export function StlScene({ asset, mode, project }: StlSceneProps) {
  const missingAssemblyMeshes = project.assets.filter((item) => !item.objectUrl);

  return (
    <div className={VIEWPORT_CLASS}>
      {mode === "assembly" ? (
        project.assets.length > 0 && missingAssemblyMeshes.length === 0 ? (
          <Canvas camera={{ position: [0.45, -0.72, 0.46], fov: 42 }} shadows>
            <color attach="background" args={[SCENE_BACKGROUND]} />
            <ambientLight intensity={0.72} />
            <directionalLight position={[4, -5, 6]} intensity={1.85} castShadow />
            <directionalLight position={[-4, 2, 3]} intensity={0.65} />
            <Suspense fallback={null}>
              <AssemblyPreview project={project} />
            </Suspense>
            <Grid
              args={[1.5, 1.5]}
              cellColor={GRID_CELL_COLOR}
              cellSize={0.05}
              fadeDistance={1.2}
              fadeStrength={1.8}
              sectionColor={GRID_SECTION_COLOR}
              sectionSize={0.25}
            />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">
            导入文件夹或绑定全部 STL 后，这里会显示整机装配预览。
          </div>
        )
      ) : asset ? (
        asset.objectUrl ? (
          <Canvas camera={{ position: [0.4, -0.65, 0.34], fov: 42 }} shadows>
            <color attach="background" args={[SCENE_BACKGROUND]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[4, -5, 6]} intensity={1.85} castShadow />
            <directionalLight position={[-4, 2, 3]} intensity={0.65} />
            <Suspense fallback={null}>
              <Bounds fit clip observe margin={1.35}>
                <MeshPreview asset={asset} />
              </Bounds>
            </Suspense>
            <Grid
              args={[1.5, 1.5]}
              cellColor={GRID_CELL_COLOR}
              cellSize={0.05}
              fadeDistance={1.2}
              fadeStrength={1.8}
              sectionColor={GRID_SECTION_COLOR}
              sectionSize={0.25}
            />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">
            项目已导入，但这个部件还没有绑定 STL 文件。
          </div>
        )
      ) : (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">
          上传 STL 后，这里会显示当前选中部件的 3D 预览。
        </div>
      )}
    </div>
  );
}
