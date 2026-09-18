import type { LocaleController, SupportedLocale } from './types.js';
export interface LocalizedSurfaceStats {
    readonly translatedTextNodes: number;
    readonly translatedAttributes: number;
    readonly unresolvedEnglish: readonly string[];
}
export interface MountedLocalizedSurface {
    refresh(): LocalizedSurfaceStats;
    getStats(): LocalizedSurfaceStats;
    dispose(): void;
}
export declare function normalizeSurfaceText(value: string): string;
export declare function translateSurfaceText(locale: SupportedLocale, value: string): string;
export declare function mountLocalizedSurface(controller: LocaleController, root: ParentNode): MountedLocalizedSurface;
//# sourceMappingURL=surface-dom-adapter.d.ts.map