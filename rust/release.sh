#!/bin/bash
# Interactive release script for Rust crates (crates.io)
# Usage: ./release.sh [--yes|-y] [version]
# Example: ./release.sh 0.1.0
#         ./release.sh --yes          # silent mode, auto-accept defaults
#         ./release.sh --yes 0.1.0    # silent mode with specific version
#
# Auto-detects project name from Cargo.toml and GitHub repo from git remote.
# Override with environment variables: PROJECT_NAME, GITHUB_REPO

SILENT=false
POSITIONAL_ARGS=()
for arg in "$@"; do
    case "$arg" in
        --yes|-y) SILENT=true ;;
        *) POSITIONAL_ARGS+=("$arg") ;;
    esac
done
set -- "${POSITIONAL_ARGS[@]}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Auto-detect project name from Cargo.toml
if [ -z "$PROJECT_NAME" ]; then
    PROJECT_NAME=$(grep -E '^name = ' Cargo.toml | head -1 | sed 's/name = "\(.*\)"/\1/')
    if [ -z "$PROJECT_NAME" ]; then
        echo -e "${RED}Error: Could not determine project name from Cargo.toml${NC}"
        exit 1
    fi
fi

# Auto-detect GitHub repo from git remote
if [ -z "$GITHUB_REPO" ]; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null)
    if [ -n "$REMOTE_URL" ]; then
        GITHUB_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
    fi
    if [ -z "$GITHUB_REPO" ]; then
        echo -e "${YELLOW}Warning: Could not detect GitHub repo from git remote${NC}"
    fi
fi

