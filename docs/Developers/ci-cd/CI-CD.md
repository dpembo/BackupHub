# CI/CD & GitHub Actions

This document describes the CI/CD workflows and GitHub Actions used in the Orchelium project.

## Overview

Orchelium uses GitHub Actions for continuous integration and deployment. The workflows are defined in `.github/workflows/` and automate tasks such as linting, testing, and release management.

## Workflows

### 1. Release Workflow (`Release.yml`)
- **Purpose:** Automates the release process, including version bumping, changelog generation, and publishing.
- **Triggers:** Manual dispatch or push to main branch.
- **Key Steps:**
  - Checkout code
  - Set up Node.js
  - Install dependencies
  - Run tests
  - Bump version and generate changelog
  - Create GitHub release

### 2. ESLint Workflow (`eslint.yml`)
- **Purpose:** Runs ESLint on the codebase to enforce code quality and style.
- **Triggers:** On push and pull request to main and feature branches.
- **Key Steps:**
  - Checkout code
  - Set up Node.js
  - Install dependencies
  - Run ESLint

## Adding or Modifying Workflows
- Workflows are defined in YAML files under `.github/workflows/`.
- To add a new workflow, create a new YAML file in this directory.
- Refer to [GitHub Actions documentation](https://docs.github.com/en/actions) for syntax and best practices.

## Secrets and Environment Variables
- Sensitive data (tokens, credentials) should be stored as GitHub repository secrets.
- Reference secrets in workflow files using `${{ secrets.SECRET_NAME }}`.

## References
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Orchelium Workflows](../../.github/workflows/)
