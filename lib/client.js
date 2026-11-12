window.__ModuleLoader__.load({
	id: "@sqdr2/dsh-fusion",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  FUSION_PANEL_ID: () => FUSION_PANEL_ID,
  FusionPanelIcon: () => FusionPanelIcon,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/acp-import.ts
var import_react = require("react");
var IMPORTED_KEYS = ["displayName", "command", "args", "env"];
var LIST_KEYS = ["agent_servers", "agentServers", "agents"];
var ROUTE_PATTERN = /^[a-z0-9][\w.-]*$/i;
function objectOf(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function routeOf(name2) {
  return name2.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-._]+|[-._]+$/g, "");
}
function serversOf(document2) {
  for (const key2 of LIST_KEYS) {
    const list = objectOf(document2[key2]);
    if (list !== void 0) {
      return { servers: list, routed: key2 === "agents" };
    }
  }
  return { servers: document2, routed: false };
}
function entryOf(name2, value) {
  const server = objectOf(value);
  const command = server?.command;
  if (server === void 0 || typeof command !== "string" || command.trim().length === 0) {
    return { ok: false, reason: "importMissingCommand" };
  }
  const args = server.args ?? [];
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
    return { ok: false, reason: "importBadArgs" };
  }
  const env = server.env ?? {};
  const envObject = objectOf(env);
  if (envObject === void 0 || !Object.values(envObject).every((item) => typeof item === "string")) {
    return { ok: false, reason: "importBadEnv" };
  }
  const displayName = typeof server.displayName === "string" ? server.displayName : name2;
  return {
    ok: true,
    command: command.trim(),
    args,
    env: envObject,
    displayName
  };
}
function existingRoutesOf(existing) {
  const map = /* @__PURE__ */ new Map();
  if (!existing) return map;
  if (Array.isArray(existing)) {
    for (const item of existing) {
      if (item && typeof item === "object" && "route" in item && typeof item.route === "string") {
        const raw = objectOf(item.user);
        const resolved = objectOf(item.profile) ?? (raw ? void 0 : objectOf(item));
        map.set(item.route, { raw, resolved });
      }
    }
    return map;
  }
  if (existing instanceof Map) {
    for (const [route, item] of existing.entries()) {
      if (typeof route === "string") {
        const raw = objectOf(item?.user);
        const resolved = objectOf(item?.profile) ?? (raw ? void 0 : objectOf(item));
        map.set(route, { raw, resolved });
      }
    }
    return map;
  }
  if (typeof existing === "object" && ("value" in existing || "user" in existing)) {
    const valObj = objectOf(existing.value);
    const userObj = objectOf(existing.user);
    const valAgents = objectOf(valObj?.acp?.agents) ?? objectOf(valObj?.agents) ?? {};
    const userAgents = objectOf(userObj?.acp?.agents) ?? objectOf(userObj?.agents) ?? {};
    const routes = /* @__PURE__ */ new Set([...Object.keys(valAgents), ...Object.keys(userAgents)]);
    for (const route of routes) {
      const raw = objectOf(userAgents[route]);
      const resolved = objectOf(valAgents[route]);
      map.set(route, { raw, resolved });
    }
    return map;
  }
  if (typeof existing === "object") {
    for (const [route, item] of Object.entries(existing)) {
      const raw = objectOf(item?.user);
      const resolved = objectOf(item?.profile) ?? (raw ? void 0 : objectOf(item));
      map.set(route, { raw, resolved });
    }
  }
  return map;
}
function parseAgentImport(text, existingInput) {
  let document2;
  try {
    document2 = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const root = objectOf(document2);
  if (root === void 0) {
    return { ok: false, error: "expected a JSON object" };
  }
  const existing = existingRoutesOf(existingInput);
  const taken = /* @__PURE__ */ new Set();
  const entries2 = [];
  const skipped = [];
  const { servers, routed } = serversOf(root);
  for (const [name2, value] of Object.entries(servers)) {
    const parsed = entryOf(name2, value);
    if (!parsed.ok) {
      skipped.push({ name: name2, reason: parsed.reason });
      continue;
    }
    const stem = routed && ROUTE_PATTERN.test(name2) ? name2 : routeOf(name2) || "agent";
    let route = stem;
    for (let suffix = 2; taken.has(route); suffix++) {
      route = `${stem}-${suffix}`;
    }
    taken.add(route);
    const previous = existing.get(route);
    const replaces = previous !== void 0;
    const merged = { ...previous?.resolved ?? {}, ...previous?.raw ?? {} };
    const carried = Object.fromEntries(
      Object.entries(merged).filter(
        ([key2]) => !IMPORTED_KEYS.includes(key2)
      )
    );
    const serverObj = objectOf(value);
    const hasExplicitDisplayName = typeof serverObj?.displayName === "string";
    const profile = {
      ...replaces ? carried : { permission: "ask" },
      ...parsed.displayName === void 0 || parsed.displayName === route && !hasExplicitDisplayName ? {} : { displayName: parsed.displayName },
      command: parsed.command,
      ...parsed.args.length > 0 ? { args: parsed.args } : {},
      ...Object.keys(parsed.env).length > 0 ? { env: parsed.env } : {}
    };
    entries2.push({ name: name2, route, replaces, profile });
  }
  return { ok: true, entries: entries2, skipped };
}
function importOpsOf(entries2) {
  return entries2.map((entry) => ({
    op: "set",
    path: ["acp", "agents", entry.route],
    value: entry.profile
  }));
}
var DEFAULT_UNAVAILABLE_SNAPSHOT = Object.freeze({
  status: "unavailable",
  value: void 0,
  base: void 0,
  user: void 0,
  revision: void 0,
  writable: false
});
var boundForm;
var formListeners = /* @__PURE__ */ new Set();
var notifyFormListeners = () => {
  for (const listener of formListeners) {
    listener();
  }
};
function bindAcpConfigForm(form) {
  boundForm = form;
  notifyFormListeners();
  const unsubscribe = form.subscribe(notifyFormListeners);
  return () => {
    unsubscribe();
    if (boundForm === form) {
      boundForm = void 0;
      notifyFormListeners();
    }
  };
}
function subscribeAcpConfigForm(listener) {
  formListeners.add(listener);
  return () => {
    formListeners.delete(listener);
  };
}
function getAcpConfigFormSnapshot() {
  return boundForm ? boundForm.getSnapshot() : DEFAULT_UNAVAILABLE_SNAPSHOT;
}
function useAcpConfigForm() {
  const snapshot = (0, import_react.useSyncExternalStore)(
    subscribeAcpConfigForm,
    getAcpConfigFormSnapshot,
    () => DEFAULT_UNAVAILABLE_SNAPSHOT
  );
  return {
    status: snapshot.status,
    value: snapshot.value,
    base: snapshot.base,
    user: snapshot.user,
    revision: snapshot.revision,
    writable: snapshot.writable,
    mode: snapshot.mode,
    form: boundForm
  };
}

// src/client/FusionHistory.tsx
var import_react3 = require("react");

// src/client/i18n.ts
var import_react2 = require("react");
var source;
var listeners = /* @__PURE__ */ new Set();
var notify = () => {
  for (const listener of listeners) listener();
};
function bindLocale(next) {
  source = next;
  notify();
  const unsubscribe = next.subscribe(notify);
  return () => {
    unsubscribe();
    if (source === next) {
      source = void 0;
      notify();
    }
  };
}
var current = () => {
  const id = source?.getSnapshot().active ?? (typeof navigator === "undefined" ? "en" : navigator.language);
  return id.toLowerCase().startsWith("zh") ? "zh" : "en";
};
function useLang() {
  return (0, import_react2.useSyncExternalStore)((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, current, () => "en");
}
var tr = (lang, zh2, en2) => lang === "zh" ? zh2 : en2;

// src/identity.ts
var FUSION_API_PATH = "/api/fusion";
var FUSION_PROVIDER = "dsh-fusion";
var FUSION_MODEL_PATTERN = /^(?:auto|pair-[a-z0-9]{6,12})$/;
var isFusionModel = (model) => typeof model === "string" && FUSION_MODEL_PATTERN.test(model);
var LEGACY_FUSION_PROVIDER = "dsh-model-fusion";
var isFusionProvider = (provider) => provider === FUSION_PROVIDER || provider === LEGACY_FUSION_PROVIDER;
var isFusionSelection = (route) => isFusionProvider(route?.provider) && isFusionModel(route?.model);

// src/client/FusionHistory.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function formatCompact(tokens3) {
  if (tokens3 < 1e3) return `${tokens3}`;
  if (tokens3 < 1e6) {
    const k = tokens3 / 1e3;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}K`;
  }
  const m = tokens3 / 1e6;
  return `${m >= 100 ? Math.round(m) : Number(m.toFixed(m >= 10 ? 1 : 2))}M`;
}
function outputTokens(lang, usage, calls) {
  if (!calls) return "\u2014";
  const total = usage.totalOutput;
  const hasTotal = Boolean(total && total.reported > 0);
  const hasVisible = Boolean(usage.output && usage.output.reported > 0);
  const hasReasoning = Boolean(usage.reasoning && usage.reasoning.reported > 0);
  if (!hasTotal) {
    if (hasVisible) {
      const vis = formatCompact(usage.output.known);
      const cov = usage.output.reported < calls ? tr(lang, `\uFF08${usage.output.reported}/${calls} \u6B21\u6709\u62A5\u544A\uFF09`, ` (${usage.output.reported}/${calls} reported)`) : "";
      return `${tr(lang, `\u81F3\u5C11 ${vis}\uFF0C\u63A8\u7406\u672A\u63D0\u4F9B`, `at least ${vis}, reasoning unavailable`)}${cov}`;
    }
    return tr(lang, "\u672A\u63D0\u4F9B", "not reported");
  }
  const totalStr = formatCompact(total.known);
  const visibleStr = hasVisible ? formatCompact(usage.output.known) : tr(lang, "\u672A\u63D0\u4F9B", "not reported");
  const reasoningStr = hasReasoning ? formatCompact(usage.reasoning.known) : tr(lang, "\u672A\u63D0\u4F9B", "not reported");
  const coverageStr = total.reported < calls ? tr(lang, `\uFF08${total.reported}/${calls} \u6B21\u6709\u62A5\u544A\uFF09`, ` (${total.reported}/${calls} reported)`) : "";
  const splitStr = tr(lang, `\uFF08\u53EF\u89C1 ${visibleStr} + \u63A8\u7406 ${reasoningStr}\uFF09`, ` (visible ${visibleStr} + reasoning ${reasoningStr})`);
  return `${totalStr} ${splitStr}${coverageStr}`;
}
var takeoverReason = (lang, reason) => ({
  "checks-still-failing": tr(lang, "\u8FD4\u5DE5\u540E\u68C0\u67E5\u4ECD\u5931\u8D25", "checks still failing after rework"),
  "worker-step-limit": tr(lang, "Sidekick \u6B65\u6570\u7528\u5C3D", "Sidekick step limit"),
  "worker-stalled": tr(lang, "Sidekick \u53CD\u590D\u505C\u6EDE", "Sidekick stalled repeatedly")
})[reason] ?? reason;
var tokens = (lang, field, calls) => !calls ? "\u2014" : !field.reported ? tr(lang, "\u672A\u63D0\u4F9B", "not reported") : `${formatCompact(field.known)} (${field.known.toLocaleString()})${field.reported < calls ? tr(lang, `\uFF08${field.reported}/${calls} \u6B21\u6709\u62A5\u544A\uFF09`, ` (${field.reported}/${calls} reported)`) : ""}`;
var purpose = (lang, value) => ({
  conversation: tr(lang, "\u4EFB\u52A1", "task"),
  compaction: tr(lang, "\u538B\u7F29", "compaction"),
  "cache-keepalive": tr(lang, "\u4FDD\u6D3B", "keepalive"),
  "session-title": tr(lang, "\u6807\u9898", "title")
})[value] ?? value;
var money = (value) => value === null ? "\u2014" : `$${Number(value).toFixed(2)}`;
var blockerText = (lang, blocker) => ({
  agent: tr(lang, "Lead \u6216 Sidekick \u4ECD\u5728\u8FD0\u884C", "its Lead or Sidekick is still running"),
  tool: tr(lang, "\u6709\u539F\u751F\u5DE5\u5177\u8C03\u7528\u5C1A\u672A\u8FD4\u56DE", "a native tool call has not returned"),
  job: tr(lang, "\u6709\u540E\u53F0\u4EFB\u52A1\u5C1A\u672A\u505C\u6B62", "a background job has not stopped"),
  lease: tr(lang, "\u4ECD\u6301\u6709\u5DE5\u4F5C\u533A\u5199\u5165\u79DF\u7EA6", "it still holds the workspace write lease"),
  "foreign-process": tr(lang, "\u53E6\u4E00\u4E2A Host \u8FDB\u7A0B\u4ECD\u5728\u5904\u7406\u5B83", "another Host process is still working on it")
})[blocker ?? ""] ?? tr(lang, "\u4ECD\u6709\u6D3B\u52A8\u5199\u5165\u65B9", "something is still writing to it");
function FusionHistory() {
  const lang = useLang();
  const [page, setPage] = (0, import_react3.useState)();
  const [cursor, setCursor] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)("");
  const [refresh, setRefresh] = (0, import_react3.useState)(0);
  const [loading, setLoading] = (0, import_react3.useState)(false);
  const [confirmingId, setConfirmingId] = (0, import_react3.useState)(null);
  const [deletingId, setDeletingId] = (0, import_react3.useState)(null);
  const [rowError, setRowError] = (0, import_react3.useState)(null);
  const [open, setOpen] = (0, import_react3.useState)(false);
  const [tasksOpen, setTasksOpen] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`${FUSION_API_PATH}?view=history&cursor=${encodeURIComponent(cursor)}`, { credentials: "same-origin", cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (cursor && (response.status === 409 || body?.error?.includes("cursor") || body?.error?.includes("Cursor"))) {
          setCursor("");
          return;
        }
        throw new Error(body?.error || tr(lang, "\u5386\u53F2\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6", "History is unavailable right now"));
      }
      return response.json();
    }).then((data) => {
      if (data) setPage(data);
    }).catch((error2) => {
      if (!abort.signal.aborted) setError(String(error2));
    }).finally(() => {
      if (!abort.signal.aborted) setLoading(false);
    });
    return () => abort.abort();
  }, [cursor, refresh, lang]);
  const handleDelete = async (taskId) => {
    setDeletingId(taskId);
    setRowError(null);
    setError("");
    try {
      const res = await fetch(`${FUSION_API_PATH}?taskId=${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const raw = data?.error || "";
        const msg = raw === "Cannot delete a running task" ? tr(
          lang,
          `\u5F53\u524D\u4EFB\u52A1\u4ECD\u5728\u8FD0\u884C\u6216\u5C1A\u672A\u5B89\u5168\u7EC8\u6B62\uFF0C\u65E0\u6CD5\u6E05\u9664\uFF1A${blockerText(lang, data?.blocker)}`,
          `Cannot delete while it still runs: ${blockerText(lang, data?.blocker)}`
        ) : raw || tr(lang, "\u6E05\u9664\u4EFB\u52A1\u5931\u8D25", "Failed to delete task");
        throw new Error(msg);
      }
      setPage((prev) => prev ? {
        ...prev,
        totalTasks: Math.max(0, prev.totalTasks - 1),
        tasks: prev.tasks.filter((task) => task.id !== taskId)
      } : prev);
      setConfirmingId(null);
      setRowError(null);
      if (cursor === taskId) setCursor("");
      setRefresh((v) => v + 1);
    } catch (err) {
      setRowError({ id: taskId, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeletingId(null);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "details",
    {
      className: "fusion-history",
      "aria-label": tr(lang, "Fusion \u5386\u53F2\u4E0E\u7EDF\u8BA1", "Fusion history and statistics"),
      "data-ud-check": "fusion-history",
      ...open ? { open: true } : {},
      onToggle: (event) => {
        if (!event.target || event.target === event.currentTarget) {
          setOpen(event.currentTarget.open);
        }
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { className: "fusion-history-summary", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fusion-history-title", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: tr(lang, "\u5386\u53F2\u4E0E\u7EDF\u8BA1", "History and statistics") }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "fusion-history-indicator", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: open ? tr(lang, "\u70B9\u51FB\u6536\u8D77", "Collapse") : tr(lang, "\u70B9\u51FB\u5C55\u5F00", "Expand") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fusion-history-chevron", "aria-hidden": "true" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fusion-history-content", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fusion-history-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: tr(
              lang,
              "\u6309\u5B9E\u9645\u6A21\u578B\u8BF7\u6C42\u6C47\u603B\uFF0C\u5305\u542B\u4EFB\u52A1\u3001\u538B\u7F29\u3001\u4FDD\u6D3B\u53CA\u5DF2\u6709\u6807\u9898\u8BF7\u6C42\u3002\u672A\u62A5\u544A\u7684\u7528\u91CF\u4E0D\u7B97\u4F5C 0\uFF1B\u91D1\u989D\u662F\u6309\u516C\u5F00\u5355\u4EF7\u6362\u7B97\u7684\u4F30\u7B97\uFF0C\u4E0D\u662F\u8D26\u5355\u3002",
              "Totals of actual model requests: tasks, compaction, keepalive and title requests. Unreported usage is not counted as 0; amounts are estimates converted at published rates, not bills."
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: loading, onClick: () => setRefresh((value) => value + 1), children: tr(lang, "\u5237\u65B0\u8BB0\u5F55", "Refresh") })
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error }),
          loading && !page && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: tr(lang, "\u6B63\u5728\u8BFB\u53D6\u8BB0\u5F55\u2026", "Loading\u2026") }),
          page && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fusion-history-panel fusion-history-usage", "aria-label": tr(lang, "\u7528\u91CF\u7EDF\u8BA1", "Usage statistics"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: tr(lang, "\u7528\u91CF\u7EDF\u8BA1", "Usage statistics") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: tr(
                lang,
                `${page.totalTasks} \u9879\u4EFB\u52A1 \xB7 ${page.totals.calls} \u6B21\u539F\u751F\u8BF7\u6C42 \xB7 ${page.totals.final} \u6B21\u7528\u91CF\u5B9A\u7A3F \xB7 ${page.totals.provisional} \u6B21\u6682\u62A5 \xB7 ${page.totals.unreported} \u6B21\u672A\u63D0\u4F9B`,
                `${page.totalTasks} tasks \xB7 ${page.totals.calls} native requests \xB7 ${page.totals.final} final usage \xB7 ${page.totals.provisional} provisional \xB7 ${page.totals.unreported} unreported`
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
                tr(lang, "\u672A\u7F13\u5B58\u8F93\u5165", "Uncached input"),
                " ",
                tokens(lang, page.totals.input, page.totals.calls),
                " \xB7 ",
                tr(lang, "\u7F13\u5B58\u8BFB\u53D6", "cache read"),
                " ",
                tokens(lang, page.totals.cacheRead, page.totals.calls),
                " \xB7 ",
                tr(lang, "\u603B\u8F93\u51FA", "Total output"),
                " ",
                outputTokens(lang, page.totals, page.totals.calls),
                " Token"
              ] }),
              page.cost && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
                tr(
                  lang,
                  `\u672C\u9875\u6309\u4EF7\u76EE\u8868\u4F30\u7B97 ${money(page.cost.apiEquivalentUsd)}\uFF0C\u8986\u76D6 ${page.cost.priced} \u6B21\u8BF7\u6C42`,
                  `This page estimates ${money(page.cost.apiEquivalentUsd)} at list prices, covering ${page.cost.priced} requests`
                ),
                page.cost.savedUsd !== null ? tr(
                  lang,
                  `\uFF1B\u6BD4\u540C\u6837\u7684 token \u5168\u4EA4\u7ED9 Lead \u7701\u4E0B ${money(page.cost.savedUsd)}\uFF08${page.cost.basis} \u6B21\u8BF7\u6C42\u53EF\u6BD4\uFF09`,
                  `; that is ${money(page.cost.savedUsd)} less than sending the same tokens to the Lead (${page.cost.basis} requests comparable)`
                ) : "",
                tr(lang, "\u3002\u5B9E\u9645\u8D26\u5355\u4ECD\u672A\u77E5\uFF1ADSH \u4E0D\u63D0\u4F9B\u6BCF\u6B21\u8BF7\u6C42\u7684\u8BA1\u8D39\u91D1\u989D\u3002", ". The actual bill is still unknown: DSH reports no per-request billed amount.")
              ] }),
              page.cost && page.cost.unpriced + page.cost.incomplete + page.cost.unknown > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: tr(
                lang,
                `\u53E6\u6709 ${page.cost.unpriced + page.cost.incomplete + page.cost.unknown} \u6B21\u8BF7\u6C42\u672A\u8BA1\u5165\u91D1\u989D\uFF1A${page.cost.unpriced} \u6B21\u6CA1\u6709\u4EF7\u76EE\u3001${page.cost.incomplete} \u6B21\u7528\u91CF\u4E0D\u5168\u3001${page.cost.unknown} \u6B21\u65E0\u6CD5\u8BFB\u53D6\u3002`,
                `${page.cost.unpriced + page.cost.incomplete + page.cost.unknown} further requests are not priced: ${page.cost.unpriced} with no rate, ${page.cost.incomplete} with incomplete usage, ${page.cost.unknown} unreadable.`
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
                tr(lang, `Lead \u63A5\u624B\u6539\u4EE3\u7801 ${page.takeovers?.total ?? 0} \u6B21\uFF08${page.takeovers?.tasks ?? 0} \u9879\u4EFB\u52A1\uFF09`, `Lead takeovers: ${page.takeovers?.total ?? 0} (${page.takeovers?.tasks ?? 0} tasks)`),
                page.takeovers?.total ? `: ${Object.entries(page.takeovers.reasons).map(([reason, count]) => `${takeoverReason(lang, reason)} ${count}`).join(", ")}` : "",
                tr(lang, "\u3002\u53EA\u6709 Sidekick \u786E\u5B9E\u5B8C\u6210\u4E0D\u4E86\u65F6\uFF0C\u7A0B\u5E8F\u624D\u4F1A\u89E3\u9501\u63A5\u624B\u3002", ". The Host unlocks a takeover only when the Sidekick demonstrably cannot finish.")
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowX: "auto" }, tabIndex: 0, "aria-label": tr(lang, "\u6309\u5B9E\u9645\u6A21\u578B\u7EDF\u8BA1", "By actual model"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("caption", { children: tr(lang, "\u6309\u89D2\u8272\u3001\u5B9E\u9645\u6A21\u578B\u548C\u8BF7\u6C42\u7528\u9014", "By role, actual model and purpose") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: tr(lang, "\u89D2\u8272 / \u6A21\u578B", "Role / model") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: tr(lang, "\u7528\u9014", "Purpose") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: tr(lang, "\u8BF7\u6C42", "Requests") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: tr(lang, "\u603B\u8F93\u51FA Token\uFF08\u53EF\u89C1 / \u63A8\u7406\uFF09", "Total output tokens (visible / reasoning)") })
                ] }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: page.groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { scope: "row", children: [
                    group.role === "lead" ? "Lead" : "Sidekick",
                    " \xB7 ",
                    group.model,
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: group.provider })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: purpose(lang, group.purpose) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: group.calls }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: outputTokens(lang, group, group.calls) })
                ] }, JSON.stringify([group.role, group.provider, group.model, group.purpose]))) })
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: tr(lang, `\u66F4\u65B0\u4E8E ${new Date(page.observedAt).toLocaleString()}\u3002\u4F9B\u5E94\u5546\u5185\u90E8\u91CD\u8BD5\u6B21\u6570\u672A\u77E5\u3002`, `Updated ${new Date(page.observedAt).toLocaleString()}. Provider-internal retries are unknown.`) }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "details",
              {
                className: "fusion-history-panel fusion-history-tasks",
                ...tasksOpen ? { open: true } : {},
                onToggle: (event) => setTasksOpen(event.currentTarget.open),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { className: "fusion-history-tasks-summary", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "fusion-history-tasks-title", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: tr(lang, "\u4EFB\u52A1\u8BB0\u5F55", "Tasks") }),
                      " ",
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "fusion-history-count", children: [
                        "(",
                        page.totalTasks,
                        ")"
                      ] })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "fusion-history-tasks-indicator", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: tasksOpen ? tr(lang, "\u70B9\u51FB\u6536\u8D77", "Collapse") : tr(lang, "\u70B9\u51FB\u5C55\u5F00", "Expand") }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fusion-history-tasks-chevron", "aria-hidden": "true" })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fusion-history-tasks-content", children: [
                    !page.tasks.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: tr(lang, "\u8FD8\u6CA1\u6709 Fusion \u4EFB\u52A1\u3002", "No Fusion tasks yet.") }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", { children: page.tasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fusion-history-item-header", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: task.title }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
                            new Date(task.createdAt).toLocaleString(),
                            " \xB7 ",
                            task.mode === "completed" ? tr(lang, "\u5DF2\u7ED3\u675F", "finished") : task.phase,
                            " \xB7 ",
                            tr(lang, `${task.usage.calls} \u6B21\u8BF7\u6C42`, `${task.usage.calls} requests`),
                            task.takeovers ? tr(lang, ` \xB7 Lead \u63A5\u624B ${task.takeovers} \u6B21`, ` \xB7 ${task.takeovers} Lead takeovers`) : "",
                            task.cost?.priced ? tr(lang, ` \xB7 \u7EA6 ${money(task.cost.apiEquivalentUsd)}`, ` \xB7 about ${money(task.cost.apiEquivalentUsd)}`) : "",
                            task.cost?.savedUsd !== null && task.cost?.savedUsd !== void 0 ? tr(lang, `\uFF08\u7701 ${money(task.cost.savedUsd)}\uFF09`, ` (saved ${money(task.cost.savedUsd)})`) : ""
                          ] })
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fusion-history-actions", children: confirmingId === task.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "fusion-history-confirm-text", children: tr(lang, "\u786E\u5B9A\u6E05\u9664\uFF1F", "Delete?") }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              disabled: Boolean(deletingId),
                              onClick: () => void handleDelete(task.id),
                              children: deletingId === task.id ? tr(lang, "\u6B63\u5728\u6E05\u9664\u2026", "Deleting\u2026") : tr(lang, "\u786E\u8BA4", "Confirm")
                            }
                          ),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              className: "fusion-btn-subtle",
                              disabled: Boolean(deletingId),
                              onClick: () => {
                                setConfirmingId(null);
                                setRowError(null);
                              },
                              children: tr(lang, "\u53D6\u6D88", "Cancel")
                            }
                          )
                        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "button",
                          {
                            type: "button",
                            disabled: Boolean(deletingId),
                            onClick: () => {
                              setError("");
                              setRowError(null);
                              setConfirmingId(task.id);
                            },
                            "aria-label": tr(lang, `\u6E05\u9664\u4EFB\u52A1 ${task.title}`, `Delete task ${task.title}`),
                            children: tr(lang, "\u6E05\u9664\u8BB0\u5F55", "Clear")
                          }
                        ) })
                      ] }),
                      rowError?.id === task.id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "fusion-history-row-error", style: { color: "var(--dsw-alias-state-error-primary, #e5484d)", margin: "6px 0 0", fontSize: "12px" }, children: rowError.message }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: tr(lang, "\u8BB0\u5F55\u8BE6\u60C5", "Details") }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
                          tr(lang, "\u4EFB\u52A1", "Task"),
                          ": ",
                          task.id
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
                          tr(lang, "\u4F1A\u8BDD", "Session"),
                          ": ",
                          task.sessionId
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: tr(lang, `\u9A8C\u8BC1\u72B6\u6001\uFF1A${task.verification}\u3002\u5386\u53F2\u8FD0\u884C\u72B6\u6001\u4E0D\u4EE3\u8868\u5F53\u524D\u4ECD\u5728\u6267\u884C\u3002`, `Verification: ${task.verification}. A recorded state does not mean it is still running.`) }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
                          tr(lang, "\u8F93\u5165", "Input"),
                          " ",
                          tokens(lang, task.usage.input, task.usage.calls),
                          " \xB7 ",
                          tr(lang, "\u7F13\u5B58\u8BFB\u53D6", "cache read"),
                          " ",
                          tokens(lang, task.usage.cacheRead, task.usage.calls),
                          " \xB7 ",
                          tr(lang, "\u603B\u8F93\u51FA", "Total output"),
                          " ",
                          outputTokens(lang, task.usage, task.usage.calls),
                          " Token"
                        ] })
                      ] })
                    ] }, task.id)) }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "fusion-actions", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: loading || !cursor, onClick: () => setCursor(""), children: tr(lang, "\u6700\u65B0\u8BB0\u5F55", "Newest") }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: loading || !page.nextCursor, onClick: () => setCursor(page.nextCursor), children: tr(lang, "\u66F4\u65E9\u8BB0\u5F55", "Older") })
                    ] })
                  ] })
                ]
              }
            )
          ] })
        ] })
      ]
    }
  );
}

// src/client/FusionCache.tsx
var import_react4 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var tokens2 = (value) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${Math.round(value / 1e3)}k` : String(value);
var minutes = (seconds) => seconds % 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds / 60} min`;
var modeName = (lang, mode) => ({ auto: tr(lang, "\u81EA\u52A8", "Auto"), on: tr(lang, "\u5F00\u542F", "On"), off: tr(lang, "\u5173\u95ED", "Off") })[mode];
function modeSource(lang, row) {
  switch (row.modeSource) {
    case "user":
      return tr(lang, "\u4F60\u7684\u8BBE\u7F6E", "your setting");
    case "pair":
      return tr(lang, "\u65E7\u7248\u7EC4\u5408\u8BBE\u7F6E", "older pair setting");
    case "role":
      return tr(lang, "Sidekick \u9ED8\u8BA4\u5173\u95ED\uFF08\u5B83\u5F88\u5C11\u957F\u65F6\u95F4\u7B49\u5F85\uFF09", "Sidekick default off (it rarely waits long)");
    case "route":
      return `${row.defaults.route.label}: ${lang === "zh" ? row.defaults.route.reason.zh : row.defaults.route.reason.en}`;
    case "family":
      return tr(lang, `${row.defaults.family.label} \u5B98\u65B9\u9ED8\u8BA4`, `${row.defaults.family.label} documented default`);
    default:
      return tr(lang, "\u901A\u7528\u9ED8\u8BA4", "generic default");
  }
}
function intervalSource(lang, row) {
  if (row.intervalSource === "user") return tr(lang, "\u4F60\u7684\u8BBE\u7F6E", "your setting");
  if (row.intervalSource === "learned") return tr(lang, "\u81EA\u52A8\u5B66\u4E60\uFF1A\u4FDD\u6D3B\u591A\u6B21\u672A\u547D\u4E2D\uFF0C\u5DF2\u7F29\u77ED", "learned: pings kept missing, shortened");
  return tr(lang, "\u9ED8\u8BA4", "default");
}
function ModelCard({ row, onSaved }) {
  const lang = useLang();
  const [interval, setInterval2] = (0, import_react4.useState)(String(row.setting.intervalSeconds ? row.setting.intervalSeconds / 60 : ""));
  const [busy, setBusy] = (0, import_react4.useState)(false), [error, setError] = (0, import_react4.useState)();
  const save = async (body) => {
    setBusy(true);
    setError(void 0);
    try {
      const response = await fetch(FUSION_API_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cache-setting", provider: row.provider, model: row.model, ...body })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? tr(lang, "\u4FDD\u5B58\u5931\u8D25", "Save failed"));
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const t = row.totals;
  const family = row.defaults.family;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "fusion-cache-model", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { children: [
      row.model,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        row.provider,
        row.role ? ` \xB7 ${row.role === "lead" ? "Lead" : "Sidekick"}` : ""
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
      tr(lang, "\u73B0\u5728", "Now"),
      ": ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: modeName(lang, row.mode) }),
      row.mode !== "off" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        tr(lang, "\uFF0C\u6BCF ", ", every "),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: minutes(row.intervalSeconds) }),
        tr(lang, " \u7EED\u4E00\u6B21", "")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        tr(lang, "\u5F00\u5173\u6765\u6E90", "Mode"),
        ": ",
        modeSource(lang, row),
        " \xB7 ",
        tr(lang, "\u95F4\u9694\u6765\u6E90", "Interval"),
        ": ",
        intervalSource(lang, row)
      ] })
    ] }),
    family && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
      tr(lang, "\u5B98\u65B9\u6587\u6863", "Documented"),
      ": ",
      lang === "zh" ? family.lifetime.zh : family.lifetime.en,
      "\uFF1B",
      tr(lang, "\u7F13\u5B58\u4EF7\u7EA6\u4E3A\u5168\u4EF7", "cached price \u2248"),
      " ",
      family.discount,
      " \xB7 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: family.docs, target: "_blank", rel: "noreferrer", children: tr(lang, "\u6765\u6E90", "source") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "fusion-cache-controls", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        tr(lang, "\u4FDD\u6D3B", "Keepalive"),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "select",
          {
            "aria-label": `${row.model} keepalive`,
            disabled: busy,
            value: row.setting.mode ?? "",
            onChange: (event) => {
              void save({ mode: event.target.value || null, intervalSeconds: row.setting.intervalSeconds ?? null });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: tr(lang, `\u9ED8\u8BA4\uFF08${modeName(lang, row.defaults.mode)}\uFF09`, `Default (${modeName(lang, row.defaults.mode)})`) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "auto", children: tr(lang, "\u81EA\u52A8\uFF1A\u8BE5\u6A21\u578B\u8FD4\u56DE\u8FC7\u7F13\u5B58\u547D\u4E2D\u540E\u624D\u5F00\u542F", "Auto: only after this model reports cache hits") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "on", children: tr(lang, "\u5F00\u542F", "On") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "off", children: tr(lang, "\u5173\u95ED\uFF08\u6309\u8BF7\u6C42\u6B21\u6570\u8BA1\u8D39\u7684\u5957\u9910\u9009\u8FD9\u4E2A\uFF09", "Off (choose for plans billed per request)") })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        tr(lang, "\u95F4\u9694\uFF08\u5206\u949F\uFF09", "Interval (min)"),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "number",
            min: "1",
            max: "59",
            step: "0.5",
            disabled: busy,
            value: interval,
            placeholder: String(+(row.intervalSeconds / 60).toFixed(2)),
            onChange: (event) => setInterval2(event.target.value),
            onBlur: () => {
              if (interval !== String(row.setting.intervalSeconds ? row.setting.intervalSeconds / 60 : ""))
                void save({ mode: row.setting.mode ?? null, intervalSeconds: interval ? Math.round(Number(interval) * 60) : null });
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: busy || !row.setting.mode && !row.setting.intervalSeconds, onClick: () => {
        setInterval2("");
        void save({ reset: true });
      }, children: tr(lang, "\u6062\u590D\u9ED8\u8BA4", "Reset") })
    ] }),
    row.suggestion && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", children: tr(
      lang,
      `\u89C2\u5BDF\u5230\u7B49\u5F85 ${minutes(row.suggestion)} \u4EE5\u4E0A\u7F13\u5B58\u4ECD\u7136\u547D\u4E2D\uFF0C\u53EF\u4EE5\u628A\u95F4\u9694\u653E\u5BBD\u5230 ${minutes(row.suggestion)}\uFF08\u4E0D\u4F1A\u81EA\u52A8\u4FEE\u6539\uFF09\u3002`,
      `Cache still hit after waits over ${minutes(row.suggestion)}; you can lengthen the interval to ${minutes(row.suggestion)} (not changed automatically).`
    ) }),
    t ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
      tr(lang, "\u6548\u679C", "Effect"),
      ": ",
      tr(lang, `\u7B49\u5F85\u540E\u547D\u4E2D ${t.waitHits}/${t.waits} \u6B21`, `hit after ${t.waitHits}/${t.waits} waits`),
      t.waits ? ` (${Math.round(100 * t.waitHits / t.waits)}%)` : "",
      "\uFF1B",
      tr(lang, ` \u4FDD\u6D3B ${t.pings} \u6B21\uFF08${t.pingHits} \u6B21\u547D\u4E2D\uFF0C\u8BFB\u53D6 ${tokens2(t.pingTokens)} token\uFF0C\u591A\u4E3A\u7F13\u5B58\u4EF7${t.pingOutputTokens != null ? `\uFF0C\u8F93\u51FA ${tokens2(t.pingOutputTokens)} token` : ""}\uFF09\uFF1B`, ` ${t.pings} pings (${t.pingHits} hit, ${tokens2(t.pingTokens)} tokens read, mostly at cache price${t.pingOutputTokens != null ? `, ${tokens2(t.pingOutputTokens)} output` : ""}); `),
      tr(lang, ` \u7B49\u5F85\u540E\u4ECD\u4ECE\u7F13\u5B58\u8BFB\u53D6 ${tokens2(t.keptWarmTokens)} token\uFF0C\u6309\u5168\u4EF7\u91CD\u53D1 ${tokens2(t.resentTokens)} token\u3002`, ` after waits ${tokens2(t.keptWarmTokens)} tokens served from cache, ${tokens2(t.resentTokens)} resent at full price.`),
      t.pings >= 5 && t.pingHits / t.pings < 0.5 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: tr(lang, " \u4FDD\u6D3B\u5927\u591A\u6CA1\u547D\u4E2D\uFF0C\u5EFA\u8BAE\u5173\u95ED\u6216\u7F29\u77ED\u95F4\u9694\u3002", " Most pings missed: turn it off or shorten the interval.") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: tr(lang, "\u8FD8\u6CA1\u6709\u6570\u636E\uFF1ALead \u7B49\u5F85 Sidekick \u4E4B\u540E\u624D\u4F1A\u4EA7\u751F\u8BB0\u5F55\u3002", "No data yet: records appear after the Lead waits for the Sidekick.") }),
    !!row.recent.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
      tr(lang, "\u6700\u8FD1", "Recent"),
      ": ",
      row.recent.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        item.ping ? "\u21BB" : "",
        minutes(item.gapSeconds),
        item.hit ? " \u2713" : " \u2717",
        i < row.recent.length - 1 ? " \xB7 " : ""
      ] }, i))
    ] }) }),
    error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "alert", children: error })
  ] });
}
function FusionCache({ refresh }) {
  const lang = useLang();
  const [rows, setRows] = (0, import_react4.useState)(), [checked, setChecked] = (0, import_react4.useState)(), [error, setError] = (0, import_react4.useState)();
  const [reload, setReload] = (0, import_react4.useState)(0);
  const [open, setOpen] = (0, import_react4.useState)(false);
  (0, import_react4.useEffect)(() => {
    const abort = new AbortController();
    void fetch(`${FUSION_API_PATH}?view=cache`, { credentials: "same-origin", cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error(tr(lang, "\u65E0\u6CD5\u8BFB\u53D6\u7F13\u5B58\u8BBE\u7F6E", "Cannot read cache settings"));
      return response.json();
    }).then((value) => {
      setRows(value.models);
      setChecked(value.checked);
    }).catch((reason) => {
      if (!abort.signal.aborted) setError(String(reason));
    });
    return () => abort.abort();
  }, [refresh, reload, lang]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "details",
    {
      className: "fusion-cache",
      "aria-label": tr(lang, "\u7F13\u5B58\u4FDD\u6D3B", "Cache keepalive"),
      "data-ud-check": "fusion-cache",
      ...open ? { open: true } : {},
      onToggle: (event) => {
        if (!event.target || event.target === event.currentTarget) {
          setOpen(event.currentTarget.open);
        }
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { className: "fusion-cache-summary", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "fusion-cache-title", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: tr(lang, "\u7F13\u5B58\u4FDD\u6D3B", "Cache keepalive") }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "fusion-cache-indicator", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: open ? tr(lang, "\u70B9\u51FB\u6536\u8D77", "Collapse") : tr(lang, "\u70B9\u51FB\u5C55\u5F00", "Expand") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "fusion-cache-chevron", "aria-hidden": "true" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "fusion-cache-content", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: tr(
            lang,
            "Lead \u7B49 Sidekick \u5E72\u6D3B\u65F6\u53EF\u80FD\u8981\u7B49\u51E0\u5206\u949F\uFF0C\u6A21\u578B\u7684\u8F93\u5165\u7F13\u5B58\u8FC7\u671F\u540E\uFF0C\u4E0B\u4E00\u6B21\u8BF7\u6C42\u4F1A\u6309\u5168\u4EF7\u91CD\u8BFB\u6574\u6BB5\u5BF9\u8BDD\u3002\u4FDD\u6D3B\u5728\u7B49\u5F85\u671F\u95F4\u5B9A\u65F6\u628A Lead \u4E0A\u4E00\u6B21\u7684\u8BF7\u6C42\u539F\u6837\u518D\u53D1\u4E00\u904D\uFF0C\u672B\u5C3E\u53EA\u52A0\u4E00\u53E5\u201CReply OK\u201D\uFF0C\u6A21\u578B\u53EA\u56DE\u4E00\u4E2A OK\uFF0C\u7F13\u5B58\u5C31\u4E0D\u4F1A\u8FC7\u671F\u3002\u9ED8\u8BA4\u503C\u6765\u81EA\u5404\u5BB6\u5B98\u65B9\u6587\u6863\uFF0C\u6BCF\u4E2A\u6A21\u578B\u90FD\u53EF\u4EE5\u5355\u72EC\u8C03\u6574\u3002",
            "While the Lead waits for the Sidekick, the model's prompt cache can expire and the next request re-reads the whole conversation at full price. Keepalive resends the Lead's previous request at intervals with only \u201CReply OK\u201D appended; the model answers OK and the cache stays warm. Defaults come from each provider's documentation; every model can be adjusted."
          ) }),
          checked && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: tr(lang, `\u5B98\u65B9\u9ED8\u8BA4\u503C\u6838\u5BF9\u65E5\u671F\uFF1A${checked}\u3002`, `Documented defaults checked on ${checked}.`) }) }),
          error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "alert", children: error }),
          rows?.map((row) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelCard, { row, onSaved: () => setReload((value) => value + 1) }, `${row.provider}/${row.model}/${row.setting.mode ?? ""}/${row.setting.intervalSeconds ?? ""}`))
        ] })
      ]
    }
  );
}

// src/client/agy/AgyConsole.tsx
var import_react6 = require("react");

// src/client/agy/brand-icons.ts
var BRAND_PATHS = {
  gemini: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  claude: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  openai: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  chrome: "M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.73c-.911-3.794-4.321-6.545-8.384-6.545zM1.986 6.368A11.95 11.95 0 0 0 0 12c0 6.096 4.542 11.134 10.428 11.89l3.953-6.848a5.454 5.454 0 0 1-5.836-2.585L1.986 6.368zm14.569 5.632a5.454 5.454 0 0 1-1.127 3.327l-5.365 9.293C10.784 24.873 11.385 25 12 25c6.627 0 12-5.373 12-12 0-.341-.014-.679-.042-1.013H12v.013h4.555z",
  edge: "M23.95 13.91c-.13-1.68-.78-3.23-1.83-4.47-.98-1.16-2.29-1.99-3.76-2.4-.64-.18-1.3-.28-1.97-.29-2.09-.03-4.08.74-5.63 2.16-1.57 1.44-2.48 3.44-2.55 5.56.08 1.47.66 2.87 1.66 3.96.99 1.09 2.37 1.76 3.86 1.88 1.34.1 2.69-.26 3.82-1.02.44-.3.84-.66 1.18-1.07l2.87 2.87c-1.35 1.44-3.04 2.51-4.92 3.12-1.89.6-3.9.7-5.84.28-2.67-.58-5.06-2.06-6.75-4.17-1.68-2.12-2.59-4.78-2.57-7.51.02-2.85 1.04-5.6 2.89-7.77C6.88 4.31 9.53 2.85 12.44 2.38c2.19-.35 4.43-.2 6.55.45 2.13.65 4.04 1.83 5.58 3.44l-2.9 2.9c-1.12-1.19-2.52-2.06-4.07-2.54-1.55-.47-3.19-.57-4.78-.3-2.14.36-4.08 1.45-5.46 3.06-1.38 1.62-2.13 3.69-2.13 5.84 0 2.05.69 4.04 1.98 5.62 1.28 1.58 3.1 2.64 5.12 3.01 1.47.27 2.99.17 4.42-.31 1.43-.48 2.7-1.33 3.69-2.46l-4.13-4.13c-.37.28-.8.48-1.26.58-.46.1-.94.09-1.4-.02-.57-.14-1.08-.47-1.46-.93-.38-.46-.59-1.04-.59-1.64.03-.84.4-1.63 1.03-2.2.63-.57 1.45-.88 2.3-.87.87.01 1.7.35 2.32.95.62.61.98 1.43 1 2.3h4.67z"
};
var BRAND_COLORS = {
  gemini: "#8E75B2",
  claude: "#D97757",
  openai: "#10a37f",
  chrome: "#4285F4",
  edge: "#0078D7"
};
var UI_PATHS = {
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  plus: "M12 5v14M5 12h14",
  refresh: "M21.5 2v6h-6M2.5 22v-6h6M2.5 11.5a10 10 0 0 1 17.5-4.5l1.5 2M21.5 12.5a10 10 0 0 1-17.5 4.5l-1.5-2",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M18 15l-6-6-6 6",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  externalLink: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  move: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  power: "M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
};

// src/client/agy/locale.ts
var import_react5 = require("react");

// src/client/agy/locales.ts
var NS = "agy-worker";
var zh = {
  "section.label": "Antigravity",
  "code.title": "\u4EE3\u7801",
  "code.inspect": "\u68C0\u67E5",
  "tv.command": "\u547D\u4EE4",
  "tv.write": "\u5199\u5165",
  "tv.edit": "\u7F16\u8F91",
  "tv.read": "\u8BFB\u53D6",
  "tv.search": "\u641C\u7D22",
  "tv.webSearch": "\u7F51\u9875\u641C\u7D22",
  "tv.list": "\u5217\u8868",
  "tv.delete": "\u5220\u9664",
  "tv.tool": "\u5DE5\u5177",
  "tv.noOutput": "(\u65E0\u8F93\u51FA)",
  "tv.noMatches": "(\u65E0\u5339\u914D)",
  "tv.noChanges": "(\u65E0\u6587\u672C\u53D8\u66F4)",
  "tv.emptyDir": "(\u7A7A\u76EE\u5F55)",
  "tv.noDetail": "(\u65E0\u8BE6\u60C5)",
  "tv.hint.expandInspect": "\u70B9\u51FB\u5C55\u5F00 \xB7 \u53F3\u952E\u68C0\u67E5",
  "tv.hint.collapseInspect": "\u70B9\u51FB\u6536\u8D77 \xB7 \u53F3\u952E\u68C0\u67E5",
  "tv.hint.expand": "\u70B9\u51FB\u5C55\u5F00",
  "tv.hint.collapse": "\u70B9\u51FB\u6536\u8D77",
  "tv.diffMore": "\u2026 \u5176\u4F59 {count} \u884C\u672A\u6E32\u67D3",
  "code.copy": "\u590D\u5236",
  "code.copied": "\u5DF2\u590D\u5236",
  "console.title": "Antigravity \u7BA1\u7406\u63A7\u5236\u53F0",
  "status.ready": "\u5C31\u7EEA",
  "status.needsAuth": "\u5F85\u8BA4\u8BC1",
  "status.loading": "\u6B63\u5728\u52A0\u8F7D Antigravity \u72B6\u6001...",
  "status.authRequired": "\u9700\u91CD\u65B0\u767B\u5F55",
  "account.setActive": "\u8BBE\u4E3A\u5F53\u524D\u4F7F\u7528",
  "account.settingActive": "\u5207\u6362\u4E2D",
  "account.activeSet": "\u5DF2\u5207\u6362\u5F53\u524D\u4F7F\u7528\u8D26\u53F7",
  "account.activeSetFailed": "\u8BE5\u8D26\u53F7\u5F53\u524D\u4E0D\u53EF\u7528\uFF08\u51B7\u5374\u6216\u9700\u91CD\u65B0\u767B\u5F55\uFF09",
  "status.proxy": "\u4EE3\u7406",
  "status.inUse": "\u5F53\u524D\u4F7F\u7528",
  "account.add": "\u6DFB\u52A0 Google \u8D26\u53F7",
  "account.aliasDefault": "\u5907\u7528 Google \u8D26\u53F7 {number}",
  "account.defaultAlias": "\u4E3B\u8D26\u53F7\uFF08\u7CFB\u7EDF\u767B\u5F55\uFF09",
  "account.proxyPlaceholder": "\u4E13\u5C5E\u4EE3\u7406 URL\uFF08\u5982 http://127.0.0.1:7890\uFF0C\u7559\u7A7A\u5219\u7EE7\u627F\u5168\u5C40\uFF09",
  "account.aliasPlaceholder": "\u8D26\u53F7\u522B\u540D\uFF08\u4F8B\u5982\uFF1A\u5907\u7528\u8D26\u53F7 2\uFF09",
  "account.removeTitle": "\u79FB\u9664\u6B64\u8D26\u53F7",
  "aria.aliasInput": "\u8D26\u53F7\u522B\u540D",
  "aria.proxyInput": "\u4E13\u5C5E\u4EE3\u7406 URL",
  "aria.authCodeInput": "\u6388\u6743\u7801\u6216\u56DE\u8C03 URL",
  "aria.closeToast": "\u5173\u95ED\u63D0\u793A",
  "account.details": "\u660E\u7EC6",
  "account.collapse": "\u6536\u8D77",
  "account.expandOthers": "\u5C55\u5F00\u67E5\u770B Claude & GPT-OSS \u6A21\u578B\u989D\u5EA6",
  "account.collapseOthers": "\u6536\u8D77 Claude & GPT-OSS \u6A21\u578B\u989D\u5EA6",
  "account.otherModels": "Claude / GPT \u989D\u5EA6",
  "account.sync": "\u540C\u6B65",
  "account.syncing": "\u540C\u6B65\u4E2D",
  "account.syncTitle": "\u5237\u65B0\u6B64\u8D26\u53F7\uFF08\u6362\u53F7\u540E\u7ACB\u5373\u540C\u6B65 email / \u989D\u5EA6 / \u6A21\u578B\uFF09",
  "account.models": "\u5355\u6A21\u578B\u660E\u7EC6\uFF1A",
  "account.cooldown": "\u90E8\u5206\u6A21\u578B\u9650\u6D41\u4E2D\uFF0C\u5DF2\u81EA\u52A8\u5207\u6362\u8D26\u53F7",
  "account.clearCooldown": "\u6E05\u9664\u51B7\u5374",
  "account.localCooldown": " \xB7 \u672C\u5730\u51B7\u5374\u4E2D",
  "account.removed": "\u5DF2\u79FB\u9664\u8D26\u53F7\uFF1A{alias}",
  "quota.fiveHour": "5 \u5C0F\u65F6\u989D\u5EA6",
  "quota.weekly": "\u5468\u989D\u5EA6",
  "quota.refreshed": "\u989D\u5EA6\u5DF2\u5237\u65B0",
  "quota.windowReset": "\u5DF2\u91CD\u7F6E \xB7 \u53EF\u7528",
  "proxy.button": "\u4EE3\u7406",
  "proxy.placeholder": "\u4E13\u5C5E\u4EE3\u7406 URL\uFF08\u5982\uFF1Ahttp://127.0.0.1:7890\uFF1B\u7559\u7A7A\u5219\u4F7F\u7528\u5168\u5C40\uFF09",
  "proxy.save": "\u4FDD\u5B58",
  "proxy.saved": "\u4EE3\u7406\u5DF2\u4FDD\u5B58",
  "cancel": "\u53D6\u6D88",
  "auth.openBrowser": "\u6253\u5F00\u6D4F\u89C8\u5668\u767B\u5F55",
  "auth.openingBrowser": "\u6B63\u5728\u6253\u5F00\u6D4F\u89C8\u5668...",
  "auth.browserOpened": "\u6D4F\u89C8\u5668\u5DF2\u6253\u5F00 Google \u6388\u6743\u9875\uFF0C\u5B8C\u6210\u6388\u6743\u540E\u5C06\u81EA\u52A8\u540C\u6B65",
  "auth.browserManual": "\u65E0\u6CD5\u81EA\u52A8\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u8BF7\u70B9\u51FB\u4E0B\u65B9\u94FE\u63A5\u624B\u52A8\u5B8C\u6210\u6388\u6743",
  "auth.startFailed": "\u65E0\u6CD5\u542F\u52A8 Google \u6388\u6743\u3002\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u4EE3\u7406\u914D\u7F6E\u3002",
  "auth.networkHint": "\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u4EE3\u7406\u914D\u7F6E",
  "auth.activated": "\u8D26\u53F7\u5DF2\u6FC0\u6D3B\u5165\u6C60",
  "auth.failed": "\u6388\u6743\u5931\u8D25",
  "auth.added": "\u6210\u529F\u6DFB\u52A0\u5E76\u6FC0\u6D3B Google \u8D26\u53F7",
  "auth.codeFailed": "\u6388\u6743\u7801\u9A8C\u8BC1\u5931\u8D25",
  "auth.exchanging": "\u6B63\u5728\u9A8C\u8BC1\u6388\u6743\u5E76\u6FC0\u6D3B\u8D26\u53F7\uFF0C\u8BF7\u7A0D\u5019...",
  "auth.waiting": "\u7B49\u5F85\u6D4F\u89C8\u5668\u4E2D\u5B8C\u6210 Google \u6388\u6743\uFF0C\u6210\u529F\u540E\u5C06\u81EA\u52A8\u6FC0\u6D3B\u3002",
  "auth.openManual": "\u82E5\u6D4F\u89C8\u5668\u672A\u6253\u5F00\uFF0C\u8BF7\u70B9\u51FB\u6B64\u5904\u624B\u52A8\u6253\u5F00 Google \u767B\u5F55\u9875",
  "auth.pasteHint": "\u672A\u5B8C\u6210\u81EA\u52A8\u56DE\u8C03\u65F6\uFF0C\u53EF\u7C98\u8D34\u6388\u6743\u7801\u6216\u56DE\u8C03 URL\uFF1A",
  "auth.codePlaceholder": "\u6388\u6743\u7801\u6216 http://localhost:51121/oauth-callback?code=... \u5B8C\u6574\u94FE\u63A5",
  "auth.activate": "\u624B\u52A8\u6FC0\u6D3B",
  "auth.activating": "\u9A8C\u8BC1\u6FC0\u6D3B\u4E2D...",
  "auth.code.browser_manual": "\u65E0\u6CD5\u81EA\u52A8\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u8BF7\u4F7F\u7528\u4E0B\u65B9\u94FE\u63A5\u624B\u52A8\u6388\u6743\u3002",
  "auth.code.callback_failed": "\u6388\u6743\u56DE\u8C03\u5931\u8D25\u3002\u8BF7\u91CD\u65B0\u5F00\u59CB\u6388\u6743\u3002",
  "auth.code.no_active_flow": "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u6388\u6743\u6D41\u7A0B\u3002",
  "auth.code.invalid_code": "\u65E0\u6CD5\u8BC6\u522B\u6388\u6743\u7801\u3002\u8BF7\u7C98\u8D34\u6388\u6743\u7801\u6216\u5B8C\u6574\u56DE\u8C03 URL\u3002",
  "auth.code.invalid_state": "\u6388\u6743\u94FE\u63A5\u4E0D\u5C5E\u4E8E\u5F53\u524D\u6D41\u7A0B\u6216\u5DF2\u8FC7\u671F\u3002\u8BF7\u91CD\u65B0\u5F00\u59CB\u6388\u6743\u3002",
  "auth.code.exchange_failed": "\u6388\u6743\u9A8C\u8BC1\u5931\u8D25\u3002\u8BF7\u91CD\u65B0\u5F00\u59CB\u6388\u6743\u3002",
  "auth.code.primary_activated": "\u4E3B\u8D26\u53F7\u5DF2\u767B\u5F55\u3002",
  "auth.code.account_activated": "\u8D26\u53F7\u5DF2\u6DFB\u52A0\u5E76\u6FC0\u6D3B\u3002",
  "auth.code.missing_code": "\u8BF7\u8F93\u5165\u6388\u6743\u7801\u3002",
  "auth.code.request_failed": "\u8BF7\u6C42\u672A\u5B8C\u6210\u3002\u8BF7\u91CD\u8BD5\u3002",
  "api.genericError": "\u64CD\u4F5C\u672A\u5B8C\u6210\u3002\u8BF7\u91CD\u8BD5\u3002",
  "duration.day": "\u5929",
  "duration.hour": "\u5C0F\u65F6",
  "duration.minute": "\u5206\u949F",
  "permission.label": "\u6743\u9650\u6A21\u5F0F\uFF1A",
  "permission.plan": "plan\uFF08\u53EA\u8BFB\uFF09",
  "permission.acceptEdits": "accept-edits\uFF08\u6539\u4EE3\u7801\uFF09",
  "permission.skip": "skip\uFF08\u81EA\u52A8\u6279\u51C6\uFF1BAGY \u5185\u90E8\u4FDD\u62A4\u4ECD\u751F\u6548\uFF09",
  "effort.label": "\u601D\u8003\u5F3A\u5EA6\uFF1A",
  "effort.auto": "auto",
  "effort.low": "low",
  "effort.medium": "medium",
  "effort.high": "high",
  "pool.label": "\u53F7\u6C60\u8C03\u5EA6\uFF1A",
  "pool.sequential": "\u987A\u6B21\u8017\u5C3D",
  "pool.roundRobin": "\u8F6E\u8BE2\u5747\u8861",
  "models.label": "\u6A21\u578B\u663E\u793A\uFF1A",
  "models.empty": "\u6A21\u578B\u76EE\u5F55\u8FD8\u6CA1\u6709\u53EF\u7528\u6A21\u578B\uFF0C\u53D1\u4E00\u6B21\u5BF9\u8BDD\u6216\u70B9\u201C\u5237\u65B0\u989D\u5EA6\u201D\u540E\u518D\u6765\u7BA1\u7406",
  "models.hint": "\u70B9\u51FB\u5207\u6362\u663E\u793A/\u9690\u85CF\uFF1B\u5173\u95ED\u7684\u6A21\u578B\u4E0D\u5728\u6A21\u578B\u9009\u62E9\u5668\u4E2D\u5217\u51FA\uFF0C\u8FDB\u884C\u4E2D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u3002",
  "header.refreshQuota": "\u5237\u65B0\u989D\u5EA6",
  "header.refreshing": "\u5237\u65B0\u4E2D",
  "console.close": "\u5173\u95ED\uFF08Esc\uFF09",
  "header.badgeTitle": "Antigravity\uFF1A{count} \u4E2A\u8D26\u53F7\u5DF2\u5C31\u7EEA \xB7 \u70B9\u51FB\u6253\u5F00\u63A7\u5236\u53F0",
  "header.badgeLoading": "Antigravity \xB7 \u70B9\u51FB\u6253\u5F00\u63A7\u5236\u53F0",
  "account.type.agy": "Google Antigravity (CLI / OAuth)",
  "account.loginType": "\u767B\u5F55\u65B9\u5F0F\uFF1A",
  "account.dragHandle": "\u62D6\u62FD\u8C03\u6574\u4F18\u5148\u7EA7",
  "account.moveUp": "\u4E0A\u79FB\u4F18\u5148\u7EA7",
  "account.moveDown": "\u4E0B\u79FB\u4F18\u5148\u7EA7",
  "account.reordered": "\u8D26\u53F7\u4F18\u5148\u7EA7\u987A\u5E8F\u5DF2\u66F4\u65B0",
  "account.collapseAll": "\u5168\u90E8\u6298\u53E0",
  "account.expandAll": "\u5168\u90E8\u5C55\u5F00",
  "account.cardCollapse": "\u6536\u8D77\u8BE6\u60C5",
  "account.cardExpand": "\u5C55\u5F00\u8BE6\u60C5",
  "account.draggingTarget": "\u653E\u7F6E\u81F3\u6B64\u6210\u4E3A\u4F18\u5148\u7EA7 #{num}",
  "account.dragBanner": "\u6B63\u5728\u8C03\u6574\u4F18\u5148\u7EA7\uFF1A\u5C06\u3010{alias}\u3011\u79FB\u52A8\u81F3 #{num}",
  "account.dragHint": "\u62D6\u62FD\u5361\u7247\u53EF\u5B9E\u65F6\u8C03\u6574\u8C03\u5EA6\u4F18\u5148\u7EA7",
  "account.enable": "\u542F\u7528",
  "account.disable": "\u505C\u7528",
  "account.enableTitle": "\u542F\u7528\u6B64\u8D26\u53F7\uFF08\u52A0\u5165\u81EA\u52A8\u5207\u53F7\u4E0E\u8C03\u5EA6\uFF09",
  "account.disableTitle": "\u505C\u7528\u6B64\u8D26\u53F7\uFF08\u5207\u53F7\u4E0E\u8C03\u5EA6\u65F6\u8DF3\u8FC7\uFF09",
  "account.enabledToast": "\u5DF2\u542F\u7528\u8D26\u53F7\uFF1A{alias}",
  "account.disabledToast": "\u5DF2\u505C\u7528\u8D26\u53F7\uFF1A{alias}",
  "status.disabled": "\u5DF2\u505C\u7528",
  "header.warmup": "\u4E00\u952E\u9884\u70ED",
  "header.warmingUp": "\u9884\u70ED\u4E2D",
  "account.warmup": "\u9884\u70ED",
  "account.warmingUp": "\u9884\u70ED\u4E2D",
  "account.warmupTitle": "\u9884\u70ED\u8BE5\u8D26\u53F7\uFF08\u5411 Google \u53D1\u9001\u6781\u5C0F\u63A2\u6D3B\u8BF7\u6C42\uFF0C\u63D0\u524D\u6FC0\u6D3B 7 \u5929\u5468\u914D\u989D\u8BA1\u65F6\u5668\uFF09",
  "warmup.success": "\u8D26\u53F7\u9884\u70ED\u6210\u529F",
  "warmup.allSuccess": "\u4E00\u952E\u9884\u70ED\u4EFB\u52A1\u5DF2\u5B8C\u6210",
  "warmup.skipped": "\u5F53\u524D\u8D26\u53F7\u6216\u6A21\u578B\u5904\u4E8E\u51B7\u5374\u4E2D\uFF0C\u65E0\u9700\u9884\u70ED",
  "config.autoWarmup": "7\u5929\u5468\u914D\u989D\u81EA\u52A8\u9884\u70ED",
  "config.autoWarmupDesc": "\u5468\u914D\u989D\u5230\u8FBE\u91CD\u7F6E\u65F6\u95F4\u6216\u51B7\u542F\u52A8\u65F6\u81EA\u52A8\u5524\u9192 1 \u6B21\u542F\u52A8\u65B0\u5468\u671F"
};
var en = {
  "section.label": "Antigravity",
  "console.title": "Antigravity Management Console",
  "code.title": "Code",
  "code.inspect": "Inspect",
  "tv.command": "Command",
  "tv.write": "Write",
  "tv.edit": "Edit",
  "tv.read": "Read",
  "tv.search": "Search",
  "tv.webSearch": "Web Search",
  "tv.list": "List",
  "tv.delete": "Delete",
  "tv.tool": "Tool",
  "tv.noOutput": "(no output)",
  "tv.noMatches": "(no matches)",
  "tv.noChanges": "(no textual changes)",
  "tv.emptyDir": "(empty directory)",
  "tv.noDetail": "(no detail)",
  "tv.hint.expandInspect": "Click to expand \xB7 right-click to inspect",
  "tv.hint.collapseInspect": "Click to collapse \xB7 right-click to inspect",
  "tv.hint.expand": "Click to expand",
  "tv.hint.collapse": "Click to collapse",
  "tv.diffMore": "\u2026 {count} more lines not rendered",
  "code.copy": "Copy",
  "code.copied": "Copied",
  "status.ready": "Ready",
  "status.needsAuth": "Authentication required",
  "status.loading": "Loading Antigravity status...",
  "status.authRequired": "Sign in again required",
  "account.setActive": "Set as in use",
  "account.settingActive": "Switching...",
  "account.activeSet": "Active account switched",
  "account.activeSetFailed": "Account not currently eligible (cooldown or auth required)",
  "status.proxy": "Proxy",
  "status.inUse": "In use",
  "account.add": "Add Google account",
  "account.aliasDefault": "Backup Google account {number}",
  "account.defaultAlias": "Primary account (system sign-in)",
  "account.proxyPlaceholder": "Dedicated proxy URL (e.g. http://127.0.0.1:7890; leave blank to inherit global)",
  "account.aliasPlaceholder": "Account alias (for example: Backup account 2)",
  "account.removeTitle": "Remove this account",
  "aria.aliasInput": "Account alias",
  "aria.proxyInput": "Dedicated proxy URL",
  "aria.authCodeInput": "Authorization code or callback URL",
  "aria.closeToast": "Dismiss notification",
  "account.details": "Details",
  "account.collapse": "Collapse",
  "account.expandOthers": "Expand Claude & GPT-OSS quotas",
  "account.collapseOthers": "Collapse Claude & GPT-OSS quotas",
  "account.otherModels": "Claude / GPT quotas",
  "account.sync": "Sync",
  "account.syncing": "Syncing...",
  "account.syncTitle": "Refresh this account (sync email, quota, and models after switching accounts)",
  "account.models": "Per-model details:",
  "account.cooldown": "Some models are rate-limited; the account was switched automatically",
  "account.clearCooldown": "Clear cooldown",
  "account.localCooldown": " \xB7 local cooldown active",
  "account.removed": "Account removed: {alias}",
  "quota.fiveHour": "5-hour quota",
  "quota.weekly": "Weekly quota",
  "quota.refreshed": "Quota refreshed",
  "quota.windowReset": "Reset \xB7 available",
  "proxy.button": "Proxy",
  "proxy.placeholder": "Dedicated proxy URL (for example: http://127.0.0.1:7890; leave blank to use the global proxy)",
  "proxy.save": "Save",
  "proxy.saved": "Proxy saved",
  "cancel": "Cancel",
  "auth.openBrowser": "Open browser to sign in",
  "auth.openingBrowser": "Opening browser...",
  "auth.browserOpened": "The Google authorization page opened in your browser and will sync automatically after authorization",
  "auth.browserManual": "The browser could not be opened automatically; use the link below to authorize manually",
  "auth.startFailed": "Could not start Google authorization. Check your network or proxy configuration.",
  "auth.networkHint": "Check your network or proxy configuration",
  "auth.activated": "Account activated in the pool",
  "auth.failed": "Authorization failed",
  "auth.added": "Google account added and activated",
  "auth.codeFailed": "Authorization code validation failed",
  "auth.exchanging": "Verifying authorization and activating the account; please wait...",
  "auth.waiting": "Complete Google authorization in the browser. The account will activate automatically.",
  "auth.openManual": "If the browser did not open, click here to open the Google sign-in page manually",
  "auth.pasteHint": "If the automatic callback did not complete, paste the authorization code or callback URL:",
  "auth.codePlaceholder": "Authorization code or full http://localhost:51121/oauth-callback?code=... URL",
  "auth.activate": "Activate manually",
  "auth.activating": "Verifying and activating...",
  "auth.code.browser_manual": "The browser could not be opened automatically; use the link below to authorize manually.",
  "auth.code.callback_failed": "The authorization callback failed. Start authorization again.",
  "auth.code.no_active_flow": "There is no active authorization flow.",
  "auth.code.invalid_code": "The authorization code was not recognized. Paste the code or full callback URL.",
  "auth.code.invalid_state": "The authorization link does not belong to this flow or has expired. Start authorization again.",
  "auth.code.exchange_failed": "Authorization verification failed. Start authorization again.",
  "auth.code.primary_activated": "Primary account signed in.",
  "auth.code.account_activated": "Account added and activated.",
  "auth.code.missing_code": "Enter an authorization code.",
  "auth.code.request_failed": "The request did not complete. Try again.",
  "api.genericError": "The operation did not complete. Try again.",
  "duration.day": "d",
  "duration.hour": "h",
  "duration.minute": "m",
  "permission.label": "Permission mode:",
  "permission.plan": "plan (read-only)",
  "permission.acceptEdits": "accept-edits (edit code)",
  "permission.skip": "skip (auto-approve; AGY internal protections remain)",
  "effort.label": "Thinking effort:",
  "effort.auto": "auto",
  "effort.low": "low",
  "effort.medium": "medium",
  "effort.high": "high",
  "pool.label": "Account-pool scheduling:",
  "pool.sequential": "Use sequentially",
  "pool.roundRobin": "Round-robin",
  "models.label": "Model visibility:",
  "models.empty": 'No models in the catalog yet \u2014 send a message or click "Refresh quota", then come back to manage them',
  "models.hint": "Click to show/hide. Hidden models are not listed in the model picker; ongoing sessions are unaffected.",
  "header.refreshQuota": "Refresh quota",
  "header.refreshing": "Refreshing...",
  "console.close": "Close (Esc)",
  "header.badgeTitle": "Antigravity: {count} accounts ready \xB7 click to open the console",
  "header.badgeLoading": "Antigravity \xB7 click to open the console",
  "account.type.agy": "Google Antigravity (CLI / OAuth)",
  "account.loginType": "Login Method:",
  "account.dragHandle": "Drag to reorder priority",
  "account.moveUp": "Move up priority",
  "account.moveDown": "Move down priority",
  "account.reordered": "Account priorities reordered successfully",
  "account.collapseAll": "Collapse all",
  "account.expandAll": "Expand all",
  "account.cardCollapse": "Collapse",
  "account.cardExpand": "Expand details",
  "account.draggingTarget": "Drop here to set priority #{num}",
  "account.dragBanner": "Reordering: moving [{alias}] to priority #{num}",
  "account.dragHint": "Drag cards to reorder scheduling priority in real time",
  "account.enable": "Enable",
  "account.disable": "Disable",
  "account.enableTitle": "Enable this account (include in rotation)",
  "account.disableTitle": "Disable this account (skip in rotation)",
  "account.enabledToast": "Account enabled: {alias}",
  "account.disabledToast": "Account disabled: {alias}",
  "status.disabled": "Disabled",
  "header.warmup": "Auto Warmup",
  "header.warmingUp": "Warming up...",
  "account.warmup": "Warmup",
  "account.warmingUp": "Warming up...",
  "account.warmupTitle": "Warm up this account (trigger 7-day weekly reset timer)",
  "warmup.success": "Account warmed up successfully",
  "warmup.allSuccess": "Warmup completed for all accounts",
  "warmup.skipped": "Account or model is in cooldown, no warmup needed",
  "config.autoWarmup": "7-Day Quota Auto-Warmup",
  "config.autoWarmupDesc": "Automatically trigger a 1-token probe when weekly reset time is reached"
};

// src/client/agy/locale.ts
var bound;
var listeners2 = /* @__PURE__ */ new Set();
var notify2 = () => {
  for (const listener of [...listeners2]) listener();
};
function bindAgyLocale(source2) {
  bound = source2;
  notify2();
  return () => {
    if (bound !== source2) return;
    bound = void 0;
    notify2();
  };
}
var activeLanguage = () => (typeof navigator === "undefined" ? "en" : navigator.language).toLowerCase().startsWith("zh") ? "zh" : "en";
function fallbackTranslate(key2, params) {
  const dictionary = activeLanguage() === "zh" ? zh : en;
  const template = dictionary[key2] ?? en[key2] ?? key2;
  if (params === void 0) return template;
  return template.replace(/\{(\w+)\}/g, (match, name2) => params[name2] === void 0 ? match : String(params[name2]));
}
function useAgyTranslation() {
  const [, rerender] = (0, import_react5.useState)(0);
  (0, import_react5.useEffect)(() => {
    const listener = () => rerender((revision) => revision + 1);
    listeners2.add(listener);
    const unsubscribe = bound?.subscribe(listener);
    return () => {
      listeners2.delete(listener);
      unsubscribe?.();
    };
  }, []);
  if (bound === void 0) return fallbackTranslate;
  const translate = bound.bind(NS);
  return (key2, params) => {
    const text = translate(key2, params);
    return text === key2 ? fallbackTranslate(key2, params) : text;
  };
}

// src/client/agy/AgyConsole.tsx
var h = import_react6.createElement;
var win = globalThis;
var base = win.location?.origin ?? "";
var STATUS_CACHE_KEY = "dsh_agy_status_cache";
function loadInitialStatusCache() {
  try {
    const raw = win.localStorage?.getItem(STATUS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
  }
  return null;
}
var statusCache = loadInitialStatusCache();
async function getStatus() {
  try {
    const init = {};
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      init.signal = AbortSignal.timeout(5e3);
    }
    const res = await win.fetch?.(base + "/plugins/agy-worker/status", init);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function postJson(path, body) {
  try {
    const res = await win.fetch?.(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res) return null;
    try {
      const payload = await res.json();
      if (!res.ok && payload !== null && typeof payload === "object") {
        return { ok: false, ...payload };
      }
      return payload;
    } catch {
      return { ok: res.ok };
    }
  } catch {
    return null;
  }
}
var statusListeners = /* @__PURE__ */ new Set();
var statusPollTimer = null;
var statusPollInterval = 3e3;
var statusFetchSeq = 0;
function isStatusEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
function notifyStatus(st) {
  statusCache = st;
  try {
    win.localStorage?.setItem(STATUS_CACHE_KEY, JSON.stringify(st));
  } catch {
  }
  for (const fn of [...statusListeners]) {
    try {
      fn(st);
    } catch {
    }
  }
}
async function statusPollTick() {
  const seq = ++statusFetchSeq;
  const st = await getStatus();
  if (st !== null && seq === statusFetchSeq) {
    if (!isStatusEqual(statusCache, st)) {
      notifyStatus(st);
    }
  }
}
function ensureStatusPolling() {
  if (statusPollTimer !== null) {
    if (statusPollInterval !== 3e3) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    } else {
      return;
    }
  }
  statusPollInterval = 3e3;
  void statusPollTick();
  statusPollTimer = setInterval(() => {
    void statusPollTick();
  }, 3e3);
}
function stopStatusPollingIfIdle() {
  if (statusListeners.size === 0 && statusPollTimer !== null && statusPollInterval === 3e3) {
    clearInterval(statusPollTimer);
    statusPollInterval = 15e3;
    statusPollTimer = setInterval(() => {
      void statusPollTick();
    }, 15e3);
  }
}
function useAgyStatus() {
  const [status, setStatus] = (0, import_react6.useState)(statusCache);
  (0, import_react6.useEffect)(() => {
    statusListeners.add(setStatus);
    ensureStatusPolling();
    return () => {
      statusListeners.delete(setStatus);
      stopStatusPollingIfIdle();
    };
  }, []);
  const refresh = async () => {
    const st = await getStatus();
    if (st !== null && !isStatusEqual(statusCache, st)) notifyStatus(st);
  };
  return { status, refresh };
}
function formatQuotaWindow(t, resetTimeStr) {
  if (!resetTimeStr) return { resetText: "", expired: false };
  try {
    const d = new Date(resetTimeStr);
    const diffMs = d.getTime() - Date.now();
    if (Number.isNaN(d.getTime()) || diffMs <= 0) return { resetText: "", expired: true };
    const totalMins = Math.ceil(diffMs / 6e4);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor(totalMins % 1440 / 60);
    const mins = totalMins % 60;
    const isWeekly = days >= 1;
    const countdown = days > 0 ? `${days}${t("duration.day")} ${hours}${t("duration.hour")}` : hours > 0 ? `${hours}${t("duration.hour")} ${mins}${t("duration.minute")}` : `${mins}${t("duration.minute")}`;
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const resetText = isWeekly ? `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} (${countdown})` : `${hh}:${mm} (${countdown})`;
    return { resetText, expired: false };
  } catch {
    return { resetText: "", expired: true };
  }
}
function brandIcon(key2, size = 13) {
  return h("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    "aria-hidden": true,
    style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0 }
  }, h("path", { d: BRAND_PATHS[key2], fill: BRAND_COLORS[key2] }));
}
function uiIcon(key2, size = 12, color = "currentColor") {
  const p = UI_PATHS[key2];
  const isFilled = key2 === "star";
  return h("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    "aria-hidden": true,
    style: { display: "inline-block", verticalAlign: "-1.5px", flexShrink: 0 }
  }, h("path", {
    d: p,
    fill: isFilled ? color : "none",
    stroke: isFilled ? "none" : color,
    "stroke-width": isFilled ? void 0 : 2,
    "stroke-linecap": isFilled ? void 0 : "round",
    "stroke-linejoin": isFilled ? void 0 : "round"
  }));
}
var FAMILY_BRAND = {
  google: "gemini",
  // Gemini 4 Argon is a Google model — it keeps the Gemini mark.
  argon: "gemini",
  anthropic: "claude",
  openai: "openai"
};
function agyIcon(size = 16) {
  const uid = "agy-logo";
  return h(
    "svg",
    {
      viewBox: "0 0 36 36",
      width: size,
      height: size,
      fill: "none",
      "aria-hidden": true,
      style: { display: "inline-block", verticalAlign: "-2.5px", flexShrink: 0 }
    },
    h(
      "defs",
      null,
      h(
        "linearGradient",
        { id: `${uid}-orb`, x1: "12", y1: "11", x2: "25", y2: "25", gradientUnits: "userSpaceOnUse" },
        h("stop", { offset: "0%", "stop-color": "#38BDF8" }),
        h("stop", { offset: "45%", "stop-color": "#6366F1" }),
        h("stop", { offset: "85%", "stop-color": "#9333EA" }),
        h("stop", { offset: "100%", "stop-color": "#C026D3" })
      ),
      h(
        "linearGradient",
        { id: `${uid}-rf`, x1: "6", y1: "24", x2: "31", y2: "12", gradientUnits: "userSpaceOnUse" },
        h("stop", { offset: "0%", "stop-color": "#00D2FF" }),
        h("stop", { offset: "40%", "stop-color": "#38BDF8" }),
        h("stop", { offset: "70%", "stop-color": "#818CF8" }),
        h("stop", { offset: "100%", "stop-color": "#F43F5E" })
      ),
      h(
        "linearGradient",
        { id: `${uid}-rb`, x1: "7", y1: "12", x2: "29", y2: "24", gradientUnits: "userSpaceOnUse" },
        h("stop", { offset: "0%", "stop-color": "#38BDF8", "stop-opacity": "0.4" }),
        h("stop", { offset: "100%", "stop-color": "#A855F7", "stop-opacity": "0.4" })
      ),
      h(
        "linearGradient",
        { id: `${uid}-hl`, x1: "14", y1: "12", x2: "19", y2: "18", gradientUnits: "userSpaceOnUse" },
        h("stop", { offset: "0%", "stop-color": "#FFFFFF", "stop-opacity": "0.65" }),
        h("stop", { offset: "100%", "stop-color": "#FFFFFF", "stop-opacity": "0.05" })
      )
    ),
    h("path", {
      d: "M 6.8 14.2 C 8.2 9.6 17.8 7.2 26.2 10.8 C 28.0 11.6 29.3 12.6 30.2 13.8",
      stroke: `url(#${uid}-rb)`,
      "stroke-width": "2.4",
      "stroke-linecap": "round"
    }),
    h("circle", { cx: 18, cy: 18, r: 7.5, fill: `url(#${uid}-orb)` }),
    h("path", {
      d: "M 13.2 15.2 A 5.5 5.5 0 0 1 21.0 13.0 A 6.2 6.2 0 0 0 14.0 18.0 Z",
      fill: `url(#${uid}-hl)`
    }),
    h("path", {
      d: "M 30.2 13.8 C 31.4 18.2 21.8 26.2 12.8 24.2 C 9.4 23.4 7.4 21.8 6.6 19.6",
      stroke: `url(#${uid}-rf)`,
      "stroke-width": "2.6",
      "stroke-linecap": "round"
    }),
    h("circle", { cx: 8.2, cy: 18.2, r: 2.2, fill: "#00D2FF" }),
    h("circle", { cx: 8.2, cy: 18.2, r: 1, fill: "#FFFFFF" }),
    h("circle", { cx: 28.4, cy: 20.4, r: 1.8, fill: "#F43F5E" }),
    h("circle", { cx: 28.4, cy: 20.4, r: 0.8, fill: "#FFFFFF" })
  );
}
function renderFamilyQuotaBar(t, label, familyKey, acc, isRefreshing = false) {
  const info = acc.quotas[familyKey];
  const cd = acc.cooldowns[familyKey];
  const inCooldown = cd && cd.cooldownUntil > Date.now();
  const has5h = typeof info?.remainingFraction === "number" && Number.isFinite(info.remainingFraction);
  const pct5h = has5h ? Math.max(0, Math.min(100, Math.round(info.remainingFraction * 100))) : -1;
  const cdNote = inCooldown ? t("account.localCooldown") : "";
  const w5h = formatQuotaWindow(t, info?.resetTime);
  const expiredFull5h = w5h.expired && has5h && pct5h >= 100;
  const hasWeekly = typeof info?.weeklyFraction === "number" && Number.isFinite(info.weeklyFraction);
  const pctWeekly = hasWeekly ? Math.max(0, Math.min(100, Math.round(info.weeklyFraction * 100))) : -1;
  const wWeekly = formatQuotaWindow(t, info?.weeklyResetTime);
  const expiredFullWeekly = wWeekly.expired && hasWeekly && pctWeekly >= 100;
  const getColors = (pct) => {
    if (pct < 0) {
      return {
        bar: "var(--agy-quota-none-border)",
        text: "var(--agy-quota-none-text)",
        bg: "var(--agy-quota-none-bg)",
        border: "var(--agy-quota-none-border)"
      };
    }
    if (pct <= 20) {
      return {
        bar: "linear-gradient(90deg, #dc2626, #ef4444)",
        text: "var(--agy-quota-low-text)",
        bg: "var(--agy-quota-low-bg)",
        border: "var(--agy-quota-low-border)"
      };
    }
    if (pct <= 50) {
      return {
        bar: "linear-gradient(90deg, #d97706, #f59e0b)",
        text: "var(--agy-quota-med-text)",
        bg: "var(--agy-quota-med-bg)",
        border: "var(--agy-quota-med-border)"
      };
    }
    return {
      bar: "linear-gradient(90deg, #059669, #10b981)",
      text: "var(--agy-quota-high-text)",
      bg: "var(--agy-quota-high-bg)",
      border: "var(--agy-quota-high-border)"
    };
  };
  const c5h = getColors(pct5h);
  const cWeekly = getColors(pctWeekly);
  const renderLine = (windowName, percent, c, resetStr, rawFraction, rawReset) => {
    const isShimmer = percent < 0 || isRefreshing;
    const tooltipText = typeof rawFraction === "number" ? `${(rawFraction * 100).toFixed(1)}% (raw: ${rawFraction})${rawReset ? ` \xB7 reset: ${rawReset}` : ""}` : resetStr ? `\u21BB ${resetStr}` : void 0;
    return h(
      "div",
      { style: { display: "flex", alignItems: "center", fontSize: "11.5px", margin: "4px 0" } },
      h("span", { style: { width: "52px", color: "var(--agy-text-window-label)", fontSize: "11px", fontWeight: 700, flexShrink: 0 } }, windowName),
      h(
        "div",
        {
          className: isShimmer ? "agy-shimmer-track" : "",
          style: S.progressBarBg
        },
        h("div", {
          className: "agy-progress-fill",
          style: {
            width: `${percent < 0 ? 100 : percent}%`,
            height: "100%",
            background: c.bar,
            borderRadius: "3px"
          }
        })
      ),
      h(
        "div",
        { style: { display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "140px", justifyContent: "flex-end", flexShrink: 0 } },
        h("span", {
          title: tooltipText,
          style: {
            padding: "2px 7px",
            borderRadius: "4px",
            background: c.bg,
            color: c.text,
            border: `1px solid ${c.border}`,
            fontWeight: 700,
            fontSize: "11.5px",
            lineHeight: 1.2,
            cursor: tooltipText ? "help" : "default"
          }
        }, percent < 0 ? "\u2014" : `${percent}%`),
        resetStr ? h("span", { style: { color: "var(--agy-text-secondary)", fontSize: "11px", fontWeight: 500 } }, `\u21BB ${resetStr}`) : null
      )
    );
  };
  return h(
    "div",
    { style: { margin: "6px 0", padding: "8px 10px", background: "var(--agy-bg-subbox)", borderRadius: "7px", border: "1px solid var(--agy-border-box)" } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "12.5px", marginBottom: "5px", color: "var(--agy-text-primary)" } },
      brandIcon(FAMILY_BRAND[familyKey], 14),
      h("span", null, label)
    ),
    // Argon is a WEEKLY-only counter today: render the 5h row only when
    // the backend actually reports one, never as a permanent "—" ghost.
    familyKey !== "argon" || has5h ? renderLine(t("quota.fiveHour"), pct5h, c5h, w5h.resetText ? w5h.resetText + cdNote : expiredFull5h ? t("quota.windowReset") + cdNote : cdNote.replace(/^ · /, ""), info?.remainingFraction, info?.resetTime) : null,
    renderLine(t("quota.weekly"), pctWeekly, cWeekly, wWeekly.resetText ? wWeekly.resetText : expiredFullWeekly ? t("quota.windowReset") : "", info?.weeklyFraction, info?.weeklyResetTime)
  );
}
var AGY_CONSOLE_CSS = `
@keyframes agy-spin {
	0% { transform: rotate(0deg); }
	100% { transform: rotate(360deg); }
}

.agy-console {
	--agy-font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif);
	--agy-bg-panel: var(--dsw-alias-bg-layer-2, #ffffff);
	--agy-bg-card: var(--dsw-alias-bg-layer-2, #ffffff);
	--agy-bg-card-primary: #f0f7ff;
	--agy-bg-header: var(--dsw-alias-bg-layer-1, #f8fafc);
	--agy-bg-box: var(--dsw-alias-bg-layer-1, #f8fafc);
	--agy-bg-subbox: var(--dsw-alias-bg-layer-3, #f1f5f9);
	--agy-bg-input: var(--dsw-alias-bg-layer-1, #ffffff);
	--agy-bg-btn: var(--dsw-alias-bg-layer-3, #f1f5f9);
	--agy-bg-btn-hover: var(--dsw-alias-interactive-bg-hover, #e2e8f0);
	--agy-bg-btn-primary: var(--dsw-alias-state-business-primary, #2563eb);
	--agy-bg-progress-track: #e2e8f0;

	--agy-border-card: var(--dsw-alias-border-l2, #e2e8f0);
	--agy-border-card-primary: #3b82f6;
	--agy-border-box: var(--dsw-alias-border-l1, #e2e8f0);
	--agy-border-subbox: var(--dsw-alias-border-l2, #cbd5e1);
	--agy-border-input: var(--dsw-alias-border-l2, #cbd5e1);
	--agy-border-input-focus: var(--dsw-alias-state-business-primary, #2563eb);
	--agy-border-btn: var(--dsw-alias-border-l2, #cbd5e1);
	--agy-border-btn-primary: #2563eb;
	--agy-border-divider: var(--dsw-alias-border-l2, #e2e8f0);

	--agy-text-primary: var(--dsw-alias-label-primary, #0f172a);
	--agy-text-secondary: var(--dsw-alias-label-secondary, #334155);
	--agy-text-tertiary: var(--dsw-alias-label-tertiary, #64748b);
	--agy-text-muted: var(--dsw-alias-label-caption, #94a3b8);
	--agy-text-btn: var(--dsw-alias-label-primary, #0f172a);
	--agy-text-btn-primary: #ffffff;
	--agy-text-window-label: #2563eb;

	--agy-shadow-card: 0 1px 3px rgba(0, 0, 0, 0.05);
	--agy-shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.08);
	--agy-shadow-card-primary: 0 0 0 1px #3b82f6, 0 4px 14px rgba(37, 99, 235, 0.12);
	--agy-shadow-modal: 0 20px 50px rgba(0, 0, 0, 0.18);
	--agy-modal-backdrop: rgba(15, 23, 42, 0.5);

	/* Badges */
	--agy-badge-primary-bg: #dbeafe;
	--agy-badge-primary-text: #1e40af;
	--agy-badge-primary-border: #60a5fa;

	--agy-badge-tag-bg: #f1f5f9;
	--agy-badge-tag-text: #334155;
	--agy-badge-tag-border: #cbd5e1;

	--agy-badge-email-bg: #eff6ff;
	--agy-badge-email-text: #1d4ed8;
	--agy-badge-email-border: #bfdbfe;

	--agy-badge-proxy-bg: #ecfdf5;
	--agy-badge-proxy-text: #047857;
	--agy-badge-proxy-border: #a7f3d0;

	--agy-badge-ready-bg: #ecfdf5;
	--agy-badge-ready-text: #047857;
	--agy-badge-ready-border: #a7f3d0;

	--agy-badge-unready-bg: #eff6ff;
	--agy-badge-unready-text: #1d4ed8;
	--agy-badge-unready-border: #bfdbfe;

	/* Quota status pills */
	--agy-quota-high-bg: #ecfdf5;
	--agy-quota-high-text: #047857;
	--agy-quota-high-border: #a7f3d0;
	--agy-quota-med-bg: #fffbeb;
	--agy-quota-med-text: #b45309;
	--agy-quota-med-border: #fde68a;
	--agy-quota-low-bg: #fef2f2;
	--agy-quota-low-text: #b91c1c;
	--agy-quota-low-border: #fecaca;
	--agy-quota-none-bg: #f1f5f9;
	--agy-quota-none-text: #64748b;
	--agy-quota-none-border: #cbd5e1;

	/* Danger button */
	--agy-danger-bg: #fef2f2;
	--agy-danger-text: #b91c1c;
	--agy-danger-border: #fecaca;
	--agy-danger-hover-bg: #fee2e2;

	/* Warning banner */
	--agy-warn-bg: #fffbeb;
	--agy-warn-text: #92400e;
	--agy-warn-border: #fcd34d;
	--agy-warn-btn-bg: #fef3c7;
	--agy-warn-btn-text: #92400e;
	--agy-warn-btn-border: #f59e0b;

	/* Toast notices */
	--agy-toast-success-bg: #ecfdf5;
	--agy-toast-success-text: #065f46;
	--agy-toast-success-border: #6ee7b7;
	--agy-toast-info-bg: #eff6ff;
	--agy-toast-info-text: #1e40af;
	--agy-toast-info-border: #93c5fd;
	--agy-toast-warn-bg: #fffbeb;
	--agy-toast-warn-text: #92400e;
	--agy-toast-warn-border: #fcd34d;
	--agy-toast-error-bg: #fef2f2;
	--agy-toast-error-text: #991b1b;
	--agy-toast-error-border: #fca5a5;

	/* Auth Modal / Box */
	--agy-auth-box-bg: #f0f7ff;
	--agy-auth-box-border: #3b82f6;

	/* Segment control */
	--agy-seg-group-bg: #e2e8f0;
	--agy-seg-group-border: #cbd5e1;
	--agy-seg-btn-text: #475569;
	--agy-seg-btn-active-bg: var(--dsw-alias-state-business-primary, #2563eb);
	--agy-seg-btn-active-text: #ffffff;
	--agy-seg-danger-bg: #dc2626;
	--agy-seg-danger-text: #ffffff;
	--agy-seg-danger-border: #b91c1c;
}

:where(body[data-ds-dark-theme], body.dark, [data-theme="dark"]) .agy-console {
	--agy-bg-panel: var(--dsw-alias-bg-layer-2, #0f172a);
	--agy-bg-card: var(--dsw-alias-bg-layer-2, #1e293b);
	--agy-bg-card-primary: #111d33;
	--agy-bg-header: var(--dsw-alias-bg-layer-1, #1e293b);
	--agy-bg-box: var(--dsw-alias-bg-layer-1, #0f172a);
	--agy-bg-subbox: var(--dsw-alias-bg-layer-3, #090d16);
	--agy-bg-input: var(--dsw-alias-bg-layer-3, #090d16);
	--agy-bg-btn: var(--dsw-alias-bg-layer-3, #334155);
	--agy-bg-btn-hover: var(--dsw-alias-interactive-bg-hover, #475569);
	--agy-bg-btn-primary: var(--dsw-alias-state-business-primary, #2563eb);
	--agy-bg-progress-track: #1e293b;

	--agy-border-card: var(--dsw-alias-border-l2, #334155);
	--agy-border-card-primary: #3b82f6;
	--agy-border-box: var(--dsw-alias-border-l1, #1e293b);
	--agy-border-subbox: var(--dsw-alias-border-l2, #334155);
	--agy-border-input: var(--dsw-alias-border-l2, #334155);
	--agy-border-input-focus: #3b82f6;
	--agy-border-btn: var(--dsw-alias-border-l2, #475569);
	--agy-border-btn-primary: #3b82f6;
	--agy-border-divider: var(--dsw-alias-border-l2, #334155);

	--agy-text-primary: var(--dsw-alias-label-primary, #f8fafc);
	--agy-text-secondary: var(--dsw-alias-label-secondary, #cbd5e1);
	--agy-text-tertiary: var(--dsw-alias-label-tertiary, #94a3b8);
	--agy-text-muted: var(--dsw-alias-label-caption, #64748b);
	--agy-text-btn: var(--dsw-alias-label-primary, #ffffff);
	--agy-text-btn-primary: #ffffff;
	--agy-text-window-label: #93c5fd;

	--agy-shadow-card: 0 2px 8px rgba(0, 0, 0, 0.3);
	--agy-shadow-card-hover: 0 6px 16px rgba(0, 0, 0, 0.4);
	--agy-shadow-card-primary: 0 0 16px rgba(59, 130, 246, 0.25);
	--agy-shadow-modal: 0 25px 60px rgba(0, 0, 0, 0.8);
	--agy-modal-backdrop: rgba(0, 0, 0, 0.75);

	/* Badges */
	--agy-badge-primary-bg: #1e3a8a;
	--agy-badge-primary-text: #93c5fd;
	--agy-badge-primary-border: #3b82f6;

	--agy-badge-tag-bg: #0f172a;
	--agy-badge-tag-text: #cbd5e1;
	--agy-badge-tag-border: #334155;

	--agy-badge-email-bg: #1e293b;
	--agy-badge-email-text: #93c5fd;
	--agy-badge-email-border: #3b82f6;

	--agy-badge-proxy-bg: #064e3b;
	--agy-badge-proxy-text: #6ee7b7;
	--agy-badge-proxy-border: #059669;

	--agy-badge-ready-bg: rgba(16, 185, 129, 0.15);
	--agy-badge-ready-text: #34d399;
	--agy-badge-ready-border: rgba(16, 185, 129, 0.35);

	--agy-badge-unready-bg: rgba(59, 130, 246, 0.15);
	--agy-badge-unready-text: #93c5fd;
	--agy-badge-unready-border: rgba(59, 130, 246, 0.35);

	/* Quota status pills */
	--agy-quota-high-bg: #064e3b;
	--agy-quota-high-text: #6ee7b7;
	--agy-quota-high-border: #059669;
	--agy-quota-med-bg: #451a03;
	--agy-quota-med-text: #fde68a;
	--agy-quota-med-border: #d97706;
	--agy-quota-low-bg: #450a0a;
	--agy-quota-low-text: #fca5a5;
	--agy-quota-low-border: #dc2626;
	--agy-quota-none-bg: #1e293b;
	--agy-quota-none-text: #94a3b8;
	--agy-quota-none-border: #475569;

	/* Danger button */
	--agy-danger-bg: #450a0a;
	--agy-danger-text: #fca5a5;
	--agy-danger-border: #ef4444;
	--agy-danger-hover-bg: #5f1313;

	/* Warning banner */
	--agy-warn-bg: #451a03;
	--agy-warn-text: #fde68a;
	--agy-warn-border: #d97706;
	--agy-warn-btn-bg: #78350f;
	--agy-warn-btn-text: #fde68a;
	--agy-warn-btn-border: #d97706;

	/* Toast notices */
	--agy-toast-success-bg: #064e3b;
	--agy-toast-success-text: #6ee7b7;
	--agy-toast-success-border: #059669;
	--agy-toast-info-bg: #1e3a8a;
	--agy-toast-info-text: #93c5fd;
	--agy-toast-info-border: #3b82f6;
	--agy-toast-warn-bg: #451a03;
	--agy-toast-warn-text: #fde68a;
	--agy-toast-warn-border: #d97706;
	--agy-toast-error-bg: #450a0a;
	--agy-toast-error-text: #fca5a5;
	--agy-toast-error-border: #dc2626;

	/* Auth Modal / Box */
	--agy-auth-box-bg: #0f223a;
	--agy-auth-box-border: #3b82f6;

	/* Segment control */
	--agy-seg-group-bg: #090d16;
	--agy-seg-group-border: #334155;
	--agy-seg-btn-text: #94a3b8;
	--agy-seg-btn-active-bg: var(--dsw-alias-state-business-primary, #2563eb);
	--agy-seg-btn-active-text: #ffffff;
	--agy-seg-danger-bg: #7f1d1d;
	--agy-seg-danger-text: #fca5a5;
	--agy-seg-danger-border: #ef4444;
}

.agy-spinner {
	display: inline-block;
	width: 12px;
	height: 12px;
	border: 2px solid currentColor;
	border-top-color: transparent;
	border-radius: 50%;
	animation: agy-spin 0.75s linear infinite;
	vertical-align: -2px;
	margin-right: 5px;
}
.agy-pulse-dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
}
.agy-card-hover {
	transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.agy-card-hover:hover {
	border-color: var(--agy-border-card-primary, #3b82f6) !important;
	box-shadow: var(--agy-shadow-card-hover) !important;
}

.agy-btn {
	transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, filter 0.15s ease, transform 0.15s ease;
	user-select: none;
}
.agy-btn:hover:not(:disabled) {
	filter: brightness(1.08);
	transform: translateY(-0.5px);
}
.agy-btn:active:not(:disabled) {
	transform: translateY(0.5px);
}
.agy-progress-fill {
	transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes agy-shimmer {
	0% { transform: translateX(-100%); }
	100% { transform: translateX(100%); }
}
.agy-shimmer-track {
	position: relative;
	overflow: hidden;
	contain: paint;
	transform: translateZ(0);
	isolation: isolate;
}
.agy-shimmer-track::after {
	content: '';
	position: absolute;
	top: 0; left: 0; right: 0; bottom: 0;
	background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.22) 50%, transparent 100%);
	transform: translateX(-100%) translateZ(0);
	will-change: transform;
	animation: agy-shimmer 1.8s infinite ease-in-out;
	pointer-events: none;
}
.agy-modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 9999;
	background: var(--agy-modal-backdrop);
	/* NO full-screen backdrop blur here. Filtering the whole viewport forces
	   Chromium/Electron to re-sample the page every frame while anything behind
	   it moves (scroll, streaming, animations) \u2014 the recurring "\u6253\u5F00\u63A7\u5236\u53F0\u540E\u6EDA\u52A8
	   \u95EA\u5C4F" root cause. The rgba dim below is stable and flicker-free. */
	overscroll-behavior: contain;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	box-sizing: border-box;
}
/* While the console is open, freeze the conversation scroller behind it so
   nothing moves/reflows under the fixed overlay. scrollbar-gutter:stable on the
   host scroller keeps the width from jumping when overflow flips to hidden. */
html.agy-console-modal-open [data-conversation-scroll] {
	overflow: hidden !important;
	overscroll-behavior: contain;
}
.agy-modal-panel {
	position: relative;
	width: 100%;
	max-width: 640px;
	max-height: min(820px, calc(100vh - 48px));
	background: var(--agy-bg-panel);
	border: 1px solid var(--agy-border-card);
	border-radius: 14px;
	box-shadow: var(--agy-shadow-modal);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	color: var(--agy-text-primary);
	font-family: var(--agy-font-family);
	transform: translateZ(0);
	contain: content;
}
.agy-submodel-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 7px 10px;
	font-size: 11.5px;
	border-radius: 6px;
	background: var(--agy-bg-subbox);
	border: 1px solid var(--agy-border-box);
	margin: 4px 0;
	color: var(--agy-text-primary);
}
`;
var S = {
  container: {
    lineHeight: 1.5,
    fontSize: "13px",
    fontFamily: "var(--agy-font-family)",
    color: "var(--agy-text-primary)"
  },
  headerCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "var(--agy-bg-header)",
    border: "1px solid var(--agy-border-card)",
    borderRadius: "10px",
    marginBottom: "12px",
    color: "var(--agy-text-primary)",
    boxShadow: "var(--agy-shadow-card)"
  },
  badgePrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "var(--agy-badge-primary-bg)",
    color: "var(--agy-badge-primary-text)",
    border: "1px solid var(--agy-badge-primary-border)",
    padding: "2px 8px",
    borderRadius: "5px",
    fontSize: "11px",
    fontWeight: 700
  },
  badgeTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "var(--agy-badge-tag-bg)",
    color: "var(--agy-badge-tag-text)",
    border: "1px solid var(--agy-badge-tag-border)",
    padding: "2px 7px",
    borderRadius: "5px",
    fontSize: "11px",
    fontWeight: 600
  },
  badgeReady: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "var(--agy-badge-ready-bg)",
    color: "var(--agy-badge-ready-text)",
    border: "1px solid var(--agy-badge-ready-border)",
    padding: "2px 8px",
    borderRadius: "5px",
    fontSize: "11px",
    fontWeight: 700
  },
  badgeUnready: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "var(--agy-badge-unready-bg)",
    color: "var(--agy-badge-unready-text)",
    border: "1px solid var(--agy-badge-unready-border)",
    padding: "2px 8px",
    borderRadius: "5px",
    fontSize: "11px",
    fontWeight: 700
  },
  card: {
    background: "var(--agy-bg-card)",
    border: "1px solid var(--agy-border-card)",
    borderRadius: "8px",
    padding: "10px 14px",
    marginBottom: "8px",
    color: "var(--agy-text-primary)",
    boxShadow: "var(--agy-shadow-card)",
    transition: "border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease"
  },
  cardPrimary: {
    background: "var(--agy-bg-card)",
    border: "1px solid var(--agy-border-card)",
    borderRadius: "8px",
    padding: "10px 14px",
    marginBottom: "8px",
    color: "var(--agy-text-primary)",
    boxShadow: "var(--agy-shadow-card)",
    transition: "border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease"
  },
  quotaBox: {
    background: "var(--agy-bg-box)",
    border: "1px solid var(--agy-border-box)",
    borderRadius: "8px",
    padding: "8px 10px",
    marginTop: "8px"
  },
  progressBarBg: {
    flex: "1",
    height: "8px",
    borderRadius: "4px",
    background: "var(--agy-bg-progress-track)",
    border: "1px solid var(--agy-border-box)",
    overflow: "hidden",
    margin: "0 10px"
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 12px",
    borderRadius: "6px",
    border: "1px solid var(--agy-border-btn)",
    background: "var(--agy-bg-btn)",
    color: "var(--agy-text-btn)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600
  },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 13px",
    borderRadius: "6px",
    border: "1px solid var(--agy-border-btn-primary)",
    background: "var(--agy-bg-btn-primary)",
    color: "var(--agy-text-btn-primary)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 700,
    boxShadow: "0 2px 6px rgba(37, 99, 235, 0.35)"
  },
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 9px",
    borderRadius: "6px",
    border: "1px solid var(--agy-danger-border)",
    background: "var(--agy-danger-bg)",
    color: "var(--agy-danger-text)",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 600
  },
  btnSm: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 9px",
    borderRadius: "5px",
    border: "1px solid var(--agy-border-btn)",
    background: "var(--agy-bg-btn)",
    color: "var(--agy-text-btn)",
    cursor: "pointer",
    fontSize: "11.5px",
    fontWeight: 600
  },
  btnSmPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 9px",
    borderRadius: "5px",
    border: "1px solid var(--agy-border-btn-primary)",
    background: "var(--agy-bg-btn-primary)",
    color: "var(--agy-text-btn-primary)",
    cursor: "pointer",
    fontSize: "11.5px",
    fontWeight: 700
  },
  segGroup: {
    display: "inline-flex",
    background: "var(--agy-seg-group-bg)",
    borderRadius: "7px",
    padding: "3px",
    border: "1px solid var(--agy-seg-group-border)"
  },
  segBtn: {
    padding: "4px 10px",
    borderRadius: "4px",
    border: "none",
    background: "transparent",
    color: "var(--agy-seg-btn-text)",
    cursor: "pointer",
    fontSize: "11.5px",
    fontWeight: 600
  },
  segBtnActive: {
    padding: "4px 10px",
    borderRadius: "4px",
    border: "none",
    background: "var(--agy-seg-btn-active-bg)",
    color: "var(--agy-seg-btn-active-text)",
    cursor: "pointer",
    fontSize: "11.5px",
    fontWeight: 700,
    boxShadow: "0 2px 4px rgba(37, 99, 235, 0.4)"
  },
  input: {
    flex: "1",
    padding: "7px 12px",
    borderRadius: "6px",
    border: "1.5px solid var(--agy-border-input)",
    background: "var(--agy-bg-input)",
    color: "var(--agy-text-primary)",
    fontSize: "12.5px",
    outline: "none"
  },
  muted: { color: "var(--agy-text-tertiary)", fontSize: "11.5px" },
  noticeBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderRadius: "8px",
    marginBottom: "12px",
    fontSize: "12.5px",
    fontWeight: 500
  },
  authModal: {
    background: "var(--agy-auth-box-bg)",
    border: "1.5px solid var(--agy-auth-box-border)",
    borderRadius: "10px",
    padding: "14px 16px",
    marginBottom: "14px",
    color: "var(--agy-text-primary)"
  }
};
function AgyConsole(props) {
  const t = useAgyTranslation();
  const { status, refresh } = useAgyStatus();
  const [aliasInput, setAliasInput] = (0, import_react6.useState)("");
  const [proxyInputs, setProxyInputs] = (0, import_react6.useState)({});
  const [editingProxyId, setEditingProxyId] = (0, import_react6.useState)(null);
  const [addingAccount, setAddingAccount] = (0, import_react6.useState)(false);
  const [authCodeInput, setAuthCodeInput] = (0, import_react6.useState)("");
  const [loadingAction, setLoadingAction] = (0, import_react6.useState)(null);
  const [toast, setToast] = (0, import_react6.useState)(null);
  const [expandedModels, setExpandedModels] = (0, import_react6.useState)({});
  const [addProxyInput, setAddProxyInput] = (0, import_react6.useState)("");
  const [optimisticActiveId, setOptimisticActiveId] = (0, import_react6.useState)(null);
  const [, setTimeTick] = (0, import_react6.useState)(0);
  (0, import_react6.useEffect)(() => {
    const timer = setInterval(() => setTimeTick((n) => n + 1), 3e4);
    return () => clearInterval(timer);
  }, []);
  const flowStartedRef = (0, import_react6.useRef)(false);
  const safeMessage = (code) => {
    const key2 = `auth.code.${code ?? ""}`;
    return code && key2 in en ? t(key2) : t("api.genericError");
  };
  (0, import_react6.useEffect)(() => {
    if (!addingAccount || !flowStartedRef.current) return;
    const pa = status?.poolAuth;
    if (!pa) return;
    if (pa.phase === "done") {
      flowStartedRef.current = false;
      setAddingAccount(false);
      setAuthCodeInput("");
      setAliasInput("");
      setAddProxyInput("");
      showToast(safeMessage(pa.code), "success");
    } else if (pa.phase === "failed") {
      flowStartedRef.current = false;
      showToast(safeMessage(pa.code), "error");
    }
  }, [addingAccount, status?.poolAuth?.phase, status?.poolAuth?.code]);
  const toastTimerRef = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => () => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
  }, []);
  const showToast = (text, type = "info") => {
    setToast({ text, type, id: Date.now() });
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast((prev) => prev !== null && prev.text === text ? null : prev);
    }, 6e3);
  };
  const actionFailed = () => {
    showToast(t("api.genericError"), "error");
  };
  const handleBeginAddAccount = async () => {
    setLoadingAction("pool:beginAdd");
    const alias = aliasInput.trim();
    const proxyUrl = addProxyInput.trim();
    const res = await postJson("/plugins/agy-worker/pool/begin-add", {
      ...alias ? { alias } : {},
      ...proxyUrl ? { proxyUrl } : {}
    });
    setLoadingAction(null);
    if (res && res.ok) {
      flowStartedRef.current = true;
      await refresh();
      if (res.browserOpened) {
        showToast(t("auth.browserOpened"), "info");
      } else {
        showToast(t("auth.browserManual"), "warn");
      }
    } else {
      showToast(res?.code ? safeMessage(res.code) : t("auth.startFailed"), "error");
    }
  };
  const handleCompleteAddAccount = async () => {
    if (!authCodeInput.trim()) return;
    setLoadingAction("pool:completeAdd");
    const res = await postJson("/plugins/agy-worker/pool/complete-add", { code: authCodeInput.trim() });
    setLoadingAction(null);
    if (res && res.ok) {
      flowStartedRef.current = false;
      setAuthCodeInput("");
      setAliasInput("");
      setAddProxyInput("");
      setAddingAccount(false);
      await refresh();
      showToast(safeMessage(res.code), "success");
    } else {
      showToast(safeMessage(res?.code), "error");
    }
  };
  const handleCancelAddAccount = async () => {
    flowStartedRef.current = false;
    await postJson("/plugins/agy-worker/pool/cancel-add", {});
    setAuthCodeInput("");
    setAliasInput("");
    setAddProxyInput("");
    setAddingAccount(false);
    await refresh();
  };
  const reorderAccounts = async (newIds) => {
    setLoadingAction("pool:reorder");
    const res = await postJson("/plugins/agy-worker/pool/reorder", { ids: newIds });
    setLoadingAction(null);
    if (res && res.ok) {
      await refresh();
      showToast(t("account.reordered"), "success");
    } else {
      actionFailed();
    }
  };
  const moveAccount = async (accId, delta) => {
    const ids = (status?.pool?.accounts ?? []).map((a) => a.id);
    const idx = ids.indexOf(accId);
    if (idx === -1) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= ids.length) return;
    const [moved] = ids.splice(idx, 1);
    if (moved) ids.splice(newIdx, 0, moved);
    await reorderAccounts(ids);
  };
  const setCfg = async (key2, value) => {
    setLoadingAction(`config:${key2}`);
    const res = await postJson("/plugins/agy-worker/config", { key: key2, value });
    if (res === null || res?.ok === false) {
      setLoadingAction(null);
      actionFailed();
      return;
    }
    await refresh();
    setLoadingAction(null);
  };
  const hiddenPendingRef = (0, import_react6.useRef)(null);
  const toggleModelHidden = async (id, hide) => {
    const next = new Set(hiddenPendingRef.current ?? status?.hiddenModels ?? []);
    if (hide) next.add(id);
    else next.delete(id);
    hiddenPendingRef.current = next;
    try {
      await setCfg("hiddenModels", Array.from(next));
    } finally {
      if (hiddenPendingRef.current === next) hiddenPendingRef.current = null;
    }
  };
  const setActiveAccount = async (id) => {
    setOptimisticActiveId(id);
    setLoadingAction(`active:${id}`);
    try {
      const res = await postJson("/plugins/agy-worker/pool/set-active", { id });
      if (res && res.ok) {
        await refresh();
        showToast(t("account.activeSet"), "success");
      } else {
        setOptimisticActiveId(null);
        showToast(res?.error || t("account.activeSetFailed"), "error");
      }
    } catch {
      setOptimisticActiveId(null);
      showToast(t("account.activeSetFailed"), "error");
    } finally {
      setOptimisticActiveId(null);
      setLoadingAction(null);
    }
  };
  const removeAccount = async (id, alias) => {
    setLoadingAction(`remove:${id}`);
    const res = await postJson("/plugins/agy-worker/pool/remove", { id });
    if (res === null || res?.ok === false) {
      setLoadingAction(null);
      actionFailed();
      return;
    }
    await refresh();
    setLoadingAction(null);
    showToast(t("account.removed", { alias }), "info");
  };
  const toggleAccountEnabled = async (acc) => {
    const nextState = !acc.enabled;
    setLoadingAction(`enable:${acc.id}`);
    const res = await postJson("/plugins/agy-worker/pool/enable", { id: acc.id, enabled: nextState });
    if (res === null || res?.ok === false) {
      setLoadingAction(null);
      actionFailed();
      return;
    }
    await refresh();
    setLoadingAction(null);
    const legacyDefault = acc.defaultAlias === void 0 && acc.systemHome && acc.alias === "\u4E3B\u8D26\u53F7 (\u7CFB\u7EDF\u767B\u5F55)";
    const displayAlias = acc.defaultAlias || legacyDefault ? acc.systemHome ? t("account.defaultAlias") : acc.alias : acc.alias;
    showToast(t(nextState ? "account.enabledToast" : "account.disabledToast", { alias: displayAlias }), "success");
  };
  const refreshQuota = async (id) => {
    setLoadingAction(id ? `refresh:${id}` : "refresh:all");
    try {
      const res = await postJson("/plugins/agy-worker/pool/refresh-quota", { id });
      if (res === null || res?.ok === false) {
        actionFailed();
        return;
      }
      await refresh();
      showToast(t("quota.refreshed"), "success");
    } finally {
      setLoadingAction(null);
    }
  };
  const warmupAccount = async (id) => {
    setLoadingAction(id ? `warmup:${id}` : "warmup:all");
    try {
      const res = await postJson("/plugins/agy-worker/pool/warmup", {
        id,
        force: true,
        ...id ? {} : { all: true }
      });
      if (res === null || res?.ok === false) {
        actionFailed();
        return;
      }
      await refresh();
      const results = Array.isArray(res.results) ? res.results : [];
      const skippedCount = results.filter((r) => r.skipped).length;
      const successCount = results.filter((r) => r.success && !r.skipped).length;
      const failedCount = results.length - skippedCount - successCount;
      if (successCount > 0) {
        showToast(id ? t("warmup.success") : t("warmup.allSuccess"), "success");
      } else if (skippedCount > 0 && failedCount === 0) {
        showToast(t("warmup.skipped"), "info");
      } else {
        actionFailed();
      }
    } finally {
      setLoadingAction(null);
    }
  };
  const saveProxy = async (id) => {
    setLoadingAction(`proxy:${id}`);
    const proxyUrl = proxyInputs[id];
    const res = await postJson("/plugins/agy-worker/pool/proxy", { id, proxyUrl });
    if (res === null || res?.ok === false) {
      setLoadingAction(null);
      actionFailed();
      return;
    }
    setEditingProxyId(null);
    await refresh();
    setLoadingAction(null);
    showToast(t("proxy.saved"), "success");
  };
  const setMode = async (mode) => {
    setLoadingAction(`mode:${mode}`);
    const res = await postJson("/plugins/agy-worker/pool/mode", { mode });
    if (res === null || res?.ok === false) {
      setLoadingAction(null);
      actionFailed();
      return;
    }
    await refresh();
    setLoadingAction(null);
  };
  const clearCooldown = async (id) => {
    setLoadingAction(id ? `clearCooldown:${id}` : "clearCooldown:all");
    const res = await postJson("/plugins/agy-worker/pool/clear-cooldown", { id });
    if (res === null || res?.ok === false) {
      setLoadingAction(null);
      actionFailed();
      return;
    }
    await refresh();
    setLoadingAction(null);
    showToast(t("account.clearCooldown"), "success");
  };
  const toggleExpand = (accId) => {
    setExpandedModels((prev) => ({ ...prev, [accId]: !prev[accId] }));
  };
  const authPhase = status?.auth?.phase ?? "unknown";
  const pool = status?.pool;
  const catalogModels = status?.catalogModels ?? [];
  const hiddenModelSet = new Set(status?.hiddenModels ?? []);
  const accounts = pool?.accounts ?? [];
  const isAuthed = authPhase === "ok" || accounts.length > 0;
  const isBusy = loadingAction !== null;
  const accountActionBusy = (acc, action) => loadingAction === `${action}:${acc.id}`;
  const globalBusy = isBusy && !loadingAction?.includes(":");
  const renderSpinner = () => h("span", { className: "agy-spinner" });
  const renderToastBanner = () => {
    if (!toast) return null;
    const typeStyles = {
      success: { background: "var(--agy-toast-success-bg)", border: "1px solid var(--agy-toast-success-border)", color: "var(--agy-toast-success-text)" },
      info: { background: "var(--agy-toast-info-bg)", border: "1px solid var(--agy-toast-info-border)", color: "var(--agy-toast-info-text)" },
      warn: { background: "var(--agy-toast-warn-bg)", border: "1px solid var(--agy-toast-warn-border)", color: "var(--agy-toast-warn-text)" },
      error: { background: "var(--agy-toast-error-bg)", border: "1px solid var(--agy-toast-error-border)", color: "var(--agy-toast-error-text)" }
    };
    const style = typeStyles[toast.type];
    return h(
      "div",
      { style: { ...S.noticeBanner, ...style } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 } },
        uiIcon(toast.type === "success" ? "check" : toast.type === "error" || toast.type === "warn" ? "alert" : "globe", 14, style.color),
        h("span", null, toast.text)
      ),
      h("button", {
        type: "button",
        style: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px", opacity: 0.8, display: "inline-flex", alignItems: "center" },
        onClick: () => setToast(null),
        "aria-label": t("aria.closeToast")
      }, uiIcon("x", 12))
    );
  };
  const renderQuotaBar = (label, familyKey, acc) => renderFamilyQuotaBar(
    t,
    label,
    familyKey,
    acc,
    loadingAction === "refresh:all" || loadingAction === `refresh:${acc.id}`
  );
  const authoritativeActiveId = pool?.activeAccountId ?? pool?.lastActiveAccountId ?? pool?.activeAccountIds?.google ?? pool?.primaryAccountId;
  const activeAccountId = optimisticActiveId ?? authoritativeActiveId;
  const renderedAccountCards = accounts.map((acc) => {
    const isPrimary = acc.id === pool?.primaryAccountId;
    const hasCooldown = Object.entries(acc.cooldowns).some(([, cd]) => cd && cd.cooldownUntil > Date.now());
    const isAuthRequired = acc.authRequired;
    const isInUse = acc.enabled && !isAuthRequired && activeAccountId !== void 0 && activeAccountId === acc.id;
    const dotColor = !acc.enabled ? "#64748b" : isAuthRequired ? "#ef4444" : hasCooldown ? "#f59e0b" : "#10b981";
    const isEditingProxy = editingProxyId === acc.id;
    const isExpanded = expandedModels[acc.id] ?? false;
    const accIndex = accounts.indexOf(acc);
    const cardStyle = {
      ...S.card,
      cursor: "default",
      padding: "10px 14px",
      marginBottom: "8px",
      ...!acc.enabled ? { opacity: 0.72 } : {}
    };
    const legacyDefault = acc.defaultAlias === void 0 && acc.systemHome && acc.alias === "\u4E3B\u8D26\u53F7 (\u7CFB\u7EDF\u767B\u5F55)";
    const displayAlias = acc.defaultAlias || legacyDefault ? acc.systemHome ? t("account.defaultAlias") : t("account.aliasDefault", { number: accIndex + 1 }) : acc.alias;
    const googleModels = acc.quotas.google?.models ?? [];
    const argonModels = acc.quotas.argon?.models ?? [];
    const anthropicModels = acc.quotas.anthropic?.models ?? [];
    const openaiModels = acc.quotas.openai?.models ?? [];
    const allChildModels = [
      ...googleModels.map((m) => ({ family: "Google", model: m })),
      ...argonModels.map((m) => ({ family: "Argon", model: m })),
      ...anthropicModels.map((m) => ({ family: "Anthropic", model: m })),
      ...openaiModels.map((m) => ({ family: "OpenAI", model: m }))
    ];
    return h(
      "div",
      {
        key: acc.id,
        className: "agy-card-hover",
        style: cardStyle
      },
      // Header row
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            userSelect: "none",
            gap: "8px",
            marginBottom: "8px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", flex: "1", minWidth: 0 } },
          h("span", {
            style: {
              ...S.badgeTag,
              fontWeight: 700,
              fontSize: "10.5px",
              padding: "1px 5px",
              background: isPrimary ? "var(--agy-badge-primary-bg)" : "var(--agy-badge-tag-bg)",
              color: isPrimary ? "var(--agy-badge-primary-text)" : "var(--agy-badge-tag-text)",
              borderColor: isPrimary ? "var(--agy-badge-primary-border)" : "var(--agy-badge-tag-border)"
            },
            title: `\u4F18\u5148\u7EA7 #${accIndex + 1}`
          }, `#${accIndex + 1}`),
          accounts.length > 1 ? h(
            "div",
            {
              style: { display: "inline-flex", gap: "2px", alignItems: "center" }
            },
            accIndex > 0 ? h("button", {
              type: "button",
              className: "agy-btn",
              style: { ...S.btnSm, padding: "1px 4px", fontSize: "10px", lineHeight: 1, height: "18px" },
              title: t("account.moveUp"),
              onClick: () => void moveAccount(acc.id, -1)
            }, uiIcon("arrowUp", 10)) : null,
            accIndex < accounts.length - 1 ? h("button", {
              type: "button",
              className: "agy-btn",
              style: { ...S.btnSm, padding: "1px 4px", fontSize: "10px", lineHeight: 1, height: "18px" },
              title: t("account.moveDown"),
              onClick: () => void moveAccount(acc.id, 1)
            }, uiIcon("arrowDown", 10)) : null
          ) : null,
          h("span", {
            className: "agy-pulse-dot",
            style: { background: dotColor, boxShadow: `0 0 6px ${dotColor}aa`, marginLeft: "1px" }
          }),
          h("span", {
            style: {
              fontWeight: 700,
              fontSize: "13px",
              color: "var(--agy-text-primary)",
              whiteSpace: "nowrap"
            },
            title: displayAlias
          }, displayAlias),
          h("span", {
            style: {
              ...S.badgeTag,
              background: "rgba(59, 130, 246, 0.12)",
              color: "#3b82f6",
              borderColor: "rgba(59, 130, 246, 0.35)",
              fontSize: "10px",
              padding: "1px 5px",
              fontWeight: 700
            }
          }, "AGY"),
          isAuthRequired ? h("span", {
            style: {
              ...S.badgeTag,
              background: "var(--agy-badge-email-bg)",
              color: "#ef4444",
              borderColor: "#fca5a5",
              gap: "3px",
              fontSize: "10px",
              padding: "1px 5px",
              fontWeight: 700
            }
          }, uiIcon("alert", 10, "#ef4444"), t("status.authRequired")) : null,
          hasCooldown ? h("span", {
            style: {
              ...S.badgeTag,
              background: "rgba(245, 158, 11, 0.15)",
              color: "#f59e0b",
              borderColor: "rgba(245, 158, 11, 0.4)",
              gap: "3px",
              fontSize: "10px",
              padding: "1px 5px",
              fontWeight: 700
            }
          }, uiIcon("alert", 10, "#f59e0b"), "\u51B7\u5374\u4E2D") : null,
          acc.email ? h("span", {
            style: {
              ...S.badgeTag,
              background: "var(--agy-badge-email-bg)",
              color: "var(--agy-badge-email-text)",
              borderColor: "var(--agy-badge-email-border)",
              gap: "4px",
              fontSize: "11px",
              padding: "1px 6px",
              whiteSpace: "nowrap"
            },
            title: acc.email
          }, uiIcon("mail", 10, "var(--agy-badge-email-text)"), acc.email) : null,
          isInUse ? h("span", {
            style: {
              ...S.badgeTag,
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              borderColor: "rgba(16, 185, 129, 0.45)",
              gap: "3px",
              fontSize: "10px",
              padding: "1px 5px",
              fontWeight: 700
            },
            title: t("status.inUse")
          }, uiIcon("zap", 10, "#10b981"), t("status.inUse")) : null,
          (() => {
            const effectiveProxy = acc.proxyUrl || pool?.systemProxy;
            return effectiveProxy ? h("span", {
              style: {
                ...S.badgeTag,
                background: "var(--agy-badge-proxy-bg)",
                color: "var(--agy-badge-proxy-text)",
                borderColor: "var(--agy-badge-proxy-border)",
                gap: "4px",
                fontSize: "10px",
                padding: "1px 5px"
              },
              title: effectiveProxy
            }, uiIcon("globe", 10, "var(--agy-badge-proxy-text)"), t("status.proxy")) : null;
          })(),
          !acc.enabled ? h("span", {
            style: {
              ...S.badgeTag,
              background: "var(--agy-bg-subbox)",
              color: "var(--agy-text-secondary)",
              borderColor: "var(--agy-border-subbox)",
              gap: "3px",
              fontSize: "10px",
              padding: "1px 5px",
              fontWeight: 700
            },
            title: t("status.disabled")
          }, uiIcon("power", 10, "#64748b"), t("status.disabled")) : null
        ),
        h(
          "div",
          {
            style: { display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 }
          },
          h("button", {
            type: "button",
            className: "agy-btn",
            style: acc.enabled ? { ...S.btnSm, gap: "3px", fontSize: "11px", padding: "2px 6px" } : { ...S.btnSmPrimary, gap: "3px", fontSize: "11px", padding: "2px 6px" },
            title: acc.enabled ? t("account.disableTitle") : t("account.enableTitle"),
            disabled: accountActionBusy(acc, "enable"),
            onClick: () => void toggleAccountEnabled(acc)
          }, loadingAction === `enable:${acc.id}` ? [renderSpinner(), acc.enabled ? t("account.disable") : t("account.enable")] : [uiIcon("power", 10, acc.enabled ? "var(--agy-text-secondary)" : "#ffffff"), ` ${acc.enabled ? t("account.disable") : t("account.enable")}`]),
          h("button", {
            type: "button",
            className: "agy-btn",
            style: { ...S.btnSm, gap: "3px", fontSize: "11px", padding: "2px 6px", minWidth: "58px", justifyContent: "center" },
            title: t("account.syncTitle"),
            disabled: accountActionBusy(acc, "refresh"),
            onClick: () => void refreshQuota(acc.id)
          }, loadingAction === `refresh:${acc.id}` ? [renderSpinner(), t("account.syncing")] : [uiIcon("refresh", 10), ` ${t("account.sync")}`]),
          acc.enabled && !acc.authRequired ? h("button", {
            type: "button",
            className: "agy-btn",
            style: { ...S.btnSm, gap: "3px", fontSize: "11px", padding: "2px 6px", minWidth: "58px", justifyContent: "center" },
            title: t("account.warmupTitle"),
            disabled: accountActionBusy(acc, "warmup"),
            onClick: () => void warmupAccount(acc.id)
          }, loadingAction === `warmup:${acc.id}` ? [renderSpinner(), t("account.warmingUp")] : [uiIcon("flame", 10, "#f97316"), ` ${t("account.warmup")}`]) : null,
          acc.enabled && !isInUse ? h("button", {
            type: "button",
            className: "agy-btn",
            style: { ...S.btnSm, gap: "3px", fontSize: "11px", padding: "2px 6px" },
            title: t("account.setActive"),
            disabled: accountActionBusy(acc, "active"),
            onClick: () => void setActiveAccount(acc.id)
          }, loadingAction === `active:${acc.id}` ? [renderSpinner(), t("account.settingActive")] : [uiIcon("zap", 10), ` ${t("account.setActive")}`]) : null,
          h("button", {
            type: "button",
            className: "agy-btn",
            style: isEditingProxy ? { ...S.btnSmPrimary, gap: "3px", fontSize: "11px", padding: "2px 6px" } : { ...S.btnSm, gap: "3px", fontSize: "11px", padding: "2px 6px" },
            disabled: accountActionBusy(acc, "proxy"),
            onClick: () => setEditingProxyId(isEditingProxy ? null : acc.id)
          }, [uiIcon("globe", 10), ` ${t("proxy.button")}`]),
          accounts.length > 1 ? h("button", {
            type: "button",
            className: "agy-btn",
            style: { ...S.btnDanger, padding: "2px 6px", fontSize: "11px" },
            title: t("account.removeTitle"),
            "aria-label": t("account.removeTitle"),
            disabled: accountActionBusy(acc, "remove"),
            onClick: () => void removeAccount(acc.id, displayAlias)
          }, loadingAction === `remove:${acc.id}` ? renderSpinner() : uiIcon("trash", 11, "var(--agy-danger-text)")) : null
        )
      ),
      // Body: Always directly visible, showing quota
      h(
        "div",
        { key: "agy-body", style: S.quotaBox },
        renderQuotaBar("Gemini", "google", acc),
        // Gemini 4 Argon (Pro/Ultra only): the backend reports its own
        // quota group/weekly bucket ONLY for accounts that have the
        // permission, so gate the row on the data itself — free and
        // legacy plans never see an empty Argon panel.
        acc.quotas.argon ? renderQuotaBar("Argon", "argon", acc) : null,
        h(
          "button",
          {
            type: "button",
            className: "agy-btn",
            style: {
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              marginTop: "6px",
              padding: "5px 10px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              color: isExpanded ? "var(--dsw-alias-state-business-primary, #3b82f6)" : "var(--agy-text-secondary)",
              background: "var(--agy-bg-subbox)",
              border: "1px dashed var(--agy-border-box)",
              borderRadius: "6px"
            },
            onClick: () => toggleExpand(acc.id)
          },
          uiIcon(isExpanded ? "chevronUp" : "chevronDown", 10),
          h("span", null, isExpanded ? t("account.collapseOthers") : t("account.expandOthers"))
        ),
        isExpanded ? [
          renderQuotaBar("Claude", "anthropic", acc),
          renderQuotaBar("GPT-OSS", "openai", acc),
          allChildModels.length > 0 ? h(
            "div",
            {
              style: {
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid var(--agy-border-box)"
              }
            },
            h("div", { style: { color: "var(--agy-text-secondary)", marginBottom: "6px", fontWeight: 600, fontSize: "11px" } }, t("account.models")),
            allChildModels.map(({ family, model }) => {
              const frac = model.remainingFraction ?? 1;
              const pct = Math.round(frac * 100);
              const w = formatQuotaWindow(t, model.resetTime);
              const pColor = pct <= 20 ? "var(--agy-quota-low-text)" : pct <= 50 ? "var(--agy-quota-med-text)" : "var(--agy-quota-high-text)";
              return h(
                "div",
                { key: `${family}-${model.modelId}`, className: "agy-submodel-row" },
                h("span", { style: { fontWeight: 500, color: "var(--agy-text-primary)" } }, `[${family}] ${model.displayName || model.modelId}`),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("span", { style: { color: pColor, fontWeight: 700 } }, `${pct}%`),
                  w.resetText ? h("span", { style: { color: "var(--agy-text-tertiary)", fontSize: "10.5px" } }, `\u21BB ${w.resetText}`) : null
                )
              );
            })
          ) : null
        ] : null
      ),
      hasCooldown ? h(
        "div",
        {
          key: "cd-body",
          style: {
            background: "var(--agy-warn-bg)",
            border: "1px solid var(--agy-warn-border)",
            borderRadius: "7px",
            padding: "6px 10px",
            color: "var(--agy-warn-text)",
            fontSize: "11.5px",
            fontWeight: 600,
            marginTop: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          uiIcon("alert", 13, "var(--agy-warn-text)"),
          h("span", null, t("account.cooldown"))
        ),
        h("button", {
          type: "button",
          className: "agy-btn",
          style: { ...S.btnSm, color: "var(--agy-warn-btn-text)", borderColor: "var(--agy-warn-btn-border)", background: "var(--agy-warn-btn-bg)", gap: "4px" },
          disabled: accountActionBusy(acc, "clearCooldown"),
          onClick: () => void clearCooldown(acc.id)
        }, loadingAction === `clearCooldown:${acc.id}` ? [renderSpinner(), ""] : [uiIcon("zap", 11, "var(--agy-warn-btn-text)"), ` ${t("account.clearCooldown")}`])
      ) : null,
      isEditingProxy ? h(
        "div",
        {
          key: "proxy-body",
          style: {
            marginTop: "8px",
            padding: "10px 12px",
            background: "var(--agy-bg-subbox)",
            borderRadius: "7px",
            border: "1px solid var(--agy-border-subbox)"
          }
        },
        h(
          "div",
          { style: { display: "flex", gap: "8px" } },
          h("input", {
            style: S.input,
            value: proxyInputs[acc.id] !== void 0 ? proxyInputs[acc.id] : acc.proxyUrl ?? "",
            placeholder: pool?.systemProxy ? `${t("proxy.placeholder")} (${pool.systemProxy})` : t("proxy.placeholder"),
            "aria-label": t("aria.proxyInput"),
            onChange: (e) => setProxyInputs({ ...proxyInputs, [acc.id]: e.target.value })
          }),
          h("button", {
            type: "button",
            className: "agy-btn",
            style: S.btnPrimary,
            disabled: accountActionBusy(acc, "proxy"),
            onClick: () => void saveProxy(acc.id)
          }, loadingAction === `proxy:${acc.id}` ? [renderSpinner(), t("proxy.save")] : t("proxy.save")),
          h("button", {
            type: "button",
            className: "agy-btn",
            style: S.btn,
            onClick: () => setEditingProxyId(null)
          }, t("cancel"))
        )
      ) : null
    );
  });
  const poolAuth = status?.poolAuth;
  const flowPhase = poolAuth?.phase ?? "idle";
  const flowActive = flowPhase === "waiting" || flowPhase === "exchanging";
  const addAccountSection = addingAccount ? h(
    "div",
    { style: S.authModal, role: "group", "aria-label": t("account.add") },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" } },
      h(
        "div",
        { style: { fontWeight: 700, fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px", color: "var(--agy-text-primary)" } },
        uiIcon("plus", 13, "var(--agy-btn-primary-bg)"),
        t("account.add")
      )
    ),
    !flowActive ? h(
      "div",
      null,
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" } },
        h("input", {
          style: S.input,
          value: aliasInput,
          placeholder: t("account.aliasPlaceholder"),
          "aria-label": t("aria.aliasInput"),
          onChange: (e) => setAliasInput(e.target.value)
        }),
        h("input", {
          style: S.input,
          value: addProxyInput,
          placeholder: pool?.systemProxy ? `${t("account.proxyPlaceholder")} (${pool.systemProxy})` : t("account.proxyPlaceholder"),
          "aria-label": t("aria.proxyInput"),
          onChange: (e) => setAddProxyInput(e.target.value)
        })
      ),
      h(
        "div",
        { style: { display: "flex", gap: "8px" } },
        h("button", {
          type: "button",
          className: "agy-btn",
          style: { ...S.btnPrimary, gap: "4px" },
          disabled: isBusy,
          onClick: () => void handleBeginAddAccount()
        }, loadingAction === "pool:beginAdd" ? [renderSpinner(), t("auth.openingBrowser")] : [uiIcon("externalLink", 12, "#ffffff"), ` ${t("auth.openBrowser")}`]),
        h("button", {
          type: "button",
          className: "agy-btn",
          style: S.btn,
          onClick: () => handleCancelAddAccount()
        }, t("cancel"))
      ),
      flowPhase === "failed" ? h("div", {
        style: { ...S.muted, color: "var(--agy-danger-text)", marginTop: "8px", display: "flex", alignItems: "center", gap: "5px", fontWeight: 600 }
      }, uiIcon("alert", 12, "var(--agy-danger-text)"), safeMessage(poolAuth?.code)) : null
    ) : h(
      "div",
      null,
      h(
        "div",
        { style: { display: "flex", alignItems: "center", color: "var(--agy-text-secondary)", marginBottom: "8px", lineHeight: 1.5, fontSize: "12px" } },
        renderSpinner(),
        flowPhase === "exchanging" ? t("auth.exchanging") : t("auth.waiting")
      ),
      poolAuth?.url ? h(
        "div",
        { style: { marginBottom: "8px" } },
        h("a", {
          href: poolAuth.url,
          target: "_blank",
          style: { color: "var(--dsw-alias-state-business-primary, #2563eb)", textDecoration: "underline", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }
        }, uiIcon("externalLink", 12, "currentColor"), t("auth.openManual"))
      ) : null,
      h(
        "div",
        { style: { color: "var(--agy-text-tertiary)", marginBottom: "6px", fontSize: "11px", fontWeight: 500 } },
        t("auth.pasteHint")
      ),
      h(
        "div",
        { style: { display: "flex", gap: "8px" } },
        h("input", {
          style: S.input,
          value: authCodeInput,
          placeholder: t("auth.codePlaceholder"),
          "aria-label": t("aria.authCodeInput"),
          onChange: (e) => setAuthCodeInput(e.target.value)
        }),
        h("button", {
          type: "button",
          className: "agy-btn",
          style: { ...S.btnPrimary, gap: "4px" },
          disabled: isBusy || !authCodeInput.trim(),
          onClick: () => void handleCompleteAddAccount()
        }, loadingAction === "pool:completeAdd" ? [renderSpinner(), t("auth.activating")] : [uiIcon("check", 12, "#ffffff"), ` ${t("auth.activate")}`]),
        h("button", {
          type: "button",
          className: "agy-btn",
          style: S.btn,
          onClick: () => handleCancelAddAccount()
        }, t("cancel"))
      )
    )
  ) : null;
  const containerStyle = props?.isModal ? S.container : {
    ...S.container,
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "920px"
  };
  if (status === null) {
    return h(
      "div",
      { className: "agy-console", style: { ...containerStyle, minHeight: "120px", display: "flex", alignItems: "center", justifyContent: "center" } },
      h("style", { key: "css" }, AGY_CONSOLE_CSS),
      h("span", { style: S.muted }, [renderSpinner(), t("status.loading")])
    );
  }
  return h(
    "div",
    { className: "agy-console", style: containerStyle },
    h("style", { key: "css" }, AGY_CONSOLE_CSS),
    h(
      "div",
      { style: S.headerCard },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        agyIcon(18),
        h("span", { style: { fontWeight: 700, fontSize: "14px", color: "var(--agy-text-primary)" } }, "Antigravity"),
        h("span", { style: isAuthed ? S.badgeReady : S.badgeUnready }, isAuthed ? t("status.ready") : t("status.needsAuth"))
      ),
      h(
        "div",
        { style: { display: "flex", gap: "6px", alignItems: "center" } },
        !addingAccount ? h("button", {
          type: "button",
          className: "agy-btn",
          style: { ...S.btnPrimary, gap: "4px" },
          onClick: () => setAddingAccount(true)
        }, [uiIcon("plus", 12, "#ffffff"), ` ${t("account.add")}`]) : null,
        h("button", {
          type: "button",
          className: "agy-btn",
          style: { ...S.btn, gap: "4px" },
          disabled: isBusy,
          onClick: () => void warmupAccount()
        }, loadingAction === "warmup:all" ? [renderSpinner(), t("header.warmingUp")] : [uiIcon("flame", 12, "#f97316"), ` ${t("header.warmup")}`]),
        h("button", {
          type: "button",
          className: "agy-btn",
          style: { ...S.btn, gap: "4px" },
          disabled: isBusy,
          onClick: () => void refreshQuota()
        }, loadingAction === "refresh:all" ? [renderSpinner(), t("header.refreshing")] : [uiIcon("refresh", 12, "var(--agy-text-btn)"), ` ${t("header.refreshQuota")}`])
      )
    ),
    renderToastBanner(),
    addAccountSection,
    h(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", padding: "0 2px" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        h("span", { style: { fontWeight: 700, fontSize: "12.5px", color: "var(--agy-text-primary)" } }, `\u8D26\u53F7\u6C60 (${accounts.length})`)
      )
    ),
    renderedAccountCards,
    h(
      "div",
      { style: { marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--agy-border-divider)" } },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "10px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h("span", { style: { color: "var(--agy-text-primary)", fontWeight: 600, fontSize: "12.5px" } }, t("permission.label")),
          h(
            "div",
            { style: S.segGroup },
            h("button", {
              type: "button",
              style: status?.permissionMode === "plan" ? S.segBtnActive : S.segBtn,
              onClick: () => void setCfg("permissionMode", "plan")
            }, t("permission.plan")),
            h("button", {
              type: "button",
              style: status?.permissionMode === "accept-edits" ? S.segBtnActive : S.segBtn,
              onClick: () => void setCfg("permissionMode", "accept-edits")
            }, t("permission.acceptEdits")),
            h("button", {
              type: "button",
              style: status?.permissionMode === "skip" ? { ...S.segBtnActive, color: "var(--agy-seg-danger-text)", background: "var(--agy-seg-danger-bg)", border: "1px solid var(--agy-seg-danger-border)" } : S.segBtn,
              onClick: () => void setCfg("permissionMode", "skip")
            }, t("permission.skip"))
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h("span", { style: { color: "var(--agy-text-primary)", fontWeight: 600, fontSize: "12.5px" } }, t("effort.label")),
          h(
            "div",
            { style: S.segGroup },
            h("button", {
              type: "button",
              style: status?.defaultEffort === "" ? S.segBtnActive : S.segBtn,
              onClick: () => void setCfg("defaultEffort", "")
            }, t("effort.auto")),
            h("button", {
              type: "button",
              style: status?.defaultEffort === "low" ? S.segBtnActive : S.segBtn,
              onClick: () => void setCfg("defaultEffort", "low")
            }, t("effort.low")),
            h("button", {
              type: "button",
              style: status?.defaultEffort === "medium" ? S.segBtnActive : S.segBtn,
              onClick: () => void setCfg("defaultEffort", "medium")
            }, t("effort.medium")),
            h("button", {
              type: "button",
              style: status?.defaultEffort === "high" ? S.segBtnActive : S.segBtn,
              onClick: () => void setCfg("defaultEffort", "high")
            }, t("effort.high"))
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h("span", { style: { color: "var(--agy-text-primary)", fontWeight: 600, fontSize: "12.5px" } }, t("pool.label")),
          h(
            "div",
            { style: S.segGroup },
            h("button", {
              type: "button",
              style: pool?.mode === "sequential" || !pool?.mode ? S.segBtnActive : S.segBtn,
              onClick: () => void setMode("sequential")
            }, t("pool.sequential")),
            h("button", {
              type: "button",
              style: pool?.mode === "round-robin" ? S.segBtnActive : S.segBtn,
              onClick: () => void setMode("round-robin")
            }, t("pool.roundRobin"))
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h(
            "div",
            { style: { display: "flex", flexDirection: "column" } },
            h("span", { style: { color: "var(--agy-text-primary)", fontWeight: 600, fontSize: "12.5px" } }, t("config.autoWarmup")),
            h("span", { style: S.muted }, t("config.autoWarmupDesc"))
          ),
          h("button", {
            type: "button",
            style: status?.autoWarmup !== false ? S.segBtnActive : S.segBtn,
            disabled: loadingAction === "config:autoWarmup",
            onClick: () => void setCfg("autoWarmup", status?.autoWarmup === false)
          }, status?.autoWarmup !== false ? t("account.disable") : t("account.enable"))
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px" } },
          h("span", { style: { color: "var(--agy-text-primary)", fontWeight: 600, fontSize: "12.5px" } }, t("models.label")),
          catalogModels.length === 0 ? h("span", { style: S.muted }, t("models.empty")) : h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
            catalogModels.map((m) => {
              const isHidden = hiddenModelSet.has(m.id);
              return h("button", {
                type: "button",
                key: m.id,
                title: m.id,
                disabled: loadingAction === "config:hiddenModels",
                style: isHidden ? { ...S.segBtn, opacity: 0.45, textDecoration: "line-through" } : S.segBtnActive,
                onClick: () => void toggleModelHidden(m.id, !isHidden)
              }, m.name);
            })
          ),
          h("span", { style: S.muted }, t("models.hint"))
        )
      )
    )
  );
}

// src/client/AcpSettingsGuide.tsx
var import_react7 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var styles = `
.acp-guide{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.acp-guide h3{margin:0;font-size:15px;font-weight:600}
.acp-guide h4{margin:0;font-size:13px;font-weight:600}
.acp-guide p{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.acp-guide ol,.acp-guide ul{margin:0;padding-left:20px;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:6px}
.acp-guide code{font-size:12px;overflow-wrap:anywhere}
.acp-guide pre{box-sizing:border-box;width:100%;margin:0;padding:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}
.acp-guide .acp-note{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.acp-guide [data-kind=warning]{color:var(--dsw-alias-label-primary)}
.acp-import-label{display:flex;flex-direction:column;gap:6px;width:100%}
.acp-field-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}
.acp-import-textarea{box-sizing:border-box;width:100%;min-height:120px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:monospace;font-size:12px;line-height:18px;resize:vertical}
.acp-import-textarea::placeholder{color:var(--dsw-alias-label-tertiary,#888)}
.acp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.acp-btn-primary{border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#1677ff));color:var(--dsw-alias-label-primary-foreground,#fff);padding:7px 18px;font:inherit;font-size:13px;cursor:pointer}
.acp-btn-secondary{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
.acp-btn-ghost{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.acp-guide button:disabled{opacity:.5;cursor:default}
.acp-guide button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.acp-banner{box-sizing:border-box;width:100%;padding:10px 12px;border-radius:6px;font-size:13px;line-height:19px;display:flex;flex-direction:column;gap:4px}
.acp-banner-error{background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.4);color:var(--dsw-alias-state-error-primary,#cf222e)}
.acp-banner-warning{background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.4);color:#d29922}
.acp-banner-success{background:rgba(46,160,67,0.1);border:1px solid rgba(46,160,67,0.4);color:#2ea043}
.acp-entries-list{display:flex;flex-direction:column;gap:8px}
.acp-entry-row{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-module-platform)}
.acp-entry-checkbox-label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px}
.acp-entry-details{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 auto}
.acp-entry-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.acp-entry-name{font-weight:600}
.acp-entry-cmd{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.acp-tag{display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500}
.acp-tag-neutral{background:var(--dsw-alias-interactive-bg-hover,#eee);color:var(--dsw-alias-label-secondary)}
.acp-tag-success{background:rgba(46,160,67,0.15);color:#2ea043;border:1px solid rgba(46,160,67,0.3)}
.acp-tag-warning{background:rgba(210,153,34,0.15);color:#d29922;border:1px solid rgba(210,153,34,0.3)}
.acp-hint-skipped{font-size:12px;color:var(--dsw-alias-label-secondary);padding-left:4px}
.acp-import-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px}
.acp-restart-notice{font-size:13px;font-weight:500;margin-top:2px}
.acp-status-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}
`;
var PLACEHOLDER = `{
  "agent_servers": {
    "Claude": {
      "command": "npx",
      "args": ["-y", "@agentclientprotocol/claude-agent-acp"],
      "env": {}
    }
  }
}`;
var CONFIG_EXAMPLE = `- id: dsh-fusion
  name: '@sqdr2/dsh-fusion'
  config:
    acp:
      agents:
        my-agent:
          command: /absolute/path/to/acp-agent
          args: []
          models:
            - id: default`;
function translateIssue(reason, lang) {
  switch (reason) {
    case "importMissingCommand":
      return tr(lang, "\u7F3A\u5C11\u542F\u52A8\u547D\u4EE4", "missing command");
    case "importBadArgs":
      return tr(lang, "args \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4", "args must be an array of strings");
    case "importBadEnv":
      return tr(lang, "env \u5FC5\u987B\u662F\u952E\u503C\u5747\u4E3A\u5B57\u7B26\u4E32\u7684\u5BF9\u8C61", "env must be an object of strings");
    default:
      return reason;
  }
}
function AcpSettingsGuide() {
  const lang = useLang();
  const { status, value, user, revision, writable, form } = useAcpConfigForm();
  const [text, setText] = (0, import_react7.useState)("");
  const [parsed, setParsed] = (0, import_react7.useState)(null);
  const [excluded, setExcluded] = (0, import_react7.useState)(/* @__PURE__ */ new Set());
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [feedback, setFeedback] = (0, import_react7.useState)(null);
  const entries2 = parsed?.ok === true ? parsed.entries : [];
  const selected = entries2.filter((entry) => !excluded.has(entry.route));
  const toggle = (route, include) => {
    setExcluded((current2) => {
      const next = new Set(current2);
      if (include) next.delete(route);
      else next.add(route);
      return next;
    });
  };
  const canImport = status === "ready" && writable && revision !== void 0 && selected.length > 0 && !busy && form !== void 0;
  const handleImport = async () => {
    if (!canImport || !form || revision === void 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const ops = importOpsOf(selected);
      const accepted = await form.mutate(ops, revision);
      if (accepted) {
        setFeedback({
          tone: "success",
          message: tr(
            lang,
            `\u6210\u529F\u5BFC\u5165 ${selected.length} \u6761 ACP \u7EBF\u8DEF\u5230 dsh-fusion \u2192 acp.agents\u3002`,
            `Successfully imported ${selected.length} ACP route${selected.length > 1 ? "s" : ""} to dsh-fusion \u2192 acp.agents.`
          )
        });
      } else {
        setFeedback({
          tone: "error",
          message: tr(
            lang,
            "Host \u62D2\u7EDD\u4E86\u914D\u7F6E\u5199\u5165\uFF08\u914D\u7F6E\u7248\u672C\u53EF\u80FD\u5DF2\u8FC7\u671F\u6216\u88AB\u5916\u90E8\u4FEE\u6539\uFF09\uFF0C\u672A\u5E94\u7528\u66F4\u6539\u3002\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
            "Host rejected the configuration write (configuration may be stale or modified concurrently). No changes applied; refresh and try again."
          )
        });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: tr(
          lang,
          `\u5BFC\u5165\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,
          `Import failed: ${error instanceof Error ? error.message : String(error)}`
        )
      });
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "acp-guide", "aria-labelledby": "acp-guide-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("style", { children: styles }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { id: "acp-guide-title", children: tr(lang, "ACP \u63A5\u5165\u8BF4\u660E", "ACP setup guide") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(
      lang,
      "ACP\uFF08Agent Client Protocol\uFF09\u4EE3\u7406\u4F5C\u4E3A\u72EC\u7ACB\u6A21\u578B\u7EBF\u8DEF\u63A5\u8FDB\u6765\uFF0C\u53EF\u4EE5\u76F4\u63A5\u88AB\u9009\u4E3A Lead \u6216 Sidekick\u3002\u672C\u533A\u57DF\u63D0\u4F9B\u63A5\u5165\u8BF4\u660E\u4E0E\u65E7\u7248\u914D\u7F6E\u5BFC\u5165\u80FD\u529B\u3002\u8DEF\u7531\u5B9A\u4E49\u5728\u63D2\u4EF6\u914D\u7F6E\u91CC\uFF0C\u4FEE\u6539\u6216\u5BFC\u5165\u540E\u9700\u8981\u91CD\u542F Host \u624D\u4F1A\u751F\u6548\uFF1B\u8FD9\u91CC\u4E0D\u63D0\u4F9B\u5728\u7EBF\u72B6\u6001\u6216\u6A21\u578B\u53D1\u73B0\u3002",
      "ACP (Agent Client Protocol) agents join as their own model routes, so one can be the Lead or the Sidekick directly. This section provides setup guidance and configuration import. Routes live in plugin configuration and require a Host restart after changes or imports; no live status or model discovery is offered here."
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "acp-note", role: "region", "aria-label": tr(lang, "\u5BFC\u5165 ACP \u7EBF\u8DEF\u914D\u7F6E", "Import ACP route configuration"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: tr(lang, "\u5BFC\u5165 ACP \u7EBF\u8DEF\u914D\u7F6E", "Import ACP route configuration") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(
        lang,
        "\u652F\u6301\u7C98\u8D34 Zed \u914D\u7F6E\u4E2D\u7684 agent_servers\u3001\u672C\u63D2\u4EF6\u7684 agents \u6216\u88F8 server \u6620\u5C04 JSON\u3002\u89E3\u6790\u540E\u53EF\u9009\u62E9\u8981\u5BFC\u5165\u7684\u7EBF\u8DEF\u5E76\u6279\u91CF\u5199\u5165 dsh-fusion \u2192 acp.agents\u3002",
        "Paste JSON from Zed's agent_servers, this plugin's agents, or a bare server map. Parse to preview, select routes, and import directly into dsh-fusion \u2192 acp.agents."
      ) }),
      status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", className: "acp-status-hint", children: tr(lang, "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u8868\u5355\u2026", "Loading configuration form\u2026") }),
      status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", className: "acp-status-hint", children: tr(lang, "\u914D\u7F6E\u8868\u5355\u5F53\u524D\u4E0D\u53EF\u7528\uFF08\u5904\u4E8E\u5185\u5B58\u6A21\u5F0F\u6216\u5C1A\u672A\u8FDE\u63A5 Host\uFF09", "Configuration form is currently unavailable (memory mode or disconnected from Host)") }),
      status === "ready" && !writable && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", className: "acp-status-hint", children: tr(lang, "\u5F53\u524D\u914D\u7F6E\u53EA\u8BFB\uFF0C\u65E0\u6CD5\u5BFC\u5165", "Configuration is read-only; importing is disabled") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "acp-import-label", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "acp-field-hint", children: tr(lang, "\u914D\u7F6E JSON", "Configuration JSON") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "textarea",
          {
            className: "acp-import-textarea",
            value: text,
            placeholder: PLACEHOLDER,
            disabled: busy,
            "aria-label": tr(lang, "\u7C98\u8D34 ACP \u914D\u7F6E JSON", "Paste ACP configuration JSON"),
            onChange: (event) => {
              setText(event.target.value);
              setParsed(null);
              setExcluded(/* @__PURE__ */ new Set());
              setFeedback(null);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "acp-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "acp-btn-secondary",
            disabled: busy || text.trim().length === 0,
            onClick: () => {
              setFeedback(null);
              setParsed(parseAgentImport(text, { value, user }));
              setExcluded(/* @__PURE__ */ new Set());
            },
            children: tr(lang, "\u89E3\u6790\u914D\u7F6E", "Parse configuration")
          }
        ),
        entries2.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "acp-btn-ghost",
            disabled: busy,
            onClick: () => setExcluded(selected.length === entries2.length ? new Set(entries2.map((e) => e.route)) : /* @__PURE__ */ new Set()),
            children: tr(
              lang,
              selected.length === entries2.length ? "\u5168\u4E0D\u9009" : "\u5168\u9009",
              selected.length === entries2.length ? "Deselect all" : "Select all"
            )
          }
        )
      ] }),
      parsed?.ok === false && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "alert", className: "acp-banner acp-banner-error", children: tr(lang, `\u89E3\u6790\u5931\u8D25\uFF1A${parsed.error}`, `Parse failed: ${parsed.error}`) }),
      parsed?.ok === true && entries2.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: "status", className: "acp-banner acp-banner-warning", children: tr(lang, "\u672A\u627E\u5230\u6709\u6548\u7684 Agent \u914D\u7F6E", "No valid agent configuration found") }),
      entries2.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "acp-entries-list", role: "group", "aria-label": tr(lang, "\u89E3\u6790\u5F97\u5230\u7684\u7EBF\u8DEF\u5217\u8868", "Parsed routes list"), children: entries2.map((entry) => {
        const isChecked = !excluded.has(entry.route);
        const args = Array.isArray(entry.profile.args) ? entry.profile.args : [];
        const cmdLine = [entry.profile.command, ...args].join(" ");
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "acp-entry-row", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "acp-entry-checkbox-label", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "checkbox",
              checked: isChecked,
              disabled: busy,
              "aria-label": tr(lang, `\u9009\u62E9\u5BFC\u5165 ${entry.name}`, `Select import ${entry.name}`),
              onChange: (event) => toggle(entry.route, event.target.checked)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "acp-entry-details", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "acp-entry-header", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { className: "acp-entry-name", children: entry.name }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "acp-tag acp-tag-neutral", children: entry.route }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `acp-tag acp-tag-${entry.replaces ? "warning" : "success"}`, children: tr(lang, entry.replaces ? "\u66FF\u6362\u73B0\u6709" : "\u65B0\u5EFA\u7EBF\u8DEF", entry.replaces ? "Replace" : "New") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { className: "acp-entry-cmd", title: cmdLine, children: cmdLine })
          ] })
        ] }) }, entry.route);
      }) }),
      parsed?.ok === true && parsed.skipped.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "acp-hint-skipped", children: tr(
        lang,
        `\u5DF2\u8DF3\u8FC7\u300C${issue.name}\u300D\uFF1A${translateIssue(issue.reason, "zh")}`,
        `Skipped "${issue.name}": ${translateIssue(issue.reason, "en")}`
      ) }, issue.name)),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "acp-import-footer", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "acp-btn-primary",
          disabled: !canImport,
          onClick: () => {
            void handleImport();
          },
          children: tr(
            lang,
            busy ? "\u6B63\u5728\u5BFC\u5165\u2026" : `\u5BFC\u5165 ${selected.length} \u4E2A Agent`,
            busy ? "Importing\u2026" : `Import ${selected.length} Agent${selected.length === 1 ? "" : "s"}`
          )
        }
      ) }),
      feedback && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "div",
        {
          role: feedback.tone === "error" ? "alert" : "status",
          className: `acp-banner acp-banner-${feedback.tone}`,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: feedback.message }),
            feedback.tone === "success" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "acp-restart-notice", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: tr(lang, "\u91CD\u8981\u63D0\u793A\uFF1A", "Important: ") }),
              tr(
                lang,
                "\u7EBF\u8DEF\u5DF2\u5199\u5165 acp.agents \u914D\u7F6E\uFF0C\u5FC5\u987B\u91CD\u542F Host \u624D\u80FD\u4F7F\u65B0\u7EBF\u8DEF\u751F\u6548\u3002",
                "Routes written to acp.agents configuration; you must restart the Host for new routes to take effect."
              )
            ] })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "acp-note", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: tr(lang, "\u914D\u7F6E\u4F4D\u7F6E", "Where the routes are configured") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(
        lang,
        "\u6BCF\u6761 ACP \u7EBF\u8DEF\u5199\u5728\u672C\u63D2\u4EF6\u7684 acp.agents \u91CC\uFF0C\u952E\u5C31\u662F\u6A21\u578B\u9009\u62E9\u5668\u91CC\u663E\u793A\u7684 provider \u8DEF\u7531\u540D\u3002\u6539\u5B8C\u6216\u5BFC\u5165\u540E\u9700\u8981\u91CD\u542F Host \u624D\u4F1A\u751F\u6548\uFF1A\u914D\u7F6E\u5728\u63D2\u4EF6\u5B89\u88C5\u65F6\u8BFB\u53D6\u4E00\u6B21\u3002",
        "Each ACP route lives in this plugin's acp.agents block; the key is the provider route name shown in the model menu. A Host restart is required after a change or import, because the routes are read once when the plugin installs."
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: CONFIG_EXAMPLE }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(
        lang,
        "command \u5FC5\u586B\uFF0C\u662F agent \u7684\u53EF\u6267\u884C\u547D\u4EE4\uFF1B\u5199\u6210\u7EDD\u5BF9\u8DEF\u5F84\u66F4\u7A33\uFF08\u4ECE\u684C\u9762\u7AEF\u542F\u52A8\u65F6 GUI \u8FDB\u7A0B\u7684 PATH \u5F80\u5F80\u6BD4\u7EC8\u7AEF\u77ED\uFF09\uFF0C\u4F46 PATH \u4E0A\u7684\u547D\u4EE4\u540C\u6837\u53EF\u7528\uFF0C\u56E0\u4E3A Host \u76F4\u63A5 spawn \u8FD9\u4E2A\u547D\u4EE4\u3002args \u53EF\u7559\u7A7A\u3002models \u53EF\u4EE5\u6574\u6BB5\u7701\u7565\uFF1A\u7701\u7565\u6216\u7559\u7A7A\u65F6\u6309 discoverModels\uFF08\u9ED8\u8BA4 true\uFF09\u5411 agent \u8BE2\u95EE\u6A21\u578B\uFF0C\u95EE\u4E0D\u5230\u5C31\u7528\u56DE\u9000\u7684 default \u6A21\u578B\uFF1B\u5199\u4E86 models \u5219\u6BCF\u4E00\u9879\u90FD\u8981\u6709 id\u3002\u5176\u4F59\u53EF\u9009\u5B57\u6BB5\uFF08permission\u3001contextWindow\u3001startupTimeoutMs \u7B49\uFF09\u89C1 docs/COMPATIBILITY.md\u3002",
        "command is required: it is the agent executable. An absolute path is more reliable (a GUI-launched Host often has a shorter PATH than a terminal), but a command on PATH works too, because the Host spawns it directly. args may be empty. models may be omitted entirely: absent or empty means the route asks the agent via discoverModels (default true) and falls back to a default model when nothing is advertised; if you do list models, every entry needs an id. The remaining optional fields (permission, contextWindow, startupTimeoutMs, \u2026) are listed in docs/COMPATIBILITY.md."
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "acp-note", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: tr(lang, "\u914D\u7F6E\u4E4B\u540E", "After configuring") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(
        lang,
        "\u91CD\u542F Host \u540E\uFF0C\u8FD9\u4E9B ACP \u7EBF\u8DEF\u4F1A\u51FA\u73B0\u5728\u539F\u751F\u6A21\u578B\u9009\u62E9\u548C Fusion \u7684\u7EC4\u5408\u91CC\uFF0C\u53EF\u4EE5\u50CF\u5176\u4ED6\u6A21\u578B\u4E00\u6837\u9009\u4E3A Lead \u6216 Sidekick\u3002\u5B83\u4EEC\u662F\u5426\u5217\u51FA\u5DE5\u5177\u3001\u5982\u4F55\u5E94\u7B54\u6743\u9650\u8BF7\u6C42\uFF0C\u7531\u6BCF\u4E2A agent \u81EA\u5DF1\u7684\u5B9E\u73B0\u548C\u8FD9\u91CC\u7684 permission \u8BBE\u7F6E\u51B3\u5B9A\u3002Fusion \u53EA\u5728\u672C\u63D2\u4EF6\u81EA\u5DF1\u6D3E\u53D1 Sidekick \u4EFB\u52A1\u65F6\uFF0C\u624D\u5728\u8BE5\u4F1A\u8BDD\u7684 ACP session/new \u91CC\u58F0\u660E Host \u5DE5\u5177\u6865\uFF1B\u5176\u4F59 ACP \u4F1A\u8BDD\u4E0D\u5E26\u4EFB\u4F55 MCP server\u3002",
        "Once the Host restarts, those ACP routes appear in the native model picker and in Fusion combos, and can be chosen as Lead or Sidekick like any other model. Whether they expose tools and how they answer permission requests is decided by each agent's own implementation and by the permission setting you gave it. Fusion declares Host tools in an ACP session/new only while it is dispatching a Sidekick on that exact session; every other ACP session opens with no MCP server."
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "acp-note", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: tr(lang, "\u8FC1\u79FB\u63D0\u9192", "Before you migrate") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { "data-kind": "warning", children: tr(
        lang,
        "\u5982\u679C\u4F60\u4EE5\u524D\u88C5\u8FC7\u72EC\u7ACB\u7684 dsh-tauri-acp\uFF08\u6216 deepseek-harness-acp\uFF09\uFF0C\u8BF7\u5148\u624B\u52A8\u505C\u7528\u6216\u79FB\u9664\u5B83\uFF0C\u518D\u628A\u540C\u6837\u7684 provider \u540D\u5199\u8FDB\u8FD9\u91CC\u7684 acp.agents\uFF1A\u540C\u4E00\u4E2A provider \u540D\u88AB\u4E24\u5904\u6CE8\u518C\u4F1A\u5728\u52A0\u8F7D\u65F6\u88AB\u62D2\u7EDD\uFF08DUPLICATE_ADAPTER\uFF09\u3002\u672C\u63D2\u4EF6\u4E0D\u4F1A\u6539\u4F60\u7684 profile\uFF0C\u4E5F\u4E0D\u4F1A\u66FF\u4F60\u5378\u8F7D\u4EFB\u4F55\u4E1C\u897F\u3002",
        "If you previously installed the standalone dsh-tauri-acp (or deepseek-harness-acp), disable or remove it manually before assigning the same provider names here: two registrations of one provider name are refused at load (DUPLICATE_ADAPTER). This plugin never edits your profile and never uninstalls anything for you."
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(
        lang,
        "\u5B8C\u6574\u6B65\u9AA4\u89C1 docs/MIGRATION-ACP.md\uFF1BACP \u90E8\u5206\u7684\u4E0A\u6E38\u6765\u6E90\u4E0E\u8BB8\u53EF\u89C1 docs/ATTRIBUTION-ACP.md\u3002",
        "Full steps are in docs/MIGRATION-ACP.md; the upstream source and license for the ACP part are in docs/ATTRIBUTION-ACP.md."
      ) })
    ] })
  ] });
}

// src/client/studio-brand.ts
var STUDIO_TITLE = "DSH Agent Studio With Fusion";
var FUSION_SIDEBAR_LABEL = "Fusion";

// src/client/FusionSettings.tsx
var import_react8 = require("react");

// src/host/settings.ts
function missingRoutes(value, catalog) {
  if (!value) return [];
  const stale = (role2, route) => route !== void 0 && !catalog.groups.find((group) => group.id === route.provider)?.models.find((model) => model.id === route.model) ? [{ role: role2, route }] : [];
  return [...stale("lead", value.lead), ...stale("worker", value.worker), ...stale("compactor", value.compactor?.route)];
}

// src/client/settings-events.ts
var listeners3 = /* @__PURE__ */ new Set();
var onSettingsChanged = (listener) => {
  listeners3.add(listener);
  return () => {
    listeners3.delete(listener);
  };
};
var settingsChanged = () => {
  for (const listener of listeners3) listener();
};

// src/client/FusionSettings.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var styles2 = `
.fusion-page{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;flex:1 1 auto;overflow:auto;display:flex;flex-direction:column;align-items:center;scrollbar-gutter:stable;padding:0 clamp(24px,4vw,48px) 48px;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.fusion-settings{box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:18px}
.fusion-settings h2{margin:0;font-size:22px;line-height:30px;font-weight:600}
.fusion-settings p{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.fusion-settings header{display:flex;flex-direction:column;gap:8px;padding-top:28px}
[data-platform='darwin'] .fusion-settings header{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.fusion-settings .fusion-card{padding:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;display:flex;flex-direction:column;gap:20px;background:var(--dsw-alias-bg-module-platform)}
.fusion-settings fieldset{padding:0;margin:0;border:0;min-inline-size:0;display:flex;flex-direction:column;gap:10px}
.fusion-settings legend{font-size:15px;font-weight:600;padding:0 0 4px}
.fusion-settings label{display:grid;grid-template-columns:85px minmax(0,1fr);align-items:center;gap:12px;font-size:13px}
.fusion-settings :is(select,option,optgroup){background-color:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);color-scheme:inherit}
.fusion-settings select{box-sizing:border-box;min-width:0;width:100%;min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 9px;font:inherit}
.fusion-settings .fusion-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.fusion-settings button{border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,#fff);padding:7px 18px;font:inherit;font-size:13px;cursor:pointer}
.fusion-settings button:disabled{opacity:.5;cursor:default}
.fusion-settings :is(button,select):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.fusion-settings [role=alert]{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.fusion-settings details{font-size:13px;line-height:21px}
.fusion-settings summary{cursor:pointer;font-weight:500}
.fusion-settings .fusion-limits{display:flex;flex-direction:column;gap:12px;padding-top:14px}
.fusion-settings :is(input[type=number],input[type=text]){min-width:0;width:100%;box-sizing:border-box;background-color:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:8px;font:inherit}
.fusion-settings .fusion-consent{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px}
.fusion-combos{display:flex;flex-direction:column;gap:8px}
.fusion-settings .fusion-combo{display:flex;align-items:stretch;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background-color:var(--dsw-alias-bg-layer-1);font-size:13px;overflow:hidden;transition:border-color .15s ease,background-color .15s ease}
.fusion-settings .fusion-combo:hover{background-color:var(--dsw-alias-interactive-bg-hover)}
.fusion-settings .fusion-combo[data-active=true]{border-color:var(--dsw-alias-brand-primary);background-color:var(--dsw-alias-interactive-bg-hover-accent)}
.fusion-settings .fusion-combo-main{flex:1 1 auto;display:flex;align-items:center;gap:10px;min-width:0;padding:11px 12px;background:none;border:0;border-radius:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.fusion-settings .fusion-combo-main:hover{background:none}
.fusion-settings .fusion-combo :is(.fusion-combo-main,.fusion-combo-actions):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.fusion-settings .fusion-combo-check{position:relative;flex:none;width:14px;height:14px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;transition:border-color .15s ease}
.fusion-settings .fusion-combo:hover .fusion-combo-check{border-color:var(--dsw-alias-label-tertiary)}
.fusion-settings .fusion-combo[data-active=true] .fusion-combo-check{border-color:var(--dsw-alias-brand-primary)}
.fusion-settings .fusion-combo[data-active=true] .fusion-combo-check::after{content:'';position:absolute;inset:2.5px;border-radius:50%;background:var(--dsw-alias-brand-primary)}
.fusion-settings .fusion-combo-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.fusion-settings .fusion-combo-name{font-weight:600;overflow-wrap:anywhere}
.fusion-settings .fusion-combo-routes{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}
.fusion-settings .fusion-combo-stale{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}
.fusion-settings .fusion-combo-actions{flex:none;align-self:stretch;display:flex;align-items:center;padding:0 14px;border:0;border-left:1px solid var(--dsw-alias-border-l1);border-radius:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:color .15s ease,background-color .15s ease}
.fusion-settings .fusion-combo-actions:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background-color:var(--dsw-alias-interactive-bg-hover-danger)}
.fusion-settings .fusion-combo-actions:disabled{opacity:.4;cursor:default}
.fusion-settings .fusion-combo-add{align-self:flex-start;padding:8px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:none;color:var(--dsw-alias-label-secondary);font-size:13px}
.fusion-settings .fusion-combo-add:hover:not(:disabled){background-color:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fusion-cache{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-cache h3{margin:0}
.fusion-cache-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none;padding:2px 0}
.fusion-cache-summary::-webkit-details-marker{display:none}
.fusion-cache-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-cache-title{display:inline-flex;align-items:center;gap:6px}
.fusion-cache-title h3{margin:0;font-size:15px;font-weight:600}
.fusion-cache-indicator{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-cache-chevron{display:inline-block;width:7px;height:7px;border-right:2px solid var(--dsw-alias-label-secondary);border-bottom:2px solid var(--dsw-alias-label-secondary);transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px}
.fusion-cache[open] .fusion-cache-chevron{transform:rotate(45deg)}
.fusion-cache-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.fusion-cache-model{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.fusion-cache-model small{display:block;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.fusion-cache-controls{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;gap:10px;align-items:end}
.fusion-cache-controls label{grid-template-columns:1fr;gap:4px}
.fusion-cache a{color:var(--dsw-alias-brand-primary)}
@media(max-width:560px){.fusion-cache-controls{grid-template-columns:1fr}}
.fusion-history{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-history-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none;padding:2px 0}
.fusion-history-summary::-webkit-details-marker{display:none}
.fusion-history-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-history-title{display:inline-flex;align-items:center;gap:6px}
.fusion-history-title h3{margin:0;font-size:15px;font-weight:600}
.fusion-history-indicator{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-history-chevron{display:inline-block;width:7px;height:7px;border-right:2px solid var(--dsw-alias-label-secondary);border-bottom:2px solid var(--dsw-alias-label-secondary);transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px}
.fusion-history[open] .fusion-history-chevron{transform:rotate(45deg)}
.fusion-history-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.fusion-history-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.fusion-history-panel{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-history-usage h3{margin:0;font-size:14px;font-weight:600}
.fusion-history table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}
.fusion-history :is(th,td){padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-weight:400;vertical-align:top}
.fusion-history caption{text-align:left;font-size:13px;margin-bottom:8px}
.fusion-history small{display:block;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.fusion-history ol{padding-left:20px;margin:0}
.fusion-history li{padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.fusion-history li:last-child{border-bottom:0}
.fusion-history h3{margin:0;font-size:14px;font-weight:600}
.fusion-history p{overflow-wrap:anywhere}
.fusion-history-tasks-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none;padding:2px 0}
.fusion-history-tasks-summary::-webkit-details-marker{display:none}
.fusion-history-tasks-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-history-tasks-title{display:inline-flex;align-items:center;gap:6px}
.fusion-history-count{font-size:13px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-history-tasks-indicator{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-history-tasks-chevron{display:inline-block;width:7px;height:7px;border-right:2px solid var(--dsw-alias-label-secondary);border-bottom:2px solid var(--dsw-alias-label-secondary);transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px}
.fusion-history-tasks[open] .fusion-history-tasks-chevron{transform:rotate(45deg)}
.fusion-history-tasks-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.fusion-history-item-header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fusion-history-item-header h3{margin:0;font-size:14px;font-weight:600}
.fusion-history-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.fusion-history-actions button{padding:3px 12px;font-size:12px;border-radius:14px}
.fusion-history-actions button.fusion-btn-subtle{background:transparent;color:var(--dsw-alias-label-primary)}
.fusion-history-confirm-text{font-size:12px;color:var(--dsw-alias-label-secondary)}
@media(max-width:480px){.fusion-page{padding:0 16px 32px}.fusion-settings label{grid-template-columns:1fr;gap:6px}.fusion-settings .fusion-card{padding:16px}}
.fusion-agy{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-agy-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;list-style:none;user-select:none;padding:2px 0}
.fusion-agy-summary::-webkit-details-marker{display:none}
.fusion-agy-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-agy-title h3{margin:0;font-size:15px;font-weight:600}
.fusion-agy-summary small{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:400}
.fusion-agy-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px;min-width:0}
.fusion-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0;padding:0}
.fusion-nav button{padding:6px 14px;border-radius:14px;background:none;color:var(--dsw-alias-label-secondary);font-size:13px;border:1px solid var(--dsw-alias-border-l2)}
.fusion-nav button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:600}
.fusion-nav button:hover:not([aria-pressed=true]){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fusion-section{display:flex;flex-direction:column;gap:18px;min-width:0}
/* An author rule beats the UA [hidden] style, so hiding a section needs its own rule. */
.fusion-section[hidden]{display:none}
`;
var key = (route) => route ? JSON.stringify([route.provider, route.model]) : "";
function ModelChoice({ role: role2, route, catalog, onChange }) {
  const lang = useLang();
  const name2 = role2 === "compactor" ? tr(lang, "\u538B\u7F29", "Compaction") : role2;
  const model = catalog.groups.find((group) => group.id === route?.provider)?.models.find((model2) => model2.id === route?.model);
  const stale = route !== void 0 && model === void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("legend", { children: name2 }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: role2 === "Lead" ? tr(lang, "\u56DE\u7B54\u95EE\u9898\u3001\u5236\u5B9A\u65B9\u6848\u5E76\u5BA1\u67E5\u7ED3\u679C\u3002", "Answers, plans and reviews.") : role2 === "Sidekick" ? tr(lang, "\u6267\u884C\u547D\u4EE4\u548C\u4FEE\u6539\uFF0C\u63A5\u6536\u53CD\u9988\u540E\u7EE7\u7EED\u3002", "Runs commands and makes changes, then continues with feedback.") : tr(lang, "\u6574\u7406\u8F83\u65E9\u7684\u4E0A\u4E0B\u6587\uFF0C\u4F9B Lead \u6216 Worker \u7EE7\u7EED\u5DE5\u4F5C\u3002", "Summarises older context so the Lead or Sidekick can continue.") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
      tr(lang, "\u6A21\u578B", "Model"),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { "aria-label": tr(lang, `${name2} \u6A21\u578B`, `${name2} model`), value: key(route), onChange: (event) => {
        if (!event.target.value) {
          onChange(void 0);
          return;
        }
        const [provider, model2] = JSON.parse(event.target.value);
        onChange({ provider, model: model2 });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", disabled: role2 !== "compactor", children: role2 === "compactor" ? tr(lang, "\u4F7F\u7528\u5F53\u524D\u89D2\u8272\u6A21\u578B", "Use the role's own model") : tr(lang, "\u9009\u62E9\u5DF2\u8FDE\u63A5\u7684\u6A21\u578B", "Choose a connected model") }),
        stale && route && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: key(route), disabled: true, children: tr(lang, `\u5DF2\u4E0D\u53EF\u7528\uFF1A${route.provider}/${route.model}`, `No longer available: ${route.provider}/${route.model}`) }),
        catalog.groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("optgroup", { label: group.name, children: group.models.map((model2) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: key({ provider: group.id, model: model2.id }), children: model2.name }, model2.id)) }, group.id))
      ] })
    ] }),
    stale && route && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", children: tr(
      lang,
      `\u8FD9\u4E2A\u89D2\u8272\u4FDD\u5B58\u7684\u6A21\u578B ${route.provider}/${route.model} \u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002`,
      `This role's saved model ${route.provider}/${route.model} is no longer available; choose another.`
    ) }),
    model?.reasoning && route && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
      tr(lang, "\u63A8\u7406\u5F3A\u5EA6", "Reasoning"),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { "aria-label": tr(lang, `${name2} \u63A8\u7406\u5F3A\u5EA6`, `${name2} reasoning`), value: route.reasoningEffort ?? "", onChange: (event) => {
        const { reasoningEffort: _old, ...physical } = route;
        onChange({ ...physical, ...event.target.value ? { reasoningEffort: event.target.value } : {} });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("option", { value: "", children: [
          tr(lang, "\u6A21\u578B\u9ED8\u8BA4", "Model default"),
          model.reasoning.defaultEffort ? ` \xB7 ${model.reasoning.defaultEffort}` : ""
        ] }),
        model.reasoning.efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: effort.id, children: effort.name }, effort.id))
      ] })
    ] })
  ] });
}
var draftKeys = 0;
var toDraft = (pairs) => pairs.map(({ id, name: name2, pair }) => ({ key: id, id, name: name2, pair }));
var STUDIO_SECTIONS = ["fusion", "antigravity", "acp"];
var SECTION_ID = (section) => `fusion-section-${section}`;
function FusionSettings() {
  const lang = useLang();
  const [section, setSection] = (0, import_react8.useState)("fusion");
  const [state, setState] = (0, import_react8.useState)();
  const [draft, setDraft] = (0, import_react8.useState)([]);
  const [active, setActive] = (0, import_react8.useState)(0);
  const [error, setError] = (0, import_react8.useState)();
  const [notice, setNotice] = (0, import_react8.useState)();
  const [saving, setSaving] = (0, import_react8.useState)(false);
  const current2 = draft[Math.min(active, draft.length - 1)];
  const routeName = (route) => route ? state?.catalog.groups.find((group) => group.id === route.provider)?.models.find((model) => model.id === route.model)?.name ?? `${route.provider}/${route.model}` : "\u2014";
  const roleLabel = (role2) => role2 === "lead" ? tr(lang, "Lead", "Lead") : role2 === "worker" ? tr(lang, "Sidekick", "Sidekick") : tr(lang, "\u538B\u7F29\u6A21\u578B", "Compaction model");
  const update = (change) => setDraft((value) => value.map((combo, index) => combo.key === current2?.key ? change(combo) : combo));
  const chooseModel = (role2, route) => update((combo) => ({ ...combo, pair: {
    ...combo.pair,
    [role2]: route,
    ...combo.pair.cacheKeepalive ? { cacheKeepalive: { ...combo.pair.cacheKeepalive, [role2]: role2 === "lead" ? "auto" : false } } : {}
  } }));
  (0, import_react8.useEffect)(() => {
    const abort = new AbortController();
    void fetch(`${FUSION_API_PATH}?view=settings`, { credentials: "same-origin", cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error(tr(lang, "\u65E0\u6CD5\u8BFB\u53D6 Fusion \u8BBE\u7F6E", "Cannot read Fusion settings"));
      return response.json();
    }).then((value) => {
      setState(value);
      setDraft(toDraft(value.pairs));
      setActive(0);
    }).catch((error2) => {
      if (!abort.signal.aborted) setError(String(error2));
    });
    return () => abort.abort();
  }, []);
  const addCombo = () => {
    draftKeys += 1;
    setDraft((value) => [...value, { key: `new-${draftKeys}`, name: tr(lang, `\u7EC4\u5408 ${value.length + 1}`, `Combo ${value.length + 1}`), pair: {} }]);
    setActive(draft.length);
  };
  const removeCombo = (index) => {
    setDraft((value) => value.filter((_, position) => position !== index));
    setActive(Math.max(0, Math.min(active > index ? active - 1 : active, draft.length - 2)));
  };
  const save = async () => {
    if (!state) return;
    const invalid = draft.findIndex((combo) => !combo.pair.lead || !combo.pair.worker || !combo.name.trim());
    if (invalid >= 0) {
      setError(tr(lang, `\u7B2C ${invalid + 1} \u4E2A\u7EC4\u5408\u8FD8\u4E0D\u5B8C\u6574\uFF1A\u9700\u8981\u540D\u79F0\u3001Lead \u548C Sidekick\u3002`, `Combo ${invalid + 1} is incomplete: it needs a name, a Lead and a Sidekick.`));
      return;
    }
    const stale = draft.flatMap((combo, index) => missingRoutes(combo.pair, state.catalog).map(({ role: role2, route }) => tr(
      lang,
      `\u7B2C ${index + 1} \u4E2A\u7EC4\u5408\u300C${combo.name.trim() || tr(lang, "\u672A\u547D\u540D\u7EC4\u5408", "Untitled combo")}\u300D\u7684 ${roleLabel(role2)} \u6A21\u578B\u5DF2\u4E0D\u53EF\u7528\uFF1A${route.provider}/${route.model}\u3002\u8BF7\u4E3A\u8BE5\u89D2\u8272\u91CD\u65B0\u9009\u62E9\u6A21\u578B\u3002`,
      `Combo ${index + 1} "${combo.name.trim() || "Untitled combo"}" still names a ${roleLabel(role2)} model that is no longer available: ${route.provider}/${route.model}. Choose a model for that role again.`
    )));
    if (stale.length) {
      setError(stale.join(tr(lang, " ", " ")));
      return;
    }
    setSaving(true);
    setError(void 0);
    setNotice(void 0);
    try {
      const pairs = draft.map(({ id, name: name2, pair }) => {
        const { outputTokens: outputTokens2, ...rest } = pair;
        const limits = Object.fromEntries(Object.entries(outputTokens2 ?? {}).filter(([, tokens3]) => Number.isSafeInteger(tokens3) && Number(tokens3) > 0));
        return { ...id ? { id } : {}, name: name2.trim(), pair: { ...rest, ...Object.keys(limits).length ? { outputTokens: limits } : {} } };
      });
      const response = await fetch(FUSION_API_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configure", revision: state.revision, pairs })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? tr(lang, "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5", "Save failed; refresh and try again"));
      const confirmed = await fetch(`${FUSION_API_PATH}?view=settings`, { credentials: "same-origin", cache: "no-store" });
      if (!confirmed.ok) throw new Error(tr(lang, "\u914D\u7F6E\u5DF2\u63D0\u4EA4\uFF0C\u4F46\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\uFF0C\u8BF7\u5237\u65B0", "Saved, but not confirmed yet; refresh"));
      const next = await confirmed.json();
      setState(next);
      setDraft(toDraft(next.pairs));
      setActive(0);
      settingsChanged();
      setNotice(tr(lang, "\u7EC4\u5408\u5DF2\u4FDD\u5B58\u3002\u6A21\u578B\u83DC\u5355\u4E2D\u6BCF\u4E2A\u7EC4\u5408\u5404\u5360\u4E00\u9879\uFF0C\u4E0D\u540C\u4F1A\u8BDD\u53EF\u4EE5\u540C\u65F6\u4F7F\u7528\u4E0D\u540C\u7EC4\u5408\u3002", "Combos saved. Each one is its own model-menu entry, so different conversations can use different combos at the same time."));
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    } finally {
      setSaving(false);
    }
  };
  const dirty = state ? JSON.stringify(draft.map(({ id, name: name2, pair }) => ({ id, name: name2, pair }))) !== JSON.stringify(state.pairs.map(({ id, name: name2, pair }) => ({ id, name: name2, pair }))) : false;
  const blocked = state?.pairs.filter((pair) => !pair.authorized) ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "fusion-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("style", { children: styles2 }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "fusion-settings", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("header", { "data-window-drag": true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: STUDIO_TITLE }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(
          lang,
          "\u4E00\u4E2A\u63D2\u4EF6\u6574\u5408\u4E09\u79CD\u80FD\u529B\uFF1AFusion \u7EC4\u5408\uFF08\u5728\u8FD9\u91CC\u914D\u7F6E\uFF0CLead \u4E0E Sidekick \u5206\u644A\u5DE5\u4F5C\u4E0E\u6210\u672C\uFF09\u3001Antigravity\uFF08agy CLI \u6A21\u578B\u7EBF\u8DEF\uFF0C\u8D26\u53F7\u4E0E\u989D\u5EA6\u7BA1\u7406\uFF09\u4E0E ACP \u4EE3\u7406\u7EBF\u8DEF\uFF08\u63A5\u5165\u8BF4\u660E\uFF09\u3002\u5DE6\u4FA7\u8FB9\u680F\u53EA\u6709 Fusion \u4E00\u4E2A\u5165\u53E3\uFF0C\u4E09\u4E2A\u533A\u57DF\u5728\u672C\u9875\u5185\u5207\u6362\u3002",
          "One plugin for three capabilities: Fusion combos (configured here \u2014 a Lead and a Sidekick sharing the work and the cost), Antigravity (the agy CLI model route, with account and quota management) and ACP agent routes (setup guidance). The sidebar has one entry \u2014 Fusion \u2014 and the three are sections of this page."
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("nav", { className: "fusion-nav", "aria-label": tr(lang, "\u672C\u9875\u533A\u57DF", "Page sections"), children: STUDIO_SECTIONS.map((name2) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          "aria-pressed": section === name2,
          "aria-controls": SECTION_ID(name2),
          onClick: () => setSection(name2),
          children: name2 === "fusion" ? tr(lang, "Fusion \u7EC4\u5408", "Fusion combos") : name2 === "antigravity" ? tr(lang, "Antigravity", "Antigravity") : tr(lang, "ACP \u7EBF\u8DEF", "ACP routes")
        },
        name2
      )) }),
      error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "alert", children: error }),
      notice && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "status", children: notice }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "div",
        {
          className: "fusion-section",
          id: SECTION_ID("fusion"),
          hidden: section !== "fusion",
          role: "region",
          "aria-label": tr(lang, "Fusion \u7EC4\u5408", "Fusion combos"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: tr(lang, "Fusion \u7EC4\u5408", "Fusion combos") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u6BCF\u4E2A\u7EC4\u5408\u662F\u4E00\u5BF9 Lead \u548C Sidekick\uFF0C\u4F1A\u4F5C\u4E3A\u5355\u72EC\u7684\u4E00\u9879\u51FA\u73B0\u5728\u6A21\u578B\u83DC\u5355\u91CC\u3002\u5F00\u542F\u591A\u4E2A\u4F1A\u8BDD\u65F6\uFF0C\u53EF\u4EE5\u4E3A\u6BCF\u4E2A\u4F1A\u8BDD\u9009\u62E9\u4E0D\u540C\u7684\u7EC4\u5408\u3002", "Each combo is a Lead and a Sidekick pair, listed as its own entry in the model menu. With several conversations open, each one can use a different combo.") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "Lead \u5904\u7406\u65E5\u5E38\u8BF7\u6C42\u3001\u5B89\u6392\u5DE5\u4F5C\u5E76\u5BA1\u67E5\u7ED3\u679C\uFF1BSidekick \u6267\u884C\u59D4\u6D3E\u7684\u4EFB\u52A1\u3002", "The Lead handles requests, plans and reviews; the Sidekick does the delegated work.") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: tr(lang, "\u642D\u914D\u5EFA\u8BAE", "Pairing tip") }),
              ": ",
              tr(
                lang,
                "Fusion \u7701\u94B1\u9760\u7684\u662F Sidekick \u6BD4 Lead \u4FBF\u5B9C\u5F97\u591A\u3002\u9009\u4E00\u4E2A\u5F3A\u7684\u524D\u6CBF\u6A21\u578B\u5F53 Lead\uFF0C\u518D\u9009\u4E00\u4E2A\u4EF7\u683C\u4F4E\u5F88\u591A\uFF08\u6700\u597D 5 \u500D\u4EE5\u4E0A\uFF09\u7684\u6A21\u578B\u5F53 Sidekick\uFF1B\u4E24\u8005\u4EF7\u683C\u8D8A\u63A5\u8FD1\uFF0C\u8D8A\u7701\u4E0D\u4E86\u94B1\u3002",
                "Fusion saves money because the Sidekick is much cheaper than the Lead. Pick a strong frontier Lead and a Sidekick that costs far less (ideally 5\xD7 or more); the closer their prices, the smaller the saving."
              )
            ] }),
            !state && !error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "status", children: tr(lang, "\u6B63\u5728\u8BFB\u53D6\u6A21\u578B\u2026", "Loading models\u2026") }),
            state && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "fusion-card", "aria-label": tr(lang, "\u7EC4\u5408\u5217\u8868", "Combo list"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "fusion-combos", children: [
                  draft.map((combo, index) => {
                    const selected = combo.key === current2?.key;
                    const label = combo.name.trim() || tr(lang, "\u672A\u547D\u540D\u7EC4\u5408", "Untitled combo");
                    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "fusion-combo", "data-active": selected, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                        "button",
                        {
                          type: "button",
                          className: "fusion-combo-main",
                          "aria-pressed": selected,
                          onClick: () => setActive(index),
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "fusion-combo-check", "aria-hidden": "true" }),
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "fusion-combo-text", children: [
                              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "fusion-combo-name", children: label }),
                              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "fusion-combo-routes", children: `${routeName(combo.pair.lead)} \u2192 ${routeName(combo.pair.worker)}` }),
                              missingRoutes(combo.pair, state.catalog).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "fusion-combo-stale", children: tr(lang, "\u6709\u6A21\u578B\u5DF2\u4E0D\u53EF\u7528\uFF0C\u9700\u8981\u91CD\u65B0\u9009\u62E9", "A model is no longer available; choose it again") })
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                        "button",
                        {
                          type: "button",
                          className: "fusion-combo-actions",
                          disabled: saving || draft.length <= 1,
                          "aria-label": tr(lang, `\u5220\u9664\u7EC4\u5408 ${label}`, `Delete combo ${label}`),
                          onClick: (event) => {
                            event.stopPropagation();
                            removeCombo(index);
                          },
                          children: tr(lang, "\u5220\u9664", "Delete")
                        }
                      )
                    ] }, combo.key);
                  }),
                  !draft.length && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u8FD8\u6CA1\u6709\u7EC4\u5408\u3002\u65B0\u589E\u4E00\u4E2A\uFF0C\u9009\u62E9 Lead \u548C Sidekick \u540E\u4FDD\u5B58\u3002", "No combos yet. Add one, choose a Lead and a Sidekick, then save.") })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "fusion-combo-add", disabled: saving || draft.length >= state.maxPairs, onClick: addCombo, children: tr(lang, "\uFF0B \u65B0\u589E\u7EC4\u5408", "+ Add combo") }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, `\u6700\u591A\u4FDD\u5B58 ${state.maxPairs} \u4E2A\u7EC4\u5408\uFF1B\u6A21\u578B\u83DC\u5355\u4E2D\u7684\u540D\u79F0\u662F\u300CFusion \xB7 \u7EC4\u5408\u540D\u79F0\u300D\u3002`, `Up to ${state.maxPairs} combos; the model menu shows them as \u201CFusion \xB7 name\u201D.`) })
              ] }),
              current2 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { className: "fusion-card", disabled: saving, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
                  tr(lang, "\u540D\u79F0", "Name"),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      type: "text",
                      maxLength: 40,
                      "aria-label": tr(lang, "\u7EC4\u5408\u540D\u79F0", "Combo name"),
                      value: current2.name,
                      onChange: (event) => update((combo) => ({ ...combo, name: event.target.value }))
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ModelChoice, { role: "Lead", route: current2.pair.lead, catalog: state.catalog, onChange: (route) => {
                  if (route) chooseModel("lead", route);
                } }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ModelChoice, { role: "Sidekick", route: current2.pair.worker, catalog: state.catalog, onChange: (route) => {
                  if (route) chooseModel("worker", route);
                } }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("summary", { children: tr(lang, "\u4E0A\u4E0B\u6587\u538B\u7F29\u6A21\u578B \xB7 \u53EF\u9009", "Compaction model \xB7 optional") }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "fusion-limits", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u9ED8\u8BA4\u7531\u5F53\u524D\u89D2\u8272\u6A21\u578B\u538B\u7F29\u3002\u4E5F\u53EF\u4EE5\u5355\u72EC\u9009\u62E9\u5DF2\u8FDE\u63A5\u7684\u6A21\u578B\uFF1B\u8BF7\u6C42\u7531\u6240\u9009\u8D26\u53F7\u8BA1\u8D39\u3002", "By default each role compacts with its own model. You can pick another connected model; its account is billed.") }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ModelChoice, { role: "compactor", route: current2.pair.compactor?.route, catalog: state.catalog, onChange: (route) => update((combo) => {
                      const { compactor, ...rest } = combo.pair;
                      return { ...combo, pair: route ? { ...rest, compactor: { route, maxOutputTokens: compactor?.maxOutputTokens ?? 8192 } } : rest };
                    }) }),
                    current2.pair.compactor && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
                      tr(lang, "\u8F93\u51FA Token \u4E0A\u9650", "Output token limit"),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                        "input",
                        {
                          "aria-label": tr(lang, "\u538B\u7F29\u8F93\u51FA Token \u4E0A\u9650", "Compaction output token limit"),
                          type: "number",
                          min: "1",
                          max: "128000",
                          value: current2.pair.compactor.maxOutputTokens,
                          onChange: (event) => {
                            const maxOutputTokens = Number(event.target.value);
                            update((combo) => combo.pair.compactor ? { ...combo, pair: { ...combo.pair, compactor: { ...combo.pair.compactor, maxOutputTokens } } } : combo);
                          }
                        }
                      )
                    ] })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "fusion-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u5DF2\u9009\u4E2D\u7684\u4F1A\u8BDD\u4FDD\u7559\u539F\u7EC4\u5408\uFF1B\u65B0\u9009\u62E9\u4F7F\u7528\u65B0\u7EC4\u5408\u3002\u989D\u5EA6\u8017\u5C3D\u540E\u8981\u6362\u5F53\u524D\u4EFB\u52A1\u7684 Sidekick\uFF0C\u7528\u8BE5\u4F1A\u8BDD\u7684 Fusion \u6062\u590D\u9762\u677F\uFF0C\u800C\u4E0D\u662F\u53EA\u6539\u8FD9\u91CC\u3002", "Conversations already using Fusion keep their pair; new selections use the new one. After a quota stop, switch this conversation's Sidekick from its Fusion recovery panel, not only here.") }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { disabled: saving || !dirty || !draft.length, onClick: () => {
                  void save();
                }, children: saving ? tr(lang, "\u6B63\u5728\u4FDD\u5B58\u2026", "Saving\u2026") : tr(lang, "\u4FDD\u5B58\u7EC4\u5408", "Save combos") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u8F93\u51FA\u53C2\u6570\u8DDF\u968F\u539F\u751F\u6A21\u578B\u8BBE\u7F6E\uFF0CFusion \u4E0D\u989D\u5916\u9650\u5236\u8BF7\u6C42\u6B21\u6570\u6216\u4EFB\u52A1\u8F6E\u6570\u3002", "Output settings follow the native model settings; Fusion adds no request or round limits.") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u4FDD\u5B58\u5373\u8868\u793A\u5141\u8BB8 Fusion \u4F7F\u7528\u6240\u9009\u6A21\u578B\u7684\u73B0\u6709\u8D26\u53F7\uFF1B\u8D39\u7528\u7531\u8FD9\u4E9B\u8D26\u53F7\u8BA1\u5165\uFF0C\u5F53\u524D\u672A\u63D0\u4F9B\u53EF\u9760\u7684\u5B9E\u9645\u8D26\u5355\u91D1\u989D\u3002", "Saving lets Fusion use the chosen models' existing accounts; they are billed there, and no reliable billed amount is available here.") }),
              blocked.map((pair) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "status", children: `${pair.name}: ${tr(lang, "\u5C1A\u672A\u5C31\u7EEA\uFF0C\u9700\u8981\u91CD\u65B0\u4FDD\u5B58\u8FD9\u4E2A\u7EC4\u5408", "not ready yet; save this combo again")}${pair.reason ? `: ${pair.reason}` : ""}` }, pair.id)),
              state.managedAuthorization && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(lang, "\u8FD0\u884C\u989D\u5EA6\u7531\u5916\u90E8\u6388\u6743\u914D\u7F6E\u7BA1\u7406\u3002", "Run limits are managed by an external authorization file.") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(FusionCache, { refresh: state?.revision ?? 0 }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(FusionHistory, {})
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "div",
        {
          className: "fusion-section",
          id: SECTION_ID("antigravity"),
          hidden: section !== "antigravity",
          role: "region",
          "aria-label": tr(lang, "Antigravity\uFF08agy CLI\uFF09", "Antigravity (agy CLI)"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: tr(lang, "Antigravity", "Antigravity") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: tr(
              lang,
              "\u628A Google Antigravity\uFF08agy CLI\uFF09\u4F5C\u4E3A\u6A21\u578B\u8DEF\u7EBF\u4E0E Sidekick \u4F7F\u7528\u3002\u8FD9\u91CC\u7BA1\u7406\u5B83\u7684\u8D26\u53F7\u3001\u989D\u5EA6\u3001\u6A21\u578B\u53EF\u89C1\u6027\u4E0E\u6743\u9650\u6A21\u5F0F\uFF1B\u8DEF\u7EBF\u540D\u4E3A antigravity\uFF0C\u547D\u4EE4\u4E3A /agy\u3002",
              "Use Google Antigravity (agy CLI) as a model route and as a Sidekick. This section manages its accounts, quota, model visibility and permission mode; the route is antigravity and the command is /agy."
            ) }),
            section === "antigravity" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(AgyConsole, { isModal: false })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: "fusion-section",
          id: SECTION_ID("acp"),
          hidden: section !== "acp",
          role: "region",
          "aria-label": tr(lang, "ACP \u7EBF\u8DEF", "ACP routes"),
          children: section === "acp" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(AcpSettingsGuide, {})
        }
      )
    ] })
  ] });
}

// src/client/FusionPanelIcon.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function FusionPanelIcon({ size = 16, active = false, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "svg",
    {
      role: "img",
      "aria-label": "Fusion",
      "aria-hidden": "true",
      focusable: "false",
      viewBox: "0 0 16 16",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: active ? 1.5 : 1.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "4", cy: "4.5", r: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "4", cy: "11.5", r: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "12", cy: "8", r: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M6 4.5h1.5a3 3 0 0 1 2.7 1.7L10.5 6.8" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M6 11.5h1.5a3 3 0 0 0 2.7-1.7l.3-.6" })
      ]
    }
  );
}

// src/client/FusionHint.tsx
var import_react12 = require("react");

// src/client/FusionRecovery.tsx
var import_react9 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function FusionRecovery({ sessionId, task }) {
  const lang = useLang();
  const control = task.modelControl;
  const [role2, setRole] = (0, import_react9.useState)("lead");
  const [route, setRoute] = (0, import_react9.useState)();
  const [catalog, setCatalog] = (0, import_react9.useState)();
  const [dueAt, setDueAt] = (0, import_react9.useState)("");
  const [busy, setBusy] = (0, import_react9.useState)(false);
  const [notice, setNotice] = (0, import_react9.useState)("");
  const [error, setError] = (0, import_react9.useState)("");
  const action = async (name2) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(FUSION_API_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: name2,
          sessionId,
          taskId: task.id,
          revision: control.revision,
          role: role2,
          route,
          ...dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? tr(lang, "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u5237\u65B0\u72B6\u6001", "Not completed; refresh the status"));
      setNotice(name2 === "schedule" ? tr(lang, "\u5DF2\u8BBE\u7F6E\u4E00\u6B21\u5B9A\u65F6\u7EE7\u7EED\u3002Host \u9700\u8981\u8FD0\u884C\uFF1B\u65B0\u6D88\u606F\u4F1A\u53D6\u6D88\u5B89\u6392\u3002", "One scheduled continuation is set. The Host must be running; a new message cancels it.") : name2 === "cancel-schedule" ? tr(lang, "\u5DF2\u53D6\u6D88\u5B9A\u65F6\u7EE7\u7EED\u3002", "Scheduled continuation cancelled.") : tr(lang, "\u5DF2\u63D0\u4EA4\u7EE7\u7EED\u64CD\u4F5C\uFF0C\u72B6\u6001\u5C06\u81EA\u52A8\u66F4\u65B0\u3002", "Continuation submitted; the status updates automatically."));
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    } finally {
      setBusy(false);
    }
  };
  const loadCatalog = async () => {
    setError("");
    try {
      const response = await fetch(`${FUSION_API_PATH}?view=catalog`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(tr(lang, "\u65E0\u6CD5\u8BFB\u53D6\u6A21\u578B\u5217\u8868", "Cannot read the model list"));
      const value = await response.json();
      setCatalog({ ...value, groups: value.groups.filter((group) => !isFusionProvider(group.id)) });
    } catch (error2) {
      setError(String(error2));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "fusion-recovery", "aria-label": tr(lang, "Fusion \u6062\u590D\u64CD\u4F5C", "Fusion recovery"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: tr(lang, "\u7EE7\u7EED\u5F53\u524D\u4EFB\u52A1", "Continue this task") }),
    Object.entries(control.waits).filter(([, wait]) => wait?.taskId === task.id).map(([key2, wait]) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { children: [
      key2 === "lead" ? "Lead" : "Sidekick",
      " \xB7 ",
      wait.code,
      " \xB7 ",
      wait.code === "NO_PROGRESS" ? tr(lang, "\u91CD\u590D\u64CD\u4F5C\u6CA1\u6709\u8FDB\u5C55\uFF0C\u8BF7\u8C03\u6574\u505A\u6CD5", "Repeated steps made no progress; change the approach") : wait.code === "WORKFLOW_INCOMPLETE" ? tr(lang, "\u62A5\u544A\u3001\u59D4\u6D3E\u6216\u5BA1\u67E5\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u4EFB\u52A1\u540E\u7EE7\u7EED", "A report, handoff or review is unfinished; check the task, then continue") : wait.code.includes("QUOTA") ? tr(lang, "\u989D\u5EA6\u91CD\u7F6E\u65F6\u95F4\u672A\u77E5", "Quota reset time unknown") : tr(lang, "\u9700\u8981\u5904\u7406\u6A21\u578B\u9519\u8BEF", "A model error needs attention"),
      wait.retryNotBefore && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("small", { children: [
        tr(lang, "\u670D\u52A1\u5546\u5EFA\u8BAE\u91CD\u8BD5\u65F6\u95F4", "Provider retry hint"),
        ": ",
        new Date(wait.retryNotBefore).toLocaleString(),
        " ",
        tr(lang, "\uFF08\u4E0D\u4EE3\u8868\u989D\u5EA6\u91CD\u7F6E\uFF09", "(not a quota reset)")
      ] })
    ] }, key2)),
    control.schedule && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { role: "status", children: [
      tr(lang, "\u5B9A\u65F6\u7EE7\u7EED", "Scheduled continuation"),
      ": ",
      new Date(control.schedule.dueAt).toLocaleString(),
      " \xB7 ",
      { scheduled: tr(lang, "\u5DF2\u5B89\u6392", "scheduled"), cancelled: tr(lang, "\u5DF2\u53D6\u6D88", "cancelled"), fired: tr(lang, "\u5DF2\u6267\u884C\u4E00\u6B21", "ran once"), failed: tr(lang, "\u672A\u80FD\u6267\u884C", "failed") }[control.schedule.state],
      control.schedule.reason ? ` \xB7 ${control.schedule.reason}` : ""
    ] }),
    control.operation && ["prepared", "dispatching"].includes(control.operation.state) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "alert", children: tr(lang, "\u4E0A\u6B21\u7EE7\u7EED\u64CD\u4F5C\u7684\u6295\u9012\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\u3002\u8BF7\u68C0\u67E5\u4F1A\u8BDD\uFF1B\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u3002", "Delivery of the last continuation is unconfirmed. Check the conversation; nothing is resent automatically.") }),
    (task.recovering || task.outcomeUnknown) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "alert", children: tr(lang, "\u4E2D\u65AD\u7684\u64CD\u4F5C\u5C1A\u672A\u6838\u5BF9\u3002\u7EE7\u7EED\u548C\u66F4\u6362\u6A21\u578B\u90FD\u4E0D\u4F1A\u751F\u6548\uFF0C\u672C\u6B21\u4E5F\u4E0D\u4F1A\u5207\u6362\u6A21\u578B\u3002\u8BF7\u5148\u7528 /fusion recover <\u68C0\u67E5\u8BB0\u5F55> \u63D0\u4EA4\u6838\u5BF9\uFF0C\u518D\u7EE7\u7EED\u6216\u66F4\u6362 Sidekick\u3002Fusion \u9762\u677F\u91CC\u4FDD\u5B58\u7684\u65B0\u7EC4\u5408\u4E0D\u4F1A\u6539\u5199\u8FD9\u4E2A\u4F1A\u8BDD\u3002", "Interrupted operations are not inspected yet. Continue and model switching do nothing, and this attempt does not change the model. Record the inspection with /fusion recover <note>, then continue or switch the Sidekick. A new pair saved in the Fusion panel does not rewrite this conversation.") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "alert", children: error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "status", children: notice }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("fieldset", { disabled: busy || task.unsettledTools > 0 || task.pendingApprovals > 0 || task.recovering || task.outcomeUnknown, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { onClick: () => {
        void action("continue");
      }, children: tr(lang, "\u7EE7\u7EED\u4E00\u6B21", "Continue once") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { onClick: () => {
          if (!catalog) void loadCatalog();
        }, children: tr(lang, "\u66F4\u6362\u89D2\u8272\u6A21\u578B\u5E76\u7EE7\u7EED", "Switch a role model and continue") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { children: [
          tr(lang, "\u89D2\u8272", "Role"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { value: role2, onChange: (event) => {
            setRole(event.target.value);
            setRoute(void 0);
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "lead", children: "Lead" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "worker", children: "Sidekick" })
          ] })
        ] }),
        catalog && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ModelChoice, { role: role2 === "lead" ? "Lead" : "Sidekick", route, catalog, onChange: setRoute }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: tr(lang, "\u4EC5\u66F4\u6362\u5F53\u524D\u4F1A\u8BDD\u7684\u89D2\u8272\u6A21\u578B\uFF0C\u4FDD\u7559\u4EFB\u52A1\u4E0E Sidekick \u4F1A\u8BDD\u3002\u540E\u7EED\u8BF7\u6C42\u4F7F\u7528\u65B0\u6A21\u578B\u7684\u8D26\u53F7\u3002", "Changes this conversation's role model only; the task and the Sidekick session are kept. Later requests use the new model's account.") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: !route, onClick: () => {
          void action("switch-role");
        }, children: tr(lang, "\u66F4\u6362\u5E76\u7EE7\u7EED\u4E00\u6B21", "Switch and continue once") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { children: tr(lang, "\u5B9A\u65F6\u7EE7\u7EED\u4E00\u6B21", "Continue once at a time") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { children: [
          tr(lang, "\u672C\u5730\u65F6\u95F4", "Local time"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { "aria-label": tr(lang, "\u5B9A\u65F6\u7EE7\u7EED\u65F6\u95F4", "Continuation time"), type: "datetime-local", value: dueAt, onChange: (event) => setDueAt(event.target.value) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: tr(lang, "\u6309\u4F60\u9009\u62E9\u7684\u65F6\u95F4\u5C1D\u8BD5\u4E00\u6B21\uFF1B\u518D\u6B21\u9047\u5230\u989D\u5EA6\u9519\u8BEF\u4F1A\u505C\u6B62\u3002\u6B64\u65F6\u95F4\u4E0D\u4EE3\u8868\u670D\u52A1\u5546\u627F\u8BFA\u7684\u6062\u590D\u65F6\u95F4\u3002", "Tries once at the time you choose and stops on another quota error. It is not a provider-promised reset time.") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { disabled: !dueAt, onClick: () => {
          void action("schedule");
        }, children: tr(lang, "\u8BBE\u7F6E\u65F6\u95F4", "Set time") }),
        control.schedule?.state === "scheduled" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { onClick: () => {
          void action("cancel-schedule");
        }, children: tr(lang, "\u53D6\u6D88\u5B89\u6392", "Cancel") })
      ] })
    ] })
  ] });
}

// src/client/FusionStatus.tsx
var import_react11 = require("react");

// src/client/status-polling.ts
var import_react10 = require("react");
var entries = /* @__PURE__ */ new Map();
var visible = () => document.visibilityState !== "hidden";
var running = /* @__PURE__ */ new Set(["\u5206\u6790", "\u6267\u884C", "\u4FEE\u6539", "\u5BA1\u67E5", "\u9A8C\u8BC1", "\u6B63\u5728\u505C\u6B62"]);
function subscribe(sessionId, listener, expanded) {
  let entry = entries.get(sessionId);
  if (!entry) {
    entry = { listeners: /* @__PURE__ */ new Map(), busy: false, visibility: () => {
    } };
    entries.set(sessionId, entry);
    const own2 = entry;
    const active = () => entries.get(sessionId) === own2 && own2.listeners.size > 0;
    const publish = (snapshot) => {
      if (!active()) return;
      own2.snapshot = snapshot;
      for (const notify3 of own2.listeners.keys()) notify3();
    };
    const refresh = async () => {
      if (!active() || own2.busy || !visible()) return;
      clearTimeout(own2.timer);
      own2.busy = true;
      const abort = new AbortController();
      own2.abort = abort;
      const deadline = setTimeout(() => {
        if (active() && visible()) publish({ sessionId, failed: true });
        abort.abort();
      }, 1e4);
      try {
        const response = await fetch(
          `${FUSION_API_PATH}?view=status&sessionId=${encodeURIComponent(sessionId)}`,
          { credentials: "same-origin", cache: "no-store", signal: abort.signal }
        );
        if (!response.ok) throw new Error("unavailable");
        const status = await response.json();
        if (status.schemaVersion !== 1 || status.sessionId !== sessionId) throw new Error("mismatched status");
        if (!abort.signal.aborted) publish({ sessionId, status, failed: false });
      } catch {
        if (!abort.signal.aborted) publish({ sessionId, failed: true });
      } finally {
        clearTimeout(deadline);
        own2.busy = false;
        if (active() && visible()) {
          const fast = [...own2.listeners.values()].some((value) => value()) && running.has(own2.snapshot?.status?.task?.stage ?? "");
          own2.timer = setTimeout(() => {
            void refresh();
          }, fast ? 2e3 : 15e3);
        }
      }
    };
    own2.visibility = () => {
      clearTimeout(own2.timer);
      if (!visible()) own2.abort?.abort();
      else void refresh();
    };
    document.addEventListener("visibilitychange", own2.visibility);
  }
  entry.listeners.set(listener, expanded);
  if (entry.listeners.size === 1 || expanded()) entry.visibility();
  const own = entry;
  return () => {
    own.listeners.delete(listener);
    if (own.listeners.size) return;
    entries.delete(sessionId);
    clearTimeout(own.timer);
    own.abort?.abort();
    document.removeEventListener("visibilitychange", own.visibility);
  };
}
function useFusionStatus(sessionId, expandedTask, attentionOnly = false, live = false) {
  const expandedRef = (0, import_react10.useRef)(expandedTask), attentionRef = (0, import_react10.useRef)(attentionOnly), liveRef = (0, import_react10.useRef)(live);
  expandedRef.current = expandedTask;
  attentionRef.current = attentionOnly;
  liveRef.current = live;
  (0, import_react10.useEffect)(() => {
    if (expandedTask) entries.get(sessionId)?.visibility();
  }, [sessionId, expandedTask]);
  return (0, import_react10.useSyncExternalStore)(
    (0, import_react10.useCallback)((listener) => subscribe(sessionId, listener, () => {
      if (liveRef.current) return true;
      const task = entries.get(sessionId)?.snapshot?.status?.task;
      return expandedRef.current !== void 0 && task?.id === expandedRef.current && (!attentionRef.current || task.attention);
    }), [sessionId]),
    (0, import_react10.useCallback)(() => entries.get(sessionId)?.snapshot, [sessionId]),
    () => void 0
  );
}

// src/client/FusionStatus.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var styles3 = `
.fusion-status{margin:8px 12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.fusion-status>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:12px;list-style:none;border-top:1px solid var(--dsw-alias-border-l2);outline-offset:2px}
.fusion-status>summary::before{content:'\u203A';font-size:18px;flex:none}.fusion-status[open]>summary::before{content:'\u2304'}
.fusion-status>summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}
.fusion-status .fusion-status-label{font-weight:600}.fusion-status .fusion-status-count{margin-left:auto;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.fusion-status .fusion-status-detail{max-height:320px;overflow:auto;padding:4px 4px 12px 0;scrollbar-gutter:stable}
.fusion-status .fusion-recovery fieldset{border:0;padding:0;display:flex;flex-direction:column;gap:10px}.fusion-recovery :is(button,select,input){font:inherit;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:7px;max-width:100%}.fusion-recovery :is(select,input,option,optgroup){background-color:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);color-scheme:inherit}.fusion-recovery button{cursor:pointer;background-color:var(--dsw-alias-button-elevated-fill)}.fusion-recovery :is(button,input,select):focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}.fusion-recovery [role=alert]{color:var(--dsw-alias-state-error-primary)}
.fusion-status:has(.fusion-recovery) .fusion-status-detail{max-height:min(65vh,640px)}.fusion-recovery details>summary{padding:8px 0;cursor:pointer}
.fusion-status p{margin:4px 0 12px}.fusion-status h3{font-size:13px;margin:16px 0 4px;font-weight:600}
.fusion-status dl{margin:0;display:grid;grid-template-columns:minmax(72px,auto) minmax(0,1fr);gap:4px 12px}
.fusion-status dt{color:var(--dsw-alias-label-secondary)}.fusion-status dd{margin:0;min-width:0}
.fusion-status ul{list-style:none;margin:0;padding:0}.fusion-status li{padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.fusion-status small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px}
@media(max-width:400px){.fusion-status>summary{gap:8px}.fusion-status .fusion-status-detail{max-height:280px}}
`;
var role = (value) => value === "lead" ? "Lead" : "Sidekick";
var purposeOf = (lang, value) => ({
  conversation: tr(lang, "\u4EFB\u52A1", "task"),
  compaction: tr(lang, "\u538B\u7F29", "compaction"),
  "cache-keepalive": tr(lang, "\u4FDD\u6D3B", "keepalive"),
  "session-title": tr(lang, "\u6807\u9898", "title")
})[value] ?? value;
var outcomeOf = (lang, value) => ({
  entered: tr(lang, "\u8BF7\u6C42\u4E2D", "in progress"),
  stop: tr(lang, "\u5DF2\u8FD4\u56DE", "returned"),
  "tool-calls": tr(lang, "\u8C03\u7528\u5DE5\u5177", "tool calls"),
  "max-tokens": tr(lang, "\u8F93\u51FA\u622A\u65AD", "output truncated"),
  aborted: tr(lang, "\u5DF2\u4E2D\u65AD", "aborted"),
  error: tr(lang, "\u8BF7\u6C42\u5931\u8D25", "failed"),
  unknown: tr(lang, "\u7ED3\u675F\u72B6\u6001\u672A\u77E5", "unknown end")
})[value] ?? value;
var toolStateOf = (lang, value) => ({
  "dispatch-started": tr(lang, "\u6267\u884C\u672A\u6536\u5C3E", "unfinished"),
  returned: tr(lang, "\u5DF2\u8FD4\u56DE", "returned"),
  "outcome-unknown": tr(lang, "\u7ED3\u679C\u672A\u77E5", "outcome unknown"),
  inspected: tr(lang, "\u5DF2\u4EBA\u5DE5\u68C0\u67E5", "inspected")
})[value] ?? value;
var countOf = (lang, value) => value.totalRequests === 0 ? "\u2014" : value.reportedRequests === 0 ? tr(lang, "\u672A\u63D0\u4F9B", "not reported") : `${value.knownTokens.toLocaleString()}${value.reportedRequests < value.totalRequests ? tr(lang, `\uFF08${value.reportedRequests}/${value.totalRequests} \u6B21\u6709\u62A5\u544A\uFF09`, ` (${value.reportedRequests}/${value.totalRequests} reported)`) : ""}`;
var noteStyle = { margin: "8px 12px", color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: 1.5 };
function FusionStatus({ sessionId, attentionOnly = false }) {
  const lang = useLang();
  const purpose2 = (value) => purposeOf(lang, value), outcome = (value) => outcomeOf(lang, value);
  const toolState = (value) => toolStateOf(lang, value), count = (value) => countOf(lang, value);
  const [expandedTask, setExpandedTask] = (0, import_react11.useState)();
  const snapshot = useFusionStatus(sessionId, expandedTask, attentionOnly);
  if (!snapshot || snapshot.sessionId !== sessionId) return attentionOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { style: noteStyle, role: "status", children: tr(lang, "\u6B63\u5728\u8BFB\u53D6 Fusion \u72B6\u6001\u2026", "Loading Fusion status\u2026") });
  if (snapshot.failed) return attentionOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { style: noteStyle, role: "status", children: tr(lang, "Fusion \u72B6\u6001\u6682\u65F6\u65E0\u6CD5\u66F4\u65B0\uFF0C\u6062\u590D\u8FDE\u63A5\u540E\u4F1A\u91CD\u8BD5\u3002\u53EF\u7528 /fusion status \u67E5\u770B\u3002", "Fusion status cannot update right now; it retries when reconnected. Use /fusion status.") });
  const task = snapshot.status?.task;
  if (!snapshot.status?.selected || !task) return null;
  if (attentionOnly && !task.attention) return null;
  const { usage } = task;
  const verification = task.automatedChecks === 0 && task.verification === "verified" ? tr(lang, "\u4EC5\u7ECF Lead \u5BA1\u67E5\uFF08\u672A\u8FD0\u884C\u81EA\u52A8\u68C0\u67E5\uFF09", "Lead review only (no automated checks ran)") : { verified: tr(lang, "\u9A8C\u8BC1\u901A\u8FC7", "verified"), partial: tr(lang, "\u90E8\u5206\u9A8C\u8BC1", "partly verified"), unverified: tr(lang, "\u5C1A\u672A\u9A8C\u8BC1", "unverified") }[task.verification];
  const stage = lang === "en" ? task.stageEn ?? task.stage : task.stage, detail = lang === "en" && task.detailEn !== void 0 ? task.detailEn : task.detail;
  const share = (role2) => {
    const total = usage.byRole.lead.output.knownTokens + usage.byRole.worker.output.knownTokens;
    return total ? tr(lang, ` \xB7 \u8F93\u51FA\u5360 ${Math.round(usage.byRole[role2].output.knownTokens / total * 100)}%`, ` \xB7 ${Math.round(usage.byRole[role2].output.knownTokens / total * 100)}% of output`) : "";
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("details", { className: "fusion-status", onToggle: (event) => setExpandedTask(event.currentTarget.open ? task.id : void 0), children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("style", { children: styles3 }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("summary", { "aria-label": tr(lang, `Fusion \xB7 ${stage}\uFF0C\u4EFB\u52A1\u8BE6\u60C5`, `Fusion \xB7 ${stage}, task details`), "data-ud-check": "fusion-status-summary", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "fusion-status-label", role: "status", children: [
        "Fusion \xB7 ",
        stage
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "fusion-status-count", children: tr(lang, `${usage.calls} \u6B21\u8BF7\u6C42`, `${usage.calls} requests`) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: tr(lang, "\u8BE6\u60C5", "Details") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "fusion-status-detail", tabIndex: 0, "aria-label": tr(lang, "Fusion \u4EFB\u52A1\u8BE6\u60C5", "Fusion task details"), "data-ud-check": "fusion-status-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: detail ?? (task.stage === "\u5B8C\u6210" ? tr(lang, `\u672C\u8F6E\u4EFB\u52A1\u5DF2\u7ED3\u675F \xB7 ${verification}`, `This task has finished \xB7 ${verification}`) : tr(lang, `\u672C\u8F6E\u4EFB\u52A1 \xB7 ${verification}`, `This task \xB7 ${verification}`)) }),
      task.modelControl && task.stage !== "\u5B8C\u6210" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(FusionRecovery, { sessionId, task }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: "Lead" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          task.models.lead.model,
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: task.models.lead.provider })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: "Sidekick" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          task.models.worker.model,
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("small", { children: [
            task.models.worker.provider,
            task.workerId ? tr(lang, " \xB7 \u5DF2\u5EFA\u7ACB\u6301\u7EED\u4F1A\u8BDD", " \xB7 persistent session") : tr(lang, " \xB7 \u5C1A\u672A\u59D4\u6D3E", " \xB7 not delegated yet")
          ] })
        ] }),
        task.models.compactor && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u538B\u7F29\u6A21\u578B", "Compaction") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
            task.models.compactor.model,
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: task.models.compactor.provider })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u5F85\u786E\u8BA4", "Pending approvals") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: task.pendingApprovals }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u672A\u6536\u5C3E\u5DE5\u5177", "Unsettled tools") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: task.unsettledTools })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: tr(lang, "\u672C\u8F6E\u7528\u91CF", "Usage this task") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u6A21\u578B\u8BF7\u6C42", "Model requests") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          usage.calls,
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, `\u542B\u538B\u7F29 ${usage.compactionCalls} \u6B21\u3001\u4FDD\u6D3B ${usage.keepaliveCalls} \u6B21`, `incl. ${usage.compactionCalls} compaction, ${usage.keepaliveCalls} keepalive`) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u7528\u91CF\u62A5\u544A", "Usage reports") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: tr(lang, `${usage.finalCalls} \u6B21\u5DF2\u5B9A\u7A3F \xB7 ${usage.provisionalCalls} \u6B21\u6682\u62A5 \xB7 ${usage.unreportedCalls} \u6B21\u672A\u63D0\u4F9B`, `${usage.finalCalls} final \xB7 ${usage.provisionalCalls} provisional \xB7 ${usage.unreportedCalls} unreported`) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u8F93\u5165 Token", "Input tokens") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          count(usage.input),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, "\u5DF2\u62A5\u544A\u7684\u672A\u7F13\u5B58\u8F93\u5165", "reported uncached input") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u7F13\u5B58\u8BFB\u53D6", "Cache read") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: count(usage.cacheRead) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u8F93\u51FA Token", "Output tokens") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: count(usage.output) })
      ] }),
      task.cost && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(CostBlock, { lang, cost: task.cost }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: tr(lang, "\u6309\u89D2\u8272", "By role") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dl", { children: ["lead", "worker"].map((role2) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_react11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: role2 === "lead" ? "Lead" : "Sidekick" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          tr(lang, `${usage.byRole[role2].calls} \u6B21`, `${usage.byRole[role2].calls} requests`),
          " \xB7 ",
          tr(lang, "\u8F93\u51FA", "output"),
          " ",
          count(usage.byRole[role2].output),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("small", { children: [
            tr(lang, "\u8F93\u5165", "input"),
            " ",
            count(usage.byRole[role2].input),
            " \xB7 ",
            tr(lang, "\u7F13\u5B58\u8BFB\u53D6", "cache read"),
            " ",
            count(usage.byRole[role2].cacheRead),
            share(role2)
          ] })
        ] })
      ] }, role2)) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, "Token \u6570\u5305\u542B\u6682\u62A5\u6570\u636E\uFF1B\u7F3A\u5931\u5B57\u6BB5\u4E0D\u8BA1\u4E3A 0\u3002\u8BF7\u6C42\u6570\u6765\u81EA DSH\uFF0C\u4F9B\u5E94\u5546\u5185\u90E8\u91CD\u8BD5\u6B21\u6570\u672A\u77E5\u3002", "Token counts include provisional data; missing fields are not counted as 0. Request counts come from DSH; provider-internal retries are unknown.") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: tr(lang, "\u6700\u8FD1\u4E0A\u4E0B\u6587\u68C0\u67E5", "Recent context checks") }),
      task.contexts.length ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { children: task.contexts.map((context) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
        role(context.role),
        " \xB7 ",
        purpose2(context.purpose),
        " \xB7 ",
        context.admitted ? tr(lang, "\u53EF\u53D1\u9001", "admitted") : tr(lang, "\u8D85\u51FA\u9884\u7B97", "over budget"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("small", { children: [
          context.inputTokens.toLocaleString(),
          " / ",
          context.budget.toLocaleString(),
          " Token \xB7 ",
          context.quality === "exact" ? tr(lang, "\u7CBE\u786E\u8BA1\u6570", "exact") : tr(lang, "\u4F30\u7B97", "estimated")
        ] })
      ] }, context.role)) }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, "\u5C1A\u65E0\u4E0A\u4E0B\u6587\u68C0\u67E5\u8BB0\u5F55\u3002", "No context checks yet.") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: tr(lang, "\u6700\u8FD1\u6A21\u578B\u8BF7\u6C42", "Recent model requests") }),
      task.requests.length ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { children: task.requests.map((request) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
        role(request.role),
        " \xB7 ",
        purpose2(request.purpose),
        " \xB7 ",
        outcome(request.outcome),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("small", { children: [
          request.model,
          " \xB7 ",
          request.provider,
          " \xB7 ",
          request.authority === "final" ? tr(lang, "\u7528\u91CF\u5DF2\u5B9A\u7A3F", "usage final") : request.authority === "provisional" ? tr(lang, "\u7528\u91CF\u6682\u62A5", "usage provisional") : tr(lang, "\u7528\u91CF\u672A\u63D0\u4F9B", "usage not reported")
        ] })
      ] }, request.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, "\u5C1A\u672A\u53D1\u51FA\u6A21\u578B\u8BF7\u6C42\u3002", "No model requests yet.") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: tr(lang, "\u6700\u8FD1\u547D\u4EE4\u4E0E\u5199\u5165", "Recent commands and writes") }),
      task.tools.length ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { children: task.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
        role(tool.role),
        " \xB7 ",
        tool.name,
        " \xB7 ",
        tool.failed ? tr(lang, "\u8FD4\u56DE\u9519\u8BEF", "error") : toolState(tool.state)
      ] }, tool.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, "\u5C1A\u65E0\u5DE5\u5177\u6267\u884C\u8BB0\u5F55\u3002", "No tool runs yet.") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(lang, "\u663E\u793A\u6700\u8FD1 12 \u6B21\u8BF7\u6C42\u30018 \u9879\u547D\u4EE4\u6216\u5199\u5165\u64CD\u4F5C\uFF1B\u7528\u91CF\u6C47\u603B\u8986\u76D6\u672C\u8F6E\u5168\u90E8\u8BF7\u6C42\u3002\u8BFB\u53D6\u64CD\u4F5C\u4ECD\u53EF\u5728\u4F1A\u8BDD\u4E2D\u67E5\u770B\u3002", "Shows the last 12 requests and 8 commands or writes; usage totals cover all requests of this task. Reads remain visible in the conversation.") })
    ] })
  ] }, task.id);
}
function CostBlock({ lang, cost }) {
  const usd = (value) => value === null ? null : `$${Number(value).toFixed(2)}`;
  const saved = cost.savedUsd === null ? null : Number(cost.savedUsd);
  const omitted = cost.unpriced + cost.incomplete + cost.unknown;
  const reasons = [
    cost.unpriced ? tr(lang, `${cost.unpriced} \u6B21\u6CA1\u6709\u4EF7\u76EE`, `${cost.unpriced} with no price`) : "",
    cost.incomplete ? tr(lang, `${cost.incomplete} \u6B21\u7528\u91CF\u4E0D\u5168`, `${cost.incomplete} with incomplete usage`) : "",
    cost.unknown ? tr(lang, `${cost.unknown} \u6B21\u65E0\u6CD5\u8BFB\u53D6`, `${cost.unknown} unreadable`) : ""
  ].filter(Boolean).join(tr(lang, "\u3001", ", "));
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: tr(lang, "\u8D39\u7528\u4F30\u7B97", "Cost estimate") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u6309\u4EF7\u76EE\u8868", "At list prices") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
        usd(cost.apiEquivalentUsd) ?? tr(lang, "\u65E0\u6CD5\u4F30\u7B97", "cannot estimate"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(
          lang,
          `\u8986\u76D6 ${cost.priced} \u6B21\u8BF7\u6C42\uFF1B\u6309\u5404\u6A21\u578B\u516C\u5F00\u5355\u4EF7\u6362\u7B97\uFF0C\u4E0D\u662F\u8D26\u5355`,
          `${cost.priced} requests priced; converted at published rates, not a bill`
        ) })
      ] }),
      cost.savedUsd !== null && cost.savedPercent !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_react11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u7701\u4E0B", "Saved") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
          usd(cost.savedUsd),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(
            lang,
            `\u6BD4\u540C\u6837\u7684 token \u5168\u4EA4\u7ED9 Lead \u4FBF\u5B9C ${cost.savedPercent}%\uFF08\u8986\u76D6 ${cost.basis} \u6B21\u8BF7\u6C42\uFF09`,
            `${cost.savedPercent}% cheaper than sending the same tokens to the Lead (${cost.basis} requests)`
          ) })
        ] })
      ] }),
      saved !== null && saved < 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { role: "status", children: tr(lang, "\u8FD9\u4E2A Sidekick \u6BD4 Lead \u66F4\u8D35\uFF0C\u7701\u94B1\u4E0D\u6210\u7ACB\u3002", "This Sidekick costs more than the Lead, so there is no saving.") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: tr(lang, "\u5B9E\u9645\u8D26\u5355", "Actual bill") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dd", { children: [
        tr(lang, "\u672A\u77E5", "unknown"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tr(
          lang,
          "DSH \u4E0D\u63D0\u4F9B\u6BCF\u6B21\u8BF7\u6C42\u7684\u8BA1\u8D39\u91D1\u989D\uFF1B\u8BA2\u9605\u7EBF\u8DEF\u4E5F\u4E0D\u6309 token \u8BA1\u8D39",
          "DSH reports no per-request billed amount, and subscription routes are not billed per token"
        ) })
      ] })
    ] }),
    omitted > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("small", { role: "status", children: [
      tr(lang, `\u6709 ${omitted} \u6B21\u8BF7\u6C42\u672A\u8BA1\u5165\uFF1A${reasons}\u3002`, `${omitted} requests are not included: ${reasons}.`),
      cost.unpricedModels.length ? tr(
        lang,
        `\u53EF\u5728\u9762\u677F\u8865\u5145\u8FD9\u4E9B\u6A21\u578B\u7684\u5355\u4EF7\uFF1A${cost.unpricedModels.join("\u3001")}\u3002`,
        ` Add rates for these models in the panel: ${cost.unpricedModels.join(", ")}.`
      ) : ""
    ] })
  ] });
}

// src/client/FusionHint.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function FusionHint({ sessionId, directory, load }) {
  const selected = (0, import_react12.useSyncExternalStore)(directory.subscribe, directory.getSnapshot).current;
  const fusion = isFusionSelection(selected ?? void 0);
  const lang = useLang();
  const [message, setMessage] = (0, import_react12.useState)();
  (0, import_react12.useEffect)(() => {
    load();
  }, [load]);
  (0, import_react12.useEffect)(() => {
    if (!fusion) {
      setMessage(void 0);
      return;
    }
    let active = true;
    const abort = new AbortController();
    const refresh = () => {
      void fetch(`${FUSION_API_PATH}?view=settings`, { credentials: "same-origin", cache: "no-store", signal: abort.signal }).then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      }).then((state) => {
        if (!active) return;
        const combo = state.pairs.find((pair) => pair.id === selected?.model);
        if (!state.pairs.length) setMessage(tr(lang, "Fusion \u5C1A\u672A\u914D\u7F6E\u6A21\u578B\uFF0C\u8BF7\u6253\u5F00\u5DE6\u4FA7\u8FB9\u680F\u7684 Fusion \u9762\u677F\u9009\u62E9 Lead \u548C Sidekick\u3002", "Fusion has no models yet: open the Fusion panel in the left sidebar and choose a Lead and a Sidekick."));
        else if (!combo) setMessage(tr(lang, "\u5F53\u524D\u7EC4\u5408\u5DF2\u88AB\u5220\u9664\uFF0C\u8BF7\u5728\u6A21\u578B\u83DC\u5355\u4E2D\u9009\u62E9\u5176\u4ED6\u7EC4\u5408\u3002", "This combo was removed; pick another one in the model menu."));
        else if (!combo.authorized) setMessage(tr(lang, "Fusion \u5F53\u524D\u914D\u7F6E\u672A\u5C31\u7EEA\uFF0C\u8BF7\u5728\u5DE6\u4FA7\u8FB9\u680F\u7684 Fusion \u9762\u677F\u67E5\u770B\u3002", "The Fusion setup is not ready: see the Fusion panel in the left sidebar."));
        else setMessage(void 0);
      }).catch(() => {
        if (active) setMessage(tr(lang, "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4 Fusion \u914D\u7F6E\uFF0C\u8BF7\u5728\u5DE6\u4FA7\u8FB9\u680F\u7684 Fusion \u9762\u677F\u67E5\u770B\u3002", "Cannot confirm the Fusion setup right now: see the Fusion panel in the left sidebar."));
      });
    };
    refresh();
    const off = onSettingsChanged(refresh);
    return () => {
      active = false;
      abort.abort();
      off();
    };
  }, [fusion, lang, selected?.model]);
  if (!fusion) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    message && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { role: "status", style: { margin: "8px 12px", color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" }, children: message }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(FusionStatus, { sessionId, attentionOnly: true })
  ] });
}

// src/client/FusionPermission.tsx
var import_react13 = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime9 = require("react/jsx-runtime");
var styles4 = `
.fusion-permission{display:inline-flex;align-items:center;gap:4px;height:28px;min-width:0;max-width:220px;padding:0 6px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500}
.fusion-permission svg{width:14px;height:14px;flex:none}
.fusion-permission .fusion-permission-role{flex:none;color:var(--dsw-alias-label-caption)}
.fusion-permission .fusion-permission-mode{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
var modeOf = (lang, mode) => mode === "read-only" ? tr(lang, "\u4EC5\u53EF\u67E5\u770B", "Read Only") : mode === "workspace-write" ? tr(lang, "\u5DE5\u4F5C\u533A\u5185\u4FEE\u6539", "Workspace Write") : tr(lang, "\u5B8C\u5168\u6743\u9650", "Full access");
var iconOf = (mode) => mode === "read-only" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives.PermissionIconReadOnlyRegular, {}) : mode === "workspace-write" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {});
function FusionPermission({ sessionId, directory, load }) {
  const selected = (0, import_react13.useSyncExternalStore)(directory.subscribe, directory.getSnapshot).current;
  const fusion = isFusionSelection(selected ?? void 0);
  const lang = useLang();
  const snapshot = useFusionStatus(sessionId, void 0, false, true);
  (0, import_react13.useEffect)(() => {
    load();
  }, [load]);
  const permissions = fusion ? snapshot?.status?.task?.permissions : void 0;
  if (!permissions) return null;
  const role2 = permissions.active === "worker" ? "Sidekick" : "Lead";
  const mode = permissions.active === "worker" ? permissions.worker : permissions.lead;
  const hint = tr(
    lang,
    `Fusion \u6309\u89D2\u8272\u5206\u79BB\u6743\u9650\uFF1ALead ${modeOf(lang, permissions.lead)}\uFF0CSidekick ${modeOf(lang, permissions.worker)}\u3002\u8F93\u5165\u6846\u7684\u6743\u9650\u63A7\u4EF6\u5C5E\u4E8E\u5BF9\u8BDD\u4F1A\u8BDD\uFF08Lead\uFF09\uFF0C\u8FD0\u884C\u671F\u95F4\u53EF\u80FD\u663E\u793A Custom\u3002`,
    `Fusion separates permissions by role: Lead ${modeOf(lang, permissions.lead)}, Sidekick ${modeOf(lang, permissions.worker)}. The permission control belongs to the conversation (Lead) session, so it may read Custom while a task runs.`
  );
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "fusion-permission", title: hint, "aria-label": `${role2} \xB7 ${modeOf(lang, mode)}`, "data-ud-check": "fusion-permission", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("style", { children: styles4 }),
    iconOf(mode),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "fusion-permission-role", children: role2 }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "fusion-permission-mode", children: modeOf(lang, mode) })
  ] });
}

// src/client/FusionTool.tsx
var import_react15 = require("react");

// src/host/route-transport.ts
var ROUTE_TRANSPORT = { antigravity: "agy_tool" };
var ROUTE_TRANSPORT_NAMES = new Set(Object.values(ROUTE_TRANSPORT));
function isRouteTransportName(name2) {
  return ROUTE_TRANSPORT_NAMES.has(name2);
}

// src/activity.ts
function activityCallId(activity) {
  const event = activity.source;
  const id = event.type === "tool/call" ? event.data.callId : event.data.message.source.callId;
  return `fusion:${activity.childSessionId}:${id}`;
}
var MIRROR_COMMENT = /^\/\/ dsh-agy-worker mirror: replay recorded agy tool step (\d+) \(([^()]*)\)$/;
var MIRROR_CALL = /^return await tools\['([^']+)'\]\((\{.*\})\)$/;
function mirrorStepInvocation(code) {
  const lines = code.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  if (lines.length !== 2) return void 0;
  const comment = MIRROR_COMMENT.exec(lines[0]);
  const call = MIRROR_CALL.exec(lines[1]);
  if (!comment || !call || !isRouteTransportName(call[1])) return void 0;
  let args;
  try {
    args = JSON.parse(call[2]);
  } catch {
    return void 0;
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) return void 0;
  const cursor = args;
  if (typeof cursor.run !== "string" || cursor.run === "") return void 0;
  if (!Number.isSafeInteger(cursor.step) || cursor.step < 0) return void 0;
  if (Number(comment[1]) !== cursor.step) return void 0;
  const tool = comment[2].trim();
  return { run: cursor.run, step: cursor.step, tool: tool === "" ? "agy tool" : tool };
}

// src/client/activity-model.ts
function activityRows(events) {
  const rows = /* @__PURE__ */ new Map();
  for (const event of events) {
    const id = activityCallId(event);
    if (event.source.type === "tool/call") rows.set(id, { id, call: event.source });
    else {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, result: event.source });
    }
  }
  return [...rows.values()];
}
function activityDiffs(row) {
  if (!row.result || row.result.data.message.isError) return [];
  const meta = row.result.data.meta;
  if (!Array.isArray(meta?.diffs)) return [];
  return meta.diffs.filter((hunk) => hunk && typeof hunk === "object" && typeof hunk.path === "string" && (typeof hunk.oldText === "string" || hunk.oldText === null) && typeof hunk.newText === "string");
}

// src/client/ActivityRows.tsx
var import_react14 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/agy-activity.ts
var CODE_WRAPPER = "run_code";
var META_MCP = /^(call_mcp_tool|callMcpTool|call_mcp|mcp_call)$/i;
var AGY_TERMINAL_TOOLS = /* @__PURE__ */ new Set([
  "run_command",
  "bash",
  "execute_command",
  "ops_bash",
  "sh",
  "shell"
]);
var HOST_TERMINAL_TOOLS = /* @__PURE__ */ new Set(["bash", "pwsh"]);
function pickString(input, keys) {
  for (const key2 of keys) {
    const value = input[key2];
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return void 0;
}
function parseObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch {
  }
  return void 0;
}
function innerArguments(value) {
  if (value === void 0 || value === null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    let text = value.trim();
    if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'")) {
      try {
        const unquoted = JSON.parse(text);
        if (typeof unquoted === "string") text = unquoted.trim();
      } catch {
      }
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
      return { value: parsed };
    } catch {
      return { value };
    }
  }
  return { value };
}
function unwrapMcp(tool, input) {
  if (META_MCP.test(tool)) {
    const server = pickString(input, ["ServerName", "server_name", "serverName", "server"]);
    const inner = pickString(input, ["ToolName", "tool_name", "toolName", "name", "tool"]);
    if (inner !== void 0) {
      const raw = input.Arguments ?? input.arguments ?? input.args ?? input.parameters ?? input.params ?? input.input;
      return { tool: inner, ...server === void 0 ? {} : { server }, input: innerArguments(raw) };
    }
  }
  if (tool.startsWith("mcp__")) {
    const parts = tool.slice(5).split("__");
    if (parts.length >= 2) return { tool: parts.slice(1).join("__"), server: parts[0], input };
  }
  return { tool, input };
}
function presentedCall(name2, rawArguments) {
  const parsed = parseObject(rawArguments);
  const raw = parsed ?? {};
  if (isRouteTransportName(name2)) {
    const reported = typeof raw.tool === "string" ? raw.tool.trim() : "";
    if (reported === "") return { tool: name2, transport: name2, arguments: raw, malformed: parsed === void 0, raw: rawArguments };
    const server = typeof raw.server === "string" && raw.server !== "" ? raw.server : void 0;
    const unwrapped = unwrapMcp(reported, innerArguments(raw.input));
    const owner = unwrapped.server ?? server;
    return {
      tool: unwrapped.tool,
      transport: name2,
      arguments: unwrapped.input,
      ...owner === void 0 ? {} : { server: owner },
      malformed: parsed === void 0,
      raw: rawArguments
    };
  }
  if (name2 === CODE_WRAPPER && parsed !== void 0 && typeof parsed.code === "string") {
    const step = mirrorStepInvocation(parsed.code);
    if (step !== void 0) {
      const description = typeof parsed.description === "string" ? parsed.description : void 0;
      return { tool: step.tool, transport: name2, arguments: description === void 0 ? {} : { Description: description }, malformed: false, raw: rawArguments };
    }
  }
  return { tool: name2, arguments: raw, malformed: parsed === void 0, raw: rawArguments };
}
function presentedCommand(call) {
  return pickString(call.arguments, ["CommandLine", "command_line", "Command", "command", "Cmd", "cmd"]);
}
function presentedPath(call) {
  return pickString(call.arguments, [
    "AbsolutePath",
    "absolute_path",
    "TargetFile",
    "target_file",
    "path",
    "file_path",
    "filename",
    "Path",
    "FilePath",
    "FileName",
    "targetFile"
  ]);
}
function presentedDescription(call) {
  return pickString(call.arguments, ["Description", "description", "toolAction", "toolSummary", "Instruction", "instruction"]);
}
function presentedQuery(call) {
  return pickString(call.arguments, ["pattern", "Pattern", "query", "Query", "regex", "Regex", "QueryString", "SearchDirectory", "directory"]);
}
function presentedCwd(call) {
  return pickString(call.arguments, ["Cwd", "cwd", "WorkingDirectory", "working_directory", "workdir", "WorkDir"]);
}
function presentsTerminal(call) {
  return AGY_TERMINAL_TOOLS.has(call.tool) || HOST_TERMINAL_TOOLS.has(call.tool);
}
function presentedExitCode(call, output) {
  if (call.transport !== void 0) {
    if (!AGY_TERMINAL_TOOLS.has(call.tool)) return void 0;
    const match = /The command exited with code (\d+)/i.exec(output) ?? /\[exit code (\d+)\]/i.exec(output);
    return match?.[1] === void 0 ? void 0 : Number(match[1]);
  }
  if (HOST_TERMINAL_TOOLS.has(call.tool)) {
    const match = /\n\[exit code: (\d+)\]\s*$/.exec(output);
    return match?.[1] === void 0 ? void 0 : Number(match[1]);
  }
  return void 0;
}

// src/client/ActivityRows.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var labelsFor = (lang) => ({
  codeLabel: tr(lang, "\u4EE3\u7801", "Code"),
  wrapLabel: tr(lang, "\u81EA\u52A8\u6362\u884C", "Wrap"),
  unwrapLabel: tr(lang, "\u53D6\u6D88\u81EA\u52A8\u6362\u884C", "No wrap"),
  copy: tr(lang, "\u590D\u5236", "Copy"),
  copied: tr(lang, "\u5DF2\u590D\u5236", "Copied"),
  collapseAria: tr(lang, "\u6536\u8D77\u5185\u5BB9", "Collapse"),
  collapse: tr(lang, "\u6536\u8D77", "Collapse"),
  expandAria: (n) => tr(lang, `\u5C55\u5F00\u5176\u4F59 ${n} \u884C`, `Show ${n} more lines`),
  expand: (n) => tr(lang, `\u5C55\u5F00\u5176\u4F59 ${n} \u884C`, `Show ${n} more lines`)
});
var terminalLabelsFor = (lang) => ({
  ...labelsFor(lang),
  commandLine: (n) => tr(lang, `\u547D\u4EE4\u884C\u7B2C ${n} \u884C`, `command line ${n}`),
  signal: (s) => tr(lang, `\u4FE1\u53F7 ${s}`, `signal ${s}`),
  exitCode: (n) => tr(lang, `\u9000\u51FA\u7801 ${n}`, `exit code ${n}`),
  running: tr(lang, "\u6267\u884C\u4E2D", "Running"),
  failed: tr(lang, "\u6267\u884C\u5931\u8D25", "Failed"),
  done: tr(lang, "\u5DF2\u8FD4\u56DE", "Done"),
  noOutput: tr(lang, "\u65E0\u8F93\u51FA", "No output"),
  noExitCode: tr(lang, "\u672A\u8BB0\u5F55\u9000\u51FA\u7801", "No exit code")
});
var titleFor = (lang) => ({
  bash: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  pwsh: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  run_command: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  execute_command: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  ops_bash: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  sh: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  shell: tr(lang, "\u7EC8\u7AEF", "Terminal"),
  read: tr(lang, "\u8BFB\u53D6", "Read"),
  view_file: tr(lang, "\u8BFB\u53D6", "Read"),
  read_file: tr(lang, "\u8BFB\u53D6", "Read"),
  open_file: tr(lang, "\u8BFB\u53D6", "Read"),
  write: tr(lang, "\u5199\u5165", "Write"),
  write_to_file: tr(lang, "\u5199\u5165", "Write"),
  write_file: tr(lang, "\u5199\u5165", "Write"),
  create_file: tr(lang, "\u5199\u5165", "Write"),
  edit: tr(lang, "\u7F16\u8F91", "Edit"),
  str_replace_editor: tr(lang, "\u7F16\u8F91", "Edit"),
  replace_file_content: tr(lang, "\u7F16\u8F91", "Edit"),
  edit_file: tr(lang, "\u7F16\u8F91", "Edit"),
  replace_in_file: tr(lang, "\u7F16\u8F91", "Edit"),
  glob: tr(lang, "\u67E5\u627E\u6587\u4EF6", "Find files"),
  find_by_name: tr(lang, "\u67E5\u627E\u6587\u4EF6", "Find files"),
  search_files: tr(lang, "\u67E5\u627E\u6587\u4EF6", "Find files"),
  ops_glob: tr(lang, "\u67E5\u627E\u6587\u4EF6", "Find files"),
  grep: tr(lang, "\u641C\u7D22", "Search"),
  grep_search: tr(lang, "\u641C\u7D22", "Search"),
  search_file_content: tr(lang, "\u641C\u7D22", "Search"),
  ops_grep: tr(lang, "\u641C\u7D22", "Search"),
  search: tr(lang, "\u641C\u7D22", "Search"),
  job_output: tr(lang, "\u547D\u4EE4\u8F93\u51FA", "Command output"),
  job_kill: tr(lang, "\u505C\u6B62\u547D\u4EE4", "Stop command")
});
function ActivityCard({ row, done, cwd, openFile }) {
  const lang = useLang();
  const [open, setOpen] = (0, import_react14.useState)(false);
  const presented = presentedCall(row.call.data.name, row.call.data.arguments);
  const result = row.result?.data.message;
  const output = result?.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") ?? "";
  const path = presentedPath(presented);
  const command = presentedCommand(presented);
  const terminal = presentsTerminal(presented);
  const exit = presentedExitCode(presented, output);
  const failed = result?.isError || exit !== void 0 && exit !== 0;
  const diffs = activityDiffs(row);
  const label = titleFor(lang)[presented.tool] ?? presented.tool;
  const summary = path ?? presentedDescription(presented) ?? command ?? presentedQuery(presented) ?? (presented.server === void 0 ? label : `${presented.server}: ${label}`);
  const status = failed ? tr(lang, "\u5931\u8D25", "Failed") : !row.result ? done ? tr(lang, "\u7ED3\u679C\u672A\u8BB0\u5F55", "No result recorded") : tr(lang, "\u6267\u884C\u4E2D", "Running") : "";
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
    "div",
    {
      className: "fusion-activity-row",
      "data-fusion-tool": row.call.data.name,
      "data-fusion-inner": presented.tool,
      "data-fusion-call": row.id,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { type: "button", "aria-expanded": open, onClick: () => setOpen(!open), className: "fusion-activity-toggle", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { "aria-hidden": true, children: open ? "\u2304" : "\u203A" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "fusion-activity-summary", children: summary }),
          status && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("small", { role: "status", "data-failed": Boolean(failed), children: status })
        ] }),
        open && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "fusion-activity-body", children: [
          path && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { type: "button", className: "fusion-activity-file", onClick: () => openFile(path), children: [
            tr(lang, "\u6253\u5F00", "Open"),
            " ",
            path
          ] }),
          diffs.length ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives2.DiffBlock, { diffs, labels: labelsFor(lang), maxLines: 16 }) : terminal && command ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            import_dsh_client_ui_primitives2.TerminalBlock,
            {
              command,
              cwd: presentedCwd(presented) ?? cwd,
              output,
              running: !row.result && !done,
              exitCode: exit,
              labels: terminalLabelsFor(lang)
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("pre", { children: output || (presented.malformed ? presented.raw : row.result ? tr(lang, "\u5DF2\u8FD4\u56DE\uFF0C\u65E0\u6587\u672C\u8F93\u51FA\u3002", "Returned without text output.") : presented.raw) })
        ] })
      ]
    }
  );
}
var activityStyles = `
.fusion-activity-row{font-size:13px;line-height:1.5;margin:4px 0;min-width:0;color:var(--dsw-alias-label-secondary)}
.fusion-activity-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:6px 0;background:none;border:0;color:inherit;text-align:left;cursor:pointer;font:inherit}
.fusion-activity-toggle:focus-visible,.fusion-activity-file:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.fusion-activity-summary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.fusion-activity-toggle small{white-space:nowrap}.fusion-activity-toggle small[data-failed=true]{color:var(--dsw-alias-state-error-primary)}
.fusion-activity-body{padding:4px 0 10px;overflow:hidden}.fusion-activity-body pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px}
.fusion-activity-file{font:inherit;border:0;background:none;color:var(--dsw-alias-brand-primary);padding:0 0 6px;cursor:pointer}
`;

// src/client/FusionTool.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var fusionControlTools = [
  "fusion_read_state",
  "fusion_delegate_text",
  "fusion_explore",
  "fusion_delegate",
  "fusion_rework",
  "fusion_wait",
  "fusion_review_result",
  "fusion_submit_result",
  "fusion_takeover",
  "fusion_finish_direct",
  "fusion_read_evidence"
];
function FusionTool({ block, sessionId, callId, toolName, cwd, openFile }) {
  const lang = useLang();
  const settled = "kind" in block;
  const tracksActivity = toolName === "fusion_delegate_text" || toolName === "fusion_explore" || toolName === "fusion_delegate" || toolName === "fusion_rework";
  const [snapshot, setSnapshot] = (0, import_react15.useState)();
  const key2 = `${sessionId}:${callId}`;
  (0, import_react15.useEffect)(() => {
    if (!tracksActivity) return;
    let active = true, busy = false, cursor = -1, timer;
    const events = /* @__PURE__ */ new Map();
    let abort;
    const visible2 = () => document.visibilityState !== "hidden";
    const refresh = async () => {
      if (!active || busy || !visible2()) return;
      busy = true;
      abort = new AbortController();
      const deadline = setTimeout(() => abort?.abort(), 1e4);
      let again = true, delay = 2e3;
      try {
        const response = await fetch(
          `${FUSION_API_PATH}?view=activity&sessionId=${encodeURIComponent(sessionId)}&callId=${encodeURIComponent(callId)}&after=${cursor}`,
          { credentials: "same-origin", cache: "no-store", signal: abort.signal }
        );
        if (!response.ok) throw new Error("Activity unavailable");
        const page = await response.json();
        if (!Array.isArray(page.events) || !Number.isSafeInteger(page.cursor) || page.cursor < cursor) throw new Error("Invalid activity page");
        for (const event of page.events) if (event.parentCallId === callId) events.set(event.source.seq, event);
        cursor = page.cursor;
        again = page.more || !page.done || !settled;
        delay = page.more ? 0 : 2e3;
        if (active) setSnapshot({ key: key2, events: [...events.values()].sort((a, b) => a.source.seq - b.source.seq), done: page.done });
      } catch {
        if (active) setSnapshot((previous) => ({ key: key2, events: previous?.key === key2 ? previous.events : [], done: false, failed: true }));
      } finally {
        clearTimeout(deadline);
        busy = false;
        if (active && again && visible2()) timer = setTimeout(() => {
          void refresh();
        }, delay);
      }
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "hidden") abort?.abort();
      else void refresh();
    };
    void refresh();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      abort?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [sessionId, callId, key2, tracksActivity, settled]);
  const current2 = tracksActivity && snapshot?.key === key2 ? snapshot : void 0;
  const rows = (0, import_react15.useMemo)(() => activityRows(current2?.events ?? []), [current2?.events]);
  const text = settled ? block.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") : "";
  let problem = settled && block.isError ? text : "";
  if (!problem) {
    try {
      const result = JSON.parse(text);
      if (result.status === "needs-decision") problem = result.reason ?? tr(lang, "\u4EFB\u52A1\u9700\u8981\u8FDB\u4E00\u6B65\u5904\u7406\u3002", "The task needs attention.");
    } catch {
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
    rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("style", { children: activityStyles }),
    rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ActivityCard, { row, done: current2?.done ?? false, cwd, openFile }, row.id)),
    current2?.failed && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { role: "status", children: tr(lang, "\u6267\u884C\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\uFF0C\u6B63\u5728\u91CD\u8BD5\u3002", "Activity is unavailable; retrying.") }),
    problem && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { role: "status", style: { fontSize: 13, whiteSpace: "pre-wrap" }, children: problem })
  ] });
}

// src/client/agy/toolview.ts
var React = __toESM(require("react"), 1);

// src/client/agy/decisions.ts
function insertTextIntoChatComposer(text) {
  if (typeof document === "undefined" || !text) return false;
  const inputEl = document.querySelector("[data-composer-input]") ?? document.querySelector('[role="textbox"][contenteditable="true"]') ?? document.querySelector("textarea");
  if (!inputEl) return false;
  inputEl.focus();
  if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;
    inputEl.setRangeText(text, start, end, "end");
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  try {
    const ok = document.execCommand("insertText", false, text);
    if (ok) return true;
  } catch {
  }
  const existing = inputEl.textContent?.trim() ?? "";
  inputEl.textContent = existing ? `${existing} ${text}` : text;
  inputEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  return true;
}

// src/client/agy/images.ts
var lightboxOverlay = null;
var currentLightboxImg = null;
var lightboxScale = 1;
var lightboxTranslateX = 0;
var lightboxTranslateY = 0;
var isDraggingLightbox = false;
var dragStartX = 0;
var dragStartY = 0;
var IMAGE_CSS = `
.agy-image-card {
  display: inline-flex;
  flex-direction: column;
  margin: 6px 0;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.25));
  background: var(--dsw-alias-bg-l1, rgba(255, 255, 255, 0.03));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  vertical-align: middle;
}

.agy-image-card:hover {
  border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.45));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

.agy-image-thumb-wrap {
  position: relative;
  overflow: hidden;
  max-height: 480px;
  cursor: zoom-in;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-conic-gradient(rgba(127,127,127,0.08) 0% 25%, transparent 0% 50%) 50% / 16px 16px;
}

.agy-image-thumb {
  display: block;
  max-width: 100%;
  max-height: 480px;
  height: auto;
  object-fit: contain;
  transition: transform 0.2s ease;
}

.agy-image-card:hover .agy-image-thumb {
  transform: scale(1.015);
}

.agy-image-caption {
  padding: 6px 10px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #aaa);
  background: var(--dsw-alias-bg-l2, rgba(127, 127, 127, 0.08));
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.15));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agy-image-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  margin: 0 2px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--dsw-alias-bg-l2, rgba(127, 127, 127, 0.1));
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2));
  color: var(--dsw-alias-label-primary, #ddd);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s ease;
}

.agy-image-link-chip:hover {
  background: var(--dsw-alias-bg-hover, rgba(127, 127, 127, 0.2));
  border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.35));
}

/* Lightbox Modal */
.agy-lightbox-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(0, 0, 0, 0.9);
  /* No full-viewport backdrop blur: same flicker class as the console overlay.
     The image viewer is already near-opaque; a solid alpha is stable. */
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  user-select: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.agy-lightbox-backdrop.open {
  opacity: 1;
}

.agy-lightbox-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(20, 20, 20, 0.65);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
}

.agy-lightbox-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.agy-lightbox-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-lightbox-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.agy-lightbox-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.agy-lightbox-btn-close {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.4);
}

.agy-lightbox-btn-close:hover {
  background: rgba(239, 68, 68, 0.45);
}

.agy-lightbox-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

.agy-lightbox-body.grabbing {
  cursor: grabbing;
}

.agy-lightbox-img-wrap {
  transform-origin: center center;
  transition: transform 0.05s ease-out;
  display: inline-block;
}

.agy-lightbox-img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  pointer-events: none;
}
`;
function injectStyles() {
  if (typeof document === "undefined") return;
  const styleId = "dsh-fusion-agy-images-css";
  if (document.getElementById(styleId) === null) {
    const st = document.createElement("style");
    st.id = styleId;
    st.textContent = IMAGE_CSS;
    const host = document.head ?? document.documentElement;
    if (host) host.appendChild(st);
  }
}
function getOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}
function buildMediaUrl(rawPath) {
  const origin = getOrigin();
  return `${origin}/plugins/agy-worker/media?path=${encodeURIComponent(rawPath.trim())}`;
}
function openLightbox(src, title = "Image Preview", rawPath) {
  if (typeof document === "undefined") return;
  injectStyles();
  if (lightboxOverlay) {
    lightboxOverlay.remove();
    lightboxOverlay = null;
  }
  lightboxScale = 1;
  lightboxTranslateX = 0;
  lightboxTranslateY = 0;
  const overlay = document.createElement("div");
  overlay.className = "agy-lightbox-backdrop";
  const header = document.createElement("div");
  header.className = "agy-lightbox-header";
  const titleEl = document.createElement("div");
  titleEl.className = "agy-lightbox-title";
  titleEl.textContent = title;
  header.appendChild(titleEl);
  const actions = document.createElement("div");
  actions.className = "agy-lightbox-actions";
  const btnZoomIn = document.createElement("button");
  btnZoomIn.className = "agy-lightbox-btn";
  btnZoomIn.textContent = "\u{1F50D}+";
  btnZoomIn.title = "\u653E\u5927 / Zoom In";
  const btnZoomOut = document.createElement("button");
  btnZoomOut.className = "agy-lightbox-btn";
  btnZoomOut.textContent = "\u{1F50D}-";
  btnZoomOut.title = "\u7F29\u5C0F / Zoom Out";
  const btnReset = document.createElement("button");
  btnReset.className = "agy-lightbox-btn";
  btnReset.textContent = "1:1";
  btnReset.title = "\u5B9E\u9645\u5927\u5C0F / Reset";
  actions.appendChild(btnZoomIn);
  actions.appendChild(btnZoomOut);
  actions.appendChild(btnReset);
  if (rawPath) {
    const btnCopyPath = document.createElement("button");
    btnCopyPath.className = "agy-lightbox-btn";
    btnCopyPath.textContent = "\u{1F4CB} \u590D\u5236\u8DEF\u5F84";
    btnCopyPath.onclick = (e) => {
      e.stopPropagation();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(rawPath).then(() => {
          btnCopyPath.textContent = "\u2713 \u5DF2\u590D\u5236";
          setTimeout(() => {
            btnCopyPath.textContent = "\u{1F4CB} \u590D\u5236\u8DEF\u5F84";
          }, 1500);
        }).catch(() => {
        });
      }
    };
    actions.appendChild(btnCopyPath);
  }
  const btnClose = document.createElement("button");
  btnClose.className = "agy-lightbox-btn agy-lightbox-btn-close";
  btnClose.textContent = "\u2715 \u5173\u95ED";
  actions.appendChild(btnClose);
  header.appendChild(actions);
  overlay.appendChild(header);
  const body = document.createElement("div");
  body.className = "agy-lightbox-body";
  const imgWrap = document.createElement("div");
  imgWrap.className = "agy-lightbox-img-wrap";
  const img = document.createElement("img");
  img.className = "agy-lightbox-img";
  img.src = src;
  img.alt = title;
  currentLightboxImg = img;
  imgWrap.appendChild(img);
  body.appendChild(imgWrap);
  overlay.appendChild(body);
  const updateTransform = () => {
    imgWrap.style.transform = `translate(${lightboxTranslateX}px, ${lightboxTranslateY}px) scale(${lightboxScale})`;
  };
  btnZoomIn.onclick = (e) => {
    e.stopPropagation();
    lightboxScale = Math.min(lightboxScale * 1.3, 5);
    updateTransform();
  };
  btnZoomOut.onclick = (e) => {
    e.stopPropagation();
    lightboxScale = Math.max(lightboxScale / 1.3, 0.2);
    updateTransform();
  };
  btnReset.onclick = (e) => {
    e.stopPropagation();
    lightboxScale = 1;
    lightboxTranslateX = 0;
    lightboxTranslateY = 0;
    updateTransform();
  };
  const closeLightbox = () => {
    window.removeEventListener("keydown", onKeyDown);
    overlay.classList.remove("open");
    setTimeout(() => {
      overlay.remove();
      if (lightboxOverlay === overlay) lightboxOverlay = null;
    }, 200);
  };
  btnClose.onclick = (e) => {
    e.stopPropagation();
    closeLightbox();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay || e.target === body) {
      closeLightbox();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      closeLightbox();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  body.onmousedown = (e) => {
    isDraggingLightbox = true;
    dragStartX = e.clientX - lightboxTranslateX;
    dragStartY = e.clientY - lightboxTranslateY;
    body.classList.add("grabbing");
  };
  const onMouseMove = (e) => {
    if (!isDraggingLightbox) return;
    lightboxTranslateX = e.clientX - dragStartX;
    lightboxTranslateY = e.clientY - dragStartY;
    updateTransform();
  };
  const onMouseUp = () => {
    if (isDraggingLightbox) {
      isDraggingLightbox = false;
      body.classList.remove("grabbing");
    }
  };
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  body.onwheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    lightboxScale = Math.max(0.2, Math.min(lightboxScale * factor, 5));
    updateTransform();
  };
  document.body.appendChild(overlay);
  lightboxOverlay = overlay;
  requestAnimationFrame(() => overlay.classList.add("open"));
}
function isImageFile(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return false;
  const clean = pathOrUrl.split(/[?#]/)[0] ?? "";
  return /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)$/i.test(clean);
}

// src/client/agy/toolview.ts
function react() {
  return React;
}
var expandedToolBlockKeys = /* @__PURE__ */ new Set();
function useToggle(initial = false, key2) {
  const R2 = react();
  const init = key2 ? expandedToolBlockKeys.has(key2) : initial;
  const [value, setValue] = R2.useState(init);
  const toggle = () => {
    setValue((prev) => {
      const next = !prev;
      if (key2) {
        if (next) expandedToolBlockKeys.add(key2);
        else expandedToolBlockKeys.delete(key2);
      }
      return next;
    });
  };
  return [value, toggle];
}
function hx(type, props, ...children) {
  return react().createElement(type, props, ...children);
}
function IconChevronDownOutline14(size = 14, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 14 14",
    fill: "none",
    style: { display: "block", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
    fill: "currentColor"
  }));
}
function IconApiOutline14(size = 14, className = "") {
  return hx(
    "svg",
    {
      width: size,
      height: size,
      className: className || void 0,
      viewBox: "0 0 14 14",
      fill: "none",
      style: { display: "block", flexShrink: 0 },
      "aria-hidden": true
    },
    hx("path", {
      transform: "translate(0.6689 1.073)",
      d: "M11.4818 5.57813C11.4818 4.45301 11.4807 3.66237 11.4075 3.05908C11.3359 2.46953 11.2024 2.13852 10.9939 1.89441C10.9247 1.81341 10.8493 1.73801 10.7683 1.66882C10.5242 1.46033 10.1932 1.32686 9.60364 1.25525C9.00034 1.18198 8.20974 1.18091 7.0846 1.18091L5.57813 1.18091C4.45301 1.18091 3.66238 1.18198 3.05908 1.25525C2.46953 1.32686 2.13852 1.46033 1.89441 1.66882C1.81341 1.73801 1.73801 1.81341 1.66882 1.89441C1.46033 2.13852 1.32686 2.46953 1.25525 3.05908C1.18198 3.66238 1.18091 4.45301 1.18091 5.57813L1.18091 6.2771C1.18091 7.40218 1.18197 8.19288 1.25525 8.79614C1.32687 9.38553 1.46036 9.71674 1.66882 9.96082C1.73797 10.0417 1.81347 10.1173 1.89441 10.1864C2.13851 10.3948 2.46965 10.5275 3.05908 10.5991C3.66238 10.6724 4.45298 10.6735 5.57813 10.6735L7.0846 10.6735C8.20977 10.6735 9.00033 10.6724 9.60364 10.5991C10.1931 10.5275 10.5242 10.3948 10.7683 10.1864C10.8493 10.1173 10.9247 10.0417 10.9939 9.96082C11.2024 9.71674 11.3358 9.38553 11.4075 8.79614C11.4808 8.19288 11.4818 7.40218 11.4818 6.2771L11.4818 5.57813ZM12.6627 6.2771C12.6627 7.37222 12.6637 8.247 12.5798 8.93799C12.4942 9.64284 12.3133 10.2359 11.8928 10.7282C11.7834 10.8562 11.6637 10.9751 11.5356 11.0845C11.0434 11.5049 10.4511 11.6867 9.74634 11.7723C9.05525 11.8563 8.17999 11.8552 7.0846 11.8552L5.57813 11.8552C4.48273 11.8552 3.60747 11.8563 2.91638 11.7723C2.21157 11.6867 1.61933 11.5049 1.12708 11.0845C0.99901 10.9751 0.879281 10.8562 0.769898 10.7282C0.349454 10.2359 0.168506 9.64284 0.0828864 8.93799C-0.00101964 8.247 4.88512e-07 7.37222 6.47206e-07 6.2771L6.47206e-07 5.57813C6.47206e-07 4.48273 -0.00106163 3.60747 0.0828864 2.91638C0.168502 2.21168 0.349594 1.61928 0.769898 1.12708C0.879302 0.998981 0.998981 0.879302 1.12708 0.769898C1.61928 0.349594 2.21168 0.168502 2.91638 0.0828864C3.60747 -0.00106163 4.48273 6.47206e-07 5.57813 6.47206e-07L7.0846 6.47206e-07C8.17999 6.47206e-07 9.05525 -0.00106163 9.74634 0.0828864C10.451 0.168505 11.0434 0.349587 11.5356 0.769898C11.6637 0.879302 11.7834 0.998981 11.8928 1.12708C12.3131 1.61928 12.4942 2.21169 12.5798 2.91638C12.6638 3.60747 12.6627 4.48273 12.6627 5.57813L12.6627 6.2771Z",
      fill: "currentColor"
    }),
    hx("path", {
      transform: "translate(0.6689 1.073)",
      d: "M6.02607 5.50955L6.44306 5.9274L3.84284 8.52762L3.425 8.11063L3.00715 7.69278L4.77253 5.9274L3.00715 4.16202L3.84284 3.32633L6.02607 5.50955Z",
      fill: "currentColor"
    }),
    hx("path", {
      transform: "translate(0.6689 1.073)",
      d: "M9.23789 7.35397L9.23789 8.53488L6.96238 8.53488L6.96238 7.35397L9.23789 7.35397Z",
      fill: "currentColor"
    })
  );
}
function IconEditOutline16(size = 14, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 16 16",
    fill: "none",
    style: { display: "block", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z",
    fill: "currentColor"
  }));
}
function IconBrowseOutline16(size = 14, className = "") {
  return hx(
    "svg",
    {
      width: size,
      height: size,
      className: className || void 0,
      viewBox: "0 0 16 16",
      fill: "none",
      style: { display: "block", flexShrink: 0 },
      "aria-hidden": true
    },
    hx("path", { d: "M11.2426 4.80473V6.10551H4.75819V4.80473H11.2426Z", fill: "currentColor" }),
    hx("path", { d: "M9.40858 7.84478V9.14557H4.75819V7.84478H9.40858Z", fill: "currentColor" }),
    hx("path", {
      d: "M9.23438 0.546389C10.1941 0.546389 10.9683 0.544914 11.5859 0.611819C12.2161 0.680096 12.7634 0.825745 13.2393 1.17139C13.5172 1.3733 13.7619 1.61812 13.9639 1.896C14.3096 2.37183 14.4551 2.91922 14.5234 3.54932C14.5903 4.16686 14.5889 4.94133 14.5889 5.90088V10.0981C14.5889 11.0576 14.5903 11.8321 14.5234 12.4497C14.4552 13.0798 14.3094 13.6272 13.9639 14.103C13.7619 14.381 13.5172 14.6257 13.2393 14.8276C12.7633 15.1734 12.2163 15.3189 11.5859 15.3872C10.9683 15.4541 10.1942 15.4536 9.23438 15.4536H6.76563C5.80591 15.4536 5.03168 15.4541 4.41407 15.3872C3.78385 15.3189 3.23665 15.1734 2.76074 14.8276C2.48291 14.6257 2.23802 14.3809 2.03614 14.103C1.69066 13.6272 1.54483 13.0798 1.47657 12.4497C1.40973 11.8321 1.41114 11.0576 1.41114 10.0981V5.90088C1.41113 4.94132 1.40966 4.16686 1.47657 3.54932C1.54488 2.91921 1.69042 2.37184 2.03614 1.896C2.2381 1.61807 2.4828 1.37333 2.76074 1.17139C3.23665 0.825682 3.78386 0.680109 4.41407 0.611819C5.03168 0.544905 5.80591 0.546389 6.76563 0.546389H9.23438ZM6.76563 1.896C5.77586 1.896 5.0876 1.89738 4.55957 1.95459C4.0443 2.01043 3.76214 2.11349 3.55469 2.26416C3.39135 2.38284 3.24761 2.52662 3.12891 2.68994C2.97821 2.89736 2.8752 3.17967 2.81934 3.69483C2.76214 4.22279 2.76075 4.91131 2.76074 5.90088V10.0981C2.76074 11.0876 2.76221 11.7762 2.81934 12.3042C2.87516 12.8194 2.97829 13.1026 3.12891 13.3101C3.24754 13.4733 3.39147 13.6172 3.55469 13.7358C3.76213 13.8865 4.04438 13.9896 4.55957 14.0454C5.0876 14.1026 5.77586 14.103 6.76563 14.103H9.23438C10.2242 14.103 10.9124 14.1026 11.4404 14.0454C11.9556 13.9896 12.2379 13.8865 12.4453 13.7358C12.6086 13.6172 12.7525 13.4733 12.8711 13.3101C13.0217 13.1026 13.1248 12.8195 13.1807 12.3042C13.2378 11.7762 13.2393 11.0876 13.2393 10.0981V5.90088C13.2393 4.91131 13.2379 4.22279 13.1807 3.69483C13.1248 3.17969 13.0218 2.89736 12.8711 2.68994C12.7524 2.52667 12.6086 2.38281 12.4453 2.26416C12.2379 2.11355 11.9556 2.01041 11.4404 1.95459C10.9124 1.8974 10.2241 1.896 9.23438 1.896H6.76563Z",
      fill: "currentColor"
    })
  );
}
function IconSearchOutline16(size = 14, className = "") {
  return hx(
    "svg",
    {
      width: size,
      height: size,
      className: className || void 0,
      viewBox: "0 0 16 16",
      fill: "none",
      style: { display: "block", flexShrink: 0 },
      "aria-hidden": true
    },
    hx("path", {
      d: "M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z",
      fill: "currentColor"
    }),
    hx("path", {
      d: "M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z",
      fill: "currentColor"
    })
  );
}
function IconCodeOutline16(size = 14, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 16 16",
    fill: "none",
    style: { display: "block", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    fillRule: "evenodd",
    clipRule: "evenodd",
    d: "M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z",
    fill: "currentColor"
  }));
}
function IconInspectOutline12(size = 12, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 16 16",
    fill: "none",
    style: { display: "inline-block", verticalAlign: "-1.5px", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M16 8L10.8571 12V10.552L14.1383 8L10.8571 5.448V4L16 8ZM5.14286 10.552L1.86171 8L5.14286 5.448V4L0 8L5.14286 12V10.552ZM9.02514 4L5.59657 12H6.84057L10.2691 4H9.02514Z",
    fill: "currentColor"
  }));
}
function IconCopyOutline16(size = 12, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 16 16",
    fill: "none",
    style: { display: "inline-block", verticalAlign: "-1.5px", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909",
    fill: "currentColor"
  }));
}
function IconCheckOutline14(size = 12, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 14 14",
    fill: "none",
    style: { display: "inline-block", verticalAlign: "-1.5px", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M11.5635 4.58984L7.61426 9.07715C7.35154 9.37561 7.11346 9.64812 6.89453 9.84668C6.66593 10.054 6.38519 10.2506 6.01465 10.3164C5.82079 10.3508 5.62207 10.3529 5.42773 10.3213C5.0561 10.2609 4.77266 10.0674 4.54102 9.86328C4.31926 9.66791 4.07752 9.39911 3.81055 9.10449L2.44531 7.59863L3.55664 6.59082L4.92188 8.09766C5.21256 8.41844 5.38878 8.61191 5.53223 8.73828C5.61022 8.80699 5.65253 8.83192 5.66895 8.83984C5.69648 8.84429 5.72449 8.84467 5.75195 8.83984C5.72657 8.84451 5.75564 8.85422 5.88672 8.73535C6.02833 8.60692 6.20225 8.41088 6.48828 8.08594L10.4385 3.59961L11.5635 4.58984Z",
    fill: "currentColor"
  }));
}
function IconQuestionOutline16(size = 14, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 16 16",
    fill: "none",
    style: { display: "block", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M8 1C4.134 1 1 3.91 1 7.5c0 1.547.575 2.973 1.559 4.093L1.13 14.54a.5.5 0 00.627.63l3.238-1.079C5.875 14.316 6.91 14.5 8 14.5c3.866 0 7-2.91 7-6.5S11.866 1 8 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zm1.09-3.41c-.42.34-.59.54-.59.91H7.5v-.5c0-.66.36-1.12.82-1.48.44-.35.68-.61.68-1.02 0-.55-.45-1-1-1s-1 .45-1 1H6c0-1.1.9-2 2-2s2 .9 2 2c0 .73-.39 1.25-.91 1.67z",
    fill: "currentColor"
  }));
}
function IconImageOutline16(size = 14, className = "") {
  return hx("svg", {
    width: size,
    height: size,
    className: className || void 0,
    viewBox: "0 0 16 16",
    fill: "none",
    style: { display: "block", flexShrink: 0 },
    "aria-hidden": true
  }, hx("path", {
    d: "M14 3H2a1 1 0 00-1 1v8a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1zm-1 8H3l2.5-3.2 1.8 2.3 2.7-3.5L13 11zM5.5 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z",
    fill: "currentColor"
  }));
}
function toolIconFor(kind, size = 14) {
  switch (kind) {
    case "terminal":
      return IconApiOutline14(size);
    case "diff":
    case "delete":
      return IconEditOutline16(size);
    case "read":
      return IconBrowseOutline16(size);
    case "search":
    case "list":
      return IconSearchOutline16(size);
    case "question":
      return IconQuestionOutline16(size);
    case "image":
      return IconImageOutline16(size);
    default:
      return IconCodeOutline16(size);
  }
}
function parsedArgsRaw(block) {
  const settled = block;
  if ("call" in settled && settled.call !== null && typeof settled.call.argsRaw === "string") {
    return settled.call.argsRaw;
  }
  const running2 = block;
  if (typeof running2.argsRaw === "string") return running2.argsRaw;
  return "";
}
function parseArgs(block) {
  const raw = parsedArgsRaw(block);
  if (raw === "") return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
function cleanString(val) {
  if (typeof val !== "string") return "";
  let s = val.trim();
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
function parseInnerArgs(raw) {
  if (raw === void 0 || raw === null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    let s = raw.trim();
    if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
      try {
        const unquoted = JSON.parse(s);
        if (typeof unquoted === "string") s = unquoted.trim();
      } catch {
      }
    }
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
      return { value: parsed };
    } catch {
      return { value: raw };
    }
  }
  return { value: raw };
}
function cleanResultText(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed);
      if (Array.isArray(obj?.content)) {
        const parts = [];
        for (const item of obj.content) {
          const blk = item;
          if (blk?.type === "text" && typeof blk.text === "string") {
            parts.push(blk.text);
          }
        }
        if (parts.length > 0) return parts.join("\n");
      }
    } catch {
    }
  }
  return text;
}
function mirrorInfo(block) {
  const a = parseArgs(block);
  if (a === null) return null;
  let tool = typeof a.tool === "string" ? a.tool : "";
  if (tool === "") return null;
  let input = {};
  const raw = a.input;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) input = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (typeof p === "object" && p !== null && !Array.isArray(p)) input = p;
      else input = { value: raw };
    } catch {
      input = { value: raw };
    }
  }
  let server = typeof a.server === "string" && a.server !== "" ? cleanString(a.server) : void 0;
  if (/^(call_mcp_tool|callMcpTool|call_mcp|mcp_call)$/i.test(tool)) {
    const s = pick(input, "ServerName", "server_name", "serverName", "server");
    if (s) server = cleanString(s);
    const innerTool = pick(input, "ToolName", "tool_name", "toolName", "name", "tool");
    const rawInner = input.Arguments ?? input.arguments ?? input.args ?? input.parameters ?? input.params ?? input.input;
    if (innerTool) {
      tool = cleanString(innerTool);
      input = parseInnerArgs(rawInner);
    }
  } else if (tool.startsWith("mcp__")) {
    const parts = tool.slice(5).split("__");
    if (parts.length >= 2) {
      server = parts[0];
      tool = parts.slice(1).join("__");
    }
  }
  return { tool, input, ...server ? { server } : {} };
}
function pick(input, ...keys) {
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v !== "") return v;
  }
  return void 0;
}
function num(input, ...keys) {
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return void 0;
}
function resultText(block) {
  const settled = block;
  if (!Array.isArray(settled.content)) return "";
  const parts = [];
  for (const b of settled.content) {
    if (b && typeof b === "object" && b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    }
  }
  const text = parts.join("\n");
  return cleanResultText(text);
}
function isSettled(block) {
  return block.kind === "tool-result" || "content" in block;
}
function isError(block) {
  const settled = block;
  return settled.isError === true || settled.error !== void 0 && settled.error !== null;
}
var TERMINAL_TOOLS = /* @__PURE__ */ new Set(["run_command", "bash", "execute_command", "ops_bash", "sh", "shell"]);
var DIFF_TOOLS = /* @__PURE__ */ new Set(["replace_file_content", "edit_file", "replace_in_file", "edit", "write_to_file", "write_file", "create_file"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["read_file", "view_file", "read", "open_file"]);
var SEARCH_TOOLS = /* @__PURE__ */ new Set(["find_by_name", "glob", "ops_glob", "search_files", "grep_search", "search", "ops_grep", "search_file_content", "grep", "search_web", "web_search"]);
var LIST_TOOLS = /* @__PURE__ */ new Set(["list_dir", "ls"]);
var DELETE_TOOLS = /* @__PURE__ */ new Set(["delete_file", "remove_file", "rm"]);
var QUESTION_TOOLS = /* @__PURE__ */ new Set(["ask_question", "ask", "question"]);
var IMAGE_TOOLS = /* @__PURE__ */ new Set(["generate_image", "create_image", "render_image"]);
function mirrorCardModel(block, cwd, home) {
  const info = mirrorInfo(block);
  const out = resultText(block);
  if (info === null) {
    return { kind: "generic", title: "agy_tool", output: out, raw: parsedArgsRaw(block) };
  }
  const { tool, input } = info;
  const desc = pick(input, "Description", "description", "toolAction", "toolSummary", "Instruction", "instruction");
  if (QUESTION_TOOLS.has(tool)) {
    const questionsRaw = input.questions ?? input.Questions;
    const questions = Array.isArray(questionsRaw) ? questionsRaw : [];
    const firstQ = questions[0];
    const qTitle = firstQ?.question ?? desc ?? "Ask Question";
    return {
      kind: "question",
      tool,
      server: info.server,
      title: qTitle,
      output: out,
      questions,
      raw: parsedArgsRaw(block)
    };
  }
  if (IMAGE_TOOLS.has(tool)) {
    const prompt = pick(input, "Prompt", "prompt") ?? "";
    const name2 = pick(input, "ImageName", "image_name", "name") ?? "image";
    const ratio = pick(input, "AspectRatio", "aspect_ratio") ?? "1:1";
    return {
      kind: "image",
      tool,
      server: info.server,
      title: desc ?? `Generate Image \xB7 ${name2}`,
      prompt,
      imageName: name2,
      aspectRatio: ratio,
      output: out,
      raw: parsedArgsRaw(block)
    };
  }
  if (TERMINAL_TOOLS.has(tool)) {
    const command = pick(input, "CommandLine", "command_line", "command", "cmd", "Cmd") ?? (desc && desc.startsWith("$ ") ? desc.replace(/\s*·\s*.*$/, "").replace(/^\$\s*/, "") : void 0) ?? JSON.stringify(input);
    const cwdVal = pick(input, "Cwd", "cwd", "WorkingDirectory", "working_directory", "workdir", "WorkDir") ?? cwd;
    const rowTitle = desc !== void 0 && !desc.startsWith("$ ") && desc !== command ? desc + " \xB7 " + command : command;
    return {
      kind: "terminal",
      tool,
      server: info.server,
      title: rowTitle,
      command,
      ...cwdVal !== void 0 ? { cwd: cwdVal } : {},
      output: out
    };
  }
  if (DIFF_TOOLS.has(tool)) {
    const rawPath = pick(input, "TargetFile", "target_file", "path", "file_path", "Path", "FilePath", "AbsolutePath", "targetFile", "filename", "FileName") ?? "file";
    const path = relativize(rawPath, cwd, home);
    const oldText = pick(input, "TargetContent", "target_content", "old_string", "oldText", "OldString", "OldText", "targetContent") ?? null;
    const newText = pick(input, "ReplacementContent", "replacement_content", "new_string", "newText", "content", "NewString", "NewText", "Content", "replacementContent", "CodeContent", "code_content", "contents", "FileContents", "codeContent") ?? "";
    const action = tool === "write_to_file" || tool === "write_file" || tool === "create_file" ? "Write" : "Edit";
    const isGenericDesc = desc !== void 0 && /^(file edit|editing file|write file|writing file|file write|edit file|editing|writing|file create|creating file)$/i.test(desc.trim());
    const title2 = desc !== void 0 && !isGenericDesc && !desc.includes(path) ? `${action} ${path} \xB7 ${desc}` : `${action} ${path}`;
    return { kind: "diff", tool, server: info.server, title: title2, path: rawPath, oldText, newText, output: out };
  }
  if (READ_TOOLS.has(tool)) {
    const path = pick(input, "AbsolutePath", "absolute_path", "TargetFile", "target_file", "path", "file_path", "filename", "Path", "FilePath", "FileName", "targetFile") ?? "";
    const offset = num(input, "offset", "Offset") ?? num(input, "StartLine", "start_line");
    const line = offset !== void 0 ? offset > 0 && (tool === "view_file" || tool === "read_file") ? offset : offset + 1 : void 0;
    const isImg = isImageFile(path);
    return {
      kind: isImg ? "image" : "read",
      tool,
      server: info.server,
      title: desc ? `${desc} \xB7 ${path}` : path !== "" ? "Read " + path : "Read",
      path,
      output: out,
      isImage: isImg,
      imagePath: isImg ? path : void 0,
      prompt: desc,
      imageName: path.split(/[/\\]/).pop() || "image",
      ...path !== "" ? { location: { path, ...line !== void 0 ? { line } : {} } } : {}
    };
  }
  if (SEARCH_TOOLS.has(tool)) {
    const rawPat = input.query ?? input.Query ?? input.pattern ?? input.Pattern ?? input.regex ?? input.Regex ?? input.QueryString;
    const q = Array.isArray(rawPat) ? rawPat.join(", ") : typeof rawPat === "string" ? rawPat : pick(input, "query", "Query", "pattern", "Pattern", "regex", "Regex", "QueryString") ?? "";
    return { kind: "search", tool, server: info.server, title: desc ?? (q !== "" ? "Search " + q : "Search"), output: out };
  }
  if (LIST_TOOLS.has(tool)) {
    const path = pick(input, "DirectoryPath", "directory_path", "path", "directory", "Path", "Directory", "SearchDirectory", "search_directory", "AbsolutePath") ?? "";
    return { kind: "list", tool, server: info.server, title: desc ?? (path !== "" ? "List " + path : "List directory"), output: out };
  }
  if (DELETE_TOOLS.has(tool)) {
    const path = pick(input, "TargetFile", "target_file", "path", "file_path", "Path", "FilePath", "AbsolutePath") ?? "";
    return { kind: "delete", tool, server: info.server, title: desc ?? "Delete " + path, output: out };
  }
  const defaultTitle = info.server ? `${info.server}: ${tool}` : tool !== "" ? tool : "agy_tool";
  const title = desc ?? defaultTitle;
  return { kind: "generic", tool, server: info.server, title, output: out, raw: parsedArgsRaw(block) };
}
function relativize(p, cwd, home) {
  if (cwd && p.startsWith(cwd)) {
    const rel = p.slice(cwd.length).replace(/^[/\\]+/, "");
    return rel !== "" ? rel : p;
  }
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  return p;
}
function clip(s, max) {
  return s.length > max ? s.slice(0, max) + "\n\u2026 (+" + (s.length - max) + " chars)" : s;
}
function trimTrailingBlankLines(s) {
  return s.replace(/[\t ]*\r?\n[\t ]*(\r?\n[\t ]*)*$/, "\n");
}
function previewLine(model, cwd, home) {
  if (model.kind === "diff") {
    const raw = model.path ?? "file";
    const rel = relativize(raw, cwd, home);
    const display = rel.length > 40 ? "\u2026" + rel.slice(-40) : rel;
    return model.oldText != null ? `\xB1 ${display}` : `+ ${display}`;
  }
  const out = model.output;
  if (out !== void 0 && out !== "") {
    const first = out.split("\n").find((l) => l.trim() !== "");
    if (first !== void 0 && first.trim() !== "") return first.trim().slice(0, 80);
  }
  return void 0;
}
function cls(...names) {
  return names.filter((n) => typeof n === "string" && n !== "").join(" ");
}
function tr2(t, key2, fallback, params) {
  if (typeof t === "function") {
    try {
      const v = t(key2, params);
      if (typeof v === "string" && v !== "" && v !== key2) return v;
    } catch {
    }
  }
  if (params !== void 0 && params.count !== void 0 && fallback.includes("{count}")) {
    return fallback.replace("{count}", String(params.count));
  }
  return fallback;
}
function displayTitle(model, t) {
  switch (model.kind) {
    case "terminal":
      return tr2(t, "tv.command", "Command");
    case "diff":
      return model.tool === "write_to_file" || model.tool === "write_file" || model.tool === "create_file" ? tr2(t, "tv.write", "Write") : tr2(t, "tv.edit", "Edit");
    case "read":
      return tr2(t, "tv.read", "Read");
    case "search":
      return model.tool === "search_web" || model.tool === "web_search" ? tr2(t, "tv.webSearch", "Web Search") : tr2(t, "tv.search", "Search");
    case "list":
      return tr2(t, "tv.list", "List");
    case "delete":
      return tr2(t, "tv.delete", "Delete");
    case "question":
      return tr2(t, "tv.question", "Question");
    case "image":
      return tr2(t, "tv.image", "Image");
    default:
      if (model.tool && model.tool !== "agy_tool") {
        return model.server ? `${model.server}: ${model.tool}` : model.tool.replace(/_/g, " ");
      }
      return tr2(t, "tv.tool", "Tool");
  }
}
function displaySummary(model, cwd, home) {
  if (model.kind === "terminal") {
    return model.command ?? model.title;
  }
  if (model.kind === "diff") {
    const rawPath = model.path ?? "file";
    return relativize(rawPath, cwd, home);
  }
  if (model.kind === "read") {
    const rawPath = model.path ?? "";
    return rawPath !== "" ? relativize(rawPath, cwd, home) : model.title;
  }
  if (model.kind === "search") {
    return model.title.replace(/^(Web search|Search)\s*/i, "") || model.title;
  }
  if (model.kind === "list") {
    return model.title.replace(/^List\s*(directory\s*)?/i, "") || model.title;
  }
  if (model.kind === "question") {
    return model.title;
  }
  if (model.kind === "image") {
    return model.prompt || model.title;
  }
  if (model.server && model.title.startsWith(`${model.server}: `)) {
    return model.title.slice(model.server.length + 2);
  }
  return model.title;
}
function diffStat(model) {
  if (model.kind !== "diff") return null;
  const oldText = model.oldText ?? "";
  const newText = model.newText ?? "";
  const oldLines = oldText === "" ? 0 : oldText.split("\n").length;
  const newLines = newText === "" ? 0 : newText.split("\n").length;
  if (oldLines === 0 && newLines === 0) return null;
  if (oldLines === 0) return `+${newLines}`;
  return `+${newLines} -${oldLines}`;
}
function CopyButton({ text, labels, t }) {
  const [copied, setCopied] = react().useState(false);
  const copyLabel = labels?.[0] ?? tr2(t, "code.copy", "Copy");
  const copiedLabel = labels?.[1] ?? tr2(t, "code.copied", "Copied");
  const onCopy = (e) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {
        setCopied(false);
      });
    }
  };
  return hx(
    "button",
    {
      type: "button",
      className: "agy-tv-copy-btn",
      onClick: onCopy,
      title: copied ? copiedLabel : copyLabel
    },
    copied ? IconCheckOutline14(11) : IconCopyOutline16(11),
    hx("span", null, copied ? copiedLabel : copyLabel)
  );
}
var DIFF_MAX_LINES = 400;
function DiffBody({ model, t }) {
  const h2 = hx;
  const oldText = model.oldText ?? "";
  const newText = model.newText ?? "";
  const rows = [];
  const moreRow = (count, key2) => h2(
    "div",
    { key: key2, className: "agy-tv-diff-line", style: { color: "var(--dsw-alias-label-tertiary)" } },
    tr2(t, "tv.diffMore", "\u2026 {count} more lines not rendered", { count })
  );
  if (oldText !== "") {
    const lines = oldText.split("\n");
    const shown = Math.min(lines.length, DIFF_MAX_LINES);
    for (let i = 0; i < shown; i++) {
      const line = lines[i];
      rows.push(h2(
        "div",
        { key: "del-" + i, className: "agy-tv-diff-line agy-tv-diff-del" },
        h2("span", { className: "agy-tv-diff-marker" }, "-"),
        h2("span", { style: { flex: 1 } }, line === "" ? " " : line)
      ));
    }
    if (lines.length > shown) rows.push(moreRow(lines.length - shown, "del-more"));
  }
  if (newText !== "") {
    const lines = newText.split("\n");
    const shown = Math.min(lines.length, DIFF_MAX_LINES);
    for (let i = 0; i < shown; i++) {
      const line = lines[i];
      rows.push(h2(
        "div",
        { key: "add-" + i, className: "agy-tv-diff-line agy-tv-diff-add" },
        h2("span", { className: "agy-tv-diff-marker" }, "+"),
        h2("span", { style: { flex: 1 } }, line === "" ? " " : line)
      ));
    }
    if (lines.length > shown) rows.push(moreRow(lines.length - shown, "add-more"));
  }
  if (rows.length === 0) {
    rows.push(h2("div", { key: "empty", className: "agy-tv-diff-line", style: { color: "var(--dsw-alias-label-tertiary)" } }, tr2(t, "tv.noChanges", "(no textual changes)")));
  }
  return h2("div", { className: "agy-tv-diff-list" }, ...rows);
}
function QuestionCardBody({ model }) {
  const h2 = hx;
  const questions = model.questions ?? [];
  const [selectedMap, setSelectedMap] = react().useState({});
  const [inserted, setInserted] = react().useState(false);
  const toggleOption = (qIdx, opt, isMulti) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const current2 = new Set(next[qIdx] ?? []);
      if (isMulti) {
        if (current2.has(opt)) current2.delete(opt);
        else current2.add(opt);
      } else {
        current2.clear();
        current2.add(opt);
      }
      next[qIdx] = current2;
      return next;
    });
  };
  const onInsert = () => {
    const parts = [];
    for (let i = 0; i < questions.length; i++) {
      const sel = Array.from(selectedMap[i] ?? []);
      if (sel.length > 0) {
        parts.push(sel.join("; "));
      }
    }
    if (parts.length > 0) {
      const text = parts.join("\n");
      insertTextIntoChatComposer(text);
      setInserted(true);
      setTimeout(() => setInserted(false), 1500);
    }
  };
  const qNodes = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) continue;
    const options = q.options ?? [];
    const isMulti = q.is_multi_select === true;
    const sel = selectedMap[i] ?? /* @__PURE__ */ new Set();
    const optNodes = options.map((opt, oIdx) => {
      const isChecked = sel.has(opt);
      return h2(
        "button",
        {
          key: "opt-" + oIdx,
          type: "button",
          className: cls("agy-tv-q-opt", isChecked && "selected"),
          onClick: (e) => {
            e.stopPropagation();
            toggleOption(i, opt, isMulti);
          }
        },
        h2("span", { className: cls("agy-tv-q-check", isMulti ? "checkbox" : "radio", isChecked && "checked") }),
        h2("span", { className: "agy-tv-q-opt-text" }, opt)
      );
    });
    qNodes.push(h2(
      "div",
      { key: "q-" + i, className: "agy-tv-q-item" },
      h2("div", { className: "agy-tv-q-prompt" }, q.question || "Please select:"),
      h2("div", { className: "agy-tv-q-opts" }, ...optNodes)
    ));
  }
  const hasSelection = Object.values(selectedMap).some((s) => s.size > 0);
  return h2(
    "div",
    { className: "agy-tv-question-wrap" },
    ...qNodes,
    h2(
      "div",
      { className: "agy-tv-q-footer" },
      h2(
        "button",
        {
          type: "button",
          className: cls("agy-tv-q-insert-btn", hasSelection && "active"),
          disabled: !hasSelection,
          onClick: (e) => {
            e.stopPropagation();
            onInsert();
          }
        },
        inserted ? "\u2713 \u5DF2\u586B\u5165\u5BF9\u8BDD\u6846" : "\u{1F4AC} \u586B\u5165\u5BF9\u8BDD\u6846 / Insert into Chat"
      ),
      model.output ? h2("div", { className: "agy-tv-q-answered" }, `\u5DF2\u8BB0\u5F55: ${model.output}`) : null
    )
  );
}
function ImageCardBody({ model }) {
  const h2 = hx;
  const prompt = model.prompt || "";
  const name2 = model.imageName || "image";
  const ratio = model.aspectRatio || "1:1";
  const path = model.imagePath || model.path || "";
  const mediaUrl = path ? buildMediaUrl(path) : null;
  return h2(
    "div",
    { className: "agy-tv-img-wrap" },
    h2(
      "div",
      { className: "agy-tv-img-meta" },
      h2("div", { className: "agy-tv-img-prompt", title: prompt || name2 }, prompt ? `"${prompt}"` : name2),
      h2(
        "div",
        { className: "agy-tv-img-badges" },
        h2("span", { className: "agy-tv-img-badge" }, ratio),
        ...path ? [h2("span", { key: "path", className: "agy-tv-img-badge", title: path }, path.split(/[/\\]/).pop())] : []
      )
    ),
    mediaUrl ? h2(
      "div",
      {
        className: "agy-tv-img-preview-box",
        onClick: (e) => {
          e.stopPropagation();
          openLightbox(mediaUrl, prompt || name2, path);
        },
        title: "\u70B9\u51FB\u653E\u5927\u9884\u89C8 / Click to open lightbox"
      },
      h2("img", {
        className: "agy-tv-img-thumb",
        src: mediaUrl,
        alt: prompt || name2,
        loading: "lazy"
      })
    ) : null
  );
}
function CardBody({ model, openFile, cwd, home, inspect, t }) {
  const h2 = hx;
  const inspectNode = inspect !== void 0 ? h2(
    "div",
    { key: "ins", style: { padding: "4px 8px 6px" } },
    h2("button", {
      type: "button",
      className: "agy-tv-inspect-btn",
      onClick: inspect
    }, IconInspectOutline12(12), tr2(t, "code.inspect", "Inspect"))
  ) : null;
  switch (model.kind) {
    case "terminal": {
      const rawBody = model.output !== void 0 && model.output !== "" ? trimTrailingBlankLines(model.output) : tr2(t, "tv.noOutput", "(no output)");
      const copyText = model.output !== void 0 && model.output !== "" ? model.output : model.command ?? "";
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            h2("span", { className: "agy-tv-prompt-glyph" }, "\u276F"),
            ...model.cwd ? [h2("span", { key: "cwd", className: "agy-tv-card-cwd" }, model.cwd)] : [],
            h2("span", { className: "agy-tv-card-cmd", title: model.command }, model.command ?? "")
          ),
          h2(CopyButton, { text: copyText, t })
        ),
        h2("pre", { className: "agy-tv-card-content" }, clip(rawBody, 16e3)),
        inspectNode
      );
    }
    case "diff": {
      const path = model.path ?? "file";
      const pathLabel = relativize(path, cwd, home);
      const stat = diffStat(model);
      const copyText = model.newText ?? "";
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconEditOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, pathLabel),
            ...stat ? [h2("span", { key: "s", className: "agy-tv-diff-stat" }, stat)] : []
          ),
          h2(CopyButton, { text: copyText })
        ),
        h2(DiffBody, { model, openFile, cwd, home, t }),
        inspectNode
      );
    }
    case "read": {
      const path = model.path ?? "file";
      const pathLabel = relativize(path, cwd, home);
      const rawBody = model.output !== void 0 && model.output !== "" ? trimTrailingBlankLines(model.output) : tr2(t, "tv.noOutput", "(no output)");
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconBrowseOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, pathLabel)
          ),
          h2(CopyButton, { text: model.output ?? "", t })
        ),
        h2("pre", { className: "agy-tv-card-content" }, clip(rawBody, 16e3)),
        inspectNode
      );
    }
    case "search": {
      const rawBody = model.output !== void 0 && model.output !== "" ? trimTrailingBlankLines(model.output) : tr2(t, "tv.noMatches", "(no matches)");
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconSearchOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, model.title)
          ),
          h2(CopyButton, { text: model.output ?? "", t })
        ),
        h2("pre", { className: "agy-tv-card-content" }, clip(rawBody, 16e3)),
        inspectNode
      );
    }
    case "list": {
      const rawBody = model.output !== void 0 && model.output !== "" ? trimTrailingBlankLines(model.output) : tr2(t, "tv.emptyDir", "(empty directory)");
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconBrowseOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, model.title)
          ),
          h2(CopyButton, { text: model.output ?? "", t })
        ),
        h2("pre", { className: "agy-tv-card-content" }, clip(rawBody, 16e3)),
        inspectNode
      );
    }
    case "question": {
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconQuestionOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, model.title)
          ),
          h2(CopyButton, { text: model.output ?? (model.raw ?? "") })
        ),
        h2(QuestionCardBody, { model }),
        inspectNode
      );
    }
    case "image": {
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconImageOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, model.imageName || "Image")
          ),
          h2(CopyButton, { text: model.prompt || (model.raw ?? "") })
        ),
        h2(ImageCardBody, { model }),
        inspectNode
      );
    }
    default: {
      const copyText = model.output !== void 0 && model.output !== "" ? model.output : model.raw ?? "";
      const rawBody = model.output !== void 0 && model.output !== "" ? trimTrailingBlankLines(model.output) : model.raw !== void 0 && model.raw !== "" ? clip(model.raw, 4e3) : tr2(t, "tv.noDetail", "(no detail)");
      return h2(
        "div",
        { className: "agy-tv-card" },
        h2(
          "div",
          { className: "agy-tv-card-header" },
          h2(
            "div",
            { className: "agy-tv-card-header-left" },
            IconCodeOutline16(13),
            h2("span", { className: "agy-tv-card-path" }, model.server ? `${model.server}: ${model.tool}` : model.title || model.tool || "Tool")
          ),
          h2(CopyButton, { text: copyText, t })
        ),
        h2("pre", { className: "agy-tv-card-content" }, clip(rawBody, 16e3)),
        inspectNode
      );
    }
  }
}
function AgyMirrorToolView(props) {
  const h2 = hx;
  const { block, cwd, home, openFile, inspect, t, callId } = props;
  const settle = isSettled(block);
  const err = isError(block);
  const model = mirrorCardModel(block, cwd, home);
  const cardKey = callId ? `call:${callId}` : `${model.kind}:${model.tool ?? ""}:${model.title}:${model.path ?? model.command ?? ""}`;
  const [open, setOpen] = useToggle(false, cardKey);
  const state = !settle ? "run" : err ? "err" : "ok";
  const title = displayTitle(model, t);
  const summary = displaySummary(model, cwd, home);
  const stat = diffStat(model);
  const preview = !open && model.kind !== "diff" ? previewLine(model, cwd, home) : void 0;
  const hasFileLink = (model.kind === "diff" || model.kind === "read") && model.path && openFile !== void 0;
  const onFileClick = (e) => {
    e.stopPropagation();
    if (model.path && openFile) {
      if (model.location?.line !== void 0) openFile(model.path, { line: model.location.line });
      else openFile(model.path);
    }
  };
  const leading = open ? h2("span", { className: "agy-tv-chevron-open" }, IconChevronDownOutline14(14)) : h2(
    "span",
    { className: "agy-tv-leading" },
    h2("span", { className: "agy-tv-icon-idle" }, toolIconFor(model.kind, 14)),
    h2("span", { className: "agy-tv-chevron-hover" }, IconChevronDownOutline14(14))
  );
  const summaryNode = hasFileLink ? h2("button", {
    type: "button",
    className: "agy-tv-file-link",
    onClick: onFileClick,
    title: model.path
  }, summary) : h2("span", {
    className: cls("agy-tv-summary", err && "agy-tv-summary-err"),
    title: summary
  }, summary);
  const header = h2(
    "div",
    {
      className: "agy-tv-row",
      role: "button",
      tabIndex: 0,
      "aria-expanded": open,
      onClick: (e) => {
        e.stopPropagation();
        setOpen();
      },
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen();
        }
      },
      title: inspect !== void 0 ? open ? tr2(t, "tv.hint.collapseInspect", "Click to collapse \xB7 right-click to inspect") : tr2(t, "tv.hint.expandInspect", "Click to expand \xB7 right-click to inspect") : open ? tr2(t, "tv.hint.collapse", "Click to collapse") : tr2(t, "tv.hint.expand", "Click to expand"),
      onContextMenu: inspect !== void 0 ? (e) => {
        e.preventDefault();
        inspect();
      } : void 0
    },
    leading,
    h2("span", { className: "agy-tv-title" }, title),
    h2("span", { className: "agy-tv-sep", "aria-hidden": true }),
    summaryNode,
    ...stat !== null ? [h2("span", { key: "stat", className: "agy-tv-diff-stat" }, stat)] : [],
    ...preview !== void 0 ? [h2("span", { key: "prev", className: "agy-tv-preview", title: preview }, preview)] : []
  );
  return h2(
    "div",
    {
      className: cls("agy-tv-root", open && "agy-tv-open"),
      "data-state": state,
      "data-kind": model.kind
    },
    header,
    ...open ? [h2(
      "div",
      { key: "wrap", className: "agy-tv-body-wrap" },
      h2(CardBody, { model, openFile, cwd, home, inspect, t })
    )] : []
  );
}
function parseAgyMirrorFromCode(argsRaw) {
  try {
    const parsed = JSON.parse(argsRaw);
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    const step = mirrorStepInvocation(code);
    if (step === void 0) return null;
    return { run: step.run, step: step.step, tool: step.tool };
  } catch {
  }
  return null;
}
function runCodeModel(block) {
  const raw = block !== void 0 ? parsedArgsRaw(block) : "{}";
  let code = raw;
  let description;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === "string") code = parsed.code;
    if (typeof parsed?.description === "string" && parsed.description !== "") description = parsed.description;
  } catch {
  }
  const firstLine = code.split("\n").find((line) => line.trim() !== "");
  const title = description ?? (firstLine !== void 0 && firstLine.trim() !== "" ? firstLine.trim().slice(0, 120) : "run_code");
  return { code, title };
}
function AgyCodeToolView(props) {
  const h2 = hx;
  const { block, inspect, t, callId } = props ?? {};
  const model = runCodeModel(block);
  const cardKey = callId ? `call:${callId}` : `code:${model.title}`;
  const [open, setOpen] = useToggle(false, cardKey);
  const settle = block !== void 0 && isSettled(block);
  const err = block !== void 0 && isError(block);
  const state = !settle ? "run" : err ? "err" : "ok";
  const translate = (key2) => typeof t === "function" ? t(key2) : key2;
  const leading = open ? h2("span", { className: "agy-tv-chevron-open" }, IconChevronDownOutline14(14)) : h2(
    "span",
    { className: "agy-tv-leading" },
    h2("span", { className: "agy-tv-icon-idle" }, IconCodeOutline16(14)),
    h2("span", { className: "agy-tv-chevron-hover" }, IconChevronDownOutline14(14))
  );
  const header = h2(
    "div",
    {
      className: "agy-tv-row",
      role: "button",
      tabIndex: 0,
      "aria-expanded": open,
      onClick: (e) => {
        e.stopPropagation();
        setOpen();
      },
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen();
        }
      },
      title: inspect !== void 0 ? open ? tr2(t, "tv.hint.collapseInspect", "Click to collapse \xB7 right-click to inspect") : tr2(t, "tv.hint.expandInspect", "Click to expand \xB7 right-click to inspect") : open ? tr2(t, "tv.hint.collapse", "Click to collapse") : tr2(t, "tv.hint.expand", "Click to expand"),
      onContextMenu: inspect !== void 0 ? (e) => {
        e.preventDefault();
        inspect();
      } : void 0
    },
    leading,
    h2("span", { className: "agy-tv-title" }, translate("code.title")),
    h2("span", { className: "agy-tv-sep", "aria-hidden": true }),
    h2("span", { className: cls("agy-tv-summary", err && "agy-tv-summary-err"), title: model.title }, model.title)
  );
  const inspectNode = inspect !== void 0 ? h2(
    "div",
    { key: "ins", style: { padding: "4px 8px 6px" } },
    h2(
      "button",
      { type: "button", className: "agy-tv-inspect-btn", onClick: inspect },
      IconInspectOutline12(12),
      translate("code.inspect")
    )
  ) : null;
  const body = h2(
    "div",
    { className: "agy-tv-card" },
    h2(
      "div",
      { className: "agy-tv-card-header" },
      h2(
        "div",
        { className: "agy-tv-card-header-left" },
        IconCodeOutline16(13),
        h2("span", { className: "agy-tv-card-path" }, model.title)
      ),
      h2(CopyButton, { text: model.code, labels: [translate("code.copy"), translate("code.copied")] })
    ),
    h2("pre", { className: "agy-tv-card-content" }, clip(model.code, 16e3)),
    inspectNode
  );
  return h2(
    "div",
    {
      className: cls("agy-tv-root", open && "agy-tv-open"),
      "data-state": state,
      "data-kind": "code"
    },
    header,
    ...open ? [h2("div", { key: "wrap", className: "agy-tv-body-wrap" }, body)] : []
  );
}
function AgyRunCodeToolView(props) {
  const typed = props;
  const block = typed?.block;
  const raw = block !== void 0 ? parsedArgsRaw(block) : "{}";
  const mirror = parseAgyMirrorFromCode(raw);
  if (mirror === null) return AgyCodeToolView(typed);
  let description;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.description === "string" && parsed.description !== "") description = parsed.description;
  } catch {
  }
  const synthetic = {
    ...block,
    call: {
      ...block?.call ?? {},
      name: "agy_tool",
      argsRaw: JSON.stringify({
        run: mirror.run,
        step: mirror.step,
        ...mirror.tool !== void 0 ? { tool: mirror.tool } : {},
        ...description !== void 0 ? { input: { description } } : {}
      })
    }
  };
  return AgyMirrorToolView({ block: synthetic, t: typed?.t });
}
var AGY_TOOL_VIEWS = [
  { key: "agy_tool", label: "Antigravity tool", component: AgyMirrorToolView },
  // Code Mode wraps the mirror in `run_code`. A keyed slot entry is a takeover,
  // not an addition, so this view also owns ordinary programs — hence the
  // fallback to the code card inside AgyRunCodeToolView.
  { key: "run_code", label: "Antigravity (code mode)", component: AgyRunCodeToolView }
];
var ROW_CSS = `
/* Container */
.agy-tv-root {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-width: 0;
	position: relative;
	font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif);
	margin: 2px 0;
}

/* Collapsed Header Row */
.agy-tv-row {
	display: flex;
	align-items: center;
	height: calc(24px + var(--dsh-content-font-delta, 0px));
	min-width: 0;
	position: relative;
	overflow: hidden;
	cursor: pointer;
	user-select: none;
	background: transparent;
	border: none;
	padding: 0;
	width: 100%;
	text-align: left;
	color: var(--dsw-alias-label-primary, #0f172a);
}

/* Running sweep shimmer animation */
.agy-tv-root[data-state="run"] .agy-tv-row:after {
	content: "";
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 300px;
	background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 60%, transparent) 55%, transparent 100%);
	pointer-events: none;
	animation: 2.6s ease-out infinite agy-tv-sweep;
}
@keyframes agy-tv-sweep {
	0% { left: -300px; }
	90%, 100% { left: 100%; }
}

/* Leading Icon with Hover-to-Arrow transition */
.agy-tv-leading {
	position: relative;
	flex: none;
	width: calc(16px + var(--dsh-content-font-delta, 0px));
	height: calc(16px + var(--dsh-content-font-delta, 0px));
	display: inline-flex;
	align-items: center;
	justify-content: center;
	margin-right: 6px;
	color: var(--dsw-alias-label-tertiary, #64748b);
}
.agy-tv-leading svg {
	width: calc(14px + var(--dsh-content-font-delta, 0px));
	height: calc(14px + var(--dsh-content-font-delta, 0px));
}
.agy-tv-icon-idle {
	display: inline-flex;
	opacity: 1;
	transition: opacity 0.1s ease;
}
.agy-tv-chevron-hover {
	position: absolute;
	inset: 0;
	margin: auto;
	opacity: 0;
	transition: opacity 0.1s ease;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	color: var(--dsw-alias-label-secondary, #334155);
}
.agy-tv-row:hover .agy-tv-icon-idle {
	opacity: 0;
}
.agy-tv-row:hover .agy-tv-chevron-hover {
	opacity: 1;
}
.agy-tv-chevron-open {
	position: relative;
	flex: none;
	width: calc(16px + var(--dsh-content-font-delta, 0px));
	height: calc(16px + var(--dsh-content-font-delta, 0px));
	display: inline-flex;
	align-items: center;
	justify-content: center;
	margin-right: 6px;
	color: var(--dsw-alias-label-secondary, #334155);
}
.agy-tv-chevron-open svg {
	width: calc(14px + var(--dsh-content-font-delta, 0px));
	height: calc(14px + var(--dsh-content-font-delta, 0px));
}

/* Title */
.agy-tv-title {
	flex: none;
	font-size: var(--dsh-content-font-size-secondary, 13px);
	line-height: calc(24px + var(--dsh-content-font-delta, 0px));
	color: var(--dsw-alias-label-secondary, #334155);
	font-weight: 400;
}

/* Dot separator */
.agy-tv-sep {
	background: var(--dsw-alias-label-caption, #94a3b8);
	border-radius: 1px;
	flex: none;
	width: 2px;
	height: 2px;
	margin: 0 8px;
}

/* Summary */
.agy-tv-summary {
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
	font-size: var(--dsh-content-font-size-secondary, 13px);
	line-height: calc(24px + var(--dsh-content-font-delta, 0px));
	color: var(--dsw-alias-label-tertiary, #64748b);
	flex: auto;
	overflow: hidden;
}
.agy-tv-summary-err {
	color: var(--dsw-alias-state-error-primary, #dc2626);
}

/* File link button */
.agy-tv-file-link {
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
	font: inherit;
	text-align: left;
	font-size: var(--dsh-content-font-size-secondary, 13px);
	line-height: calc(24px + var(--dsh-content-font-delta, 0px));
	color: var(--dsw-alias-label-secondary, #334155);
	text-decoration: underline dotted;
	text-decoration-color: var(--dsw-alias-label-tertiary, #64748b);
	text-underline-offset: 3px;
	cursor: pointer;
	background: none;
	border: none;
	flex: 0 auto;
	margin: 0;
	padding: 0;
	text-decoration-thickness: 1px;
	overflow: hidden;
}
.agy-tv-file-link:hover {
	color: var(--dsw-alias-label-primary, #0f172a);
	text-decoration-color: currentColor;
}

/* Diff stat badge (+10 -2) */
.agy-tv-diff-stat {
	font-family: var(--ds-font-family-code, ui-monospace, monospace);
	font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
	color: var(--dsw-alias-label-caption, #94a3b8);
	margin-left: 10px;
	flex: none;
}

/* Preview text */
.agy-tv-preview {
	font-family: var(--ds-font-family-code, ui-monospace, monospace);
	font-size: 11px;
	color: var(--dsw-alias-label-caption, #94a3b8);
	margin-left: 8px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 35%;
	flex: none;
}

/* Body wrap */
.agy-tv-body-wrap {
	display: flex;
	flex-direction: column;
}

/* Card container */
.agy-tv-card {
	border: 0.5px solid var(--dsw-alias-border-l1, #e2e8f0);
	background: var(--dsw-alias-markdown-code-block, #f8fafc);
	font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
	font-size: 12px;
	line-height: 1.55;
	border-radius: 12px;
	margin: 4px 0 4px 4px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

/* Card Header */
.agy-tv-card-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 12px;
	background: var(--dsw-alias-markdown-code-block-banner, rgba(0, 0, 0, 0.02));
	border-bottom: 0.5px solid var(--dsw-alias-border-l2, #e2e8f0);
}
.agy-tv-card-header-left {
	display: flex;
	align-items: baseline;
	gap: 8px;
	min-width: 0;
	flex: 1;
	overflow: hidden;
}
.agy-tv-prompt-glyph {
	color: var(--dsw-alias-label-caption, #94a3b8);
	flex: none;
	font-weight: 700;
}
.agy-tv-card-cwd {
	color: var(--dsw-alias-label-tertiary, #64748b);
	flex: none;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.agy-tv-card-cmd {
	color: var(--dsw-alias-label-primary, #0f172a);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: pre;
	font-weight: 600;
}
.agy-tv-card-path {
	color: var(--dsw-alias-label-primary, #0f172a);
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* Copy button */
.agy-tv-copy-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	background: transparent;
	border: none;
	padding: 2px 6px;
	margin: 0;
	color: var(--dsw-alias-label-secondary, #334155);
	cursor: pointer;
	font-size: 11px;
	line-height: 16px;
	border-radius: 4px;
	transition: background-color 0.1s ease, color 0.1s ease;
	flex: none;
}
.agy-tv-copy-btn:hover {
	background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
	color: var(--dsw-alias-label-primary, #0f172a);
}

/* Card scrollable content */
.agy-tv-card-content {
	max-height: 260px;
	overflow-y: auto;
	overflow-x: auto;
	padding: 10px 14px;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--dsw-alias-label-secondary, #334155);
	scrollbar-width: thin;
	scrollbar-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.2)) transparent;
}
.agy-tv-card-content::-webkit-scrollbar {
	width: 6px;
	height: 6px;
}
.agy-tv-card-content::-webkit-scrollbar-thumb {
	background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.18));
	border-radius: 6px;
	background-clip: padding-box;
}
.agy-tv-card-content::-webkit-scrollbar-track {
	background: transparent;
	margin: 6px 0;
}

/* Diff lines */
.agy-tv-diff-list {
	display: flex;
	flex-direction: column;
	padding: 6px 0;
	max-height: 280px;
	overflow-y: auto;
	overflow-x: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.2)) transparent;
}
.agy-tv-diff-list::-webkit-scrollbar {
	width: 6px;
	height: 6px;
}
.agy-tv-diff-list::-webkit-scrollbar-thumb {
	background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.18));
	border-radius: 6px;
}
.agy-tv-diff-list::-webkit-scrollbar-track {
	background: transparent;
	margin: 4px 0;
}
.agy-tv-diff-line {
	display: flex;
	gap: 8px;
	padding: 0 12px;
	min-height: 20px;
	line-height: 20px;
	white-space: pre-wrap;
	word-break: break-word;
}
.agy-tv-diff-del {
	background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent);
	color: var(--dsw-alias-state-error-primary, #dc2626);
}
.agy-tv-diff-add {
	background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #059669) 10%, transparent);
	color: var(--dsw-alias-state-success-primary, #059669);
}
.agy-tv-diff-marker {
	flex: none;
	width: 14px;
	font-weight: 700;
	user-select: none;
}

/* Inspect button */
.agy-tv-inspect-btn {
	border: 0.5px solid var(--dsw-alias-border-l3, #cbd5e1);
	background: var(--dsw-alias-bg-base, #ffffff);
	color: var(--dsw-alias-label-secondary, #334155);
	cursor: pointer;
	opacity: 0;
	border-radius: 999px;
	align-self: flex-start;
	align-items: center;
	gap: 4px;
	margin: 4px 0 2px 4px;
	padding: 2px 8px;
	font-size: 11px;
	line-height: 16px;
	transition: opacity 0.1s;
	display: inline-flex;
}
.agy-tv-root:hover .agy-tv-inspect-btn,
.agy-tv-inspect-btn:focus-visible {
	opacity: 1;
}
.agy-tv-inspect-btn:hover {
	background: var(--dsw-alias-interactive-bg-hover-solid, #f1f5f9);
	color: var(--dsw-alias-label-primary, #0f172a);
}

/* Question Card Styles */
.agy-tv-question-wrap {
	padding: 10px 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	font-family: inherit;
}
.agy-tv-q-item {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.agy-tv-q-prompt {
	font-size: 13px;
	font-weight: 600;
	color: var(--dsw-alias-label-primary, #0f172a);
}
.agy-tv-q-opts {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.agy-tv-q-opt {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	border-radius: 6px;
	background: var(--dsw-alias-bg-l2, rgba(127, 127, 127, 0.08));
	border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2));
	color: var(--dsw-alias-label-primary, #334155);
	cursor: pointer;
	text-align: left;
	font-size: 12.5px;
	transition: all 0.15s ease;
}
.agy-tv-q-opt:hover {
	background: var(--dsw-alias-bg-hover, rgba(127, 127, 127, 0.15));
	border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.35));
}
.agy-tv-q-opt.selected {
	background: rgba(16, 185, 129, 0.12);
	border-color: #10b981;
	color: #10b981;
}
.agy-tv-q-check {
	width: 14px;
	height: 14px;
	border: 1.5px solid currentColor;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.agy-tv-q-check.radio {
	border-radius: 50%;
}
.agy-tv-q-check.checkbox {
	border-radius: 3px;
}
.agy-tv-q-check.checked:after {
	content: "";
	width: 6px;
	height: 6px;
	background: currentColor;
	border-radius: inherit;
}
.agy-tv-q-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding-top: 6px;
	border-top: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.15));
}
.agy-tv-q-insert-btn {
	padding: 5px 12px;
	border-radius: 6px;
	font-size: 12px;
	font-weight: 600;
	background: rgba(16, 185, 129, 0.15);
	border: 1px solid #10b981;
	color: #10b981;
	cursor: pointer;
	transition: all 0.15s ease;
}
.agy-tv-q-insert-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.agy-tv-q-insert-btn:not(:disabled):hover {
	background: #10b981;
	color: #fff;
}
.agy-tv-q-answered {
	font-size: 11px;
	color: var(--dsw-alias-label-tertiary, #888);
}

/* Image Card Styles */
.agy-tv-img-wrap {
	padding: 10px 14px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.agy-tv-img-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.agy-tv-img-prompt {
	font-size: 12.5px;
	color: var(--dsw-alias-label-primary, #334155);
	font-style: italic;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.agy-tv-img-badges {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
}
.agy-tv-img-badge {
	font-size: 11px;
	padding: 1px 6px;
	border-radius: 4px;
	background: var(--dsw-alias-bg-l2, rgba(127, 127, 127, 0.1));
	border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2));
	color: var(--dsw-alias-label-secondary, #888);
}
.agy-tv-img-preview-box {
	max-height: 320px;
	overflow: hidden;
	border-radius: 6px;
	border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2));
	display: flex;
	align-items: center;
	justify-content: center;
	background: repeating-conic-gradient(rgba(127,127,127,0.08) 0% 25%, transparent 0% 50%) 50% / 16px 16px;
	cursor: zoom-in;
}
.agy-tv-img-thumb {
	max-width: 100%;
	max-height: 320px;
	object-fit: contain;
}
`;
function installAgyToolViewStyles() {
  const gDoc = globalThis.document;
  if (gDoc === void 0 || gDoc === null) return () => {
  };
  const styleId = "dsh-fusion-agy-toolview-css";
  let st = gDoc.getElementById(styleId);
  if (st === null) {
    st = gDoc.createElement("style");
    st.id = styleId;
    st.textContent = ROW_CSS;
    const host = gDoc.head ?? gDoc.documentElement;
    if (host !== void 0) host.appendChild(st);
  }
  return () => {
    st?.remove?.();
  };
}

// src/client/index.ts
var name = "dsh-fusion/client";
var inject = ["slots"];
var FUSION_PANEL_ID = "fusion";
function apply(ctx) {
  ctx.inject(["locale"], (scope) => {
    const locale = scope.locale;
    scope.effect(() => bindLocale(locale));
    scope.effect(() => bindAgyLocale(locale));
  });
  ctx.inject(
    ["configForms"],
    (scope) => scope.effect(() => bindAcpConfigForm(scope.configForms.get("dsh-fusion")))
  );
  for (const tool of fusionControlTools) ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: tool
  }, FusionTool));
  for (const view of AGY_TOOL_VIEWS) ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: view.key,
    locale: NS
  }, view.component));
  ctx.effect(() => installAgyToolViewStyles());
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: FUSION_PANEL_ID
  }, FusionSettings));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: FUSION_PANEL_ID,
    order: 40,
    label: () => FUSION_SIDEBAR_LABEL
  }, FusionPanelIcon));
  ctx.inject(["modelDirectories"], (scope) => {
    const sessionProps = (sessionId) => {
      const directory = scope.modelDirectories.directoryFor(sessionId);
      return { sessionId, directory: directory.store, load: () => {
        void directory.load().catch(() => void 0);
      } };
    };
    scope.slots.inject("conversation.input.dock", () => scope.slots.register({
      name: "conversation.input.dock",
      id: "fusion-configuration",
      order: 20,
      inject: sessionProps
    }, FusionHint));
    scope.slots.inject("conversation.input.left", () => scope.slots.register({
      name: "conversation.input.left",
      id: "fusion-permission",
      order: 10,
      inject: sessionProps
    }, FusionPermission));
  });
}

		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
