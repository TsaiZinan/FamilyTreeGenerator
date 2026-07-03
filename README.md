# FamilyTreeGenerator

一个基于 React + TypeScript + Vite 的族谱网页编辑器，用于在浏览器中维护家族关系、编辑人物信息，并导出整张族谱图片。

## 功能

- 添加人物、伴侣、子辈
- 直接在卡片内编辑姓名、生辰日期、头像
- 拖动调整同组配偶或同一家子辈的顺序
- 自动保存到浏览器本地
- 导入文件、导出文件
- 导出整张族谱图片
- 默认居中显示整张族谱画布
- GitHub Pages 自动部署

## 技术栈

- React
- TypeScript
- Vite
- html-to-image

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

## 项目结构

```text
.
├─ src/
│  ├─ App.tsx
│  ├─ index.css
│  └─ main.tsx
├─ .github/workflows/deploy.yml
├─ index.html
├─ package.json
└─ vite.config.ts
```

## GitHub Pages 部署

项目已经包含 GitHub Pages 工作流：

- 工作流文件：`.github/workflows/deploy.yml`
- 仓库地址：`https://github.com/TsaiZinan/FamilyTreeGenerator`
- 目标地址：`https://tsaizinan.github.io/FamilyTreeGenerator/`

首次启用 GitHub Pages 时，需要在 GitHub 仓库里手动做一次设置：

1. 打开仓库 `Settings`
2. 进入 `Pages`
3. 在 `Build and deployment` 下把 `Source` 改成 `GitHub Actions`
4. 保存后重新运行一次工作流，或再推送一次提交

这是因为 GitHub 在仓库还没有启用 Pages 时，`actions/configure-pages` 会先查询 Pages 站点；如果仓库从未启用过，会返回 `404 Not Found`。

## 部署故障排查

如果 Actions 里看到下面这类错误：

```text
Get Pages site failed. Please verify that the repository has Pages enabled
and configured to build using GitHub Actions
```

通常说明不是构建失败，而是仓库还没有启用 GitHub Pages。按上面的 `Settings -> Pages -> Source -> GitHub Actions` 设置一次即可。

如果工作流已经成功，但页面还是 `404`：

- 等待 1 到 5 分钟让 GitHub Pages 生效
- 确认访问地址是 `https://tsaizinan.github.io/FamilyTreeGenerator/`
- 确认仓库名和 `vite.config.ts` 中的 `base` 一致

## 隐私说明

仓库默认只提交网站源码与部署配置，不提交本地图片、PDF、Excel 或其他个人资料文件。
