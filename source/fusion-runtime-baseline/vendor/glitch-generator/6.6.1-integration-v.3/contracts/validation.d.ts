export type UnifiedMusicFrameValidationMode = 'partial' | 'resolved';
export type UnifiedMusicFrameValidationCode = 'NOT_OBJECT' | 'MISSING_FIELD' | 'UNKNOWN_FIELD' | 'INVALID_TYPE' | 'NON_FINITE_NUMBER' | 'OUT_OF_RANGE' | 'INVALID_ENUM' | 'CONTRACT_MISMATCH' | 'CONTRACT_VERSION_UNSUPPORTED' | 'EMPTY_EVENT_ID';
export interface UnifiedMusicFrameValidationIssue {
    readonly severity: 'error';
    readonly code: UnifiedMusicFrameValidationCode;
    readonly path: string;
    readonly message: string;
}
export interface UnifiedMusicFrameValidationReport {
    readonly valid: boolean;
    readonly mode: UnifiedMusicFrameValidationMode;
    readonly issues: readonly UnifiedMusicFrameValidationIssue[];
}
export declare function validateUnifiedMusicFrame(input: unknown, mode?: UnifiedMusicFrameValidationMode): UnifiedMusicFrameValidationReport;
export declare class UnifiedMusicFrameValidationError extends Error {
    readonly report: UnifiedMusicFrameValidationReport;
    constructor(report: UnifiedMusicFrameValidationReport);
}
//# sourceMappingURL=validation.d.ts.map