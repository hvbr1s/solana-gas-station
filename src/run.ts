import { signFeePayerVault, signWithSourceVault} from './serialize-spl-gas-station';
import { createAndSignTx } from '../utils/process_tx';
import { signWithApiSigner } from './signer';
import { pushToJito } from './push_to_jito';
import { fordefiConfig } from './config';


async function main(): Promise<void> {
  if (!fordefiConfig.accessToken) {
    console.error('Error: FORDEFI_API_TOKEN environment variable is not set');
    return;
  }

  const [jsonBody, msgData] = await signFeePayerVault(fordefiConfig);
  console.log("JSON request: ", jsonBody)
  const requestBody = JSON.stringify(jsonBody);
  const timestamp = new Date().getTime();
  const payload = `${fordefiConfig.apiPathEndpoint}|${timestamp}|${requestBody}`;
  const signature = await signWithApiSigner(payload, fordefiConfig.privateKeyPem);
  const response = await createAndSignTx(
    fordefiConfig.apiPathEndpoint, 
    fordefiConfig.accessToken, 
    signature, 
    timestamp, 
    requestBody
  );
  const data = response.data;
  console.log(data)
  console.log("Transaction submitted to Fordefi for broadcast ✅")
  console.log(`Transaction ID: ${data.id}`)
  console.log("First sig ->", data.signatures[0])

  try {

    // Create payload for source Vault signature
    const sourceVaultRequest = await signWithSourceVault(fordefiConfig, data.signatures[0], msgData);
    const sourceVaultRequestBody = JSON.stringify(sourceVaultRequest);
    const sourceVaultTimestamp = new Date().getTime();
    const sourceVaultPayload = `${fordefiConfig.apiPathEndpoint}|${sourceVaultTimestamp}|${sourceVaultRequestBody}`;

    const sourceVaultSignature = await signWithApiSigner(sourceVaultPayload, fordefiConfig.privateKeyPem);
    
    // Send the second request to Fordefi for the source vault to sign and broadcast
    const finalResponse = await createAndSignTx(
      fordefiConfig.apiPathEndpoint,
      fordefiConfig.accessToken, 
      sourceVaultSignature,
      sourceVaultTimestamp,
      sourceVaultRequestBody
    );
    console.debug(finalResponse.data)

    if(fordefiConfig.useJito){
      try {
        const transaction_id = data.id
        console.log(`Transaction ID -> ${transaction_id}`)
  
        await pushToJito(transaction_id, fordefiConfig.accessToken)
  
      } catch (error: any){
        console.error(`Failed to push the transaction to Orca: ${error.message}`)
      }
    } else {
    console.log("Transaction signed by source vault and submitted to network ✅");
    console.log(`Final transaction ID: ${finalResponse.data.id}`);
    }

  } catch (error: any) {
    console.error(`Failed to sign the transaction: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}