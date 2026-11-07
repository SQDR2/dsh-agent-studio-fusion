window.__ModuleLoader__.load({
	id: "@sqdr2/dsh-fusion",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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

// src/client/FusionHistory.tsx
var import_react2 = require("react");

// src/client/i18n.ts
var import_react = require("react");
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
  return (0, import_react.useSyncExternalStore)((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, current, () => "en");
}
var tr = (lang, zh, en) => lang === "zh" ? zh : en;

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
var blockerText = (lang, blocker) => ({
  agent: tr(lang, "Lead \u6216 Sidekick \u4ECD\u5728\u8FD0\u884C", "its Lead or Sidekick is still running"),
  tool: tr(lang, "\u6709\u539F\u751F\u5DE5\u5177\u8C03\u7528\u5C1A\u672A\u8FD4\u56DE", "a native tool call has not returned"),
  job: tr(lang, "\u6709\u540E\u53F0\u4EFB\u52A1\u5C1A\u672A\u505C\u6B62", "a background job has not stopped"),
  lease: tr(lang, "\u4ECD\u6301\u6709\u5DE5\u4F5C\u533A\u5199\u5165\u79DF\u7EA6", "it still holds the workspace write lease"),
  "foreign-process": tr(lang, "\u53E6\u4E00\u4E2A Host \u8FDB\u7A0B\u4ECD\u5728\u5904\u7406\u5B83", "another Host process is still working on it")
})[blocker ?? ""] ?? tr(lang, "\u4ECD\u6709\u6D3B\u52A8\u5199\u5165\u65B9", "something is still writing to it");
function FusionHistory() {
  const lang = useLang();
  const [page, setPage] = (0, import_react2.useState)();
  const [cursor, setCursor] = (0, import_react2.useState)("");
  const [error, setError] = (0, import_react2.useState)("");
  const [refresh, setRefresh] = (0, import_react2.useState)(0);
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [confirmingId, setConfirmingId] = (0, import_react2.useState)(null);
  const [deletingId, setDeletingId] = (0, import_react2.useState)(null);
  const [rowError, setRowError] = (0, import_react2.useState)(null);
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [tasksOpen, setTasksOpen] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
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
              "\u6309\u5B9E\u9645\u6A21\u578B\u8BF7\u6C42\u6C47\u603B\uFF0C\u5305\u542B\u4EFB\u52A1\u3001\u538B\u7F29\u3001\u4FDD\u6D3B\u53CA\u5DF2\u6709\u6807\u9898\u8BF7\u6C42\u3002\u672A\u62A5\u544A\u7684\u7528\u91CF\u4E0D\u7B97\u4F5C 0\uFF1B\u91D1\u989D\u4E0E\u8282\u7701\u7387\u5C1A\u65E0\u53EF\u9760\u6570\u636E\u3002",
              "Totals of actual model requests: tasks, compaction, keepalive and title requests. Unreported usage is not counted as 0; no reliable billed amount or saving rate is available."
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
                            task.takeovers ? tr(lang, ` \xB7 Lead \u63A5\u624B ${task.takeovers} \u6B21`, ` \xB7 ${task.takeovers} Lead takeovers`) : ""
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
var import_react3 = require("react");
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
  const [interval, setInterval] = (0, import_react3.useState)(String(row.setting.intervalSeconds ? row.setting.intervalSeconds / 60 : ""));
  const [busy, setBusy] = (0, import_react3.useState)(false), [error, setError] = (0, import_react3.useState)();
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
            onChange: (event) => setInterval(event.target.value),
            onBlur: () => {
              if (interval !== String(row.setting.intervalSeconds ? row.setting.intervalSeconds / 60 : ""))
                void save({ mode: row.setting.mode ?? null, intervalSeconds: interval ? Math.round(Number(interval) * 60) : null });
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: busy || !row.setting.mode && !row.setting.intervalSeconds, onClick: () => {
        setInterval("");
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
  const [rows, setRows] = (0, import_react3.useState)(), [checked, setChecked] = (0, import_react3.useState)(), [error, setError] = (0, import_react3.useState)();
  const [reload, setReload] = (0, import_react3.useState)(0);
  const [open, setOpen] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
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

// src/client/FusionSettings.tsx
var import_react4 = require("react");

// src/host/settings.ts
function missingRoutes(value, catalog) {
  if (!value) return [];
  const stale = (role2, route) => route !== void 0 && !catalog.groups.find((group) => group.id === route.provider)?.models.find((model) => model.id === route.model) ? [{ role: role2, route }] : [];
  return [...stale("lead", value.lead), ...stale("worker", value.worker), ...stale("compactor", value.compactor?.route)];
}

// src/client/settings-events.ts
var listeners2 = /* @__PURE__ */ new Set();
var onSettingsChanged = (listener) => {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
};
var settingsChanged = () => {
  for (const listener of listeners2) listener();
};

// src/client/FusionSettings.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var styles = `
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
.fusion-combo{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);font-size:13px}
.fusion-combo[data-active=true]{border-color:var(--dsw-alias-brand-primary)}
.fusion-combo-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto;cursor:pointer;background:none;border:0;padding:0;color:inherit;font:inherit;text-align:left}
.fusion-combo-name{font-weight:600;overflow-wrap:anywhere}
.fusion-combo-routes{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}
.fusion-combo-stale{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}
.fusion-combo-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.fusion-combo-actions button{padding:3px 12px;font-size:12px;border-radius:14px;background:transparent;color:var(--dsw-alias-label-primary)}
.fusion-combo-add{align-self:flex-start}
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
`;
var key = (route) => route ? JSON.stringify([route.provider, route.model]) : "";
function ModelChoice({ role: role2, route, catalog, onChange }) {
  const lang = useLang();
  const name2 = role2 === "compactor" ? tr(lang, "\u538B\u7F29", "Compaction") : role2;
  const model = catalog.groups.find((group) => group.id === route?.provider)?.models.find((model2) => model2.id === route?.model);
  const stale = route !== void 0 && model === void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: name2 }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: role2 === "Lead" ? tr(lang, "\u56DE\u7B54\u95EE\u9898\u3001\u5236\u5B9A\u65B9\u6848\u5E76\u5BA1\u67E5\u7ED3\u679C\u3002", "Answers, plans and reviews.") : role2 === "Sidekick" ? tr(lang, "\u6267\u884C\u547D\u4EE4\u548C\u4FEE\u6539\uFF0C\u63A5\u6536\u53CD\u9988\u540E\u7EE7\u7EED\u3002", "Runs commands and makes changes, then continues with feedback.") : tr(lang, "\u6574\u7406\u8F83\u65E9\u7684\u4E0A\u4E0B\u6587\uFF0C\u4F9B Lead \u6216 Worker \u7EE7\u7EED\u5DE5\u4F5C\u3002", "Summarises older context so the Lead or Sidekick can continue.") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
      tr(lang, "\u6A21\u578B", "Model"),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { "aria-label": tr(lang, `${name2} \u6A21\u578B`, `${name2} model`), value: key(route), onChange: (event) => {
        if (!event.target.value) {
          onChange(void 0);
          return;
        }
        const [provider, model2] = JSON.parse(event.target.value);
        onChange({ provider, model: model2 });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", disabled: role2 !== "compactor", children: role2 === "compactor" ? tr(lang, "\u4F7F\u7528\u5F53\u524D\u89D2\u8272\u6A21\u578B", "Use the role's own model") : tr(lang, "\u9009\u62E9\u5DF2\u8FDE\u63A5\u7684\u6A21\u578B", "Choose a connected model") }),
        stale && route && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: key(route), disabled: true, children: tr(lang, `\u5DF2\u4E0D\u53EF\u7528\uFF1A${route.provider}/${route.model}`, `No longer available: ${route.provider}/${route.model}`) }),
        catalog.groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("optgroup", { label: group.name, children: group.models.map((model2) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: key({ provider: group.id, model: model2.id }), children: model2.name }, model2.id)) }, group.id))
      ] })
    ] }),
    stale && route && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "alert", children: tr(
      lang,
      `\u8FD9\u4E2A\u89D2\u8272\u4FDD\u5B58\u7684\u6A21\u578B ${route.provider}/${route.model} \u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002`,
      `This role's saved model ${route.provider}/${route.model} is no longer available; choose another.`
    ) }),
    model?.reasoning && route && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
      tr(lang, "\u63A8\u7406\u5F3A\u5EA6", "Reasoning"),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { "aria-label": tr(lang, `${name2} \u63A8\u7406\u5F3A\u5EA6`, `${name2} reasoning`), value: route.reasoningEffort ?? "", onChange: (event) => {
        const { reasoningEffort: _old, ...physical } = route;
        onChange({ ...physical, ...event.target.value ? { reasoningEffort: event.target.value } : {} });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: "", children: [
          tr(lang, "\u6A21\u578B\u9ED8\u8BA4", "Model default"),
          model.reasoning.defaultEffort ? ` \xB7 ${model.reasoning.defaultEffort}` : ""
        ] }),
        model.reasoning.efforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: effort.id, children: effort.name }, effort.id))
      ] })
    ] })
  ] });
}
var draftKeys = 0;
var toDraft = (pairs) => pairs.map(({ id, name: name2, pair }) => ({ key: id, id, name: name2, pair }));
function FusionSettings() {
  const lang = useLang();
  const [state, setState] = (0, import_react4.useState)();
  const [draft, setDraft] = (0, import_react4.useState)([]);
  const [active, setActive] = (0, import_react4.useState)(0);
  const [error, setError] = (0, import_react4.useState)();
  const [notice, setNotice] = (0, import_react4.useState)();
  const [saving, setSaving] = (0, import_react4.useState)(false);
  const current2 = draft[Math.min(active, draft.length - 1)];
  const routeName = (route) => route ? state?.catalog.groups.find((group) => group.id === route.provider)?.models.find((model) => model.id === route.model)?.name ?? `${route.provider}/${route.model}` : "\u2014";
  const roleLabel = (role2) => role2 === "lead" ? tr(lang, "Lead", "Lead") : role2 === "worker" ? tr(lang, "Sidekick", "Sidekick") : tr(lang, "\u538B\u7F29\u6A21\u578B", "Compaction model");
  const update = (change) => setDraft((value) => value.map((combo, index) => combo.key === current2?.key ? change(combo) : combo));
  const chooseModel = (role2, route) => update((combo) => ({ ...combo, pair: {
    ...combo.pair,
    [role2]: route,
    ...combo.pair.cacheKeepalive ? { cacheKeepalive: { ...combo.pair.cacheKeepalive, [role2]: role2 === "lead" ? "auto" : false } } : {}
  } }));
  (0, import_react4.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fusion-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("style", { children: styles }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fusion-settings", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { "data-window-drag": true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { children: "Fusion" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u6BCF\u4E2A\u7EC4\u5408\u662F\u4E00\u5BF9 Lead \u548C Sidekick\uFF0C\u4F1A\u4F5C\u4E3A\u5355\u72EC\u7684\u4E00\u9879\u51FA\u73B0\u5728\u6A21\u578B\u83DC\u5355\u91CC\u3002\u5F00\u542F\u591A\u4E2A\u4F1A\u8BDD\u65F6\uFF0C\u53EF\u4EE5\u4E3A\u6BCF\u4E2A\u4F1A\u8BDD\u9009\u62E9\u4E0D\u540C\u7684\u7EC4\u5408\u3002", "Each combo is a Lead and a Sidekick pair, listed as its own entry in the model menu. With several conversations open, each one can use a different combo.") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "Lead \u5904\u7406\u65E5\u5E38\u8BF7\u6C42\u3001\u5B89\u6392\u5DE5\u4F5C\u5E76\u5BA1\u67E5\u7ED3\u679C\uFF1BSidekick \u6267\u884C\u59D4\u6D3E\u7684\u4EFB\u52A1\u3002", "The Lead handles requests, plans and reviews; the Sidekick does the delegated work.") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: tr(lang, "\u642D\u914D\u5EFA\u8BAE", "Pairing tip") }),
          ": ",
          tr(
            lang,
            "Fusion \u7701\u94B1\u9760\u7684\u662F Sidekick \u6BD4 Lead \u4FBF\u5B9C\u5F97\u591A\u3002\u9009\u4E00\u4E2A\u5F3A\u7684\u524D\u6CBF\u6A21\u578B\u5F53 Lead\uFF0C\u518D\u9009\u4E00\u4E2A\u4EF7\u683C\u4F4E\u5F88\u591A\uFF08\u6700\u597D 5 \u500D\u4EE5\u4E0A\uFF09\u7684\u6A21\u578B\u5F53 Sidekick\uFF1B\u4E24\u8005\u4EF7\u683C\u8D8A\u63A5\u8FD1\uFF0C\u8D8A\u7701\u4E0D\u4E86\u94B1\u3002",
            "Fusion saves money because the Sidekick is much cheaper than the Lead. Pick a strong frontier Lead and a Sidekick that costs far less (ideally 5\xD7 or more); the closer their prices, the smaller the saving."
          )
        ] })
      ] }),
      error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "alert", children: error }),
      !state && !error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", children: tr(lang, "\u6B63\u5728\u8BFB\u53D6\u6A21\u578B\u2026", "Loading models\u2026") }),
      state && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "fusion-card", "aria-label": tr(lang, "\u7EC4\u5408\u5217\u8868", "Combo list"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fusion-combos", children: [
            draft.map((combo, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fusion-combo", "data-active": combo.key === current2?.key, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "fusion-combo-main", "aria-pressed": combo.key === current2?.key, onClick: () => setActive(index), children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fusion-combo-name", children: combo.name.trim() || tr(lang, "\u672A\u547D\u540D\u7EC4\u5408", "Untitled combo") }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fusion-combo-routes", children: `${routeName(combo.pair.lead)} \u2192 ${routeName(combo.pair.worker)}` }),
                missingRoutes(combo.pair, state.catalog).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fusion-combo-stale", children: tr(lang, "\u6709\u6A21\u578B\u5DF2\u4E0D\u53EF\u7528\uFF0C\u9700\u8981\u91CD\u65B0\u9009\u62E9", "A model is no longer available; choose it again") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "fusion-combo-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: saving || draft.length <= 1, onClick: () => removeCombo(index), children: tr(lang, "\u5220\u9664", "Delete") }) })
            ] }, combo.key)),
            !draft.length && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u8FD8\u6CA1\u6709\u7EC4\u5408\u3002\u65B0\u589E\u4E00\u4E2A\uFF0C\u9009\u62E9 Lead \u548C Sidekick \u540E\u4FDD\u5B58\u3002", "No combos yet. Add one, choose a Lead and a Sidekick, then save.") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "fusion-combo-add", disabled: saving || draft.length >= state.maxPairs, onClick: addCombo, children: tr(lang, "\uFF0B \u65B0\u589E\u7EC4\u5408", "+ Add combo") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, `\u6700\u591A\u4FDD\u5B58 ${state.maxPairs} \u4E2A\u7EC4\u5408\uFF1B\u6A21\u578B\u83DC\u5355\u4E2D\u7684\u540D\u79F0\u662F\u300CFusion \xB7 \u7EC4\u5408\u540D\u79F0\u300D\u3002`, `Up to ${state.maxPairs} combos; the model menu shows them as \u201CFusion \xB7 name\u201D.`) })
        ] }),
        current2 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { className: "fusion-card", disabled: saving, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            tr(lang, "\u540D\u79F0", "Name"),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ModelChoice, { role: "Lead", route: current2.pair.lead, catalog: state.catalog, onChange: (route) => {
            if (route) chooseModel("lead", route);
          } }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ModelChoice, { role: "Sidekick", route: current2.pair.worker, catalog: state.catalog, onChange: (route) => {
            if (route) chooseModel("worker", route);
          } }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { children: tr(lang, "\u4E0A\u4E0B\u6587\u538B\u7F29\u6A21\u578B \xB7 \u53EF\u9009", "Compaction model \xB7 optional") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fusion-limits", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u9ED8\u8BA4\u7531\u5F53\u524D\u89D2\u8272\u6A21\u578B\u538B\u7F29\u3002\u4E5F\u53EF\u4EE5\u5355\u72EC\u9009\u62E9\u5DF2\u8FDE\u63A5\u7684\u6A21\u578B\uFF1B\u8BF7\u6C42\u7531\u6240\u9009\u8D26\u53F7\u8BA1\u8D39\u3002", "By default each role compacts with its own model. You can pick another connected model; its account is billed.") }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ModelChoice, { role: "compactor", route: current2.pair.compactor?.route, catalog: state.catalog, onChange: (route) => update((combo) => {
                const { compactor, ...rest } = combo.pair;
                return { ...combo, pair: route ? { ...rest, compactor: { route, maxOutputTokens: compactor?.maxOutputTokens ?? 8192 } } : rest };
              }) }),
              current2.pair.compactor && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
                tr(lang, "\u8F93\u51FA Token \u4E0A\u9650", "Output token limit"),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fusion-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u5DF2\u9009\u4E2D\u7684\u4F1A\u8BDD\u4FDD\u7559\u539F\u7EC4\u5408\uFF1B\u65B0\u9009\u62E9\u4F7F\u7528\u65B0\u7EC4\u5408\u3002\u989D\u5EA6\u8017\u5C3D\u540E\u8981\u6362\u5F53\u524D\u4EFB\u52A1\u7684 Sidekick\uFF0C\u7528\u8BE5\u4F1A\u8BDD\u7684 Fusion \u6062\u590D\u9762\u677F\uFF0C\u800C\u4E0D\u662F\u53EA\u6539\u8FD9\u91CC\u3002", "Conversations already using Fusion keep their pair; new selections use the new one. After a quota stop, switch this conversation's Sidekick from its Fusion recovery panel, not only here.") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { disabled: saving || !dirty || !draft.length, onClick: () => {
            void save();
          }, children: saving ? tr(lang, "\u6B63\u5728\u4FDD\u5B58\u2026", "Saving\u2026") : tr(lang, "\u4FDD\u5B58\u7EC4\u5408", "Save combos") })
        ] }),
        notice && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", children: notice }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u8F93\u51FA\u53C2\u6570\u8DDF\u968F\u539F\u751F\u6A21\u578B\u8BBE\u7F6E\uFF0CFusion \u4E0D\u989D\u5916\u9650\u5236\u8BF7\u6C42\u6B21\u6570\u6216\u4EFB\u52A1\u8F6E\u6570\u3002", "Output settings follow the native model settings; Fusion adds no request or round limits.") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u4FDD\u5B58\u5373\u8868\u793A\u5141\u8BB8 Fusion \u4F7F\u7528\u6240\u9009\u6A21\u578B\u7684\u73B0\u6709\u8D26\u53F7\uFF1B\u8D39\u7528\u7531\u8FD9\u4E9B\u8D26\u53F7\u8BA1\u5165\uFF0C\u5F53\u524D\u672A\u63D0\u4F9B\u53EF\u9760\u7684\u5B9E\u9645\u8D26\u5355\u91D1\u989D\u3002", "Saving lets Fusion use the chosen models' existing accounts; they are billed there, and no reliable billed amount is available here.") }),
        blocked.map((pair) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", children: `${pair.name}: ${tr(lang, "\u5C1A\u672A\u5C31\u7EEA\uFF0C\u9700\u8981\u91CD\u65B0\u4FDD\u5B58\u8FD9\u4E2A\u7EC4\u5408", "not ready yet; save this combo again")}${pair.reason ? `: ${pair.reason}` : ""}` }, pair.id)),
        state.managedAuthorization && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: tr(lang, "\u8FD0\u884C\u989D\u5EA6\u7531\u5916\u90E8\u6388\u6743\u914D\u7F6E\u7BA1\u7406\u3002", "Run limits are managed by an external authorization file.") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FusionCache, { refresh: state?.revision ?? 0 }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FusionHistory, {})
    ] })
  ] });
}

