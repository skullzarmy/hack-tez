---
title: "SmartPy Quickstart"
slug: "smartpy-quickstart"
summary: "From zero to a deployed SmartPy contract on ghostnet."
category: "contracts"
tags: [smartpy, contracts, python]
status: "draft"
author: "admin.hack.tez"
---

# SmartPy Quickstart

SmartPy is a Pythonic DSL for writing Tezos smart contracts that compile to Michelson.

## Install and Run
```bash
pip install smartpy-tezos
python contract/hack_tez_registrar.py  # example from this repo
```

## Key Concepts
- Entry points: methods that can be called by users/contracts.
- Storage: contract state; types matter.
- Views: read-only helpers.

## Testing
SmartPy includes unit test primitives and a CLI. Write tests alongside contracts and assert storage changes and emitted operations.

## References
- https://smartpy.io/

