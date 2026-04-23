---
title: "SmartPy — Overview and Where It Fits"
slug: "smartpy-quickstart"
summary: "What SmartPy is, when to use it, how it fits in the Tezos stack, and where to go next."
category: "contracts"
tags: [smartpy, contracts, python, michelson, testing, tooling]
status: "draft"
author: "admin.hack.tez"
---

# SmartPy — What It Is and When To Use It

SmartPy is a Pythonic language for writing Tezos smart contracts. You author contracts in a safe, strongly‑typed subset of Python; SmartPy compiles them to efficient Michelson, the native low‑level language of Tezos.

Why teams pick SmartPy:
- Pythonic syntax: fast onboarding for Python‑literate teams.
- First‑class Tezos types: strong typing for storage and parameters (e.g., `sp.TInt`, `sp.TAddress`, `sp.TMap`).
- Predictable output: compilation targets plain Michelson, so you keep full compatibility with Tezos tooling.
- Built‑in testing: unit‑test primitives and a simple scenario runner to simulate entrypoints and assert storage changes.

When SmartPy is a good fit:
- You want a high‑level language without leaving Tezos conventions behind.
- You’ll ship standard contracts (FA2 tokens, multisigs, registries, governance helpers) and value a rich template set.
- Your stack already uses TypeScript on the dApp side (Taquito/Octez Connect) and you want clean Michelson for deployment.

How SmartPy fits in the stack:
- Authoring: write `contract.py` with classes that inherit from `sp.Contract`.
- Compilation: SmartPy compiles to `.tz` Michelson + artifacts (storage/type) for deployment and auditing.
- Deployment: originate the compiled Michelson via SmartPy CLI, Octez client, or programmatically (Taquito).
- dApp integration: call entrypoints from the browser or server using Taquito or raw operation requests.
- Indexing/analytics: use TzKT to query storage, operations, and big‑maps for your contract.

## Minimal Example

```python
import smartpy as sp

class Counter(sp.Contract):
    def __init__(self, initial=0):
        self.init(value=sp.int(initial))

    @sp.entry_point
    def increment(self, delta):
        sp.set_type(delta, sp.TInt)
        self.data.value += delta

    @sp.entry_point
    def reset(self):
        self.data.value = 0

@sp.add_test(name="Counter basic")
def test():
    s = sp.test_scenario()
    c = Counter(initial=5)
    s += c
    c.increment(3)
    s.verify(c.data.value == 8)
    c.reset()
    s.verify(c.data.value == 0)
```

What this shows:
- Explicit types and deterministic updates to storage (`self.data`).
- Two entrypoints with clear parameter typing and checks.
- A test scenario that simulates calls and asserts post‑conditions.

## Tooling You’ll Use

- Web IDE (templates + simulator): https://smartpy.io/ide
- Tutorials and templates: https://smartpy.io/ide?templates=true
- CLI and toolchain: https://smartpy.io/docs/cli
- Patterns and best practices: https://smartpy.io/docs/patterns

Typical local workflow (high‑level):
1) Install the toolchain: `pip install smartpy-tezos`
2) Write and test in Python files alongside your project.
3) Compile to Michelson for deployment.
4) Originate on a testnet (then mainnet) and integrate with your dApp.

## Practical Notes

- Types and annotations matter: Tezos enforces types at the Michelson level; define storage and parameter types explicitly.
- Prefer big‑maps for sparse or unbounded data; keep storage minimal to control costs.
- Unit test early: SmartPy’s `sp.test_scenario()` is quick and prevents costly on‑chain iterations.
- Deployment is tool‑agnostic: compiled Michelson works with Octez client, Taquito, or any infra you already use.

## Where to Go Next

- Docs home: https://smartpy.io/
- CLI reference: https://smartpy.io/docs/cli
- IDE templates: https://smartpy.io/ide?templates=true
- Patterns: https://smartpy.io/docs/patterns
