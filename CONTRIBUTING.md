# Contributing to Hybrid RAG Action

Thanks for considering a contribution.

This repository uses a protected `main` branch and a CI-gated pull request workflow. Keep changes focused, testable, and consistent with the existing architecture.

## Development Requirements

- Node.js 24 or later
- npm
- Python 3 for ecosystem adapter tests
- actionlint for GitHub Actions workflow validation

Install JavaScript dependencies with:

```bash
npm ci
```

## Validation

Before opening or updating a pull request, run:

```bash
npm audit --audit-level=high
npm test
npm run build
node --check dist/index.js
git diff --exit-code dist/
python -m unittest ecosystem.test_ecosystem_integrations
actionlint
```

## Distribution Bundle

This is a JavaScript GitHub Action. Source or runtime dependency changes may change `dist/`.

After relevant changes:

```bash
npm run build
git diff --exit-code dist/
```

If rebuilding intentionally changes `dist/`, include the generated distribution changes in the same pull request.

## Pull Requests

Create changes on a dedicated branch and submit them through a pull request to `main`.

The protected `main` branch requires:

- GitHub Actions workflow static validation
- Node.js 24 validation on Ubuntu
- Node.js 24 validation on Windows
- Node.js 24 validation on macOS

Explain what changed, why it is needed, how it was validated, and whether it changes permissions, the public Action interface, or compatibility.

## Dependency Updates

Patch and minor dependency updates must remain compatible with the current architecture and pass the complete validation suite.

Major dependency updates that require architectural migration or introduce breaking runtime or module changes must be reviewed as migrations rather than routine upgrades.

## Public Interface Changes

When applicable, keep these surfaces synchronized:

- `action.yml`
- `README.md`
- source implementation
- tests
- workflow examples
- Marketplace-facing documentation

## Security

Do not publish suspected vulnerabilities in a public issue or pull request.

Follow the private reporting instructions in [SECURITY.md](SECURITY.md).

## License

By contributing to this repository, you agree that your contribution may be distributed under the repository MIT License.