// src/client/FusionPanelIcon.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function FusionPanelIcon({ size = 16, active = false, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "4", cy: "4.5", r: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "4", cy: "11.5", r: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "12", cy: "8", r: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M6 4.5h1.5a3 3 0 0 1 2.7 1.7L10.5 6.8" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M6 11.5h1.5a3 3 0 0 0 2.7-1.7l.3-.6" })
      ]
    }
  );
}

// src/client/FusionHint.tsx
var import_react8 = require("react");

// src/client/FusionRecovery.tsx
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function FusionRecovery({ sessionId, task }) {
  const lang = useLang();
  const control = task.modelControl;
  const [role2, setRole] = (0, import_react5.useState)("lead");
  const [route, setRoute] = (0, import_react5.useState)();
  const [catalog, setCatalog] = (0, import_react5.useState)();
  const [dueAt, setDueAt] = (0, import_react5.useState)("");
  const [busy, setBusy] = (0, import_react5.useState)(false);
  const [notice, setNotice] = (0, import_react5.useState)("");
  const [error, setError] = (0, import_react5.useState)("");
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "fusion-recovery", "aria-label": tr(lang, "Fusion \u6062\u590D\u64CD\u4F5C", "Fusion recovery"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: tr(lang, "\u7EE7\u7EED\u5F53\u524D\u4EFB\u52A1", "Continue this task") }),
    Object.entries(control.waits).filter(([, wait]) => wait?.taskId === task.id).map(([key2, wait]) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { children: [
      key2 === "lead" ? "Lead" : "Sidekick",
      " \xB7 ",
      wait.code,
      " \xB7 ",
      wait.code === "NO_PROGRESS" ? tr(lang, "\u91CD\u590D\u64CD\u4F5C\u6CA1\u6709\u8FDB\u5C55\uFF0C\u8BF7\u8C03\u6574\u505A\u6CD5", "Repeated steps made no progress; change the approach") : wait.code === "WORKFLOW_INCOMPLETE" ? tr(lang, "\u62A5\u544A\u3001\u59D4\u6D3E\u6216\u5BA1\u67E5\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u4EFB\u52A1\u540E\u7EE7\u7EED", "A report, handoff or review is unfinished; check the task, then continue") : wait.code.includes("QUOTA") ? tr(lang, "\u989D\u5EA6\u91CD\u7F6E\u65F6\u95F4\u672A\u77E5", "Quota reset time unknown") : tr(lang, "\u9700\u8981\u5904\u7406\u6A21\u578B\u9519\u8BEF", "A model error needs attention"),
      wait.retryNotBefore && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("small", { children: [
        tr(lang, "\u670D\u52A1\u5546\u5EFA\u8BAE\u91CD\u8BD5\u65F6\u95F4", "Provider retry hint"),
        ": ",
        new Date(wait.retryNotBefore).toLocaleString(),
        " ",
        tr(lang, "\uFF08\u4E0D\u4EE3\u8868\u989D\u5EA6\u91CD\u7F6E\uFF09", "(not a quota reset)")
      ] })
    ] }, key2)),
    control.schedule && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { role: "status", children: [
      tr(lang, "\u5B9A\u65F6\u7EE7\u7EED", "Scheduled continuation"),
      ": ",
      new Date(control.schedule.dueAt).toLocaleString(),
      " \xB7 ",
      { scheduled: tr(lang, "\u5DF2\u5B89\u6392", "scheduled"), cancelled: tr(lang, "\u5DF2\u53D6\u6D88", "cancelled"), fired: tr(lang, "\u5DF2\u6267\u884C\u4E00\u6B21", "ran once"), failed: tr(lang, "\u672A\u80FD\u6267\u884C", "failed") }[control.schedule.state],
      control.schedule.reason ? ` \xB7 ${control.schedule.reason}` : ""
    ] }),
    control.operation && ["prepared", "dispatching"].includes(control.operation.state) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: tr(lang, "\u4E0A\u6B21\u7EE7\u7EED\u64CD\u4F5C\u7684\u6295\u9012\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\u3002\u8BF7\u68C0\u67E5\u4F1A\u8BDD\uFF1B\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u3002", "Delivery of the last continuation is unconfirmed. Check the conversation; nothing is resent automatically.") }),
    (task.recovering || task.outcomeUnknown) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: tr(lang, "\u4E2D\u65AD\u7684\u64CD\u4F5C\u5C1A\u672A\u6838\u5BF9\u3002\u7EE7\u7EED\u548C\u66F4\u6362\u6A21\u578B\u90FD\u4E0D\u4F1A\u751F\u6548\uFF0C\u672C\u6B21\u4E5F\u4E0D\u4F1A\u5207\u6362\u6A21\u578B\u3002\u8BF7\u5148\u7528 /fusion recover <\u68C0\u67E5\u8BB0\u5F55> \u63D0\u4EA4\u6838\u5BF9\uFF0C\u518D\u7EE7\u7EED\u6216\u66F4\u6362 Sidekick\u3002\u8BBE\u7F6E\u91CC\u4FDD\u5B58\u7684\u65B0\u7EC4\u5408\u4E0D\u4F1A\u6539\u5199\u8FD9\u4E2A\u4F1A\u8BDD\u3002", "Interrupted operations are not inspected yet. Continue and model switching do nothing, and this attempt does not change the model. Record the inspection with /fusion recover <note>, then continue or switch the Sidekick. A new pair saved in Settings does not rewrite this conversation.") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "alert", children: error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", children: notice }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("fieldset", { disabled: busy || task.unsettledTools > 0 || task.pendingApprovals > 0 || task.recovering || task.outcomeUnknown, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { onClick: () => {
        void action("continue");
      }, children: tr(lang, "\u7EE7\u7EED\u4E00\u6B21", "Continue once") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { onClick: () => {
          if (!catalog) void loadCatalog();
        }, children: tr(lang, "\u66F4\u6362\u89D2\u8272\u6A21\u578B\u5E76\u7EE7\u7EED", "Switch a role model and continue") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
          tr(lang, "\u89D2\u8272", "Role"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { value: role2, onChange: (event) => {
            setRole(event.target.value);
            setRoute(void 0);
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "lead", children: "Lead" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "worker", children: "Sidekick" })
          ] })
        ] }),
        catalog && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ModelChoice, { role: role2 === "lead" ? "Lead" : "Sidekick", route, catalog, onChange: setRoute }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: tr(lang, "\u4EC5\u66F4\u6362\u5F53\u524D\u4F1A\u8BDD\u7684\u89D2\u8272\u6A21\u578B\uFF0C\u4FDD\u7559\u4EFB\u52A1\u4E0E Sidekick \u4F1A\u8BDD\u3002\u540E\u7EED\u8BF7\u6C42\u4F7F\u7528\u65B0\u6A21\u578B\u7684\u8D26\u53F7\u3002", "Changes this conversation's role model only; the task and the Sidekick session are kept. Later requests use the new model's account.") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { disabled: !route, onClick: () => {
          void action("switch-role");
        }, children: tr(lang, "\u66F4\u6362\u5E76\u7EE7\u7EED\u4E00\u6B21", "Switch and continue once") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: tr(lang, "\u5B9A\u65F6\u7EE7\u7EED\u4E00\u6B21", "Continue once at a time") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
          tr(lang, "\u672C\u5730\u65F6\u95F4", "Local time"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { "aria-label": tr(lang, "\u5B9A\u65F6\u7EE7\u7EED\u65F6\u95F4", "Continuation time"), type: "datetime-local", value: dueAt, onChange: (event) => setDueAt(event.target.value) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: tr(lang, "\u6309\u4F60\u9009\u62E9\u7684\u65F6\u95F4\u5C1D\u8BD5\u4E00\u6B21\uFF1B\u518D\u6B21\u9047\u5230\u989D\u5EA6\u9519\u8BEF\u4F1A\u505C\u6B62\u3002\u6B64\u65F6\u95F4\u4E0D\u4EE3\u8868\u670D\u52A1\u5546\u627F\u8BFA\u7684\u6062\u590D\u65F6\u95F4\u3002", "Tries once at the time you choose and stops on another quota error. It is not a provider-promised reset time.") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { disabled: !dueAt, onClick: () => {
          void action("schedule");
        }, children: tr(lang, "\u8BBE\u7F6E\u65F6\u95F4", "Set time") }),
        control.schedule?.state === "scheduled" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { onClick: () => {
          void action("cancel-schedule");
        }, children: tr(lang, "\u53D6\u6D88\u5B89\u6392", "Cancel") })
      ] })
    ] })
  ] });
}

