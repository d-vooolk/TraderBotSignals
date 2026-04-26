export const getCandleScale = (candles) => {
    if (!candles?.length) return [0, 0, 0];
    const timestamps = candles.map(c => c.x);
    const minX = Math.min(...timestamps);
    const maxX = Math.max(...timestamps);
    const offsetX = (maxX - minX) * 0.05;

    return [minX, maxX, offsetX];
}