/**
 * Commit message contract.
 *
 * Conventional Commits, enforced by the commit-msg git hook so the rule is
 * mechanical rather than a review comment. The header budget is tighter than
 * commitlint's default because a 100-character subject does not fit a terminal
 * or a GitHub sidebar.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "subject-full-stop": [2, "never", "."],
    "body-max-line-length": [2, "always", 100],
  },
};
