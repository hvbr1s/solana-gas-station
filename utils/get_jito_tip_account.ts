import { SearcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { PublicKey } from '@solana/web3.js'

export async function getJitoTipAccount(client: SearcherClient): Promise<PublicKey> {
    const tipAccountsResult = await client.getTipAccounts();
    if (!tipAccountsResult.ok) {
        throw new Error(`Failed to get tip accounts: ${tipAccountsResult.error}`);
    }
   const randomIndex = Math.floor(Math.random() * tipAccountsResult.value.length);
   const tipAccount = tipAccountsResult.value[randomIndex];
   if (!tipAccount) {
    throw new Error(`Tip account at index ${randomIndex} is undefined`);
    }
    const jitoTipAccount = new PublicKey(tipAccount);
   console.log(`Tip account (index ${randomIndex}) -> ${jitoTipAccount}`);
   
   return jitoTipAccount;
}