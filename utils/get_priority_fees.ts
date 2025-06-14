export async function getPriorityFees(accounts: string[], mainnetRpc: any): Promise<number> {
    const response = await mainnetRpc
        .getRecentPrioritizationFees(accounts)
        .send();
    if (!response?.value?.result) {
        console.error('Invalid response format:', response);
        return 1000; // fallback fee
    }
    const fees: number[] = response.value.result.map((item: { slot: number, prioritizationFee: number }) => item.prioritizationFee);
    const sum: number = fees.reduce((acc: number, fee: number) => acc + fee, 0);
    const average: number = Math.ceil(sum / fees.length);
    const buffer: number = 1000;
    const finalFee: number = average + buffer;

    return finalFee;
}