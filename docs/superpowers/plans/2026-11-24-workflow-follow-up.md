# Workflow Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development where available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix reproducible issues in project recovery, page navigation, export selection, and the desktop workspace.

**Architecture:** Recover the source filename from the stored project path and keep the project name field aligned with the active record. Validate page jump input at submission and show an explicit placeholder for an outdated chapter selection. Size the desktop workspace to the remaining height so top-level messages do not push the document panes beyond the window.

**Tech Stack:** React, TypeScript, CSS, Playwright.

## Global Constraints

- Preserve browser-only processing and backwards compatibility with existing project archives.
- Keep the narrow-screen tab layout and preserve explicit selections where still valid.

- [x] Extend project restoration coverage to verify the original file name and existing project name after reopening.
- [x] Verify that editing a chosen chapter's heading leaves an explicit selection prompt and supports reselecting it.
- [x] Verify keyboard page jumps and reject fractional page numbers.
- [x] Check the desktop viewport at a wrapped header width with visible operation status, and retain narrow-screen regression coverage.
- [x] Reproduce all four issues before applying fixes. Pass 147 unit tests, 97 Edge browser tests, 18 Firefox and WebKit tests, and the production build before deployment.
