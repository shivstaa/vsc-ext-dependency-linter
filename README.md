# pkg-json-dep-linter README

This is a VSCode extension designed for linting `package.json` dependency and dev dependency entries to track out-of-date dependencies.

## Features

- Provides errors and warnings on load and detection of `package.json` file
- `Warning:` out of date packages
  - fixed version
  - tilde patch-level version
  - caret minor-level version
  - pre-release tags
- `Error:` out of range packages

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

Must have `package.json` file in the environment.
