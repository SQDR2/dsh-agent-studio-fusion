/**
 * Ambient shape of the tool-executor packages 0.2.2 added.
 *
 * The plugin typechecks against the published 0.2.0-rc.2 declarations, which predate these
 * packages entirely, and a 0.2.1 Host does not ship them. Only `tool-seam.ts` imports them,
 * dynamically, so this declaration exists to give that one import a type instead of
 * pulling a real dependency into a plugin that must also load on 0.2.1.
 *
 * Keep the shape minimal: it is a structural copy of the parts Fusion reads, not a mirror
 * of the upstream contract.
 */
declare module '@deepseek-ai/dsh-tool-executor-native' {
  import type { Context } from '@deepseek-ai/cordis'

  /** Native execution, selected per scope with `ctx.tools.setExecutor()`. */
  export class NativeToolExecutor {
    constructor(ctx: Context)
    readonly sections?: readonly unknown[]
    describe(tools: readonly { name: string; description: string; parameters: Record<string, unknown>; output: unknown; deferLoading?: boolean }[]):
    { readonly schemas: readonly { name: string; description: string; parameters: Record<string, unknown>; deferLoading?: boolean }[] }
    execute(input: unknown): Promise<unknown>
  }
}
