import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { MessageId } from '@deepseek-ai/dsh-llm';
import type { PhysicalRoute } from '../contracts.js';
export interface NativeWorkerRequest {
    readonly childId: string;
    readonly label: string;
    /** Model-authored brief from the Lead's native tool call. */
    readonly brief: string;
    readonly route: PhysicalRoute;
    /** 0.2.0 startContinuable persona. 0.2.1 rejects it; the role scope carries the prompt. */
    readonly persona: string;
    /** 0.2.0 start-time tool ceiling. 0.2.1 rejects toolFilter; the role scope narrows tools. */
    readonly allowedTools: readonly string[];
}
export interface NativeWorkerAcceptance {
    readonly childId: string;
    readonly messageId: MessageId;
}
export declare class NativeWorkerTransport {
    #private;
    private readonly ctx;
    private readonly provider;
    constructor(ctx: Context, provider?: string);
    assertAvailable(): void;
    /** Caller durably reserves the child and operation before entering this method. */
    start(parent: Agent, request: NativeWorkerRequest, signal: AbortSignal): Promise<NativeWorkerAcceptance>;
    /** Only Lead-authored feedback is sent through this public model-message API. */
    continue(parent: Agent, childId: string, feedback: string, signal: AbortSignal): Promise<NativeWorkerAcceptance>;
    /**
     * Replace an in-flight generation through public cancellation, then deliver
     * to the same durable child. The caller must first exclude live/unknown
     * effectful tools. Otherwise use continue(), which steers at a step boundary.
     */
    interruptAndContinue(parent: Agent, childId: string, feedback: string, signal: AbortSignal): Promise<NativeWorkerAcceptance>;
    /** Interrupt acceptance is insufficient: wait for the exact native Agent to settle and flush. */
    settle(parent: Agent, childId: string, signal: AbortSignal): Promise<Agent>;
    /** Yield a blocking tool to native user steering without canceling or releasing the Worker. */
    settle(parent: Agent, childId: string, signal: AbortSignal, yieldToSteering: true): Promise<Agent | undefined>;
    stop(parent: Agent, childId: string): Promise<Agent>;
    /**
     * Native release owns quiescence, persistence and handle disposal across HMR.
     *
     * 0.2.1 and 0.2.0 release a named child through the service; 0.2.2 removed both
     * drains and documents the activation receipt as the replacement. A receipt
     * addresses exactly the execution that this transport started, so it is used
     * first and the drain calls remain only for Hosts that still declare them.
     */
    release(parent: Agent, childId: string): Promise<void>;
}
