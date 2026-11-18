//! The names the file's sheets get. Excel takes a sheet name of at most 31 characters (UTF-16 units), without
//! `[ ] : * ? / \`, not starting or ending with `'`, not "History", and none twice whatever its case.

/// The longest a sheet name may be in Excel, in UTF-16 units.
const LONGEST: usize = 31;

/// A name as Excel takes it: each character it does not take written `_`, cut to 31 units, an `'` at either end
/// written `_`, "History" (in any case) written `History_`, and no name written `_`.
fn as_excel_takes(name: &str) -> String {
    let replaced: String = name.chars().map(|c| if "[]:*?/\\".contains(c) { '_' } else { c }).collect();
    let mut out = cut(&replaced, LONGEST);
    if out.starts_with('\'') {
        out.replace_range(..1, "_");
    }
    if out.ends_with('\'') {
        out.pop();
        out.push('_');
    }
    if out.to_lowercase() == "history" {
        out.push('_');
    }
    if out.is_empty() {
        out.push('_');
    }
    out
}

/// The text cut to at most `units` UTF-16 units, at a character's end.
fn cut(text: &str, units: usize) -> String {
    let mut out = String::new();
    let mut used = 0;
    for c in text.chars() {
        used += c.len_utf16();
        if used > units {
            break;
        }
        out.push(c);
    }
    out
}

/// The names of the sheets in the file, in order, and that of the sheet of dropdown options after them when there
/// is one. A name Excel takes as it is stays; one it does not is written as it takes it, and when that is a name
/// already given, ` (2)`, ` (3)`… is put after it (cut so the whole fits). Also whether a sheet's name changed.
pub fn names_in_the_file(names: &[&str], options: Option<&str>) -> (Vec<String>, Option<String>, bool) {
    let key = |s: &str| s.to_lowercase();
    let mut taken: hashbrown::HashSet<String> = hashbrown::HashSet::new();
    let mut out: Vec<Option<String>> = vec![None; names.len()];
    for (i, name) in names.iter().enumerate() {
        if as_excel_takes(name) == *name && taken.insert(key(name)) {
            out[i] = Some((*name).to_owned());
        }
    }
    let give = |wanted: String, taken: &mut hashbrown::HashSet<String>| -> String {
        let mut name = wanted.clone();
        let mut n = 2;
        while taken.contains(&key(&name)) {
            let suffix = format!(" ({n})");
            name = format!("{}{suffix}", cut(&wanted, LONGEST - suffix.len()));
            n += 1;
        }
        taken.insert(key(&name));
        name
    };
    let mut changed = false;
    for (i, name) in names.iter().enumerate() {
        if out[i].is_none() {
            let given = give(as_excel_takes(name), &mut taken);
            changed |= given != *name;
            out[i] = Some(given);
        }
    }
    let options = options.map(|name| give(as_excel_takes(name), &mut taken));
    (out.into_iter().map(|n| n.expect("every sheet named")).collect(), options, changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        let (names, options, changed) = names_in_the_file(&["a[b", "a]b", "a_b (2)", "History", "'q'"], Some("S"));
        assert_eq!(names, ["a_b", "a_b (3)", "a_b (2)", "History_", "_q_"]);
        assert_eq!(options.as_deref(), Some("S"));
        assert!(changed);
        let long = "abcdefghijklmnopqrstuvwxyz0123456789";
        let (names, _, _) = names_in_the_file(&[long, "abcdefghijklmnopqrstuvwxyz01234567xx"], None);
        assert_eq!(names, ["abcdefghijklmnopqrstuvwxyz01234", "abcdefghijklmnopqrstuvwxyz0 (2)"]);
        let (names, options, changed) = names_in_the_file(&["Dropdown options"], Some("Dropdown options"));
        assert_eq!(names, ["Dropdown options"]);
        assert_eq!((options.as_deref(), changed), (Some("Dropdown options (2)"), false));
    }
}
