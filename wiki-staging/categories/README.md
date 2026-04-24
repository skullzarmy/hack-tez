---
title: "Category Staging"
slug: "categories"
summary: "Frontmatter schema for wiki categories (admin import)."
category: "meta"
tags: [categories, staging]
status: "draft"
author: "admin.hack.tez"
---

# Category Staging

Define categories as individual Markdown files with YAML frontmatter under `wiki-staging/categories/`.

Frontmatter Schema
- name: Required string. Display name in the UI.
- slug: Optional string. Kebab-case; defaults to filename.
- description: Optional string. Shown on the category page/link.
- sortOrder: Optional integer. Lower numbers appear first.

Example
---
name: "Tooling"
slug: "tooling"
description: "SDKs, CLIs, and developer tools."
sortOrder: 30
---

