import { type AgyLocaleKey } from './locales.js';
/** The slice of DSH's client locale service this console uses. */
export interface AgyLocaleSource {
    /** Bind the `agy-worker` namespace to a `(key, params) => string` translator. */
    bind(namespace: string): (key: string, params?: Record<string, unknown>) => string;
    /** Contribute one language's dictionary under a namespace. */
    register(namespace: string, language: string, dictionary: Record<string, string>): () => void;
    /** Add a language the Host catalog does not own yet. */
    addLanguage(language: {
        id: string;
        label: string;
        fallback: string;
    }): () => void;
    /** Subscribe to language/dictionary changes. */
    subscribe(listener: () => void): () => void;
    /** Current catalog snapshot, when the service exposes one. */
    getSnapshot?(): {
        locales?: readonly {
            id: string;
        }[];
    };
}
/** Bind the Host locale service; returns the disposer the client entry owns. */
export declare function bindAgyLocale(source: AgyLocaleSource): () => void;
/** The console's translator: Host locale when bound, browser language otherwise. */
export declare function useAgyTranslation(): (key: AgyLocaleKey, params?: Record<string, unknown>) => string;
