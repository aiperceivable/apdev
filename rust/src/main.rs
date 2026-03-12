mod check_chars;
mod check_imports;
mod cli;
mod config;

fn main() {
    std::process::exit(cli::run());
}
