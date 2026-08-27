# Security Policy

## Supported Versions

Only the most recent release receives security fixes. Users are encouraged to
always use the latest version, available from the
[releases page](https://github.com/w-s-bitcoin/entropylab/releases) and the
[official website](https://entropylab.online).

| Version | Supported          |
| ------- | ------------------ |
| 0.1.3   | :white_check_mark: |
| < 0.1.3 | :x:                |

## Security Considerations

EntropyLab handles Bitcoin private keys, seed phrases, and other secret wallet
material. Its security posture rests on the following model:

- The tool is self-contained and designed for offline, air-gapped use. It does
  not intentionally transmit sensitive data to any server.
- The on-screen result of any derivation can only be as trustworthy as the
  code that produced it. Review the source, build from `src/`, and test the
  tool with published vectors before relying on it.
- Wallet security depends on the quality and secrecy of the entropy, seed
  phrase, passphrase, or private key supplied by the user, and on the
  integrity of the machine it runs on.
- Material involving loss of funds (incorrect derivations, exfiltration of
  secret data, injected script execution in the generated HTML, unexpected
  network egress) is treated as a security issue.

## Reporting a Vulnerability

Please report suspected security issues privately through
[GitHub Security Advisories](https://github.com/w-s-bitcoin/entropylab/security/advisories/new)
rather than opening a public issue. If private reporting is unavailable, reach
the maintainers through the [official website](https://entropylab.online).

Include the version, the affected input type and derivation path if relevant,
and a description of the impact. A maintainer will acknowledge the report and
coordinate a fix; scope it as narrowly as needed to reproduce responsibly.

## Disclaimer

This software is provided without warranty under the
[MIT License](LICENSE). Keep verified backups, and use it at your own risk.
