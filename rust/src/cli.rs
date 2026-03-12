use clap::{Parser, Subcommand};
use std::env;
use std::path::PathBuf;
use std::process::Command;

use crate::check_chars::{check_paths, resolve_charsets};
use crate::check_imports::check_circular_imports;
use crate::config::load_config;

#[derive(Parser)]
#[command(name = "apdev", about = "Shared development tools", version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Validate files contain only allowed characters
    CheckChars {
        /// Files or directories to check (defaults to src/, tests/, examples/)
        files: Vec<PathBuf>,

        /// Extra charset preset to enable (repeatable, e.g. --charset chinese)
        #[arg(long = "charset", action = clap::ArgAction::Append)]
        charset: Vec<String>,

        /// Path to custom charset JSON file (repeatable)
        #[arg(long = "charset-file", action = clap::ArgAction::Append)]
        charset_files: Vec<String>,
    },

    /// Detect circular imports in a Python package
    CheckImports {
        /// Base package name. Reads from [tool.apdev] if omitted.
        #[arg(long = "package")]
        base_package: Option<String>,

        /// Source directory containing the package (default: src)
        #[arg(long = "src-dir")]
        src_dir: Option<String>,
    },

    /// Interactive release automation (build, tag, GitHub release, upload)
    Release {
        /// Auto-accept all defaults (silent mode)
        #[arg(long, short = 'y')]
        yes: bool,

        /// Version to release (auto-detected from Cargo.toml if omitted)
        version: Option<String>,
    },
}

pub fn run() -> i32 {
    let cli = Cli::parse();

    match cli.command {
        None => {
            use clap::CommandFactory;
            Cli::command().print_help().ok();
            0
        }

        Some(Commands::CheckChars {
            files,
            mut charset,
            mut charset_files,
        }) => {
            // Fall back to APDEV_EXTRA_CHARS env var if no CLI args
            if charset.is_empty() && charset_files.is_empty() {
                if let Ok(env_val) = env::var("APDEV_EXTRA_CHARS") {
                    for item in env_val.split(',') {
                        let item = item.trim();
                        if item.is_empty() {
                            continue;
                        }
                        if item.contains(std::path::MAIN_SEPARATOR) || item.ends_with(".json") {
                            charset_files.push(item.to_string());
                        } else {
                            charset.push(item.to_string());
                        }
                    }
                }
            }

            let (extra_ranges, dangerous) = match resolve_charsets(&charset, &charset_files) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("Error: {}", e);
                    return 1;
                }
            };

            check_paths(files, &extra_ranges, &dangerous)
        }

        Some(Commands::CheckImports {
            base_package,
            src_dir,
        }) => {
            let config = load_config();
            let base_package = base_package.or_else(|| config.get("base_package").cloned());
            let src_dir_str = src_dir
                .or_else(|| config.get("src_dir").cloned())
                .unwrap_or_else(|| "src".to_string());

            match base_package {
                None => {
                    eprintln!(
                        "Error: --package is required (or set base_package in [tool.apdev])"
                    );
                    1
                }
                Some(pkg) => check_circular_imports(PathBuf::from(src_dir_str), &pkg),
            }
        }

        Some(Commands::Release { yes, version }) => {
            // Look for release.sh in current directory
            let script = PathBuf::from("release.sh");
            if !script.is_file() {
                eprintln!("Error: release.sh not found in current directory");
                eprintln!("Hint: copy the release.sh from the rust/ directory of apdev");
                return 1;
            }
            let mut cmd = Command::new("bash");
            cmd.arg(&script);
            if yes {
                cmd.arg("--yes");
            }
            if let Some(v) = version {
                cmd.arg(v);
            }
            match cmd.status() {
                Ok(status) => status.code().unwrap_or(1),
                Err(e) => {
                    eprintln!("Error running release.sh: {}", e);
                    1
                }
            }
        }
    }
}
