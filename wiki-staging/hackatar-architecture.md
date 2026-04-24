---
title: "Hackatar Architecture"
slug: "hackatar-architecture"
summary: "How Hackatars are deterministically generated and served from the API."
category: "hacktez"
tags: [hackatar, avatars, generative, gif]
status: "draft"
author: "admin.hack.tez"
---

# Hackatar Architecture

Hackatars are server‑rendered, deterministic avatars generated from a salted domain label. They’re lightweight, unique, and instantly recognizable — a generative identity you own with your domain.

## Pipeline

1. Seed: salted label → PRNG
2. Traits: select features via PRNG
3. Render: compose frames and encode as animated GIF (or static frame)
4. Cache: store in Netlify Blobs and serve at `/api/v1/hackatar/:label`

## Client Usage

Use the `<Hackatar>` component, which renders an `<img>` pointing to the API. Add `?static=1` for a single‑frame image. Avatars load fast and cache well, making them great for lists and chats.

## Design Notes

- Deterministic: the same label always yields the same art.
- Privacy‑preserving: no tracking pixels or client‑side RNG.
- Fun: glitch effects and traits keep the style playful and on‑brand.

## References

- See `src/lib/hackatar/` and `netlify/functions/api.mts`
