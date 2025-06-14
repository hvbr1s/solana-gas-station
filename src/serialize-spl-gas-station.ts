import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';
import * as kit from '@solana/kit';
import { getPriorityFees } from '../utils/get_priority_fees'
import { FordefiSolanaConfig } from './config'
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
} from '@solana-program/token';

const mainnetRpc = kit.createSolanaRpc('https://api.mainnet-beta.solana.com');
                                        

export async function signFeePayerVault(fordefiConfig: FordefiSolanaConfig): Promise<any>{
    const sourceVault = kit.address(fordefiConfig.originAddress)
    const sourceVaultSigner = kit.createNoopSigner(sourceVault)
    const destVault = kit.address(fordefiConfig.destAddress)
    const feePayer = kit.address(fordefiConfig.feePayer)
    const usdcMint = kit.address(fordefiConfig.tokenMint)
    console.debug("Source vault -> ", sourceVault)
    console.debug("Dest vault -> ", destVault)
    console.debug("Fee payer -> ", feePayer)

    const [sourceAta] = await findAssociatedTokenPda({
      owner:      sourceVault,
      mint:       usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    console.debug("Source ATA -> ", sourceAta)
    
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

    // Upgrade source vault account role to writable
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
      message => kit.setTransactionMessageFeePayer(feePayer, message),
      message => kit.setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
      message => kit.appendTransactionMessageInstruction(ixes[0], message)
    );
    console.log("Tx message: ", txMessage)
    console.log("Tx instructions detailed:", JSON.stringify(txMessage.instructions, null, 2));

    // Optional -> Budget CU
    const getComputeUnitEstimateForTransactionMessage = kit.getComputeUnitEstimateForTransactionMessageFactory({
      rpc: mainnetRpc,
    });
    const computeUnitsEstimate = await getComputeUnitEstimateForTransactionMessage(txMessage);
    const boostedBudget = computeUnitsEstimate * 10 
    console.log("Compute budget ->", boostedBudget)

    const txMessageWithComputeUnitLimit = kit.prependTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units: boostedBudget }),
      txMessage,
    );

    // Calculate Priority Fee
    let addresses = [sourceVault, destVault, feePayer, usdcMint];
    const priorityFee = await getPriorityFees(addresses, mainnetRpc)
    console.log(`Priority fee -> ${priorityFee}`)
    const txMessageWithComputeUnitLimitPriced = kit.prependTransactionMessageInstruction(
      getSetComputeUnitPriceInstruction({microLamports: priorityFee}),
      txMessageWithComputeUnitLimit
    );
    console.debug("Signed message ->", txMessageWithComputeUnitLimitPriced)

    const partiallySignedTx = await kit.partiallySignTransactionMessageWithSigners(txMessageWithComputeUnitLimitPriced);
    console.log("Signed transaction: ", partiallySignedTx)

    const base64EncodedData = Buffer.from(partiallySignedTx.messageBytes).toString('base64');
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

    return [jsonBody, base64EncodedData, priorityFee];
}

export async function signWithSourceVault(fordefiConfig: FordefiSolanaConfig, feePayerSignature: any, msgData: any, priorityFee: number): Promise<any> {  
  const jsonBody = {
      "vault_id": fordefiConfig.originVault, 
      "signer_type": "api_signer",
      "sign_mode": "auto",
      "type": "solana_transaction",
      "skip_prediction": false,
      "details": {
          "fee": {
            "type": "custom",
            "priority_fee": priorityFee.toString()
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