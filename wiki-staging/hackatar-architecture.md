---
title: "Hackatars — Your hack.tez Avatar"
slug: "hackatar-architecture"
summary: "What Hackatars are, where you’ll see them, and how they work at a high level."
category: "hacktez"
tags: [hackatar, avatar, identity]
status: "draft"
author: "admin.hack.tez"
---

# Hackatars — Your hack.tez Avatar

Hackatars are the small, unique avatars you’ll see next to names in the hack.tez world. They’re fast, consistent, and tied to your domain — a simple way to recognize people at a glance.

## At a Glance

- Tied to your domain: each label (like `alice.hack.tez`) has a matching Hackatar.
- Always the same: your avatar looks identical wherever it appears.
- Privacy‑friendly: no tracking, no personal data, no external requests from your browser beyond the image.
- Lightweight: loads quickly and caches well across the app.

## Where You’ll See Them

- On profile and article pages in the wiki.
- In chat lists and messages to show who’s speaking.
- In activity feeds or anywhere your domain is displayed.

## How It Works (High Level)

A Hackatar is generated from your domain label (e.g., `alice`). That label seeds a simple, deterministic process that picks colors and shapes, then renders a small image. Because the input never changes, the result never changes either — it’s stable across devices and sessions.

You don’t need to do anything special to get one: once you claim a domain, its Hackatar exists automatically.

## Animated or Static

Most places show a crisp static image. Some views may use a subtle animated version for extra flair. Either way, it’s the same avatar — just rendered differently.

## Changing Your Hackatar

Your Hackatar is based on the domain label itself. If you want a different look, you’d claim a different label. Cosmetic changes aren’t “edited” — they’re a property of the name.

## Tips

- Use your Hackatar as a quick visual signature when linking to your work.
- If you run into a broken image, reload the page — the avatar is served from the app and should cache after the first load.