// src/client/FusionStatus.tsx
var import_react7 = require("react");

// src/client/status-polling.ts
var import_react6 = require("react");
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
      for (const notify2 of own2.listeners.keys()) notify2();
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
  const expandedRef = (0, import_react6.useRef)(expandedTask), attentionRef = (0, import_react6.useRef)(attentionOnly), liveRef = (0, import_react6.useRef)(live);
  expandedRef.current = expandedTask;
  attentionRef.current = attentionOnly;
  liveRef.current = live;
  (0, import_react6.useEffect)(() => {
    if (expandedTask) entries.get(sessionId)?.visibility();
  }, [sessionId, expandedTask]);
  return (0, import_react6.useSyncExternalStore)(
    (0, import_react6.useCallback)((listener) => subscribe(sessionId, listener, () => {
      if (liveRef.current) return true;
      const task = entries.get(sessionId)?.snapshot?.status?.task;
      return expandedRef.current !== void 0 && task?.id === expandedRef.current && (!attentionRef.current || task.attention);
    }), [sessionId]),
    (0, import_react6.useCallback)(() => entries.get(sessionId)?.snapshot, [sessionId]),
    () => void 0
  );
}

// src/client/FusionStatus.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var styles2 = `
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
  const [expandedTask, setExpandedTask] = (0, import_react7.useState)();
  const snapshot = useFusionStatus(sessionId, expandedTask, attentionOnly);
  if (!snapshot || snapshot.sessionId !== sessionId) return attentionOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: noteStyle, role: "status", children: tr(lang, "\u6B63\u5728\u8BFB\u53D6 Fusion \u72B6\u6001\u2026", "Loading Fusion status\u2026") });
  if (snapshot.failed) return attentionOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: noteStyle, role: "status", children: tr(lang, "Fusion \u72B6\u6001\u6682\u65F6\u65E0\u6CD5\u66F4\u65B0\uFF0C\u6062\u590D\u8FDE\u63A5\u540E\u4F1A\u91CD\u8BD5\u3002\u53EF\u7528 /fusion status \u67E5\u770B\u3002", "Fusion status cannot update right now; it retries when reconnected. Use /fusion status.") });
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
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "fusion-status", onToggle: (event) => setExpandedTask(event.currentTarget.open ? task.id : void 0), children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("style", { children: styles2 }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("summary", { "aria-label": tr(lang, `Fusion \xB7 ${stage}\uFF0C\u4EFB\u52A1\u8BE6\u60C5`, `Fusion \xB7 ${stage}, task details`), "data-ud-check": "fusion-status-summary", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "fusion-status-label", role: "status", children: [
        "Fusion \xB7 ",
        stage
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "fusion-status-count", children: tr(lang, `${usage.calls} \u6B21\u8BF7\u6C42`, `${usage.calls} requests`) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: tr(lang, "\u8BE6\u60C5", "Details") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "fusion-status-detail", tabIndex: 0, "aria-label": tr(lang, "Fusion \u4EFB\u52A1\u8BE6\u60C5", "Fusion task details"), "data-ud-check": "fusion-status-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: detail ?? (task.stage === "\u5B8C\u6210" ? tr(lang, `\u672C\u8F6E\u4EFB\u52A1\u5DF2\u7ED3\u675F \xB7 ${verification}`, `This task has finished \xB7 ${verification}`) : tr(lang, `\u672C\u8F6E\u4EFB\u52A1 \xB7 ${verification}`, `This task \xB7 ${verification}`)) }),
      task.modelControl && task.stage !== "\u5B8C\u6210" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(FusionRecovery, { sessionId, task }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dl", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: "Lead" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          task.models.lead.model,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: task.models.lead.provider })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: "Sidekick" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          task.models.worker.model,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("small", { children: [
            task.models.worker.provider,
            task.workerId ? tr(lang, " \xB7 \u5DF2\u5EFA\u7ACB\u6301\u7EED\u4F1A\u8BDD", " \xB7 persistent session") : tr(lang, " \xB7 \u5C1A\u672A\u59D4\u6D3E", " \xB7 not delegated yet")
          ] })
        ] }),
        task.models.compactor && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u538B\u7F29\u6A21\u578B", "Compaction") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
            task.models.compactor.model,
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: task.models.compactor.provider })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u5F85\u786E\u8BA4", "Pending approvals") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { children: task.pendingApprovals }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u672A\u6536\u5C3E\u5DE5\u5177", "Unsettled tools") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { children: task.unsettledTools })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: tr(lang, "\u672C\u8F6E\u7528\u91CF", "Usage this task") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dl", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u6A21\u578B\u8BF7\u6C42", "Model requests") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          usage.calls,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, `\u542B\u538B\u7F29 ${usage.compactionCalls} \u6B21\u3001\u4FDD\u6D3B ${usage.keepaliveCalls} \u6B21`, `incl. ${usage.compactionCalls} compaction, ${usage.keepaliveCalls} keepalive`) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u7528\u91CF\u62A5\u544A", "Usage reports") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { children: tr(lang, `${usage.finalCalls} \u6B21\u5DF2\u5B9A\u7A3F \xB7 ${usage.provisionalCalls} \u6B21\u6682\u62A5 \xB7 ${usage.unreportedCalls} \u6B21\u672A\u63D0\u4F9B`, `${usage.finalCalls} final \xB7 ${usage.provisionalCalls} provisional \xB7 ${usage.unreportedCalls} unreported`) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u8F93\u5165 Token", "Input tokens") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          count(usage.input),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "\u5DF2\u62A5\u544A\u7684\u672A\u7F13\u5B58\u8F93\u5165", "reported uncached input") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u7F13\u5B58\u8BFB\u53D6", "Cache read") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { children: count(usage.cacheRead) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u8F93\u51FA Token", "Output tokens") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { children: count(usage.output) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: tr(lang, "\u5B9E\u9645\u8D39\u7528", "Actual cost") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          tr(lang, "\u672A\u77E5", "unknown"),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "\u5F53\u524D\u8D26\u53F7\u672A\u63D0\u4F9B\u53EF\u9760\u8D26\u5355\u91D1\u989D", "the account reports no reliable billed amount") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: tr(lang, "\u6309\u89D2\u8272", "By role") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dl", { children: ["lead", "worker"].map((role2) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_react7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: role2 === "lead" ? "Lead" : "Sidekick" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dd", { children: [
          tr(lang, `${usage.byRole[role2].calls} \u6B21`, `${usage.byRole[role2].calls} requests`),
          " \xB7 ",
          tr(lang, "\u8F93\u51FA", "output"),
          " ",
          count(usage.byRole[role2].output),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("small", { children: [
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
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "Token \u6570\u5305\u542B\u6682\u62A5\u6570\u636E\uFF1B\u7F3A\u5931\u5B57\u6BB5\u4E0D\u8BA1\u4E3A 0\u3002\u8BF7\u6C42\u6570\u6765\u81EA DSH\uFF0C\u4F9B\u5E94\u5546\u5185\u90E8\u91CD\u8BD5\u6B21\u6570\u672A\u77E5\u3002", "Token counts include provisional data; missing fields are not counted as 0. Request counts come from DSH; provider-internal retries are unknown.") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: tr(lang, "\u6700\u8FD1\u4E0A\u4E0B\u6587\u68C0\u67E5", "Recent context checks") }),
      task.contexts.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { children: task.contexts.map((context) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
        role(context.role),
        " \xB7 ",
        purpose2(context.purpose),
        " \xB7 ",
        context.admitted ? tr(lang, "\u53EF\u53D1\u9001", "admitted") : tr(lang, "\u8D85\u51FA\u9884\u7B97", "over budget"),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("small", { children: [
          context.inputTokens.toLocaleString(),
          " / ",
          context.budget.toLocaleString(),
          " Token \xB7 ",
          context.quality === "exact" ? tr(lang, "\u7CBE\u786E\u8BA1\u6570", "exact") : tr(lang, "\u4F30\u7B97", "estimated")
        ] })
      ] }, context.role)) }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "\u5C1A\u65E0\u4E0A\u4E0B\u6587\u68C0\u67E5\u8BB0\u5F55\u3002", "No context checks yet.") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: tr(lang, "\u6700\u8FD1\u6A21\u578B\u8BF7\u6C42", "Recent model requests") }),
      task.requests.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { children: task.requests.map((request) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
        role(request.role),
        " \xB7 ",
        purpose2(request.purpose),
        " \xB7 ",
        outcome(request.outcome),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("small", { children: [
          request.model,
          " \xB7 ",
          request.provider,
          " \xB7 ",
          request.authority === "final" ? tr(lang, "\u7528\u91CF\u5DF2\u5B9A\u7A3F", "usage final") : request.authority === "provisional" ? tr(lang, "\u7528\u91CF\u6682\u62A5", "usage provisional") : tr(lang, "\u7528\u91CF\u672A\u63D0\u4F9B", "usage not reported")
        ] })
      ] }, request.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "\u5C1A\u672A\u53D1\u51FA\u6A21\u578B\u8BF7\u6C42\u3002", "No model requests yet.") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: tr(lang, "\u6700\u8FD1\u547D\u4EE4\u4E0E\u5199\u5165", "Recent commands and writes") }),
      task.tools.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { children: task.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
        role(tool.role),
        " \xB7 ",
        tool.name,
        " \xB7 ",
        tool.failed ? tr(lang, "\u8FD4\u56DE\u9519\u8BEF", "error") : toolState(tool.state)
      ] }, tool.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "\u5C1A\u65E0\u5DE5\u5177\u6267\u884C\u8BB0\u5F55\u3002", "No tool runs yet.") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: tr(lang, "\u663E\u793A\u6700\u8FD1 12 \u6B21\u8BF7\u6C42\u30018 \u9879\u547D\u4EE4\u6216\u5199\u5165\u64CD\u4F5C\uFF1B\u7528\u91CF\u6C47\u603B\u8986\u76D6\u672C\u8F6E\u5168\u90E8\u8BF7\u6C42\u3002\u8BFB\u53D6\u64CD\u4F5C\u4ECD\u53EF\u5728\u4F1A\u8BDD\u4E2D\u67E5\u770B\u3002", "Shows the last 12 requests and 8 commands or writes; usage totals cover all requests of this task. Reads remain visible in the conversation.") })
    ] })
  ] }, task.id);
}

