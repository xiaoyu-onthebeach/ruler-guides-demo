const NICE_NUMBERS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000, 100000,
];

const MIN_MAJOR_TICK_GAP_PX = 60;

export function pickStep(zoom: number): number {
  const targetWorldStep = MIN_MAJOR_TICK_GAP_PX / zoom;
  for (const step of NICE_NUMBERS) {
    if (step >= targetWorldStep) return step;
  }
  return NICE_NUMBERS[NICE_NUMBERS.length - 1];
}
