# DeDeUrdf

DeDeUrdf 是一个纯 Next.js 的浏览器端 URDF 装配工作台，用来把一组 STL 网格整理成 URDF 项目，并导出普通 URDF ZIP 或 MuJoCo 可直接加载的 URDF ZIP。

它不依赖 Python 服务，不接数据库，也不把用户上传的 STL/JSON/ZIP 保存到服务器。文件在浏览器内存中完成解析、预览、组装和导出。

## 在线访问

Production: <https://dedeurdf.vercel.app/>

## 功能

- 批量导入 STL，并自动生成初始 `base_link -> link...` 链式结构。
- 导入项目 JSON、项目 ZIP，或直接导入包含项目文件和 STL 的文件夹。
- 兼容历史 `project.fluxweave.json` 项目格式，方便继续打开已有装配数据。
- Three.js 预览单个 STL 或整机装配结果。
- React Flow 装配节点视图，支持节点拖拽、关节连线重连和布局查看。
- 编辑 link name、visual origin、颜色。
- 编辑 joint name、type、origin、axis、limit。
- 实时预览 URDF 文本。
- 保存项目 JSON、保存可继续编辑的项目 ZIP。
- 导出普通 URDF ZIP。
- 导出 MuJoCo URDF ZIP：mesh 路径会转换为 `../meshes/*.stl`，STL 会转换成 binary STL，解压后可以用 MuJoCo 加载。

## 使用手册

完整图文教程见 [docs/USER_GUIDE.md](./docs/USER_GUIDE.md)，里面包含导入、编辑、预览、保存、导出和常见问题的局部截图。

## 本地启动

```bash
cd DeDeUrdf
nvm use
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

如果没有使用 `nvm`，请确保 Node.js 版本满足：

```text
>=22 <25
```

## 导入与导出

可导入的内容：

- `*.json`：DeDeUrdf 当前项目 JSON，或历史 `project.fluxweave.json`。
- `*.zip`：此前保存的项目 ZIP，里面通常包含项目 JSON 和 `meshes/*.stl`。
- 文件夹：选择包含项目 JSON、`meshes/`、`metadata_stl/` 等 STL 文件的项目目录。

普通 URDF ZIP 结构：

```text
robot_urdf.zip
├── project.fluxweave.json
├── urdf/
│   └── robot.urdf
└── meshes/
    └── *.stl
```

MuJoCo URDF ZIP 结构：

```text
robot_mujoco_urdf.zip
├── project.fluxweave.json
├── README.txt
├── urdf/
│   └── robot_mujoco.urdf
└── meshes/
    └── *.stl
```

MuJoCo 加载示例：

```bash
python - <<'PY'
import mujoco
model = mujoco.MjModel.from_xml_path("urdf/robot_mujoco.urdf")
print(model.nbody, model.njnt, model.ngeom)
PY
```

## 隐私边界

- STL、JSON、ZIP 文件只在浏览器内存中处理。
- 应用没有数据库、登录系统、上传 API 或服务端持久化逻辑。
- 刷新页面会丢失当前未导出的项目。
- 只有用户点击保存/导出时，浏览器才会生成下载文件。
- 部署到第三方平台时，平台可能记录普通网页访问日志，但 DeDeUrdf 本身不会把用户文件发送到应用服务器。

更多说明见 [PRIVACY.md](./PRIVACY.md)。

## 部署

Vercel 和自托管部署说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

本地 Vercel CLI 部署：

```bash
cd DeDeUrdf
npm ci
npm run build
npx vercel --prod
```

自托管核心命令：

```bash
npm ci
npm run build
npm run start
```

## 验证命令

```bash
npm test
npm run lint
npm run build
```

## 仓库结构

```text
src/app/                  Next.js App Router 页面入口
src/components/           3D 预览、装配工作台等 React 组件
src/lib/app-info.ts       DeDeUrdf 公开品牌与隐私摘要
src/lib/fluxweave/        项目格式、URDF 生成、MuJoCo ZIP 导出和装配数学
public/examples/          内置 MuJoCo RSReBot 示例项目
```

## 开发注意

- `project.fluxweave.json` 文件名会继续保留，目的是兼容已有项目和之前的导入导出结果。
- 当前 MuJoCo ZIP 包含几何和关节定义；如果要做动力学闭环控制，还需要根据真实机器人补充惯量、质量、阻尼、执行器和控制参数。
- 浏览器无法直接读取 JSON 中保存的本机绝对路径；重新打开项目时，如果 STL 没有随 ZIP 或文件夹一起导入，需要重新绑定同名 STL。
