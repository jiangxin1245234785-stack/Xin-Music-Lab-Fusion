import type { ShaderPassId } from '../schema/types.js';
export declare const SHADER_PASS_IDS: readonly ShaderPassId[];
export declare function resolveShaderPassOrder(input: readonly ShaderPassId[]): readonly ShaderPassId[];
export declare function moveShaderPass(input: readonly ShaderPassId[], passId: ShaderPassId, direction: -1 | 1): readonly ShaderPassId[];
//# sourceMappingURL=shader-pass-order.d.ts.map