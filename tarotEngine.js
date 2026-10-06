export function drawOneCard(cards) {
  if (!Array.isArray(cards) || cards.length !== 78) {
    throw new Error("Tarot deck must contain exactly 78 cards.");
  }

  const index = Math.floor(Math.random() * cards.length);
  const card = cards[index];

  const reversed = Math.random() < 0.5;

  return {
    card,
    orientation: reversed ? "reversed" : "upright"
  };
}
