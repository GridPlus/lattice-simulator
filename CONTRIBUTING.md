# Contributing to the Lattice Simulator

Thanks for helping improve the Lattice Simulator! This document describes the
expectations for filing issues, proposing changes, and submitting pull requests.

## Getting Started

1. Fork the repository and create a feature branch from `main`.
2. Install dependencies with `pnpm install` (Node.js ≥ 18 is required).
3. Review `README.md` plus `docs/DEVELOPMENT.md` for an overview of the local
   workflow, architecture, and tooling.

## Development Workflow

- Use the provided scripts for common tasks:
  - `pnpm dev` – run the simulator locally.
  - `pnpm lint`, `pnpm format:check`, `pnpm type-check`, `pnpm test`.
- Ensure new features or fixes include adequate tests (unit, integration, or
  Vitest snapshots as appropriate).
- Keep changes focused. Separate unrelated fixes into different pull requests.

## Commit & PR Guidelines

- Follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced
  via `commitlint`).
- Run `pnpm lint`, `pnpm type-check`, and `pnpm test` before opening a PR; CI
  will run the same commands.
- Update docs (README, architecture notes, etc.) when behavior or interfaces
  change.
- Reference existing issues in PR descriptions when applicable.

## Coding Standards

- Prefer TypeScript with strict typing. Avoid `any` unless absolutely necessary.
- Reuse shared helpers under `src/shared` instead of duplicating logic.
- Keep UI/server boundaries clean: do not import server modules into client code
  (and vice versa).
- Add succinct comments only where code intent is non-obvious.

## Issue Reporting

- Use GitHub Issues for bugs or feature ideas.
- Provide reproduction steps, expected vs actual behavior, and simulator/network
  details.
- For security-sensitive reports, **do not** open a public issue; follow
  `SECURITY.md` instead.

## Pull Request Checklist

- [ ] Tests pass locally (`pnpm test`).
- [ ] Lint and type checks succeed (`pnpm lint:check`, `pnpm type-check`).
- [ ] Documentation updates included (if needed).
- [ ] Screenshots or recordings added for UI changes (if helpful).
- [ ] Linked issues referenced and PR description explains the change clearly.

We appreciate your contributions and look forward to building a great simulator
together!
