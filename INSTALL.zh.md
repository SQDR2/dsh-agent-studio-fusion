# 安装 DSH Agent Studio

[English](INSTALL.md) · 产品介绍：[README.md](README.md)（中文）、[README.en.md](README.en.md)

需要 **DeepSeek Harness `>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.2 <0.3.0-0`**，并需要 **Node 24 或更新版本**。其他版本不支持；0.2.0 系列已不再支持。

> 包名 `@sqdr2/dsh-agent-studio-fusion`，插件 id 为 `dsh-agent-studio-fusion`。
> 旧的 `dsh-fusion` 或 `dsh-model-fusion` 数据会在首次启动时自动迁移。

## 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

## 从 GitHub 安装

仓库里带着构建好的 `lib/`，不需要自己编译。

```sh
dsh plugin --profile web add github:SQDR2/dsh-agent-studio-fusion
```

`dsh` 不在 PATH 里时，指定一个受支持的 CLI：

```sh
npx @deepseek-ai/dsh@0.2.1-rc.5 plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

这只会写入 `web` 配置。正在运行的 Web 服务需要重新打开一次，再刷新页面。

## 从本地目录安装（开发用）

```sh
git clone https://github.com/SQDR2/dsh-agent-studio-fusion.git ~/github/dsh-agent-studio-fusion
cd ~/github/dsh-agent-studio-fusion && corepack pnpm@9.15.9 install --frozen-lockfile && cd -
dsh plugin --profile web add ~/github/dsh-agent-studio-fusion
```

## DSH Studio 桌面版

点左侧栏的 **插件** → **添加插件**，在"包名或地址"里填：

```text
@sqdr2/dsh-agent-studio-fusion
```

也可以填 `github:SQDR2/dsh-agent-studio-fusion`。装好后退出并重新打开 DSH Studio（插件在下次启动时生效）。

## 从旧版本迁移

1. 先卸载旧包，避免多个包同时注册插件入口：

   ```sh
   dsh plugin --profile web remove @sqdr2/dsh-fusion
   dsh plugin --profile web remove dsh-model-fusion
   ```

2. 按上面的方式安装 `@sqdr2/dsh-agent-studio-fusion`。**不要**先手动删除旧数据目录：
   `$DSH_HOME/plugins/dsh-fusion/` 或 `dsh-model-fusion/` 里的任务、用量和设置会在首次启动时整体迁移到
   `$DSH_HOME/plugins/dsh-agent-studio-fusion/`。
3. 如果之前单独装过 `dsh-agy-worker`，也予以卸载（功能已完全内置）：
   ```sh
   dsh plugin --profile web remove @sqdr2/dsh-agy-worker
   ```
4. 重启 DSH（桌面版退出后重开，Web 版重开服务并刷新页面）。
5. 已有的会话不用改：模型菜单里的选项会自动兼容指向新的线路。

## 卸载

```sh
dsh plugin --profile web remove @sqdr2/dsh-agent-studio-fusion
```
