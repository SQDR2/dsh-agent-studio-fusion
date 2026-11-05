# 发版

[English](RELEASING.md) · [安装](INSTALL.zh.md) · [README](README.md)

维护者用。普通用户不需要看这一页。

`@sqdr2/dsh-fusion` 由 GitHub Actions 通过 OIDC 发到 npm，任何地方都不存在长期 token。本页说明让它跑起来的一次性配置，以及之后每一版的流程。

## 什么会触发发布

只有两种事件：

| 事件 | 结果 |
| --- | --- |
| 推送匹配 `v*` 的 tag | 构建、测试、发布 |
| `workflow_dispatch` | 同上；`dry_run=true` 在发布前停下 |

**往 `main` 推永远不会发布。** 合一个 PR、改一处文档、或者把版本号改好放在 `main` 上，在有 tag 之前都不会影响 npm。

workflow 会跳过 npm 上已存在的版本，所以同一个 tag 重跑是安全的：重新构建、重新测试，然后不碰 registry 直接退出。

## 一次性配置

两步本仓库都已完成。之所以记在这里，是因为 fork 后改名要重做一遍，而且信任配置配错时的失败现象很像「workflow 坏了」。

### 1. 启用 Actions

本仓库是 fork，GitHub 默认禁用 fork 的 Actions。这一步不做，推 tag 会被静默忽略：不建运行、不报错，Actions 页面显示 `0 workflow runs`。

打开 **Actions** 标签页，接受 “I understand my workflows, go ahead and enable them” 提示。

### 2. 在 npm 上加信任配置

OIDC 发布是按包授权的，配置在包自己的设置页上，而一个从未发布过的包名没有这个页面。所以某个包名的第一版只能手发：

1. 用一个勾了 2FA bypass 的 granular token 手动发一次（`bypass_2fa: true`，`package: write`，作用域要对）。
   不勾 bypass 会被拒：`E403 Two-factor authentication ... is required to publish packages`；
   而作用域是 `@sqdr2` 的 token 根本无法发布无 scope 的包名。
2. 在 **npmjs.com → 该包 → Settings → Trusted publishing** 添加：

   | 字段 | 值 |
   | --- | --- |
   | Provider | GitHub Actions |
   | Repository | `SQDR2/dsh-fusion` |
   | Workflow | `publish.yml` |
   | Permission | allow npm publish |

   **账号自己得先有 2FA。** 包页面上只会写一句 “2FA has been enabled for this package. It is recommended that you
   configure 2FA for your npm account”，而提交表单会跳到 `/settings/<user>/tfa` 要求录入安全密钥或认证器。
   动手之前先把账号级 2FA 配好，否则表单会静默变成 2FA 注册页，什么都不会创建。

3. 在 **2 天内**发一个版本。新的信任配置只有首次成功发布才算验证通过；未验证的会过期，
   之后不能编辑，只能删掉重建。

信任配置验证通过后，建议在包上开 **Settings → Publishing access → Require two-factor authentication and disallow tokens**。
此后 token 不能再发布，只有 workflow 能发。

npm CLI 建不了信任配置：`npm trust github` 需要交互式 2FA 凭据，而 API 会拒绝 bypass 2FA 的 token，
返回 `Granular access tokens that bypass two-factor authentication may not perform this action`。
这一步在设计上只能走浏览器。

## 发一版

版本号的唯一真源是 `package.json`。tag 必须与它完全一致，否则 workflow 会在第一步退出。

```sh
# 1. 改 package.json 里的版本号（别处不要改），并在 CHANGELOG.md 顶部加一条。
#    这一节就是 GitHub Release 的正文。
# 2. 重建 lib/ —— 它纳入版本库并随包发布，lib/ 陈旧等于发布了
#    与 tag 源码不一致的代码。
DSHX_HARNESS=/path/to/deepseek-harness-0.2.0-rc.2 pnpm build
pnpm typecheck && pnpm test
# 3. 源码、重建后的 lib/ 和 CHANGELOG.md 一起提交。
git add -A && git commit -m "chore(release): 0.3.1"
# 4. 打 tag 并一起推。
git tag v0.3.1 && git push origin main v0.3.1
```

workflow 随后依次执行 `pnpm install`、`pnpm build`、`pnpm test`，在 tag 上再执行 `npm publish --access public`。
发布出来的版本还带 provenance 证明，可以用 `npm view` 追溯它是从哪个 commit 构建的。

发布说明只有 [`CHANGELOG.md`](CHANGELOG.md) 一处。不要再每个版本加一个 `RELEASE-*.md`：
一堆无人引用、名字几乎相同的文件，几个版本之后就没法读了；同一个版本的内容应该按版本标题归在这一个文件里。
它只列以 `@sqdr2/dsh-fusion` 名义发过的版本；上游 `dsh-model-fusion` 的历史留在上游仓库。

### 构建被钉死的两处

`scripts/build.mjs` 只接受 `engines.dsh` 里列出的 Host 版本（`0.2.0-rc.2` 和 `0.2.1-rc.2`），其余直接报错。
CI 因此 checkout `dsh-v0.2.0-rc.2`。

workflow 里的打包器版本精确钉在 `tsdown@0.22.2`。`lib/` 是提交进仓库的，换个打包器就会提交一份与测试结果不一致的产物；
比如 `0.22.14` 会重写几百行格式。

## 检查一次发布

```sh
npm view @sqdr2/dsh-fusion version dist-tags
npm view @sqdr2/dsh-fusion@0.3.0 dist.attestations   # 有值说明出自 CI
```

想验证产物本身而不是元数据：

```sh
npm install @sqdr2/dsh-fusion@0.3.0
node -e "import('@sqdr2/dsh-fusion').then(m => console.log(m.name, m.inject.length))"
grep -o 'id: "[^"]*"' node_modules/@sqdr2/dsh-fusion/lib/client.js | head -1
```

宿主 bundle 必须导出 `dsh-fusion`，客户端 bundle 的注册 id 必须是包名 `@sqdr2/dsh-fusion`。
两者不同是刻意的：原因见 [INSTALL.zh.md](INSTALL.zh.md)，实现见 `src/identity.ts`。

## 发布失败时

| 现象 | 原因 |
| --- | --- |
| 推了 tag，`0 workflow runs` | fork 上没有启用 Actions |
| `npm publish` 报 `404` 或 `ENEEDAUTH` | npm 上没有信任配置，或它过期未验证 |
| `tag vX != package.json Y` | 版本号只改了一处 |
| `Unsupported Host package version` | `HARNESS_REF` 与 `engines.dsh` 不一致 |
| 重建后的 bundle 与已提交的 `lib/` 不同 | 打包器没钉在 `0.22.2` |
