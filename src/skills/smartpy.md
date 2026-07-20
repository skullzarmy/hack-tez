---
title: "SmartPy v0.17+"
description: "Canonical modern SmartPy syntax reference for writing Tezos smart contracts. Covers module/entrypoint decorators, type system, inter-contract calls, crypto primitives, and testing."
tags: [tezos, smartpy, smart-contracts, python, blockchain]
---
# Skill: SmartPy v0.17+ LLM Reference

Fetched from https://smartpy.tezos.com/llm.txt — canonical modern SmartPy syntax.

## Key Syntax (v0.17+)

- `@sp.module` decorator for contract modules
- `@sp.entrypoint` for public entrypoints  
- `@sp.private(with_storage="read-only")` for private methods
- `assert` instead of `sp.verify()`
- `raise` instead of `sp.failwith()`
- `sp.cast()` instead of `sp.set_type()`
- Direct `self.data.x = val` instead of `self.init()`
- Native `if/else/for/while/match/case` instead of `sp.if_()`
- `sp.Some()` / `.unwrap_some()` instead of `.open_some()`
- No `sp.local()` — use plain variables

## Types (new system)
```
sp.nat, sp.int, sp.string, sp.bool, sp.address, sp.bytes
sp.key, sp.key_hash, sp.signature, sp.timestamp
sp.record(field=type), sp.variant(opt=type)
sp.map[k,v], sp.big_map[k,v], sp.list[t], sp.set[t], sp.option[t]
sp.pair[a,b], sp.lambda_(a,b)
```

## Inter-contract calls
```python
# Call external contract entrypoint
contract = sp.contract(param_type, address, entrypoint="name").unwrap_some()
sp.transfer(param_value, sp.mutez(0), contract)
```

## Crypto
```python
sp.check_signature(key, signature, packed_bytes)  # returns bool
sp.pack(value)  # serialize to bytes
sp.blake2b(bytes), sp.sha256(bytes), sp.sha512(bytes)
```

## Testing
```python
@sp.add_test()
def test():
    scenario = sp.test_scenario("name", module)
    alice = sp.test_account("Alice")  # .address, .public_key, .secret_key
    contract = module.MyContract(args)
    scenario += contract
    contract.ep(params, _sender=alice)
    contract.ep(params, _valid=False)  # expect failure
    scenario.verify(contract.data.x == expected)
```

## Examples repo
https://gitlab.com/smartpy.io/smartpy/-/tree/main/wheels/smartpy-tezos-examples/smartpy_examples

## Tezos X note

SmartPy contracts deploy unchanged to the Michelson interface of Tezos X previewnet (`https://michelson.previewnet.tezosx.nomadic-labs.com`). Caveats: tickets are temporarily disabled there, storage burn matches L1, Michelson gas is capped at 3M per operation, and network resets wipe all deployed contracts. Consensus operations (delegation, voting) do not exist in the rollup context. See the `tezos-x` skill for the full picture.
