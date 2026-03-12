use std::collections::HashMap;
use std::fs;

/// Load [tool.apdev] section from pyproject.toml in the current directory.
/// Returns an empty map if the file or section is not found.
pub fn load_config() -> HashMap<String, String> {
    let content = match fs::read_to_string("pyproject.toml") {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };

    let value: toml::Value = match content.parse() {
        Ok(v) => v,
        Err(_) => return HashMap::new(),
    };

    let section = value
        .get("tool")
        .and_then(|t| t.get("apdev"))
        .and_then(|a| a.as_table());

    let mut config = HashMap::new();
    if let Some(table) = section {
        for (k, v) in table {
            if let Some(s) = v.as_str() {
                config.insert(k.clone(), s.to_string());
            }
        }
    }

    config
}
