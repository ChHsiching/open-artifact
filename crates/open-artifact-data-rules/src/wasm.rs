use wasm_bindgen::prelude::*;

/// Why a rule pattern cannot be used, or an empty string when it can.
#[wasm_bindgen(js_name = rulePatternProblem)]
pub fn rule_pattern_problem(pattern: &str) -> String {
    crate::pattern_problem(pattern).unwrap_or_default()
}

/// 1 when the whole value matches, 0 when it doesn't, 2 when the pattern cannot be used.
#[wasm_bindgen(js_name = rulePatternMatches)]
pub fn rule_pattern_matches(pattern: &str, value: &str) -> u8 {
    match crate::pattern_matches(pattern, value) {
        Some(true) => 1,
        Some(false) => 0,
        None => 2,
    }
}
