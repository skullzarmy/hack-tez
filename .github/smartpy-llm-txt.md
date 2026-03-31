---
description:
globs:
alwaysApply: true
---

# SmartPy

> SmartPy is a comprehensive solution for developing, testing, and deploying smart contracts on the Tezos blockchain. It provides a high-level, Python-like language with static type checking that transpiles to Michelson (Tezos' native smart contract language).

SmartPy code looks and behaves much like Python but is not actually Python. It is a domain-specific language with types, structures, and limitations specific to the Tezos blockchain. This documentation covers the latest SmartPy syntax (v0.17+), which uses modern Python features like type annotations and pattern matching. The older syntax using "T" prefixed types (like `sp.TInt`) is deprecated.

## File Pattern Matching

```
*.py
*.spy
*.ipynb
```

This rule applies specifically to SmartPy (`*.py` and `*.spy`) contract and module files and Jupyter notebooks (`*.ipynb`).

SmartPy files (`.spy`) contain only SmartPy code and can import other `.spy` files. A single `.py` file can contain both SmartPy code (in modules designated with the `@sp.module` decorator) and Python code (for test scenarios).

## Core Concepts

- [Modules](https://smartpy.tezos.com/manual/syntax/modules.html): SmartPy code is structured in modules defined using the `@sp.module` decorator or within `spy` files.
- [Type System](https://smartpy.tezos.com/manual/data-types/types.html): SmartPy has a rich type system including primitives (nat, int, string), collections (map, big_map, list), and user-defined types (record, variant).
- [Smart Contracts](https://smartpy.tezos.com/manual/syntax/contracts.html): Contracts are created by defining a class that inherits from `sp.Contract` or from another contract class. The public methods are called entrypoints.
- [Testing](https://smartpy.tezos.com/manual/scenarios/test_scenarios.html): SmartPy includes a scenario-based testing framework for contract verification.
- [Modules & Imports](https://smartpy.tezos.com/manual/syntax/modules.html): SmartPy supports modular development with imports from separate files.

## Syntax Reference

- [Type Definitions](https://smartpy.tezos.com/manual/data-types/types.html): Define types using the `: type` hint syntax with `sp.record`, `sp.variant`, etc.
- [Contract Storage](https://smartpy.tezos.com/manual/syntax/contracts.html): Initialize contract state directly on `self.data` with explicit type casting using `sp.cast`.
- [Entrypoints](https://smartpy.tezos.com/manual/syntax/contracts.html): Define contract entry points using the `@sp.entrypoint` decorator.
- [Private Methods](https://smartpy.tezos.com/manual/syntax/contracts.html): Create private methods with the `@sp.private` decorator.
- [Pattern Matching](https://smartpy.tezos.com/manual/data-types/options-and-variants.html): Use Python's native pattern matching (`match` and `case`) for variants and options.

## SmartPy vs Python

- SmartPy cannot use standard Python libraries within contract code (but they can be used in test code).
- Python f-strings are not supported within contract code (but can be used in test code).
- SmartPy has specific data types related to blockchain operations.
- For records, SmartPy uses the syntax `sp.record(field1=value1, field2=value2)` instead of Python classes.
- For variants, SmartPy uses the syntax `sp.variant("option1", value)` instead of Python enums.

## File Structure and Imports

SmartPy files (`.spy`) can be imported using standard Python import syntax:

```python
# Importing a SmartPy file
import calculator_main as cm

# Importing from a subdirectory
import utils.calculator_main as cm

# Importing from the standard library
import smartpy as sp
import smartpy.math as m
import smartpy.utils as utils
```

SmartPy searches for files based on the filepath in the import statement, looking in:

1. Local inline modules
2. SmartPy files relative to the current working directory
3. SmartPy files in PYTHONPATH directories
4. SmartPy files in site-packages directories

## Code Guide

Here's a complete guide to the new SmartPy syntax:

### Module Definition

SmartPy modules are now Python functions decorated with `@sp.module`.

```python
@sp.module
def my_module():
    pass
```

A module with a type and a contract definition:

```python
@sp.module
def main():
    t_storage: type = sp.record(x=sp.nat)

    class MyContract(sp.Contract):
        def __init__(self):
            self.data.x = 0
            sp.cast(self.data, t_storage)
```

### Type Definitions

Use the `: type` hint to explicitly name types.

```python
@sp.module
def my_module():
    t1: type = sp.unit
    t2: type = sp.nat
    t3: type = sp.int
    t4: type = sp.string
    t5: type = sp.bool
    t6: type = sp.address
    t7: type = sp.bytes
    t8: type = sp.record(field1=t1, field2=t2)
    t9: type = sp.variant(field1=t1, field2=t2)
    t10: type = sp.map[t6, t2]
    t11: type = sp.big_map[t6, t2]
    t12: type = sp.set[t2]
    t13: type = sp.list[t2]
    t14: type = sp.lambda_(t1, t2)
    t15: type = sp.option[t2]
    t16: type = sp.operation
    t17: type = sp.signature
    t18: type = sp.key
    t19: type = sp.key_hash
    t20: type = sp.timestamp
    t21: type = sp.chain_id
    t22: type = sp.bytes
    t23: type = sp.pair[t1, t2]
    t24: type = sp.bool
```

Use the new type system, not the old one with capital 'T'. For example use
`sp.pair[sp.nat, sp.int]` instead of `sp.TPair(sp.TNat, sp.TInt)`.

### Type Casting

Use `sp.cast` for explicit type casting instead of `sp.set_type()` or
`sp.set_type_expr()`.

```python
x = sp.cast({}, sp.map[sp.address, sp.int])
```

### Value Creation

Most types are inferred by default, but explicit definitions may be used to
avoid ambiguity.

```python
a = 1           # inferred as sp.int
b = sp.nat(1)   # explicitly sp.nat
c = sp.cast(1, sp.nat)  # explicitly sp.nat using sp.cast
```

Replace the old syntax for map definition by the new syntax.

```python
# Don't use
x = sp.map(l={}, tkey = sp.TAddress, tvalue = sp.TInt)
y = sp.big_map(l={}, tkey = sp.TAddress, tvalue = sp.TInt)

# Use
x = sp.cast({}, sp.map[sp.address, sp.int])
y = sp.cast(sp.big_map({}), sp.big_map[sp.address, sp.int])
```

### Contract Data Initialization

Contract data is now set directly on `self.data`.

Replace the old `self.init` method by assignments to `self.data`.

```python
# Don't use
self.init(
    field1 = value1,
    field2 = value2,
)

# Use
self.data.field1 = value1
self.data.field2 = value2
```

To specify data types explicitly, use `sp.cast`:

```python
# Don't use
self.init_type(sp.TRecord(field1=sp.TNat, field2=sp.TString))

# Use
sp.cast(self.data, sp.record(field1=sp.nat, field2=sp.string))
```

### Imports

Imports are now done explicitly within modules.

```python
# an inlined SmartPy module
@sp.module
def example():
    def foo():
        pass

# another inlined SmartPy module that uses the previous module
@sp.module
def my_module():
    # To use the `example` module you must import it
    import example
    def bar():
        example.foo()
```

The import only works if the module is visible within the file or if it exists
within a `.spy` that is visible within the Python path.

A way to make the module visible is to import it using a top file import (and
then import it within the module).

For example:

```python
from smartpy.templates import fa2_lib as fa2

# Alias the main template for FA2 contracts
main = fa2.main

@sp.module
def my_module():
    import main

    class MyFungibleContract(
        main.Fungible,
        main.OnchainviewBalanceOf,
    ):
        def __init__(self, contract_metadata, ledger, token_metadata):

            # Initialize on-chain balance view
            main.OnchainviewBalanceOf.__init__(self)

            # Initialize fungible token base class
            main.Fungible.__init__(self, contract_metadata, ledger, token_metadata)
```

### Lambda Definitions

Private lambdas are defined with the `@sp.private` decorator.

```python
@sp.module
def main():
    class C(sp.Contract):
        @sp.private(with_storage="read-only", with_operations=False)
        def multiply(self, a, b):
            return a * b

        @sp.entrypoint
        def ep(self):
            assert self.multiply(a=4, b=5) == 20
```

### Pattern Matching

Use native Python pattern-matching syntax (`match` and `case`).

```python
@sp.module
def main():
    class C(sp.Contract):
        @sp.entrypoint
        def ep(self):
            v = sp.variant.Circle(2)
            match v:
                case Circle(radius):
                    assert radius == 2
                case Rectangle(dimensions):
                    # Do something with dimensions
                    pass
```

You can use `case None` to match the `None` case when dealing with options.

```python
@sp.module
def main():
    class C(sp.Contract):
        @sp.entrypoint
        def ep(self):
            o = sp.Some(5)
            match o:
                case Some(value):
                    assert value == 5
                case None:
                    pass
```

### Entrypoint Assertions

The `check_no_incoming_transfer` parameter has been removed; use explicit
assertions instead.

```python
assert sp.amount == sp.tez(0), "No incoming transfer allowed"
```

### Local Variables

Don't use `sp.local`; instead, define variables directly.

```python
x = value
```

### Verification Statements

Replace `sp.verify()` with Python's native `assert`.

```python
assert x > 5, "X should be superior to 5"
```

### Optional Values

Use `.unwrap_some()` instead of `.open_some()`.

```python
value = optional_value.unwrap_some(error="Value is required")
```

### Flow Control

Replace SmartPy flow controls (`sp.if_()`, `sp.else_()`, `sp.for_()`,
`sp.while_()`) with native Python controls (`if`, `else`, `for`, `while`).

```python
if condition:
    # logic
else:
    # logic

for item in items:
    # logic
```

### Returning Values

Replace `sp.result()` with Python's native `return`.

```python
return result_value
```

Only return if there is not instruction after the block.

### Error Handling

Replace `sp.failwith()` with Python's native `raise`.

```python
raise "X should be superior to 5"
```

### Other Syntax Changes

- `sp.unit` → `()`
- `sp.pair(x, y)` → `(x, y)`
- Prefer `sp.mutez` directly rather than converting `sp.nat` to mutez using utilities like `utils.nat_to_mutez(x)`.

## Testing

SmartPy tests are written in standard Python code, not in SmartPy.
Therefore, you can do things in test scenarios that you can't do in modules,
such as using external libraries and calling external APIs.

This code defines a simple smart contract and then creates a test scenario for
it:

```python
@sp.module
def main():
    class MyCounter(sp.Contract):
        def __init__(self, initialValue: sp.nat):
            self.data.value = initialValue

        @sp.entrypoint
        def increment(self, update):
            assert update < 6, "Increment by less than 6"
            self.data.value += update


@sp.add_test()
def test():
    # Create a test scenario
    # Specify the output folder
    scenario = sp.test_scenario("MyCounter tests")

    # Create an instance of a contract
    # Automatically calls the __init__() method of the contract's class
    contract = main.MyCounter(5)
    # Add the contract to the scenario
    scenario += contract

    # Call an entrypoint
    contract.increment(3)
    # Call an entrypoint and expect it to fail
    contract.increment(12, _valid=False)
    # Check the expected value in the contract storage
    scenario.verify(contract.data.value == 8)
```

Note that in a test scenario, you can access contract storage only within `scenario` functions and contract calls.
For example, the last line of the example above checks the value of a number in contract storage within the `scenario.verify` function.

To create test accounts, pass a seed string to the `sp.test_account` function.
This function returns an object with the address of the test account in its `address` property.

Then, send requests from these accounts by passing them as the value of the `_sender` field in the call to the smart contract, as in this example:

```python
@sp.module
def main():
    class MyContract(sp.Contract):
        def __init__(self, admin):
            self.data.adminAccount = admin

        @sp.entrypoint
        def setAdmin(self, newAdmin):
            assert sp.sender == self.data.adminAccount, "Must be admin"
            self.data.adminAccount = newAdmin


@sp.add_test()
def test():
    # Create test accounts
    alice = sp.test_account("Alice")
    bob = sp.address("tz1QCVQinE8iVj1H2fckqx6oiM85CNJSK9Sx")

    scenario = sp.test_scenario("Admin test", main)
    contract = main.MyContract(alice.address)
    scenario += contract

    # Verify that non-admin account can't change the admin
    contract.setAdmin(bob, _sender=bob, _valid=False)
    # Verify that the admin can change the admin
    contract.setAdmin(
        bob,
        _sender=alice,
    )
    scenario.verify(contract.data.adminAccount == bob)
```
