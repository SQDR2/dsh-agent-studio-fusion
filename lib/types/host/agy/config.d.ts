/**
 * Config resolution for the built-in AGY side of dsh-fusion.
 *
 * Ported from dsh-agy-worker (`src/common/config.ts`), MIT License,
 * Copyright (c) 2026 dsh-agy-worker contributors, itself a fork of
 * `dsh-agy-link`. See docs/ATTRIBUTION-AGY.md.
 *
 * Layering is unchanged: env (`DSH_AGY_*`) > runtime overrides file > cordis
 * `agy` block > defaults (spec ADR-13). The overrides file backs /agy hot
 * changes and survives restarts; the env is read per call so a changed process
 * environment is honored without reload.
 *
 * State paths are deliberately identical to the standalone plugin so an
 * existing installation keeps its bindings, overrides and media cache. Nothing
 * here moves, copies or deletes user state: migration from the old plugin is a
 * documented manual step (docs/MIGRATION-AGY.md).
 */
import { type PluginConfig } from './types.js';
export interface OverridesFile {
    [key: string]: unknown;
}
export declare function dshHome(): string;
/** AGY work state: `$DSH_HOME/agy-worker` (unchanged from the standalone plugin). */
export declare function stateDir(): string;
/**
 * AGY account pool: `$DSH_HOME/agy-accounts` (the documented task decision).
 *
 * Upstream `dsh-agy-worker` resolved this from `DSH_STATE_DIR` (falling back to
 * `~/.dsh`), while its work state came from `DSH_HOME`. The two agree whenever
 * `DSH_STATE_DIR` is unset; when they differ, docs/MIGRATION-AGY.md explains the
 * one-time manual copy. This function never moves the directory itself.
 */
export declare function agyAccountsDir(): string;
export declare function overridesPath(): string;
export declare function readOverrides(file?: string): OverridesFile;
/** Layered config read; cheap enough to call per request (thunk pattern). */
export declare function resolveConfig(entry: Record<string, unknown> | undefined, env?: NodeJS.ProcessEnv, overrides?: OverridesFile): PluginConfig;
