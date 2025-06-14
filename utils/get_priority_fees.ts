export async function getPriorityFees(accounts: string[], mainnetRpc: any): Promise<number> {
    const response = await mainnetRpc
        .getRecentPrioritizationFees(accounts)
        .send();
    const fees = Array.isArray(response) ? response : response?.value?.result;
    
    if (!fees || !Array.isArray(fees)) {
        console.error('Invalid response format:', response);
        return 1000; // fallback fee
    }
    const nonZeroFees: number[] = fees
        .map((item: { slot: bigint, prioritizationFee: bigint }) => Number(item.prioritizationFee))
        .filter(fee => fee > 0);
    if (nonZeroFees.length === 0) {
        return 1000;
    }
    const sum: number = nonZeroFees.reduce((acc: number, fee: number) => acc + fee, 0);
    const average: number = Math.ceil(sum / nonZeroFees.length);
    const buffer: number = 1000;
    const finalFee: number = average + buffer;

    return finalFee;
}