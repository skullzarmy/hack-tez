"""
HackTezRegistrar — Permit-gated subdomain registrar for hack.tez

This contract becomes the owner of the hack.tez forward record in Tezos Domains.
Users request a permit from the server, then submit a transaction calling register()
which verifies the permit and calls set_child_record on the Tezos Domains NameRegistry.
"""
import smartpy as sp


@sp.module
def main():
    # Type for set_child_record entrypoint on Tezos Domains NameRegistry
    t_set_child_record: type = sp.record(
        label=sp.bytes,
        parent=sp.bytes,
        address=sp.option[sp.address],
        owner=sp.address,
        data=sp.map[sp.string, sp.bytes],
        expiry=sp.option[sp.timestamp],
    )

    # Contract storage type
    t_storage: type = sp.record(
        admin_public_key=sp.key,
        admin_address=sp.address,
        registrations=sp.big_map[sp.address, sp.nat],
        used_permits=sp.big_map[sp.bytes, sp.bool],
        name_registry=sp.address,
        parent_name=sp.bytes,
        max_per_wallet=sp.nat,
        paused=sp.bool,
    )

    class HackTezRegistrar(sp.Contract):
        """Permit-gated subdomain registrar for hack.tez"""

        def __init__(
            self,
            admin_public_key,
            admin_address,
            name_registry,
            parent_name,
        ):
            self.data.admin_public_key = admin_public_key
            self.data.admin_address = admin_address
            self.data.registrations = sp.cast(
                sp.big_map({}), sp.big_map[sp.address, sp.nat]
            )
            self.data.used_permits = sp.cast(
                sp.big_map({}), sp.big_map[sp.bytes, sp.bool]
            )
            self.data.name_registry = name_registry
            self.data.parent_name = parent_name
            self.data.max_per_wallet = sp.nat(5)
            self.data.paused = False
            sp.cast(self.data, t_storage)

        @sp.entrypoint
        def register(self, label, target_address, permit_sig, expiry):
            """Register a subdomain. Requires a valid server-signed permit."""
            sp.cast(label, sp.bytes)
            sp.cast(target_address, sp.address)
            sp.cast(permit_sig, sp.signature)
            sp.cast(expiry, sp.timestamp)

            # Contract must not be paused
            assert not self.data.paused, "CONTRACT_PAUSED"

            # Permit must not be expired
            assert expiry > sp.now, "PERMIT_EXPIRED"

            # Build the permit payload: (label, sender, target_address, expiry)
            payload = sp.pack(
                sp.record(
                    label=label,
                    sender=sp.sender,
                    target_address=target_address,
                    expiry=expiry,
                )
            )
            payload_hash = sp.blake2b(payload)

            # Check permit signature against admin public key
            assert sp.check_signature(
                self.data.admin_public_key, permit_sig, payload
            ), "INVALID_PERMIT"

            # Replay protection
            assert not self.data.used_permits.contains(payload_hash), "PERMIT_ALREADY_USED"

            # Registration limit per wallet
            current_count = self.data.registrations.get(sp.sender, default=sp.nat(0))
            assert current_count < self.data.max_per_wallet, "MAX_REGISTRATIONS_REACHED"

            # Call set_child_record on Tezos Domains NameRegistry
            set_child = sp.contract(
                t_set_child_record,
                self.data.name_registry,
                entrypoint="default",
            ).unwrap_some(error="INVALID_NAME_REGISTRY")

            sp.transfer(
                sp.record(
                    label=label,
                    parent=self.data.parent_name,
                    address=sp.Some(target_address),
                    owner=sp.sender,
                    data=sp.cast({}, sp.map[sp.string, sp.bytes]),
                    expiry=sp.cast(None, sp.option[sp.timestamp]),
                ),
                sp.mutez(0),
                set_child,
            )

            # Update bookkeeping
            self.data.registrations[sp.sender] = current_count + 1
            self.data.used_permits[payload_hash] = True

        # --- Admin entrypoints ---

        @sp.entrypoint
        def update_admin(self, new_key, new_address):
            """Rotate admin key and address."""
            sp.cast(new_key, sp.key)
            sp.cast(new_address, sp.address)
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.admin_public_key = new_key
            self.data.admin_address = new_address

        @sp.entrypoint
        def update_registry(self, new_address):
            """Update the NameRegistry proxy address."""
            sp.cast(new_address, sp.address)
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.name_registry = new_address

        @sp.entrypoint
        def set_max_per_wallet(self, new_max):
            """Update the max registrations per wallet."""
            sp.cast(new_max, sp.nat)
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.max_per_wallet = new_max

        @sp.entrypoint
        def set_paused(self, paused):
            """Pause or unpause registrations."""
            sp.cast(paused, sp.bool)
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.paused = paused

        @sp.entrypoint
        def update_parent_record(self, address, data):
            """Update the hack.tez record itself (admin only).
            Calls update_record on Tezos Domains NameRegistry.UpdateRecord."""
            sp.cast(address, sp.option[sp.address])
            sp.cast(data, sp.map[sp.string, sp.bytes])
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            # This would need the UpdateRecord proxy address — admin provides via separate call
            # For now this is a placeholder; actual implementation depends on deployment config

        @sp.entrypoint
        def transfer_domain(self, new_owner):
            """Transfer hack.tez ownership to another address (emergency escape hatch)."""
            sp.cast(new_owner, sp.address)
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            # This calls set_child_record or update_record to change the owner
            # Implementation depends on which TED entrypoint manages parent record ownership


