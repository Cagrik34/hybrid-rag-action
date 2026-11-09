# Security Policy

## Reporting a Vulnerability

Please do not disclose suspected security vulnerabilities through public issues, pull requests, or other public repository content.

This repository has GitHub Private Vulnerability Reporting enabled.

To report a vulnerability, use the repository Security area and select **Report a vulnerability**. This provides a private channel for sharing security-sensitive details with the maintainer.

When possible, include enough information to reproduce and assess the issue:

- affected component or workflow
- affected version or commit
- security impact
- reproduction conditions
- relevant logs or error output with secrets removed
- suggested remediation, if known

Do not include credentials, tokens, private keys, or unrelated personal information.

## Disclosure

Security reports should remain private while the issue is assessed and, when necessary, remediated and validated.

Public disclosure should be coordinated after an appropriate fix or mitigation is available.

## Scope

Security-relevant areas include, but are not limited to:

- GitHub Actions permissions and token handling
- repository and workflow supply-chain security
- untrusted Issue, Pull Request, and comment input
- prompt-injection boundaries
- repository path handling
- credential or secret exposure
- dependency vulnerabilities
- GitHub Models request handling
- generated repository comments and citations

## Supported Releases

Security fixes are prioritized for the latest supported release line and the current `v1` major release alias.

Users who require reproducible behavior may pin an exact release or commit according to their security requirements.
