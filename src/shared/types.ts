export interface User {
  id: number;
  username: string;
}

export interface LanguageSummary {
  id: number;
  name: string;
  letterCount: number;
  deckCount: number;
}

export interface Letter {
  id: number;
  lower: string;
  upper: string;
  pronunciation: string;
  position: number;
}

export interface DeckSummary {
  id: number;
  name: string;
  cardCount: number;
  dueCount: number;
}

export interface Language {
  id: number;
  name: string;
  notes: string;
  letters: Letter[];
  decks: DeckSummary[];
}

export interface Card {
  id: number;
  word: string;
  translation: string;
  boxForward: number;
  boxReverse: number;
}

export interface Deck {
  id: number;
  name: string;
  language: { id: number; name: string; letters: Letter[] };
  cards: Card[];
}

export type Direction = "forward" | "reverse";
export type DirectionChoice = Direction | "mixed";
export type StudyMode = "simple" | "smart";

export interface StudyItem {
  cardId: number;
  direction: Direction;
  prompt: string;
  answer: string;
  box: number;
}
