#!/bin/bash
# Interactive release script for TypeScript/JavaScript projects
# Usage: ./release.sh [version]
# Example: ./release.sh 0.2.0
#
# Auto-detects project name from package.json and GitHub repo from git remote.
# Override with environment variables: PROJECT_NAME, GITHUB_REPO

# Note: set -e is disabled to allow step-by-step execution
# Individual steps will handle their own error handling

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Auto-detect project name from package.json (unless set via env)
if [ -z "$PROJECT_NAME" ]; then
    PROJECT_NAME=$(node -e "console.log(require('./package.json').name)" 2>/dev/null)
    if [ -z "$PROJECT_NAME" ]; then
        echo -e "${RED}Error: Could not determine project name from package.json${NC}"
        echo -e "${YELLOW}Set PROJECT_NAME environment variable or check package.json${NC}"
        exit 1
    fi
fi

# Auto-detect GitHub repo from git remote (unless set via env)
if [ -z "$GITHUB_REPO" ]; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null)
    if [ -n "$REMOTE_URL" ]; then
        GITHUB_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
    fi
    if [ -z "$GITHUB_REPO" ]; then
        echo -e "${YELLOW}Warning: Could not detect GitHub repo from git remote${NC}"
        echo -e "${YELLOW}Set GITHUB_REPO environment variable (e.g. owner/repo)${NC}"
    fi
fi

# Get version from argument or package.json
if [ -z "$1" ]; then
    VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null)
    if [ -z "$VERSION" ]; then
        echo -e "${RED}Error: Could not determine version from package.json${NC}"
        exit 1
    fi
else
    VERSION="$1"
fi

TAG="typescript/v${VERSION}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ${PROJECT_NAME} Release Script v${VERSION}${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "  Project:     ${CYAN}${PROJECT_NAME}${NC}"
[ -n "$GITHUB_REPO" ] && echo -e "  GitHub:      ${CYAN}${GITHUB_REPO}${NC}"
echo ""

# Function to check if step is already done
check_tag_exists() {
    if git rev-parse "${TAG}" >/dev/null 2>&1; then
        if git ls-remote --tags origin | grep -q "refs/tags/${TAG}$"; then
            return 0  # Tag exists on remote
        fi
    fi
    return 1  # Tag doesn't exist
}

check_npm_uploaded() {
    # Check if version exists on npm registry
    npm view "${PROJECT_NAME}" versions --json 2>/dev/null \
        | grep -qF "\"${VERSION}\"" && return 0 || return 1
}

check_release_exists() {
    if command -v gh &> /dev/null; then
        gh release view "${TAG}" &>/dev/null && return 0 || return 1
    fi
    return 1
}

# Function to ask yes/no with default
ask_yn() {
    local prompt="$1"
    local default="$2"
    local answer

    if [ "$default" = "y" ]; then
        prompt="${prompt} [Y/n]"
    else
        prompt="${prompt} [y/N]"
    fi

    read -p "$(echo -e "${YELLOW}${prompt}${NC}") " answer
    answer=${answer:-$default}
    [[ $answer =~ ^[Yy]$ ]]
}

# Function to show main menu with all steps
show_main_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Release Steps Selection                                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${CYAN}Select a step to execute:${NC}"
    echo -e "  ${CYAN}all) Execute all steps (with interactive prompts)${NC}"
    echo -e "  ${CYAN}1) Step 1: Version Verification${NC}"
    echo -e "  ${CYAN}2) Step 2: Check Current Status${NC}"
    echo -e "  ${CYAN}3) Step 3: Clean Build Files${NC}"
    echo -e "  ${CYAN}4) Step 4: Build Package${NC}"
    echo -e "  ${CYAN}5) Step 5: Check Package${NC}"
    echo -e "  ${CYAN}6) Step 6: Git Tag${NC}"
    echo -e "  ${CYAN}7) Step 6.5: Create GitHub Release${NC}"
    echo -e "  ${CYAN}8) Step 7: Upload to npm${NC}"
    echo -e "  ${CYAN}9) Show Summary${NC}"
    echo -e "  ${CYAN}0) Exit${NC}"
    echo ""

    read -p "$(echo -e "${YELLOW}Select option [all]:${NC} ") " MENU_SELECTION
    MENU_SELECTION=${MENU_SELECTION:-all}
}

