export function* split(value, tryIntoChunkSize) {
	const chunks = Math.floor(value / tryIntoChunkSize);
	const remainder = value % tryIntoChunkSize;

	if (chunks === 0 && remainder > 0) {
		yield [0, remainder - 1];
	}

	// Fit
	const newChunkSize = tryIntoChunkSize + Math.floor(remainder / chunks);
	const finalChunkSize = newChunkSize + remainder % chunks;

	for (let i = 0; i < chunks; i++) {
		if (i + 1 === chunks) {
			yield [i * newChunkSize, i * newChunkSize + finalChunkSize]
		} else {
			yield [i * newChunkSize, (i + 1) * newChunkSize];
		}
	}
}