# Get version from argument or Cargo.toml
if [ -z "$1" ]; then
    VERSION=$(grep -E '^version = ' Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
    if [ -z "$VERSION" ]; then
        echo -e "${RED}Error: Could not determine version from Cargo.toml${NC}"
        exit 1
    fi
else
    VERSION="$1"
fi

TAG="rust/v${VERSION}"
TAG_URL_ENCODED="${TAG//\//%2F}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ${PROJECT_NAME} Release Script v${VERSION} (Rust)${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "  Project:     ${CYAN}${PROJECT_NAME}${NC}"
[ -n "$GITHUB_REPO" ] && echo -e "  GitHub:      ${CYAN}${GITHUB_REPO}${NC}"
echo ""

check_tag_exists() {
    if git rev-parse "${TAG}" >/dev/null 2>&1; then
        if git ls-remote --tags origin | grep -q "refs/tags/${TAG}$"; then
            return 0
        fi
    fi
    return 1
}

check_crates_uploaded() {
    curl -s "https://crates.io/api/v1/crates/${PROJECT_NAME}/${VERSION}" \
        | grep -q '"num"' && return 0 || return 1
}

check_release_exists() {
    if command -v gh &> /dev/null; then
        gh release view "${TAG}" &>/dev/null && return 0 || return 1
    fi
    return 1
}

ask_yn() {
    local prompt="$1"
    local default="$2"
    local answer

    if [ "$SILENT" = true ]; then
        if [ "$default" = "y" ]; then
            echo -e "${YELLOW}${prompt} [Y/n] y (auto)${NC}"
            return 0
        else
            echo -e "${YELLOW}${prompt} [y/N] n (auto)${NC}"
            return 1
        fi
    fi

    if [ "$default" = "y" ]; then
        prompt="${prompt} [Y/n]"
    else
        prompt="${prompt} [y/N]"
    fi

    read -p "$(echo -e "${YELLOW}${prompt}${NC}") " answer
    answer=${answer:-$default}
    [[ $answer =~ ^[Yy]$ ]]
}

show_main_menu() {
    if [ "$SILENT" = true ]; then
        echo -e "${CYAN}Silent mode: auto-selecting all steps${NC}"
        MENU_SELECTION="all"
        return
    fi

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Release Steps Selection                                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Select a step to execute:${NC}"
    echo -e "  ${CYAN}all) Execute all steps${NC}"
    echo -e "  ${CYAN}1) Step 1: Version Verification${NC}"
    echo -e "  ${CYAN}2) Step 2: Check Current Status${NC}"
    echo -e "  ${CYAN}3) Step 3: Run Tests${NC}"
    echo -e "  ${CYAN}4) Step 4: Build Release${NC}"
    echo -e "  ${CYAN}5) Step 5: Git Tag${NC}"
    echo -e "  ${CYAN}6) Step 6: Create GitHub Release${NC}"
    echo -e "  ${CYAN}7) Step 7: Publish to crates.io${NC}"
    echo -e "  ${CYAN}9) Show Summary${NC}"
    echo -e "  ${CYAN}0) Exit${NC}"
    echo ""
    read -p "$(echo -e "${YELLOW}Select option [all]:${NC} ") " MENU_SELECTION
    MENU_SELECTION=${MENU_SELECTION:-all}
}

step1_version_verification() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 1: Version Verification${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    CARGO_VERSION=$(grep -E '^version = ' Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
    echo -e "  Cargo.toml:     ${CYAN}${CARGO_VERSION}${NC}"
    echo -e "  Script version: ${CYAN}${VERSION}${NC}"

    if [ "$CARGO_VERSION" != "$VERSION" ]; then
        echo -e "${RED}❌ Version mismatch: Cargo.toml (${CARGO_VERSION}) != script (${VERSION})${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ Versions match${NC}"
    echo ""
    return 0
}

step2_check_status() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 2: Checking Current Status${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if check_tag_exists; then
        echo -e "  Git Tag:      ${GREEN}✅${NC} Tag ${TAG} exists on remote"
    else
        echo -e "  Git Tag:      ❌ Tag ${TAG} not found on remote"
    fi

    if check_crates_uploaded; then
        echo -e "  crates.io:    ${GREEN}✅${NC} Version ${VERSION} found"
    else
        echo -e "  crates.io:    ❌ Version ${VERSION} not found"
    fi

    echo ""
    return 0
}

step3_run_tests() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 3: Run Tests${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if ask_yn "Run cargo test?" "y"; then
        if ! cargo test; then
            echo -e "${RED}❌ Tests failed${NC}"
            return 1
        fi
        echo -e "${GREEN}✅ All tests passed${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped tests${NC}"
    fi
    echo ""
    return 0
}

step4_build_release() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 4: Build Release${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if ask_yn "Run cargo build --release?" "y"; then
        if ! cargo build --release; then
            echo -e "${RED}❌ Build failed${NC}"
            return 1
        fi
        echo -e "${GREEN}✅ Build successful${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped build${NC}"
    fi
    echo ""
    return 0
}

step5_git_tag() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 5: Git Tag${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if check_tag_exists; then
        echo -e "${GREEN}✅ Tag ${TAG} already exists on remote${NC}"
        if ! ask_yn "Create/update tag anyway?" "n"; then
            echo ""
            return 0
        fi
    fi

    if ask_yn "Create Git tag ${TAG}?" "y"; then
        if ! git diff-index --quiet HEAD --; then
            echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
            if ! ask_yn "Continue anyway?" "n"; then
                return 1
            fi
        fi
        git tag -a "${TAG}" -m "Release version ${VERSION}"
        echo -e "${GREEN}✅ Tag created${NC}"

        if ask_yn "Push tag to remote?" "y"; then
            git push origin "${TAG}"
            echo -e "${GREEN}✅ Tag pushed${NC}"
        fi
    fi
    echo ""
    return 0
}

step6_github_release() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 6: Create GitHub Release${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ -z "$GITHUB_REPO" ]; then
        echo -e "${YELLOW}⚠️  GitHub repo not detected. Skipping.${NC}"
        echo ""
        return 0
    fi

    if check_release_exists; then
        echo -e "${GREEN}✅ Release ${TAG} already exists${NC}"
        echo ""
        return 0
    fi

    if ! command -v gh &> /dev/null; then
        echo -e "${YELLOW}⚠️  GitHub CLI (gh) not found. Skipping.${NC}"
        echo ""
        return 0
    fi

    if ask_yn "Create GitHub Release ${TAG}?" "y"; then
        RELEASE_NOTES="Release version ${VERSION}"
        if [ -f "CHANGELOG.md" ]; then
            NOTES=$(awk "/^## \[${VERSION}\]/ {found=1; next} found && /^## \[/ {exit} found {print}" CHANGELOG.md)
            [ -n "$NOTES" ] && RELEASE_NOTES="$NOTES"
        fi

        NOTES_FILE=$(mktemp)
        echo "$RELEASE_NOTES" > "$NOTES_FILE"

        if gh release create "${TAG}" \
            --title "Release ${VERSION}" \
            --notes-file "$NOTES_FILE" \
            --repo "${GITHUB_REPO}"; then
            echo -e "${GREEN}✅ GitHub Release created${NC}"
        else
            echo -e "${RED}❌ Failed to create GitHub Release${NC}"
        fi
        rm -f "$NOTES_FILE"
    fi
    echo ""
    return 0
}

step7_publish_crates() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 7: Publish to crates.io${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if check_crates_uploaded; then
        echo -e "${GREEN}✅ Version ${VERSION} already on crates.io${NC}"
        if ! ask_yn "Publish anyway? (will fail if version exists)" "n"; then
            echo ""
            return 0
        fi
    fi

    if ask_yn "Publish to crates.io?" "y"; then
        if ! cargo publish; then
            echo -e "${RED}❌ Publish failed${NC}"
            return 1
        fi
        echo -e "${GREEN}✅ Published to crates.io!${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped publish${NC}"
    fi
    echo ""
    return 0
}

step_summary() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Release Summary                                          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Version: ${CYAN}${VERSION}${NC}"
    echo -e "  Tag:     ${CYAN}${TAG}${NC}"
    echo ""

    check_tag_exists && echo -e "  ${GREEN}✅${NC} Git tag: ${TAG}" || echo -e "  ⚠️  Git tag: not created"
    check_crates_uploaded && echo -e "  ${GREEN}✅${NC} crates.io: https://crates.io/crates/${PROJECT_NAME}/${VERSION}" \
                          || echo -e "  ⚠️  crates.io: not published yet"

    echo ""
    echo -e "${GREEN}✨ Release script completed!${NC}"
    echo ""
}

