# Development Guide

## Code Quality & Formatting

This project uses modern code quality tools to ensure consistent, maintainable
code.

### Tools Used

- **ESLint**: Static code analysis with TypeScript, React, and accessibility
  rules
- **Prettier**: Code formatting
- **Husky**: Git hooks for automation
- **lint-staged**: Run linters on staged files only
- **Commitlint**: Enforce conventional commit messages

### Available Scripts

```bash
# Format all files
pnpm format

# Check formatting without fixing
pnpm format:check

# Lint and fix issues
pnpm lint

# Check linting without fixing
pnpm lint:check

# Type check
pnpm type-check
```

### Pre-commit Workflow

When you commit code, the following happens automatically:

1. **lint-staged** runs on staged files:
   - Prettier formats the code
   - ESLint fixes auto-fixable issues
2. **Type checking** runs if TypeScript files are staged
3. **Commit message** is validated for conventional commit format

### Conventional Commits

Use this format for commit messages:

```
type(scope): description

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`,
`ci`, `build`, `revert`

**Examples**:

```bash
feat: add user authentication
fix: resolve memory leak in WebSocket handler
docs: update API documentation
refactor: simplify error handling logic
```

### IDE Setup

The project works with any editor, but VS Code users might want to install:

- ESLint extension
- Prettier extension
- Tailwind CSS IntelliSense

### Skipping Hooks

If needed (rare cases), you can skip hooks:

```bash
git commit --no-verify -m "emergency fix"
```

### Configuration Files

- `.prettierrc.json` - Prettier configuration
- `eslint.config.mjs` - ESLint rules (flat config)
- `commitlint.config.js` - Conventional commit rules
- `.husky/` - Git hooks
- `package.json` - lint-staged configuration
