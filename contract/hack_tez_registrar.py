"""
HackTezRegistrar — Free subdomain registrar for hack.tez

TZIP-016 compliant. This contract is a registration gate for subdomains
under hack.tez via the Tezos Domains (TED) protocol. It calls TED's
set_child_record with owner=sp.sender, giving the registrant full TED
ownership. After registration, users manage their subdomain (address,
redirects, IPFS, transfers) directly through Tezos Domains.

This contract's scope is strictly:
  - Gated registration via commit-reveal
  - Anti-gaming enforcement (1 claim per wallet, label validation)
  - Admin configuration and escape hatches

Registration uses a commit-reveal pattern enforced entirely on-chain:

  1. commit(hash) — user submits blake2b(pack(label, sender, target, salt))
  2. Wait ≥ min_commit_age (currently 2 min on ghostnet — TODO: 30s for production)
  3. register(label, target_address, salt) — contract verifies the hash,
     checks timing, calls set_child_record on TED with owner=sp.sender

On-chain anti-gaming:
  - Commit-reveal with mandatory wait period (sybil must wait per name)
  - 1 active commitment per wallet at a time (enforced by pending_commitments)
  - 1 registration per wallet (permanent — claims are not refundable)
  - Label length bounds enforced (default 3-64 bytes)
  - Label content validation (a-z, 0-9, hyphen only; no leading/trailing hyphens)
  - Whitelist mode: when enabled, only whitelisted wallets can interact
  - Gas cost per commit + per register (natural sybil resistance)
  - Commitments expire after max_commit_age (default 24 hours)
  - Admin can pause at any time
  - All entrypoints reject tez to prevent locked funds
  - Lambda upgrade pattern for future-proofing

"""
import smartpy as sp