// src/client/FusionHint.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function FusionHint({ sessionId, directory, load }) {
  const selected = (0, import_react8.useSyncExternalStore)(directory.subscribe, directory.getSnapshot).current;
  const fusion = isFusionSelection(selected ?? void 0);
  const lang = useLang();
  const [message, setMessage] = (0, import_react8.useState)();
  (0, import_react8.useEffect)(() => {
    load();
  }, [load]);
  (0, import_react8.useEffect)(() => {
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
        if (!state.pairs.length) setMessage(tr(lang, "Fusion \u5C1A\u672A\u914D\u7F6E\u6A21\u578B\uFF0C\u8BF7\u524D\u5F80\u8BBE\u7F6E \u2192 Fusion \u9009\u62E9 Lead \u548C Sidekick\u3002", "Fusion has no models yet: open Settings \u2192 Fusion and choose a Lead and a Sidekick."));
        else if (!combo) setMessage(tr(lang, "\u5F53\u524D\u7EC4\u5408\u5DF2\u88AB\u5220\u9664\uFF0C\u8BF7\u5728\u6A21\u578B\u83DC\u5355\u4E2D\u9009\u62E9\u5176\u4ED6\u7EC4\u5408\u3002", "This combo was removed; pick another one in the model menu."));
        else if (!combo.authorized) setMessage(tr(lang, "Fusion \u5F53\u524D\u914D\u7F6E\u672A\u5C31\u7EEA\uFF0C\u8BF7\u524D\u5F80\u8BBE\u7F6E \u2192 Fusion \u67E5\u770B\u3002", "The Fusion setup is not ready: see Settings \u2192 Fusion."));
        else setMessage(void 0);
      }).catch(() => {
        if (active) setMessage(tr(lang, "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4 Fusion \u914D\u7F6E\uFF0C\u8BF7\u524D\u5F80\u8BBE\u7F6E \u2192 Fusion \u67E5\u770B\u3002", "Cannot confirm the Fusion setup right now: see Settings \u2192 Fusion."));
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
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    message && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", style: { margin: "8px 12px", color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" }, children: message }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(FusionStatus, { sessionId, attentionOnly: true })
  ] });
}

