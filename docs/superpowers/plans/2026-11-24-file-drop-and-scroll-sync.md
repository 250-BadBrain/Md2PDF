# File Drop and Scroll Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development where available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import dropped Markdown files and eliminate preview jumps during synchronized scrolling.

**Architecture:** Send file input and application file drops through the same import workflow in `src/App.tsx`, while `src/Editor.tsx` handles image-only drops into the text. Schedule each direction of scroll sync at most once per frame and identify programmatic scrolls by their actual resulting position. Prepare virtualized navigation destinations before applying a single preview scroll.

**Tech Stack:** React, TypeScript, browser drag and drop, Playwright.

## Global Constraints

- All processing stays in the browser.
- Preserve image insertion, batch export, original filenames, page selection, and source and anchor navigation.

- [x] Reuse the file import path for Markdown drops. Verify a Markdown file dropped with an image resolves its relative image and exports under its original name.
- [x] Replace timer locks and delayed preview jumps. Verify continuous movement in both directions and navigation across virtualized pages.
- [x] Run `npm test`, `npm run build`, and the Edge browser suite. GitHub Actions runs the browser suite with Chromium, WebKit, and Firefox after push.