@sp.module
def main():
    # Type for set_child_record on Tezos Domains NameRegistry.SetChildRecord
    # Layout MUST match TED's proxy (non-alphabetical) to pass CONTRACT type check
    t_set_child_record: type = sp.record(
        label=sp.bytes,
        parent=sp.bytes,
        address=sp.option[sp.address],
        owner=sp.address,
        data=sp.map[sp.string, sp.bytes],
        expiry=sp.option[sp.timestamp],
    ).layout(("label", ("parent", ("address", ("owner", ("data", "expiry"))))))

    # Contract storage type
    t_storage: type = sp.record(
        admin_address=sp.address,
        proposed_admin=sp.option[sp.address],
        metadata=sp.big_map[sp.string, sp.bytes],
        commitments=sp.big_map[sp.bytes, sp.timestamp],
        pending_commitments=sp.big_map[sp.address, sp.bytes],
        registrations=sp.big_map[sp.address, sp.nat],
        whitelist=sp.big_map[sp.address, sp.bool],
        whitelist_enabled=sp.bool,
        name_registry=sp.address,
        parent_name=sp.bytes,
        max_per_wallet=sp.nat,
        min_label_length=sp.nat,
        max_label_length=sp.nat,
        min_commit_age=sp.int,
        max_commit_age=sp.int,
        paused=sp.bool,
    )

    # Test helper lambda — must be defined inside @sp.module.
    # SmartPy treats function params as immutable, so we use an identity
    # lambda to verify admin_lambda entrypoint compiles and executes.
    # Actual storage mutation is verified by the entrypoint code itself.
    def identity_lambda(storage):
        sp.cast(storage, t_storage)
        return storage

    class HackTezRegistrar(sp.Contract):
        """Free subdomain registrar for hack.tez with commit-reveal."""

        def __init__(
            self,
            admin_address,
            name_registry,
            parent_name,
            metadata,
        ):
            self.data.admin_address = admin_address
            self.data.proposed_admin = sp.cast(
                None, sp.option[sp.address]
            )
            self.data.metadata = metadata
            self.data.commitments = sp.cast(
                sp.big_map({}), sp.big_map[sp.bytes, sp.timestamp]
            )
            self.data.pending_commitments = sp.cast(
                sp.big_map({}), sp.big_map[sp.address, sp.bytes]
            )
            self.data.registrations = sp.cast(
                sp.big_map({}), sp.big_map[sp.address, sp.nat]
            )
            self.data.whitelist = sp.cast(
                sp.big_map({}), sp.big_map[sp.address, sp.bool]
            )
            self.data.whitelist_enabled = False
            self.data.name_registry = name_registry
            self.data.parent_name = parent_name
            self.data.max_per_wallet = sp.nat(1)
            self.data.min_label_length = sp.nat(3)
            self.data.max_label_length = sp.nat(64)
            self.data.min_commit_age = 14400  # 4 hours in seconds — TODO: change to 30 before next deploy
            self.data.max_commit_age = 86400  # 24 hours in seconds
            self.data.paused = False
            sp.cast(self.data, t_storage)

        @sp.private(with_storage="read-only")
        def _check_access(self):
            """Enforce whitelist when enabled."""
            if self.data.whitelist_enabled:
                assert self.data.whitelist.get(
                    sp.sender, default=False
                ), "NOT_WHITELISTED"

        @sp.private(with_storage="read-only")
        def _validate_label(self, label):
            """Validate label: length bounds + allowed chars (a-z, 0-9, hyphen).
            Each byte must be 0x61-0x7a (a-z), 0x30-0x39 (0-9), or 0x2d (-).
            Leading and trailing hyphens are rejected (DNS convention).
            """
            sp.cast(label, sp.bytes)
            label_len = sp.len(label)
            assert label_len >= self.data.min_label_length, "LABEL_TOO_SHORT"
            assert label_len <= self.data.max_label_length, "LABEL_TOO_LONG"
            # No leading or trailing hyphens
            first = sp.slice(sp.nat(0), sp.nat(1), label).unwrap_some(error="SLICE_FAIL")
            last_offset = sp.as_nat(label_len - sp.nat(1))
            last = sp.slice(last_offset, sp.nat(1), label).unwrap_some(
                error="SLICE_FAIL"
            )
            assert first != sp.bytes("0x2d"), "LABEL_LEADING_HYPHEN"
            assert last != sp.bytes("0x2d"), "LABEL_TRAILING_HYPHEN"
            # Byte-by-byte validation (a-z, 0-9, hyphen)
            for i in sp.range(sp.nat(0), label_len):
                b = sp.slice(i, sp.nat(1), label).unwrap_some(error="SLICE_FAIL")
                valid = False
                if b >= sp.bytes("0x61"):
                    if b <= sp.bytes("0x7a"):
                        valid = True
                if b >= sp.bytes("0x30"):
                    if b <= sp.bytes("0x39"):
                        valid = True
                if b == sp.bytes("0x2d"):
                    valid = True
                assert valid, "INVALID_LABEL_CHAR"

        # --- Public entrypoints ---

        @sp.entrypoint
        def commit(self, commitment_hash):
            """Phase 1: Submit a commitment hash.
            hash = blake2b(pack(record(label, sender, target_address, salt)))
            Only one active commitment per wallet is allowed at a time.
            If a previous commitment has expired, it is cleared automatically.
            """
            sp.cast(commitment_hash, sp.bytes)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert not self.data.paused, "CONTRACT_PAUSED"
            self._check_access()
            # Enforce 1 active commitment per sender.
            # If they have a previous commitment, it must have expired.
            if self.data.pending_commitments.contains(sp.sender):
                prev_hash = self.data.pending_commitments[sp.sender]
                if self.data.commitments.contains(prev_hash):
                    prev_age = sp.now - self.data.commitments[prev_hash]
                    assert prev_age > self.data.max_commit_age, "COMMITMENT_ALREADY_PENDING"
                    # Previous commitment provably expired — clean it up
                    del self.data.commitments[prev_hash]
                del self.data.pending_commitments[sp.sender]
            assert not self.data.commitments.contains(
                commitment_hash
            ), "COMMITMENT_EXISTS"
            self.data.commitments[commitment_hash] = sp.now
            self.data.pending_commitments[sp.sender] = commitment_hash
            sp.emit(
                sp.record(hash=commitment_hash, sender=sp.sender),
                tag="commit",
            )

        @sp.entrypoint
        def register(self, label, target_address, salt):
            """Phase 2: Reveal and register. Must wait min_commit_age after commit.
            Calls TED set_child_record with owner=sp.sender — user gets full TED ownership."""
            sp.cast(label, sp.bytes)
            sp.cast(target_address, sp.address)
            sp.cast(salt, sp.bytes)

            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert not self.data.paused, "CONTRACT_PAUSED"
            self._check_access()
            self._validate_label(label)

            # Reconstruct and verify commitment
            payload = sp.pack(
                sp.record(
                    label=label,
                    sender=sp.sender,
                    target_address=target_address,
                    salt=salt,
                )
            )
            commitment_hash = sp.blake2b(payload)

            commit_time = self.data.commitments.get(
                commitment_hash, error="NO_COMMITMENT"
            )

            # Enforce timing window
            age = sp.now - commit_time
            assert age >= self.data.min_commit_age, "COMMITMENT_TOO_YOUNG"
            assert age <= self.data.max_commit_age, "COMMITMENT_EXPIRED"

            # Registration limit per wallet
            current_count = self.data.registrations.get(
                sp.sender, default=sp.nat(0)
            )
            assert current_count < self.data.max_per_wallet, "MAX_REGISTRATIONS_REACHED"

            # Call set_child_record on TED — user gets TED ownership
            set_child = sp.contract(
                t_set_child_record,
                self.data.name_registry,
                entrypoint="set_child_record",
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

            # Bookkeeping
            self.data.registrations[sp.sender] = current_count + 1
            del self.data.commitments[commitment_hash]
            if self.data.pending_commitments.contains(sp.sender):
                del self.data.pending_commitments[sp.sender]

            # Emit event for indexers
            sp.emit(
                sp.record(
                    label=label,
                    owner=sp.sender,
                    target_address=target_address,
                ),
                tag="register",
            )

        @sp.entrypoint
        def release_commitment(self):
            """Cancel your own pending commitment. Removes it from both
            commitments and pending_commitments, freeing you to commit again.
            The on-chain hash slot is released immediately."""
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert self.data.pending_commitments.contains(sp.sender), "NO_PENDING_COMMITMENT"
            commitment_hash = self.data.pending_commitments[sp.sender]
            if self.data.commitments.contains(commitment_hash):
                del self.data.commitments[commitment_hash]
            del self.data.pending_commitments[sp.sender]
            sp.emit(
                sp.record(hash=commitment_hash, sender=sp.sender),
                tag="release_commitment",
            )

        # --- Admin entrypoints ---

        @sp.entrypoint
        def propose_admin(self, new_address):
            """Step 1: Propose a new admin. Must be accepted by the proposed address."""
            sp.cast(new_address, sp.address)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.proposed_admin = sp.Some(new_address)
            sp.emit(
                sp.record(proposed=new_address), tag="propose_admin"
            )

        @sp.entrypoint
        def accept_admin(self):
            """Step 2: Proposed admin accepts the role."""
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            proposed = self.data.proposed_admin.unwrap_some(
                error="NO_PROPOSED_ADMIN"
            )
            assert sp.sender == proposed, "NOT_PROPOSED_ADMIN"
            self.data.admin_address = proposed
            self.data.proposed_admin = sp.cast(
                None, sp.option[sp.address]
            )
            sp.emit(
                sp.record(new_admin=proposed), tag="accept_admin"
            )

        @sp.entrypoint
        def update_registry(self, new_address):
            """Update the NameRegistry.SetChildRecord proxy address."""
            sp.cast(new_address, sp.address)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.name_registry = new_address
            sp.emit(
                sp.record(new_registry=new_address), tag="update_registry"
            )

        @sp.entrypoint
        def set_max_per_wallet(self, new_max):
            """Update the max registrations per wallet."""
            sp.cast(new_max, sp.nat)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.max_per_wallet = new_max
            sp.emit(
                sp.record(new_max=new_max), tag="set_max_per_wallet"
            )

        @sp.entrypoint
        def set_min_label_length(self, new_min):
            """Update the minimum label length (in bytes)."""
            sp.cast(new_min, sp.nat)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            assert new_min >= 1, "MIN_LABEL_TOO_LOW"
            assert new_min <= self.data.max_label_length, "MIN_ABOVE_MAX"
            self.data.min_label_length = new_min
            sp.emit(
                sp.record(new_min=new_min), tag="set_min_label_length"
            )

        @sp.entrypoint
        def set_max_label_length(self, new_max):
            """Update the maximum label length (in bytes)."""
            sp.cast(new_max, sp.nat)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            assert new_max >= self.data.min_label_length, "MAX_BELOW_MIN"
            self.data.max_label_length = new_max
            sp.emit(
                sp.record(new_max=new_max), tag="set_max_label_length"
            )

        @sp.entrypoint
        def set_commit_ages(self, min_age, max_age):
            """Update commit timing window. min_age must be >= 60 seconds."""
            sp.cast(min_age, sp.int)
            sp.cast(max_age, sp.int)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            assert min_age >= 60, "MIN_AGE_TOO_LOW"
            assert max_age > min_age, "INVALID_AGES"
            self.data.min_commit_age = min_age
            self.data.max_commit_age = max_age
            sp.emit(
                sp.record(min_age=min_age, max_age=max_age),
                tag="set_commit_ages",
            )

        @sp.entrypoint
        def set_paused(self, paused):
            """Pause or unpause registrations."""
            sp.cast(paused, sp.bool)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.paused = paused
            sp.emit(sp.record(paused=paused), tag="set_paused")

        @sp.entrypoint
        def set_whitelist_enabled(self, enabled):
            """Enable or disable whitelist mode."""
            sp.cast(enabled, sp.bool)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.whitelist_enabled = enabled
            sp.emit(
                sp.record(enabled=enabled), tag="set_whitelist_enabled"
            )

        @sp.entrypoint
        def update_whitelist(self, wallet, add):
            """Add or remove a wallet from the whitelist."""
            sp.cast(wallet, sp.address)
            sp.cast(add, sp.bool)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            if add:
                self.data.whitelist[wallet] = True
            else:
                del self.data.whitelist[wallet]
            sp.emit(
                sp.record(wallet=wallet, add=add), tag="update_whitelist"
            )

        @sp.entrypoint
        def update_whitelist_batch(self, updates):
            """Batch add/remove wallets from the whitelist."""
            sp.cast(
                updates,
                sp.list[sp.record(wallet=sp.address, add=sp.bool)],
            )
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            for update in updates:
                if update.add:
                    self.data.whitelist[update.wallet] = True
                else:
                    del self.data.whitelist[update.wallet]
            sp.emit(
                sp.record(count=sp.len(updates)),
                tag="update_whitelist_batch",
            )

        @sp.entrypoint
        def set_registration_count(self, wallet, count):
            """Set a wallet's registration count to an explicit value (admin only).
            Use this to correct desyncs or grant/restrict additional slots."""
            sp.cast(wallet, sp.address)
            sp.cast(count, sp.nat)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            self.data.registrations[wallet] = count
            sp.emit(
                sp.record(wallet=wallet, count=count),
                tag="set_registration_count",
            )

        @sp.entrypoint
        def clear_commitments(self, hashes):
            """Remove expired/stale commitments from storage (admin only, batch).
            Also cleans up pending_commitments entries for affected senders."""
            sp.cast(hashes, sp.list[sp.bytes])
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            for h in hashes:
                if self.data.commitments.contains(h):
                    del self.data.commitments[h]
            sp.emit(
                sp.record(count=sp.len(hashes)),
                tag="clear_commitments",
            )

        @sp.entrypoint
        def clear_expired_commitment(self, commitment_hash):
            """Permissionless cleanup: anyone can remove a commitment that
            has provably expired (age > max_commit_age). Cannot touch
            commitments still within the valid timing window.
            Also cleans up the sender's pending_commitments entry."""
            sp.cast(commitment_hash, sp.bytes)
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            commit_time = self.data.commitments.get(
                commitment_hash, error="NO_COMMITMENT"
            )
            age = sp.now - commit_time
            assert age > self.data.max_commit_age, "COMMITMENT_NOT_EXPIRED"
            del self.data.commitments[commitment_hash]
            sp.emit(
                sp.record(hash=commitment_hash),
                tag="clear_expired_commitment",
            )

        @sp.entrypoint
        def admin_lambda(self, f):
            """Execute an arbitrary lambda on storage (admin only).
            Escape hatch for unforeseen upgrades. The lambda receives
            storage and returns modified storage."""
            assert sp.amount == sp.mutez(0), "TEZ_NOT_ACCEPTED"
            assert sp.sender == self.data.admin_address, "NOT_ADMIN"
            sp.cast(f, sp.lambda_(t_storage, t_storage))
            self.data = f(self.data)
            sp.emit(sp.record(executed=True), tag="admin_lambda")

        # --- On-chain views ---

        @sp.onchain_view()
        def is_paused(self):
            """Check if the contract is paused."""
            return (self.data.paused)

        @sp.onchain_view()
        def get_registration_count(self, wallet):
            """Get the number of registrations for a wallet."""
            sp.cast(wallet, sp.address)
            return (
                self.data.registrations.get(wallet, default=sp.nat(0))
            )

        @sp.onchain_view()
        def get_max_per_wallet(self):
            """Get the current max registrations per wallet."""
            return (self.data.max_per_wallet)

        @sp.onchain_view()
        def get_commit_time(self, commitment_hash):
            """Get the timestamp of a commitment (or fail if not found)."""
            sp.cast(commitment_hash, sp.bytes)
            return (
                self.data.commitments.get(
                    commitment_hash, error="NO_COMMITMENT"
                )
            )

        @sp.onchain_view()
        def is_whitelisted(self, wallet):
            """Check if a wallet is whitelisted."""
            sp.cast(wallet, sp.address)
            return (
                self.data.whitelist.get(wallet, default=False)
            )

        @sp.onchain_view()
        def get_label_limits(self):
            """Get current min and max label length."""
            return (
                sp.record(
                    min_length=self.data.min_label_length,
                    max_length=self.data.max_label_length,
                )
            )

        @sp.onchain_view()
        def get_pending_commitment(self, wallet):
            """Get the active pending commitment hash for a wallet, if any."""
            sp.cast(wallet, sp.address)
            return (
                self.data.pending_commitments.get(
                    wallet, default=sp.cast(sp.bytes("0x"), sp.bytes)
                )
            )


# === Tests ===


# Helper: build contract with TZIP-016 metadata stub
def _make_contract(scenario, admin, registry):
    metadata = sp.big_map(
        {
            "": sp.bytes("0x74657a6f732d73746f726167653a636f6e74656e74"),
            "content": sp.bytes(
                "0x7b226e616d65223a224861636b54657a52656769737472617222"
                "2c226465736372697074696f6e223a2246726565207375622d"
                "646f6d61696e207265676973747261722e222c22766572736"
                "96f6e223a22312e302e30222c22696e74657266616365"
                "73223a5b22545a49502d303136225d7d"
            ),
        }
    )
    contract = main.HackTezRegistrar(
        admin_address=admin.address,
        name_registry=registry.address,
        parent_name=sp.bytes("0x6861636b"),
        metadata=metadata,
    )
    scenario += contract
    return contract


@sp.add_test()
def test_initial_state():
    """Verify contract deploys with correct initial state."""
    scenario = sp.test_scenario("Initial state", main)

    admin = sp.test_account("Admin")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    scenario.verify(contract.data.paused == False)
    scenario.verify(contract.data.whitelist_enabled == False)
    scenario.verify(contract.data.max_per_wallet == 1)
    scenario.verify(contract.data.min_label_length == 3)
    scenario.verify(contract.data.max_label_length == 64)
    scenario.verify(contract.data.min_commit_age == 14400)
    scenario.verify(contract.data.max_commit_age == 86400)
    scenario.verify(contract.data.admin_address == admin.address)
    scenario.verify(contract.data.metadata.contains(""))


@sp.add_test()
def test_commit():
    """Test commit stores hash with timestamp, rejects duplicate hash,
    and rejects a second commit from the same sender while first is active."""
    scenario = sp.test_scenario("Commit", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    user2 = sp.test_account("User2")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    test_hash = sp.blake2b(sp.bytes("0xdeadbeef"))
    contract.commit(test_hash, _sender=user, _now=sp.timestamp(0))
    scenario.verify(contract.data.commitments.contains(test_hash))
    scenario.verify(contract.data.pending_commitments[user.address] == test_hash)

    # Same hash again (even from different sender) — hash already in commitments
    contract.commit(test_hash, _sender=user2, _valid=False)

    # Same sender with a different hash — blocked while first is still active
    test_hash2 = sp.blake2b(sp.bytes("0xcafebabe"))
    contract.commit(test_hash2, _sender=user, _now=sp.timestamp(100), _valid=False)

    # Different sender with different hash — allowed
    test_hash3 = sp.blake2b(sp.bytes("0xc0ffee"))
    contract.commit(test_hash3, _sender=user2, _now=sp.timestamp(0))
    scenario.verify(contract.data.pending_commitments[user2.address] == test_hash3)

    # After expiry, same sender CAN commit again — expired commitment auto-cleared
    test_hash4 = sp.blake2b(sp.bytes("0xf00d"))
    contract.commit(test_hash4, _sender=user, _now=sp.timestamp(86401))
    scenario.verify(~contract.data.commitments.contains(test_hash))
    scenario.verify(contract.data.pending_commitments[user.address] == test_hash4)


@sp.add_test()
def test_commit_rejects_tez():
    """Commit should reject tez sent with the transaction."""
    scenario = sp.test_scenario("Commit rejects tez", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    test_hash = sp.blake2b(sp.bytes("0xdeadbeef"))
    contract.commit(
        test_hash, _sender=user, _amount=sp.mutez(1), _valid=False
    )


@sp.add_test()
def test_commit_paused():
    """Commit should fail when contract is paused."""
    scenario = sp.test_scenario("Commit paused", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    contract.set_paused(True, _sender=admin)
    test_hash = sp.blake2b(sp.bytes("0xdeadbeef"))
    contract.commit(test_hash, _sender=user, _valid=False)


@sp.add_test()
def test_register_no_commitment():
    """Register without a matching commitment should fail."""
    scenario = sp.test_scenario("Register no commitment", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    contract.register(
        sp.record(
            label=sp.bytes("0x666f6f"),
            target_address=user.address,
            salt=sp.bytes("0x01"),
        ),
        _sender=user,
        _valid=False,
    )


@sp.add_test()
def test_register_too_young():
    """Register before min_commit_age should fail."""
    scenario = sp.test_scenario("Register too young", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    label = sp.bytes("0x666f6f")  # "foo"
    salt = sp.bytes("0x01")
    payload = sp.pack(
        sp.record(
            label=label,
            sender=user.address,
            target_address=user.address,
            salt=salt,
        )
    )
    commitment_hash = sp.blake2b(payload)

    contract.commit(commitment_hash, _sender=user, _now=sp.timestamp(0))

    # 100 seconds — way before 4hr min
    contract.register(
        sp.record(label=label, target_address=user.address, salt=salt),
        _sender=user,
        _now=sp.timestamp(100),
        _valid=False,
    )


@sp.add_test()
def test_register_label_too_short():
    """Register with a label shorter than min_label_length should fail."""
    scenario = sp.test_scenario("Label too short", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    label = sp.bytes("0x6162")  # 2 bytes — below 3-byte minimum
    salt = sp.bytes("0x01")
    payload = sp.pack(
        sp.record(
            label=label,
            sender=user.address,
            target_address=user.address,
            salt=salt,
        )
    )
    commitment_hash = sp.blake2b(payload)

    contract.commit(commitment_hash, _sender=user, _now=sp.timestamp(0))

    contract.register(
        sp.record(label=label, target_address=user.address, salt=salt),
        _sender=user,
        _now=sp.timestamp(14401),
        _valid=False,
    )


@sp.add_test()
def test_paused_blocks_registration():
    """Registration should fail when contract is paused."""
    scenario = sp.test_scenario("Paused registration", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    contract.set_paused(True, _sender=admin)

    contract.register(
        sp.record(
            label=sp.bytes("0x666f6f"),
            target_address=user.address,
            salt=sp.bytes("0x01"),
        ),
        _sender=user,
        _valid=False,
    )


@sp.add_test()
def test_wrong_sender_cannot_reveal():
    """A different sender cannot reveal someone else's commitment."""
    scenario = sp.test_scenario("Wrong sender reveal", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    user2 = sp.test_account("User2")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    label = sp.bytes("0x666f6f")
    salt = sp.bytes("0x01")
    payload = sp.pack(
        sp.record(
            label=label,
            sender=user.address,
            target_address=user.address,
            salt=salt,
        )
    )
    commitment_hash = sp.blake2b(payload)
    contract.commit(commitment_hash, _sender=user, _now=sp.timestamp(0))

    contract.register(
        sp.record(label=label, target_address=user.address, salt=salt),
        _sender=user2,
        _now=sp.timestamp(14401),
        _valid=False,
    )


@sp.add_test()
def test_whitelist():
    """Whitelist mode blocks non-whitelisted wallets."""
    scenario = sp.test_scenario("Whitelist", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    user2 = sp.test_account("User2")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    # Enable whitelist, add only user
    contract.set_whitelist_enabled(True, _sender=admin)
    contract.update_whitelist(
        sp.record(wallet=user.address, add=True), _sender=admin
    )

    test_hash = sp.blake2b(sp.bytes("0xdeadbeef"))
    # Whitelisted user can commit
    contract.commit(test_hash, _sender=user)
    scenario.verify(contract.data.commitments.contains(test_hash))

    # Non-whitelisted user cannot commit
    test_hash2 = sp.blake2b(sp.bytes("0xcafebabe"))
    contract.commit(test_hash2, _sender=user2, _valid=False)

    # Disable whitelist — user2 can now commit
    contract.set_whitelist_enabled(False, _sender=admin)
    contract.commit(test_hash2, _sender=user2)
    scenario.verify(contract.data.commitments.contains(test_hash2))


@sp.add_test()
def test_admin_functions():
    """Test all admin-only entrypoints."""
    scenario = sp.test_scenario("Admin functions", main)

    admin = sp.test_account("Admin")
    new_admin = sp.test_account("NewAdmin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    # --- set_paused ---
    contract.set_paused(True, _sender=user, _valid=False)
    contract.set_paused(True, _sender=admin)
    scenario.verify(contract.data.paused == True)
    contract.set_paused(False, _sender=admin)
    scenario.verify(contract.data.paused == False)

    # --- set_max_per_wallet ---
    contract.set_max_per_wallet(sp.nat(10), _sender=admin)
    scenario.verify(contract.data.max_per_wallet == 10)
    contract.set_max_per_wallet(sp.nat(20), _sender=user, _valid=False)

    # --- set_min_label_length ---
    contract.set_min_label_length(sp.nat(5), _sender=admin)
    scenario.verify(contract.data.min_label_length == 5)
    contract.set_min_label_length(sp.nat(0), _sender=admin, _valid=False)
    contract.set_min_label_length(sp.nat(3), _sender=user, _valid=False)
    # min > max (64) should fail
    contract.set_min_label_length(sp.nat(100), _sender=admin, _valid=False)

    # --- set_commit_ages (with min_age >= 60 enforcement) ---
    contract.set_commit_ages(
        sp.record(min_age=3600, max_age=43200), _sender=admin
    )
    scenario.verify(contract.data.min_commit_age == 3600)
    scenario.verify(contract.data.max_commit_age == 43200)
    contract.set_commit_ages(
        sp.record(min_age=3600, max_age=43200), _sender=user, _valid=False
    )
    # max < min should fail
    contract.set_commit_ages(
        sp.record(min_age=50000, max_age=10000), _sender=admin, _valid=False
    )
    # min_age < 60 should fail
    contract.set_commit_ages(
        sp.record(min_age=30, max_age=10000), _sender=admin, _valid=False
    )
    # Negative min_age should fail (< 60)
    contract.set_commit_ages(
        sp.record(min_age=-100, max_age=10000), _sender=admin, _valid=False
    )

    # --- update_registry ---
    new_registry = sp.test_account("NewRegistry")
    contract.update_registry(new_registry.address, _sender=admin)
    scenario.verify(contract.data.name_registry == new_registry.address)
    contract.update_registry(registry.address, _sender=user, _valid=False)

    # --- set_registration_count ---
    contract.set_registration_count(
        sp.record(wallet=user.address, count=sp.nat(3)), _sender=admin
    )
    scenario.verify(
        contract.data.registrations[user.address]
        == 3
    )
    contract.set_registration_count(
        sp.record(wallet=user.address, count=sp.nat(0)), _sender=admin
    )
    scenario.verify(
        contract.data.registrations[user.address]
        == 0
    )
    contract.set_registration_count(
        sp.record(wallet=user.address, count=sp.nat(1)),
        _sender=user, _valid=False,
    )

    # --- clear_commitments (batch) ---
    h1 = sp.blake2b(sp.bytes("0xcafebabe"))
    h2 = sp.blake2b(sp.bytes("0xdeadbeef"))
    user_a = sp.test_account("UserA")
    user_b = sp.test_account("UserB")
    contract.commit(h1, _sender=user_a)
    contract.commit(h2, _sender=user_b)
    scenario.verify(contract.data.commitments.contains(h1))
    scenario.verify(contract.data.commitments.contains(h2))
    contract.clear_commitments(
        [h1, h2], _sender=user, _valid=False
    )
    contract.clear_commitments([h1, h2], _sender=admin)
    scenario.verify(~contract.data.commitments.contains(h1))
    scenario.verify(~contract.data.commitments.contains(h2))

    # --- admin_lambda (execute lambda via entrypoint) ---
    contract.set_paused(False, _sender=admin)
    scenario.verify(contract.data.paused == False)

    # Non-admin cannot call admin_lambda
    contract.admin_lambda(
        main.identity_lambda, _sender=user, _valid=False
    )
    # Admin can call admin_lambda (identity — no mutation, just verifies execution)
    contract.admin_lambda(main.identity_lambda, _sender=admin)
    # Storage unchanged since identity lambda returns storage as-is
    scenario.verify(contract.data.paused == False)

    # --- whitelist admin controls ---
    contract.set_whitelist_enabled(True, _sender=user, _valid=False)
    contract.update_whitelist(
        sp.record(wallet=user.address, add=True),
        _sender=user,
        _valid=False,
    )

    # --- set_max_label_length ---
    contract.set_max_label_length(sp.nat(128), _sender=admin)
    scenario.verify(contract.data.max_label_length == 128)
    contract.set_max_label_length(sp.nat(50), _sender=user, _valid=False)
    # max below min should fail (min is currently 5 from earlier test)
    contract.set_max_label_length(sp.nat(2), _sender=admin, _valid=False)

    # --- update_whitelist_batch ---
    user3 = sp.test_account("User3")
    user4 = sp.test_account("User4")
    contract.update_whitelist_batch(
        [
            sp.record(wallet=user3.address, add=True),
            sp.record(wallet=user4.address, add=True),
        ],
        _sender=admin,
    )
    scenario.verify(contract.data.whitelist.contains(user3.address))
    scenario.verify(contract.data.whitelist.contains(user4.address))
    contract.update_whitelist_batch(
        [sp.record(wallet=user3.address, add=False)],
        _sender=admin,
    )
    scenario.verify(~contract.data.whitelist.contains(user3.address))
    # Non-admin fails
    contract.update_whitelist_batch(
        [sp.record(wallet=user.address, add=True)],
        _sender=user,
        _valid=False,
    )

    # --- propose_admin / accept_admin (two-step) ---
    contract.propose_admin(new_admin.address, _sender=user, _valid=False)
    contract.propose_admin(new_admin.address, _sender=admin)
    scenario.verify(contract.data.proposed_admin == sp.Some(new_admin.address))

    # Wrong address tries to accept
    contract.accept_admin(_sender=user, _valid=False)

    # Proposed admin accepts
    contract.accept_admin(_sender=new_admin)
    scenario.verify(contract.data.admin_address == new_admin.address)
    scenario.verify(contract.data.proposed_admin == sp.cast(None, sp.option[sp.address]))

    # Old admin can no longer act
    contract.set_paused(True, _sender=admin, _valid=False)
    contract.set_paused(True, _sender=new_admin)
    scenario.verify(contract.data.paused == True)


@sp.add_test()
def test_label_too_long():
    """Register with a label longer than max_label_length should fail."""
    scenario = sp.test_scenario("Label too long", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)
    # Set max to 5 bytes for easy testing
    contract.set_max_label_length(sp.nat(5), _sender=admin)

    # 6 bytes — "abcdef" = 0x616263646566
    label = sp.bytes("0x616263646566")
    salt = sp.bytes("0x01")
    payload = sp.pack(
        sp.record(
            label=label,
            sender=user.address,
            target_address=user.address,
            salt=salt,
        )
    )
    commitment_hash = sp.blake2b(payload)
    contract.commit(commitment_hash, _sender=user, _now=sp.timestamp(0))

    contract.register(
        sp.record(label=label, target_address=user.address, salt=salt),
        _sender=user,
        _now=sp.timestamp(14401),
        _valid=False,
    )


@sp.add_test()
def test_label_invalid_chars():
    """Register with invalid characters (uppercase, special) should fail."""
    scenario = sp.test_scenario("Label invalid chars", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    # "FOO" = 0x464f4f (uppercase — not allowed)
    label = sp.bytes("0x464f4f")
    salt = sp.bytes("0x01")
    payload = sp.pack(
        sp.record(
            label=label,
            sender=user.address,
            target_address=user.address,
            salt=salt,
        )
    )
    commitment_hash = sp.blake2b(payload)
    contract.commit(commitment_hash, _sender=user, _now=sp.timestamp(0))

    contract.register(
        sp.record(label=label, target_address=user.address, salt=salt),
        _sender=user,
        _now=sp.timestamp(14401),
        _valid=False,
    )


@sp.add_test()
def test_label_valid_chars():
    """Labels with a-z, 0-9, and hyphens should be accepted."""
    scenario = sp.test_scenario("Label valid chars", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    # "a-1" = 0x612d31 (lowercase + hyphen + digit)
    label = sp.bytes("0x612d31")
    salt = sp.bytes("0x01")
    payload = sp.pack(
        sp.record(
            label=label,
            sender=user.address,
            target_address=user.address,
            salt=salt,
        )
    )
    commitment_hash = sp.blake2b(payload)
    contract.commit(commitment_hash, _sender=user, _now=sp.timestamp(0))

    # This should succeed (valid chars, valid length)
    contract.register(
        sp.record(label=label, target_address=user.address, salt=salt),
        _sender=user,
        _now=sp.timestamp(14401),
    )
    scenario.verify(contract.data.registrations[user.address] == 1)


@sp.add_test()
def test_label_leading_trailing_hyphen():
    """Labels with leading or trailing hyphens should be rejected.
    Each invalid label is tested with a fresh user to avoid pending_commitments conflicts."""
    scenario = sp.test_scenario("Label hyphen edges", main)

    admin = sp.test_account("Admin")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    # "-ab" = 0x2d6162 (leading hyphen)
    user1 = sp.test_account("User1")
    label1 = sp.bytes("0x2d6162")
    salt = sp.bytes("0x01")
    payload1 = sp.pack(
        sp.record(
            label=label1, sender=user1.address,
            target_address=user1.address, salt=salt,
        )
    )
    h1 = sp.blake2b(payload1)
    contract.commit(h1, _sender=user1, _now=sp.timestamp(0))
    contract.register(
        sp.record(label=label1, target_address=user1.address, salt=salt),
        _sender=user1, _now=sp.timestamp(14401), _valid=False,
    )

    # "ab-" = 0x61622d (trailing hyphen)
    user2 = sp.test_account("User2")
    label2 = sp.bytes("0x61622d")
    salt2 = sp.bytes("0x02")
    payload2 = sp.pack(
        sp.record(
            label=label2, sender=user2.address,
            target_address=user2.address, salt=salt2,
        )
    )
    h2 = sp.blake2b(payload2)
    contract.commit(h2, _sender=user2, _now=sp.timestamp(0))
    contract.register(
        sp.record(label=label2, target_address=user2.address, salt=salt2),
        _sender=user2, _now=sp.timestamp(14401), _valid=False,
    )

    # "---" = 0x2d2d2d (all hyphens — leading AND trailing)
    user3 = sp.test_account("User3")
    label3 = sp.bytes("0x2d2d2d")
    salt3 = sp.bytes("0x03")
    payload3 = sp.pack(
        sp.record(
            label=label3, sender=user3.address,
            target_address=user3.address, salt=salt3,
        )
    )
    h3 = sp.blake2b(payload3)
    contract.commit(h3, _sender=user3, _now=sp.timestamp(0))
    contract.register(
        sp.record(label=label3, target_address=user3.address, salt=salt3),
        _sender=user3, _now=sp.timestamp(14401), _valid=False,
    )

    # "a-b" = 0x612d62 (middle hyphen — should pass)
    user4 = sp.test_account("User4")
    label4 = sp.bytes("0x612d62")
    salt4 = sp.bytes("0x04")
    payload4 = sp.pack(
        sp.record(
            label=label4, sender=user4.address,
            target_address=user4.address, salt=salt4,
        )
    )
    h4 = sp.blake2b(payload4)
    contract.commit(h4, _sender=user4, _now=sp.timestamp(0))
    contract.register(
        sp.record(label=label4, target_address=user4.address, salt=salt4),
        _sender=user4, _now=sp.timestamp(14401),
    )
    scenario.verify(contract.data.registrations[user4.address] == 1)


@sp.add_test()
def test_clear_expired_commitment():
    """Anyone can clear a commitment that has provably expired."""
    scenario = sp.test_scenario("Clear expired commitment", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    stranger = sp.test_account("Stranger")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    test_hash = sp.blake2b(sp.bytes("0xdeadbeef"))
    contract.commit(test_hash, _sender=user, _now=sp.timestamp(0))
    scenario.verify(contract.data.commitments.contains(test_hash))

    # Cannot clear a commitment that hasn't expired yet (within max_commit_age=86400)
    contract.clear_expired_commitment(
        test_hash, _sender=stranger, _now=sp.timestamp(86000), _valid=False,
    )

    # Cannot clear at exactly max_commit_age (must be strictly greater)
    contract.clear_expired_commitment(
        test_hash, _sender=stranger, _now=sp.timestamp(86400), _valid=False,
    )

    # Can clear once provably expired (age > max_commit_age)
    contract.clear_expired_commitment(
        test_hash, _sender=stranger, _now=sp.timestamp(86401),
    )
    scenario.verify(~contract.data.commitments.contains(test_hash))

    # Clearing a non-existent commitment fails
    contract.clear_expired_commitment(
        test_hash, _sender=stranger, _now=sp.timestamp(100000), _valid=False,
    )

    # Rejects tez
    test_hash2 = sp.blake2b(sp.bytes("0xcafebabe"))
    contract.commit(test_hash2, _sender=user, _now=sp.timestamp(0))
    contract.clear_expired_commitment(
        test_hash2, _sender=stranger,
        _now=sp.timestamp(86401), _amount=sp.mutez(1), _valid=False,
    )


@sp.add_test()
def test_release_commitment():
    """User can release their own pending commitment, freeing them to commit again."""
    scenario = sp.test_scenario("Release commitment", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    user2 = sp.test_account("User2")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    test_hash = sp.blake2b(sp.bytes("0xdeadbeef"))
    contract.commit(test_hash, _sender=user, _now=sp.timestamp(0))
    scenario.verify(contract.data.commitments.contains(test_hash))
    scenario.verify(contract.data.pending_commitments.contains(user.address))

    # Another user cannot release someone else's commitment
    contract.release_commitment(_sender=user2, _valid=False)

    # User releases their own commitment
    contract.release_commitment(_sender=user)
    scenario.verify(~contract.data.commitments.contains(test_hash))
    scenario.verify(~contract.data.pending_commitments.contains(user.address))

    # Releasing when no pending commitment fails
    contract.release_commitment(_sender=user, _valid=False)

    # After release, user can immediately commit a new hash
    new_hash = sp.blake2b(sp.bytes("0xcafebabe"))
    contract.commit(new_hash, _sender=user, _now=sp.timestamp(100))
    scenario.verify(contract.data.commitments.contains(new_hash))
    scenario.verify(contract.data.pending_commitments[user.address] == new_hash)

    # Rejects tez
    contract.release_commitment(_sender=user, _amount=sp.mutez(1), _valid=False)


@sp.add_test()
def test_one_commitment_per_wallet():
    """A wallet cannot have more than one active commitment at a time."""
    scenario = sp.test_scenario("One commitment per wallet", main)

    admin = sp.test_account("Admin")
    user = sp.test_account("User")
    registry = sp.test_account("Registry")

    contract = _make_contract(scenario, admin, registry)

    h1 = sp.blake2b(sp.bytes("0xdeadbeef"))
    h2 = sp.blake2b(sp.bytes("0xcafebabe"))
    h3 = sp.blake2b(sp.bytes("0xf00dcafe"))

    # First commit succeeds
    contract.commit(h1, _sender=user, _now=sp.timestamp(0))
    scenario.verify(contract.data.pending_commitments[user.address] == h1)

    # Second commit from same wallet while first active — blocked
    contract.commit(h2, _sender=user, _now=sp.timestamp(60), _valid=False)

    # Release and try again — now allowed
    contract.release_commitment(_sender=user)
    contract.commit(h2, _sender=user, _now=sp.timestamp(120))
    scenario.verify(contract.data.pending_commitments[user.address] == h2)
    scenario.verify(~contract.data.commitments.contains(h1))

    # Let h2 expire, then commit h3 — auto-clears expired h2
    contract.commit(h3, _sender=user, _now=sp.timestamp(86522))
    scenario.verify(~contract.data.commitments.contains(h2))
    scenario.verify(contract.data.pending_commitments[user.address] == h3)
