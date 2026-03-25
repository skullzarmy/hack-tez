/**
 * HackTezRegistrar contract interaction helpers
 */
import { TezosToolkit } from "@taquito/taquito";
import config from "../config/tezos";

export interface RegisterParams {
    label: string; // hex bytes
    targetAddress: string;
    permitSignature: string;
    expiry: string; // ISO timestamp
}

/**
 * Submit a register() transaction to the HackTezRegistrar contract.
 * The user's wallet signs and pays gas.
 */
export async function submitRegister(tezos: TezosToolkit, params: RegisterParams) {
    const contract = await tezos.wallet.at(config.registrarAddress);

    const op = await contract.methodsObject
        .register({
            label: params.label,
            target_address: params.targetAddress,
            permit_sig: params.permitSignature,
            expiry: params.expiry,
        })
        .send();

    return op;
}

/**
 * Submit an update_record transaction directly to Tezos Domains.
 * The user must be the record owner.
 */
export async function updateRecord(
    tezos: TezosToolkit,
    params: {
        name: string; // hex bytes of full name e.g. "foo.hack.tez"
        address: string;
    },
) {
    const contract = await tezos.wallet.at(config.nameRegistryUpdateRecord);

    const op = await contract.methodsObject
        .default({
            name: params.name,
            address: params.address,
            owner: params.address,
            data: {},
        })
        .send();

    return op;
}
