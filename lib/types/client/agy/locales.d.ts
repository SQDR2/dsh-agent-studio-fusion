/**
 * Native DSH locale dictionaries for the Antigravity console.
 *
 * Ported from dsh-agy-worker (`src/client/locales.ts`), MIT License,
 * Copyright (c) 2026 dsh-agy-worker contributors; see docs/ATTRIBUTION-AGY.md.
 * The namespace id and every key are unchanged, so translated copy and the
 * Host-facing registrations that name the namespace keep working.
 */
export declare const NS = "agy-worker";
/** Simplified Chinese is preserved as the original UI language and key source. */
export declare const zh: {
    readonly 'section.label': "Antigravity";
    readonly 'code.title': "代码";
    readonly 'code.inspect': "检查";
    readonly 'tv.command': "命令";
    readonly 'tv.write': "写入";
    readonly 'tv.edit': "编辑";
    readonly 'tv.read': "读取";
    readonly 'tv.search': "搜索";
    readonly 'tv.webSearch': "网页搜索";
    readonly 'tv.list': "列表";
    readonly 'tv.delete': "删除";
    readonly 'tv.tool': "工具";
    readonly 'tv.noOutput': "(无输出)";
    readonly 'tv.noMatches': "(无匹配)";
    readonly 'tv.noChanges': "(无文本变更)";
    readonly 'tv.emptyDir': "(空目录)";
    readonly 'tv.noDetail': "(无详情)";
    readonly 'tv.hint.expandInspect': "点击展开 · 右键检查";
    readonly 'tv.hint.collapseInspect': "点击收起 · 右键检查";
    readonly 'tv.hint.expand': "点击展开";
    readonly 'tv.hint.collapse': "点击收起";
    readonly 'tv.diffMore': "… 其余 {count} 行未渲染";
    readonly 'code.copy': "复制";
    readonly 'code.copied': "已复制";
    readonly 'console.title': "Antigravity 管理控制台";
    readonly 'status.ready': "就绪";
    readonly 'status.needsAuth': "待认证";
    readonly 'status.loading': "正在加载 Antigravity 状态...";
    readonly 'status.authRequired': "需重新登录";
    readonly 'account.setActive': "设为当前使用";
    readonly 'account.settingActive': "切换中";
    readonly 'account.activeSet': "已切换当前使用账号";
    readonly 'account.activeSetFailed': "该账号当前不可用（冷却或需重新登录）";
    readonly 'status.proxy': "代理";
    readonly 'status.inUse': "当前使用";
    readonly 'account.add': "添加 Google 账号";
    readonly 'account.aliasDefault': "备用 Google 账号 {number}";
    readonly 'account.defaultAlias': "主账号（系统登录）";
    readonly 'account.proxyPlaceholder': "专属代理 URL（如 http://127.0.0.1:7890，留空则继承全局）";
    readonly 'account.aliasPlaceholder': "账号别名（例如：备用账号 2）";
    readonly 'account.removeTitle': "移除此账号";
    readonly 'aria.aliasInput': "账号别名";
    readonly 'aria.proxyInput': "专属代理 URL";
    readonly 'aria.authCodeInput': "授权码或回调 URL";
    readonly 'aria.closeToast': "关闭提示";
    readonly 'account.details': "明细";
    readonly 'account.collapse': "收起";
    readonly 'account.expandOthers': "展开查看 Claude & GPT-OSS 模型额度";
    readonly 'account.collapseOthers': "收起 Claude & GPT-OSS 模型额度";
    readonly 'account.otherModels': "Claude / GPT 额度";
    readonly 'account.sync': "同步";
    readonly 'account.syncing': "同步中";
    readonly 'account.syncTitle': "刷新此账号（换号后立即同步 email / 额度 / 模型）";
    readonly 'account.models': "单模型明细：";
    readonly 'account.cooldown': "部分模型限流中，已自动切换账号";
    readonly 'account.clearCooldown': "清除冷却";
    readonly 'account.localCooldown': " · 本地冷却中";
    readonly 'account.removed': "已移除账号：{alias}";
    readonly 'quota.fiveHour': "5 小时额度";
    readonly 'quota.weekly': "周额度";
    readonly 'quota.refreshed': "额度已刷新";
    readonly 'quota.windowReset': "已重置 · 可用";
    readonly 'proxy.button': "代理";
    readonly 'proxy.placeholder': "专属代理 URL（如：http://127.0.0.1:7890；留空则使用全局）";
    readonly 'proxy.save': "保存";
    readonly 'proxy.saved': "代理已保存";
    readonly cancel: "取消";
    readonly 'auth.openBrowser': "打开浏览器登录";
    readonly 'auth.openingBrowser': "正在打开浏览器...";
    readonly 'auth.browserOpened': "浏览器已打开 Google 授权页，完成授权后将自动同步";
    readonly 'auth.browserManual': "无法自动打开浏览器，请点击下方链接手动完成授权";
    readonly 'auth.startFailed': "无法启动 Google 授权。请检查网络或代理配置。";
    readonly 'auth.networkHint': "请检查网络或代理配置";
    readonly 'auth.activated': "账号已激活入池";
    readonly 'auth.failed': "授权失败";
    readonly 'auth.added': "成功添加并激活 Google 账号";
    readonly 'auth.codeFailed': "授权码验证失败";
    readonly 'auth.exchanging': "正在验证授权并激活账号，请稍候...";
    readonly 'auth.waiting': "等待浏览器中完成 Google 授权，成功后将自动激活。";
    readonly 'auth.openManual': "若浏览器未打开，请点击此处手动打开 Google 登录页";
    readonly 'auth.pasteHint': "未完成自动回调时，可粘贴授权码或回调 URL：";
    readonly 'auth.codePlaceholder': "授权码或 http://localhost:51121/oauth-callback?code=... 完整链接";
    readonly 'auth.activate': "手动激活";
    readonly 'auth.activating': "验证激活中...";
    readonly 'auth.code.browser_manual': "无法自动打开浏览器，请使用下方链接手动授权。";
    readonly 'auth.code.callback_failed': "授权回调失败。请重新开始授权。";
    readonly 'auth.code.no_active_flow': "当前没有进行中的授权流程。";
    readonly 'auth.code.invalid_code': "无法识别授权码。请粘贴授权码或完整回调 URL。";
    readonly 'auth.code.invalid_state': "授权链接不属于当前流程或已过期。请重新开始授权。";
    readonly 'auth.code.exchange_failed': "授权验证失败。请重新开始授权。";
    readonly 'auth.code.primary_activated': "主账号已登录。";
    readonly 'auth.code.account_activated': "账号已添加并激活。";
    readonly 'auth.code.missing_code': "请输入授权码。";
    readonly 'auth.code.request_failed': "请求未完成。请重试。";
    readonly 'api.genericError': "操作未完成。请重试。";
    readonly 'duration.day': "天";
    readonly 'duration.hour': "小时";
    readonly 'duration.minute': "分钟";
    readonly 'permission.label': "权限模式：";
    readonly 'permission.plan': "plan（只读）";
    readonly 'permission.acceptEdits': "accept-edits（改代码）";
    readonly 'permission.skip': "skip（自动批准；AGY 内部保护仍生效）";
    readonly 'effort.label': "思考强度：";
    readonly 'effort.auto': "auto";
    readonly 'effort.low': "low";
    readonly 'effort.medium': "medium";
    readonly 'effort.high': "high";
    readonly 'pool.label': "号池调度：";
    readonly 'pool.sequential': "顺次耗尽";
    readonly 'pool.roundRobin': "轮询均衡";
    readonly 'models.label': "模型显示：";
    readonly 'models.empty': "模型目录还没有可用模型，发一次对话或点“刷新额度”后再来管理";
    readonly 'models.hint': "点击切换显示/隐藏；关闭的模型不在模型选择器中列出，进行中的会话不受影响。";
    readonly 'header.refreshQuota': "刷新额度";
    readonly 'header.refreshing': "刷新中";
    readonly 'console.close': "关闭（Esc）";
    readonly 'header.badgeTitle': "Antigravity：{count} 个账号已就绪 · 点击打开控制台";
    readonly 'header.badgeLoading': "Antigravity · 点击打开控制台";
    readonly 'account.type.agy': "Google Antigravity (CLI / OAuth)";
    readonly 'account.loginType': "登录方式：";
    readonly 'account.dragHandle': "拖拽调整优先级";
    readonly 'account.moveUp': "上移优先级";
    readonly 'account.moveDown': "下移优先级";
    readonly 'account.reordered': "账号优先级顺序已更新";
    readonly 'account.collapseAll': "全部折叠";
    readonly 'account.expandAll': "全部展开";
    readonly 'account.cardCollapse': "收起详情";
    readonly 'account.cardExpand': "展开详情";
    readonly 'account.draggingTarget': "放置至此成为优先级 #{num}";
    readonly 'account.dragBanner': "正在调整优先级：将【{alias}】移动至 #{num}";
    readonly 'account.dragHint': "拖拽卡片可实时调整调度优先级";
    readonly 'account.enable': "启用";
    readonly 'account.disable': "停用";
    readonly 'account.enableTitle': "启用此账号（加入自动切号与调度）";
    readonly 'account.disableTitle': "停用此账号（切号与调度时跳过）";
    readonly 'account.enabledToast': "已启用账号：{alias}";
    readonly 'account.disabledToast': "已停用账号：{alias}";
    readonly 'status.disabled': "已停用";
    readonly 'header.warmup': "一键预热";
    readonly 'header.warmingUp': "预热中";
    readonly 'account.warmup': "预热";
    readonly 'account.warmingUp': "预热中";
    readonly 'account.warmupTitle': "预热该账号（向 Google 发送极小探活请求，提前激活 7 天周配额计时器）";
    readonly 'warmup.success': "账号预热成功";
    readonly 'warmup.allSuccess': "一键预热任务已完成";
    readonly 'warmup.skipped': "当前账号或模型处于冷却中，无需预热";
    readonly 'config.autoWarmup': "7天周配额自动预热";
    readonly 'config.autoWarmupDesc': "周配额到达重置时间或冷启动时自动唤醒 1 次启动新周期";
};
export type AgyLocaleKey = keyof typeof zh;
export type AgyDictionary = Record<AgyLocaleKey, string>;
export declare const en: AgyDictionary;
export declare const ptBR: AgyDictionary;
export declare const es: AgyDictionary;
/**
 * The namespace this dictionary owns, merged into the Host's locale map so the
 * keyed tool views can seat `t` and so a missing/extra key is a type error.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'agy-worker': AgyLocaleKey;
    }
}
