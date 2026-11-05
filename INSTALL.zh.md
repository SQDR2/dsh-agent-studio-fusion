# 安装 Fusion

[English](INSTALL.md) · 产品介绍：[README.md](README.md)（中文）、[README.en.md](README.en.md)

需要 **DeepSeek Harness 0.2.0-rc.2 或 0.2.1-rc.2**，其他版本不支持。

> 本包是 [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion) 的 fork，包名 `@sqdr2/dsh-fusion`。
> 因为换了包名，旧的 `dsh-model-fusion` 不会被自动升级；需要按下面的步骤装一次新包，装好后数据会自动迁移。
>
> 包名和插件 id 是两件事：包名是 `@sqdr2/dsh-fusion`，插件 id（配置里 `- id:`，也是数据目录名）仍是
> `dsh-fusion`。所以升级只换安装来源，不动已有数据。

## 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @sqdr2/dsh-fusion
```

## 从 GitHub 安装

仓库里带着构建好的 `lib/`，不需要自己编译。

```sh
dsh plugin --profile web add github:SQDR2/dsh-fusion
```

`dsh` 不在 PATH 里时，指定一个受支持的 CLI：

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add @sqdr2/dsh-fusion
# 或
npx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web add @sqdr2/dsh-fusion
```

这只会写入 `web` 配置。正在运行的 Web 服务需要重新打开一次，再刷新页面。

## 从本地目录安装（开发用）

```sh
git clone https://github.com/SQDR2/dsh-fusion.git ~/github/dsh-fusion
cd ~/github/dsh-fusion && corepack pnpm@9.15.9 install --frozen-lockfile && cd -
dsh plugin --profile web add ~/github/dsh-fusion
```

## DSH Studio 桌面版

点左侧栏的 **插件** → **添加插件**，在"包名或地址"里填：

```text
@sqdr2/dsh-fusion
```

也可以填 `github:SQDR2/dsh-fusion`。装好后退出并重新打开 DSH Studio（插件在下次启动时生效）。

## 从 dsh-model-fusion 升级

1. 先卸载旧包，避免两个包同时注册 Fusion 入口：

   ```sh
   dsh plugin --profile web remove dsh-model-fusion
   ```

2. 按上面的方式安装 `@sqdr2/dsh-fusion`。**不要**先手动删除旧数据目录：
   `$DSH_HOME/plugins/dsh-model-fusion/` 里的任务、用量和设置会在首次启动时整体迁移到
   `$DSH_HOME/plugins/dsh-fusion/`。
3. 重启 DSH（桌面版退出后重开，Web 版重开服务并刷新页面）。
4. 已有的会话不用改：模型菜单里的 Fusion 选项会自动指向新的线路。

## 装好之后

1. 在 DSH 里至少登录两个模型：一个强的当 Lead，一个便宜得多的当 Sidekick。DSH 自带的模型可以用，
   [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 的订阅登录线路也可以用。
   想把 agy（Google Antigravity）当 Sidekick，另需 [dsh-agy-worker](https://github.com/SQDR2/dsh-agy-worker)，
   配置要求见 [README.md](README.md#用-agy-当-sidekickdsh-agy-worker)。
2. 打开左侧边栏的 **Fusion** 入口，选择 Lead 和 Sidekick，保存。
3. 在模型菜单里选择 **Fusion · 自动**。
4. Windows 用户需安装 PowerShell 7，并确保启动 DSH 的进程 PATH 中有 `pwsh`。Windows 支持在 v0.2.1 上于 Windows Server 2022 验证过（之后的版本只改了与平台无关的代码或打包方式，在 macOS 上复测）；Windows 10/11 尚未验证。Linux 用户正式使用前，先按 [README.md](README.md#支持范围) 里的步骤检查只读限制是否生效。

## 卸载

```sh
dsh plugin --profile web remove @sqdr2/dsh-fusion
```

桌面版在左侧栏的 **插件** 页面里卸载。Fusion 自己的记录在 `$DSH_HOME/plugins/dsh-fusion/state.sqlite`，
想一并清除就删掉这个文件。