// src/client/FusionPermission.tsx
var import_react9 = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime8 = require("react/jsx-runtime");
var styles3 = `
.fusion-permission{display:inline-flex;align-items:center;gap:4px;height:28px;min-width:0;max-width:220px;padding:0 6px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500}
.fusion-permission svg{width:14px;height:14px;flex:none}
.fusion-permission .fusion-permission-role{flex:none;color:var(--dsw-alias-label-caption)}
.fusion-permission .fusion-permission-mode{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
var modeOf = (lang, mode) => mode === "read-only" ? tr(lang, "\u4EC5\u53EF\u67E5\u770B", "Read Only") : mode === "workspace-write" ? tr(lang, "\u5DE5\u4F5C\u533A\u5185\u4FEE\u6539", "Workspace Write") : tr(lang, "\u5B8C\u5168\u6743\u9650", "Full access");
var iconOf = (mode) => mode === "read-only" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives.PermissionIconReadOnlyRegular, {}) : mode === "workspace-write" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {});
function FusionPermission({ sessionId, directory, load }) {
  const selected = (0, import_react9.useSyncExternalStore)(directory.subscribe, directory.getSnapshot).current;
  const fusion = isFusionSelection(selected ?? void 0);
  const lang = useLang();
  const snapshot = useFusionStatus(sessionId, void 0, false, true);
  (0, import_react9.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "fusion-permission", title: hint, "aria-label": `${role2} \xB7 ${modeOf(lang, mode)}`, "data-ud-check": "fusion-permission", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("style", { children: styles3 }),
    iconOf(mode),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "fusion-permission-role", children: role2 }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "fusion-permission-mode", children: modeOf(lang, mode) })
  ] });
}

// src/client/FusionTool.tsx
var import_react11 = require("react");

// src/activity.ts
function activityCallId(activity) {
  const event = activity.source;
  const id = event.type === "tool/call" ? event.data.callId : event.data.message.source.callId;
  return `fusion:${activity.childSessionId}:${id}`;
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
var import_react10 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime9 = require("react/jsx-runtime");
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
  read: tr(lang, "\u8BFB\u53D6", "Read"),
  write: tr(lang, "\u5199\u5165", "Write"),
  edit: tr(lang, "\u7F16\u8F91", "Edit"),
  glob: tr(lang, "\u67E5\u627E\u6587\u4EF6", "Find files"),
  grep: tr(lang, "\u641C\u7D22", "Search"),
  job_output: tr(lang, "\u547D\u4EE4\u8F93\u51FA", "Command output"),
  job_kill: tr(lang, "\u505C\u6B62\u547D\u4EE4", "Stop command"),
  str_replace_editor: tr(lang, "\u7F16\u8F91", "Edit")
});
function ActivityCard({ row, done, cwd, openFile }) {
  const lang = useLang();
  const [open, setOpen] = (0, import_react10.useState)(false);
  let args = {};
  try {
    const parsed = JSON.parse(row.call.data.arguments);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
  } catch {
  }
  const result = row.result?.data.message;
  const output = result?.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") ?? "";
  const path = typeof args.file_path === "string" ? args.file_path : typeof args.path === "string" ? args.path : void 0;
  const command = typeof args.command === "string" ? args.command : void 0;
  const exit = /\n\[exit code: (\d+)\]\s*$/.exec(output);
  const failed = result?.isError || exit && Number(exit[1]) !== 0;
  const diffs = activityDiffs(row);
  const label = titleFor(lang)[row.call.data.name] ?? row.call.data.name;
  const summary = path ?? (typeof args.description === "string" ? args.description : command) ?? (typeof args.pattern === "string" ? args.pattern : label);
  const status = failed ? tr(lang, "\u5931\u8D25", "Failed") : !row.result ? done ? tr(lang, "\u7ED3\u679C\u672A\u8BB0\u5F55", "No result recorded") : tr(lang, "\u6267\u884C\u4E2D", "Running") : "";
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "fusion-activity-row", "data-fusion-tool": row.call.data.name, "data-fusion-call": row.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", "aria-expanded": open, onClick: () => setOpen(!open), className: "fusion-activity-toggle", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { "aria-hidden": true, children: open ? "\u2304" : "\u203A" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "fusion-activity-summary", children: summary }),
      status && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("small", { role: "status", "data-failed": Boolean(failed), children: status })
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "fusion-activity-body", children: [
      path && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "fusion-activity-file", onClick: () => openFile(path), children: [
        tr(lang, "\u6253\u5F00", "Open"),
        " ",
        path
      ] }),
      diffs.length ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives2.DiffBlock, { diffs, labels: labelsFor(lang), maxLines: 16 }) : (row.call.data.name === "bash" || row.call.data.name === "pwsh") && command ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        import_dsh_client_ui_primitives2.TerminalBlock,
        {
          command,
          cwd,
          output,
          running: !row.result && !done,
          exitCode: exit ? Number(exit[1]) : void 0,
          labels: terminalLabelsFor(lang)
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("pre", { children: output || (row.result ? tr(lang, "\u5DF2\u8FD4\u56DE\uFF0C\u65E0\u6587\u672C\u8F93\u51FA\u3002", "Returned without text output.") : row.call.data.arguments) })
    ] })
  ] });
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
var import_jsx_runtime10 = require("react/jsx-runtime");
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
  const [snapshot, setSnapshot] = (0, import_react11.useState)();
  const key2 = `${sessionId}:${callId}`;
  (0, import_react11.useEffect)(() => {
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
  const rows = (0, import_react11.useMemo)(() => activityRows(current2?.events ?? []), [current2?.events]);
  const text = settled ? block.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") : "";
  let problem = settled && block.isError ? text : "";
  if (!problem) {
    try {
      const result = JSON.parse(text);
      if (result.status === "needs-decision") problem = result.reason ?? tr(lang, "\u4EFB\u52A1\u9700\u8981\u8FDB\u4E00\u6B65\u5904\u7406\u3002", "The task needs attention.");
    } catch {
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
    rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("style", { children: activityStyles }),
    rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ActivityCard, { row, done: current2?.done ?? false, cwd, openFile }, row.id)),
    current2?.failed && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { role: "status", children: tr(lang, "\u6267\u884C\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\uFF0C\u6B63\u5728\u91CD\u8BD5\u3002", "Activity is unavailable; retrying.") }),
    problem && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { role: "status", style: { fontSize: 13, whiteSpace: "pre-wrap" }, children: problem })
  ] });
}

// src/client/index.ts
var name = "dsh-fusion/client";
var inject = ["slots"];
var FUSION_PANEL_ID = "fusion";
function apply(ctx) {
  ctx.inject(["locale"], (scope) => {
    scope.effect(() => bindLocale(scope.locale));
  });
  for (const tool of fusionControlTools) ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: tool
  }, FusionTool));
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: FUSION_PANEL_ID
  }, FusionSettings));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: FUSION_PANEL_ID,
    order: 40,
    label: () => "Fusion"
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
