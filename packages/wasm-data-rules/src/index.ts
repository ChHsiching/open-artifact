/**
 * Rule patterns of the Data type (`crates/open-artifact-data-rules`): the
 * JavaScript pattern syntax matched in linear time, instantiated on first use.
 */

import * as glue from '../generated/open_artifact_data_rules.js';
import { WASM_BASE64 } from '../generated/bytes.js';

let ready = false;

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function rules(): typeof glue {
  if (!ready) {
    glue.initSync({ module: decode(WASM_BASE64) });
    ready = true;
  }
  return glue;
}

/** Why a rule pattern cannot be used, or `null` when it can. */
export function rulePatternProblem(pattern: string): string | null {
  return rules().rulePatternProblem(pattern) || null;
}

/** Whether the whole value matches the pattern; `null` when the pattern cannot be used. */
export function rulePatternMatches(pattern: string, value: string): boolean | null {
  const answer = rules().rulePatternMatches(pattern, value);
  return answer === 2 ? null : answer === 1;
}