# Step functions
step1_version_verification() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 1: Version Verification${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    PKG_VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null)

    echo -e "  package.json:      ${CYAN}${PKG_VERSION}${NC}"
    echo -e "  Script version:    ${CYAN}${VERSION}${NC}"

    if [ "$PKG_VERSION" != "$VERSION" ]; then
        echo -e "${RED}Version mismatch detected!${NC}"
        return 1
    fi

    echo -e "${GREEN}All versions match${NC}"
    echo ""
    return 0
}

step2_check_status() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 2: Checking Current Status${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Check Git tag
    if check_tag_exists; then
        echo -e "  Git Tag:          ${GREEN}Tag ${TAG} exists on remote${NC}"
    else
        echo -e "  Git Tag:          Tag ${TAG} not found on remote"
    fi

    # Check build files
    if [ -d "dist" ] && [ "$(ls -A dist/*.js dist/*.cjs 2>/dev/null | wc -l)" -gt 0 ]; then
        echo -e "  Build Files:      ${GREEN}Found in dist/${NC}"
        ls -lh dist/ | tail -n +2 | sed 's/^/    /'
    else
        echo -e "  Build Files:      Not found"
    fi

    # Check npm registry
    if command -v npm &> /dev/null; then
        if check_npm_uploaded; then
            echo -e "  npm Upload:       ${GREEN}Version ${VERSION} found on npm${NC}"
        else
            echo -e "  npm Upload:       Version ${VERSION} not found on npm"
        fi
    else
        echo -e "  npm Upload:       (cannot check - npm not available)"
    fi

    echo ""
    return 0
}

step3_clean_build() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 3: Clean Build Files${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ -d "dist" ]; then
        echo -e "${YELLOW}Found existing build files${NC}"
        if ask_yn "Clean build files? (dist/, node_modules/.cache/)" "y"; then
            rm -rf dist/ node_modules/.cache/
            echo -e "${GREEN}Cleaned${NC}"
        else
            echo -e "${YELLOW}Skipped cleaning${NC}"
        fi
    else
        echo -e "${GREEN}No build files to clean${NC}"
    fi
    echo ""
    return 0
}

step4_build_package() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 4: Build Package${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ -d "dist" ] && [ "$(ls -A dist/*.js 2>/dev/null | wc -l)" -gt 0 ]; then
        echo -e "${GREEN}Build files already exist${NC}"
        if ask_yn "Rebuild package?" "n"; then
            SKIP_BUILD=false
        else
            SKIP_BUILD=true
        fi
    else
        SKIP_BUILD=false
    fi

    if [ "$SKIP_BUILD" = false ]; then
        echo -e "${YELLOW}Building package...${NC}"
        if ! pnpm build; then
            echo -e "${RED}Build failed${NC}"
            return 1
        fi
        echo -e "${GREEN}Package built successfully${NC}"

        echo ""
        echo -e "${CYAN}Built files:${NC}"
        ls -lh dist/ | tail -n +2 | sed 's/^/  /'
    else
        echo -e "${YELLOW}Skipped build (using existing files)${NC}"
    fi
    echo ""
    return 0
}

step5_check_package() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 5: Check Package${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if ask_yn "Check package with npm pack --dry-run?" "y"; then
        if ! npm pack --dry-run; then
            echo -e "${RED}Package check failed${NC}"
            return 1
        fi
        echo -e "${GREEN}Package check passed${NC}"
    else
        echo -e "${YELLOW}Skipped package check${NC}"
    fi
    echo ""
    return 0
}

