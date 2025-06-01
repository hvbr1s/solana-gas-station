import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import * as kit from '@solana/kit';
import { FordefiSolanaConfig } from './config'
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
} from '@solana-program/token';

const mainnetRpc = kit.createSolanaRpc('https://api.mainnet-beta.solana.com');
                                        
const getComputeUnitEstimateForTransactionMessage = kit.getComputeUnitEstimateForTransactionMessageFactory({
  rpc: mainnetRpc,
});

export async function signFeePayerVault(fordefiConfig: FordefiSolanaConfig){
    const sourceVault = kit.address(fordefiConfig.originAddress)
    const sourceVaultSigner = kit.createNoopSigner(sourceVault)
    const destVault = kit.address(fordefiConfig.destAddress)
    const feePayer = kit.address(fordefiConfig.feePayer)
    const feePayerSigner = kit.createNoopSigner(feePayer)
    const usdcMint = kit.address(fordefiConfig.tokenMint)
    console.debug("Source vault -> ", sourceVault)
    console.debug("Dest vault -> ", destVault)
    console.debug("Fee payer -> ", feePayer)

    const [sourceAta] = await findAssociatedTokenPda({
      owner:      sourceVault,
      mint:       usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    console.debug("Source ATA", sourceAta)
    
    const [destAta] = await findAssociatedTokenPda({
      owner:        destVault,
      mint:         usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    console.debug("Destination ATA", destAta)

    // Token transfer ixs
    const ixes: any = [];
    ixes.push(
      getTransferCheckedInstruction({
        source:      sourceAta,
        mint:        usdcMint,
        destination: destAta,
        authority:   sourceVaultSigner,       
        amount:      fordefiConfig.amount,
        decimals:    Number(fordefiConfig.decimals),
      })
    );
    console.log("Transfer Ixs ->", ixes)

    // Upgrade source vault role to writable
    const updatedAccounts = [...ixes[0].accounts];
    updatedAccounts[3] = {
      ...updatedAccounts[3],
      role: kit.upgradeRoleToWritable(updatedAccounts[3].role)
    };
    ixes[0] = {
      ...ixes[0],
      accounts: updatedAccounts
    };

    const { value: latestBlockhash } = await mainnetRpc.getLatestBlockhash().send();

    const txMessage = kit.pipe(
      kit.createTransactionMessage({ version: 0 }),
      message => kit.setTransactionMessageFeePayerSigner(feePayerSigner, message),
      message => kit.setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
      message => kit.appendTransactionMessageInstruction(ixes[0], message)
    );
    console.log("Tx message: ", txMessage)
    console.log("Tx instructions detailed:", JSON.stringify(txMessage.instructions, null, 2));

    // Optional -> Budget CU
    const computeUnitsEstimate = await getComputeUnitEstimateForTransactionMessage(txMessage);
    const boostedBudget = computeUnitsEstimate * 10
    console.log("Compute budged ->", boostedBudget)
    const txMessageWithComputeUnitLimit = kit.prependTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units: boostedBudget }),
      txMessage,
    );

    const signedTx = await kit.partiallySignTransactionMessageWithSigners(txMessageWithComputeUnitLimit);
    console.log("Signed transaction: ", signedTx)

    const base64EncodedData = Buffer.from(signedTx.messageBytes).toString('base64');
    console.debug("Raw data ->", base64EncodedData)

    const jsonBody = {
        "vault_id": fordefiConfig.feePayerVault,
        "signer_type": "api_signer",
        "sign_mode": "auto",
        "type": "solana_transaction",
        "details": {
            "skip_prediction": false,
            "type": "solana_serialized_transaction_message",
            "push_mode": "manual",
            "chain": "solana_mainnet",
            "data": base64EncodedData
        },
        "wait_for_state": "signed" // only for create-and-wait
    };

    return [jsonBody, base64EncodedData];
}

export async function signWithSourceVault(fordefiConfig: FordefiSolanaConfig, feePayerSignature: any, msgData: any) {
  const jsonBody = {
      "vault_id": fordefiConfig.originVault, 
      "signer_type": "api_signer",
      "sign_mode": "auto",
      "type": "solana_transaction",
      "details": {
          "fee": {
            "type": "custom",
            "priority_fee": "10000"
          },
          "type": "solana_serialized_transaction_message",
          "push_mode": "auto",
          "chain": "solana_mainnet",
          "data": msgData,
          "signatures":[
              {data: feePayerSignature},
              {data: null}
          ]
      },
      "wait_for_state": "signed"
  };

  return jsonBody;
}