# Main loop
while true; do
    show_main_menu
    SELECTION="$MENU_SELECTION"

    case "$SELECTION" in
        all|ALL|a|A)
            echo ""
            echo -e "${CYAN}Executing all steps...${NC}"
            echo ""

            run_step() {
                local name="$1"; shift
                if ! "$@"; then
                    if [ "$SILENT" = true ]; then
                        echo -e "${RED}${name} failed. Aborting.${NC}"
                        exit 1
                    else
                        echo -e "${YELLOW}${name} failed, continuing...${NC}"
                    fi
                fi
            }

            if ! step1_version_verification; then
                echo -e "${RED}Version verification failed. Exiting.${NC}"
                exit 1
            fi

            step2_check_status
            run_step "Step 3" step3_run_tests
            run_step "Step 4" step4_build_release
            run_step "Step 5" step5_git_tag
            run_step "Step 6" step6_github_release
            run_step "Step 7" step7_publish_crates
            step_summary
            break
            ;;
        1) step1_version_verification ;;
        2) step2_check_status ;;
        3) step3_run_tests ;;
        4) step4_build_release ;;
        5) step5_git_tag ;;
        6) step6_github_release ;;
        7) step7_publish_crates ;;
        9) step_summary ;;
        0) echo -e "${CYAN}Exiting...${NC}"; exit 0 ;;
        *) echo -e "${RED}Invalid selection.${NC}" ;;
    esac
done