step6_git_tag() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 6: Git Tag${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if check_tag_exists; then
        echo -e "${GREEN}Tag ${TAG} already exists on remote${NC}"
        if ask_yn "Create/update tag anyway?" "n"; then
            SKIP_TAG=false
        else
            SKIP_TAG=true
        fi
    else
        SKIP_TAG=false
        if git rev-parse "${TAG}" >/dev/null 2>&1; then
            echo -e "${YELLOW}Tag ${TAG} exists locally but not on remote${NC}"
            if ask_yn "Push existing tag to remote?" "y"; then
                git push origin "${TAG}"
                echo -e "${GREEN}Tag pushed${NC}"
                SKIP_TAG=true
            fi
        fi
    fi

    if [ "$SKIP_TAG" = false ]; then
        if ask_yn "Create Git tag ${TAG}?" "y"; then
            if ! git diff-index --quiet HEAD --; then
                echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
                git status --short
                if ! ask_yn "Continue anyway?" "n"; then
                    return 1
                fi
            fi

            git tag -a "${TAG}" -m "Release version ${VERSION}"
            echo -e "${GREEN}Tag created${NC}"

            if ask_yn "Push tag to remote?" "y"; then
                git push origin "${TAG}"
                echo -e "${GREEN}Tag pushed to remote${NC}"
            else
                echo -e "${YELLOW}Tag not pushed. Push manually with: git push origin ${TAG}${NC}"
            fi
        else
            echo -e "${YELLOW}Skipped tag creation${NC}"
        fi
    fi
    echo ""
    return 0
}

step6_5_create_github_release() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 6.5: Create GitHub Release${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ -z "$GITHUB_REPO" ]; then
        echo -e "${YELLOW}GitHub repo not detected. Set GITHUB_REPO env variable (e.g. owner/repo)${NC}"
        echo ""
        return 0
    fi

    SKIP_RELEASE=false

    if ! command -v gh &> /dev/null; then
        echo -e "${YELLOW}GitHub CLI (gh) not found. Install with: brew install gh${NC}"
        echo -e "${CYAN}Create release manually at: https://github.com/${GITHUB_REPO}/releases/new${NC}"
        SKIP_RELEASE=true
    else
        if ! gh auth status &>/dev/null; then
            echo -e "${YELLOW}GitHub CLI not authenticated. Run: gh auth login${NC}"
            SKIP_RELEASE=true
        fi
    fi

    if [ "$SKIP_RELEASE" = false ]; then
        if check_release_exists; then
            echo -e "${GREEN}Release ${TAG} already exists${NC}"
            if ! ask_yn "Update existing release?" "n"; then
                SKIP_RELEASE=true
            fi
        fi
    fi

    if [ "$SKIP_RELEASE" = false ]; then
        if ask_yn "Create GitHub Release ${TAG}?" "y"; then
            RELEASE_NOTES=""
            if [ -f "CHANGELOG.md" ]; then
                RELEASE_NOTES=$(awk "
                    /^## \[${VERSION}\]/ {found=1; next}
                    found && /^## \[/ {exit}
                    found {print}
                " CHANGELOG.md)
                RELEASE_NOTES=$(echo "$RELEASE_NOTES" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
            fi

            if [ -z "$RELEASE_NOTES" ]; then
                RELEASE_NOTES="Release version ${VERSION}"
            fi

            NOTES_FILE=$(mktemp)
            echo "$RELEASE_NOTES" > "$NOTES_FILE"

            if gh release create "${TAG}" \
                --title "Release ${VERSION}" \
                --notes-file "$NOTES_FILE" \
                --repo "${GITHUB_REPO}"; then
                echo -e "${GREEN}GitHub Release created successfully${NC}"
                echo -e "${CYAN}https://github.com/${GITHUB_REPO}/releases/tag/${TAG}${NC}"
            else
                echo -e "${RED}Failed to create GitHub Release${NC}"
            fi

            rm -f "$NOTES_FILE"
        fi
    fi

    echo ""
    return 0
}

step7_upload_npm() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Step 7: Upload to npm${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if check_npm_uploaded; then
        echo -e "${GREEN}Version ${VERSION} already exists on npm${NC}"
        if ! ask_yn "Upload anyway? (will fail if version exists)" "n"; then
            echo -e "${YELLOW}Skipped npm upload (version already exists)${NC}"
            echo ""
            return 0
        fi
    fi

    if ask_yn "Upload to npm?" "y"; then
        echo -e "${YELLOW}Publishing to npm...${NC}"
        if ! npm publish --access public; then
            echo -e "${RED}Upload to npm failed${NC}"
            return 1
        fi
        echo -e "${GREEN}Successfully published to npm!${NC}"
    else
        echo -e "${YELLOW}Skipped npm upload${NC}"
        echo -e "${CYAN}Upload manually with: npm publish --access public${NC}"
    fi
    echo ""
    return 0
}

step_summary() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Release Summary                                          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Version:     ${CYAN}${VERSION}${NC}"
    echo -e "  Tag:         ${CYAN}${TAG}${NC}"
    echo ""

    if [ -n "$GITHUB_REPO" ]; then
        if check_release_exists; then
            echo -e "  ${GREEN}GitHub Release:${NC}"
            echo -e "     https://github.com/${GITHUB_REPO}/releases/tag/${TAG}"
        else
            echo -e "  GitHub Release: Not created yet"
        fi
    fi

    if [ -d "dist" ] && [ "$(ls -A dist/*.js 2>/dev/null | wc -l)" -gt 0 ]; then
        echo -e "  ${GREEN}Package built: dist/${NC}"
    else
        echo -e "  Package: Not built"
    fi

    if check_npm_uploaded; then
        echo -e "  ${GREEN}npm: https://www.npmjs.com/package/${PROJECT_NAME}/v/${VERSION}${NC}"
    else
        echo -e "  npm: Not uploaded yet"
    fi

    echo ""
    echo -e "${GREEN}Release script completed!${NC}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Verify installation: npm install ${PROJECT_NAME}@${VERSION}"
    echo "  2. Update CHANGELOG.md with [Unreleased] section for next version"
    echo ""
    return 0
}

