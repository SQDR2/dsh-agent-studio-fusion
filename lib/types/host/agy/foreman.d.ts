import { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { agyFetch } from './net.js';
interface Connection {
    accessToken: string;
    project: string;
    proxy?: string;
    version: string | null;
}
export declare function streamAgyForeman(options: GenerateOptions, connection: Connection, fetch?: typeof agyFetch): AsyncIterable<StreamChunk>;
export {};