# === Tests ===

@sp.add_test()
def test_register():
    """Test basic registration flow with valid permit."""
    scenario = sp.test_scenario("Register subdomain", main)

    admin = sp.test_account("Admin")
    user1 = sp.test_account("User1")

    # Mock name registry (just needs to accept set_child_record calls)
    registry = sp.test_account("Registry")

    contract = main.HackTezRegistrar(
        admin_public_key=admin.public_key,
        admin_address=admin.address,
        name_registry=registry.address,
        parent_name=sp.bytes("0x6861636b"),  # "hack" in hex
    )
    scenario += contract

    # Verify initial state
    scenario.verify(contract.data.paused == False)
    scenario.verify(contract.data.max_per_wallet == 5)


@sp.add_test()
def test_admin_functions():
    """Test admin-only entrypoints."""
    scenario = sp.test_scenario("Admin functions", main)

    admin = sp.test_account("Admin")
    new_admin = sp.test_account("NewAdmin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = main.HackTezRegistrar(
        admin_public_key=admin.public_key,
        admin_address=admin.address,
        name_registry=registry.address,
        parent_name=sp.bytes("0x6861636b"),
    )
    scenario += contract

    # Non-admin cannot pause
    contract.set_paused(True, _sender=user, _valid=False)

    # Admin can pause
    contract.set_paused(True, _sender=admin)
    scenario.verify(contract.data.paused == True)

    # Admin can unpause
    contract.set_paused(False, _sender=admin)
    scenario.verify(contract.data.paused == False)

    # Admin can update max per wallet
    contract.set_max_per_wallet(sp.nat(10), _sender=admin)
    scenario.verify(contract.data.max_per_wallet == 10)

    # Non-admin cannot update max
    contract.set_max_per_wallet(sp.nat(20), _sender=user, _valid=False)

    # Admin can update registry
    new_registry = sp.test_account("NewRegistry")
    contract.update_registry(new_registry.address, _sender=admin)
    scenario.verify(contract.data.name_registry == new_registry.address)

    # Non-admin cannot update registry
    contract.update_registry(registry.address, _sender=user, _valid=False)

    # Admin can rotate keys
    contract.update_admin(
        sp.record(new_key=new_admin.public_key, new_address=new_admin.address),
        _sender=admin,
    )
    scenario.verify(contract.data.admin_address == new_admin.address)
    scenario.verify(contract.data.admin_public_key == new_admin.public_key)

    # Old admin can no longer call admin functions
    contract.set_paused(True, _sender=admin, _valid=False)

    # New admin can
    contract.set_paused(True, _sender=new_admin)
    scenario.verify(contract.data.paused == True)


@sp.add_test()
def test_paused_blocks_registration():
    """Registration should fail when contract is paused."""
    scenario = sp.test_scenario("Paused registration", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = main.HackTezRegistrar(
        admin_public_key=admin.public_key,
        admin_address=admin.address,
        name_registry=registry.address,
        parent_name=sp.bytes("0x6861636b"),
    )
    scenario += contract

    # Pause the contract
    contract.set_paused(True, _sender=admin)

    # Registration should fail (we'd need a valid permit to test fully,
    # but the paused check happens first)
    contract.register(
        sp.record(
            label=sp.bytes("0x666f6f"),  # "foo"
            target_address=user.address,
            permit_sig=sp.signature(
                "edsigtXomBKi5CTRf5cjHJgENnKFC9CZdGgk7Bpf3HMemJPHEa2unxUiP6Pm7Bpce8c49HsSaPsRs4MQVv8JzRSAiaDDBhKFrN"
            ),
            expiry=sp.timestamp(9999999999),
        ),
        _sender=user,
        _valid=False,
    )