# Main execution logic
while true; do
    show_main_menu

    SELECTION="$MENU_SELECTION"

    if [ -z "$SELECTION" ]; then
        echo -e "${RED}No selection made. Please try again.${NC}"
        continue
    fi

    case "$SELECTION" in
        all|ALL|a|A)
            echo ""
            echo -e "${CYAN}Executing all steps with interactive prompts...${NC}"
            echo ""

            if ! step1_version_verification; then
                echo -e "${RED}Version verification failed. Exiting.${NC}"
                exit 1
            fi

            step2_check_status
            step3_clean_build || echo -e "${YELLOW}Step 3 failed, continuing...${NC}"
            step4_build_package || echo -e "${YELLOW}Step 4 failed, continuing...${NC}"
            step5_check_package || echo -e "${YELLOW}Step 5 failed, continuing...${NC}"
            step6_git_tag || echo -e "${YELLOW}Step 6 failed, continuing...${NC}"
            step6_5_create_github_release || echo -e "${YELLOW}Step 6.5 failed, continuing...${NC}"
            step7_upload_npm || echo -e "${YELLOW}Step 7 failed, continuing...${NC}"
            step_summary
            break
            ;;
        1) step1_version_verification || echo -e "${RED}Version verification failed.${NC}" ;;
        2) step2_check_status ;;
        3) step3_clean_build ;;
        4) step4_build_package ;;
        5) step5_check_package ;;
        6) step6_git_tag ;;
        7) step6_5_create_github_release ;;
        8) step7_upload_npm ;;
        9) step_summary ;;
        0) echo -e "${CYAN}Exiting...${NC}"; exit 0 ;;
        *) echo -e "${RED}Invalid selection. Please choose a valid option.${NC}" ;;
    esac
done
