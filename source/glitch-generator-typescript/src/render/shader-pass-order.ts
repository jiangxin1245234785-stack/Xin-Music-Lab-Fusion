import type { ShaderPassId } from '../schema/types.js';

export const SHADER_PASS_IDS: readonly ShaderPassId[] = Object.freeze([
  'builtin-feedback',
  'custom-glsl'
]);

export function resolveShaderPassOrder(
  input: readonly ShaderPassId[]
): readonly ShaderPassId[] {
  if (
    input.length !== SHADER_PASS_IDS.length ||
    new Set(input).size !== SHADER_PASS_IDS.length ||
    input.some(passId => !SHADER_PASS_IDS.includes(passId))
  ) {
    throw new Error(
      'Shader pass order must contain builtin-feedback and custom-glsl exactly once.'
    );
  }
  return Object.freeze([...input]);
}

export function moveShaderPass(
  input: readonly ShaderPassId[],
  passId: ShaderPassId,
  direction: -1 | 1
): readonly ShaderPassId[] {
  const order = [...resolveShaderPassOrder(input)];
  const index = order.indexOf(passId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) {
    return Object.freeze(order);
  }
  [order[index], order[target]] = [order[target]!, order[index]!];
  return Object.freeze(order);
}
