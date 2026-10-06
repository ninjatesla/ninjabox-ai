import TAROT_DECK from "./tarotDeck.js";

export function drawOneCard() {
  const index = Math.floor(Math.random() * TAROT_DECK.length);
  const card = TAROT_DECK[index];

  const orientation =
    Math.random() < 0.5 ? "upright" : "reversed";

  return {
    card,
    orientation,
    meaning:
      orientation === "upright"
        ? card.upright
        : card.reversed
  };
}

export function getCardAnswer(draw) {
  const { card, orientation, meaning } = draw;

  return {
    cardName: card.name,
    image: card.image,
    orientation,
    meaning
  };
}
