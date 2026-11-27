export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Utilities",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface LineItem {
  name: string;
  quantity: number;
  /** Line total in minor units (cents). */
  priceCents: number;
}

export interface Receipt {
  id: number;
  merchant: string;
  /** Local purchase date, YYYY-MM-DD. */
  date: string;
  currency: string;
  /** All amounts are integer minor units (cents) to avoid float drift. */
  totalCents: number;
  taxCents: number | null;
  tipCents: number | null;
  category: Category;
  items: LineItem[];
  imageUri: string | null;
  note: string;
  createdAt: string;
}

export type NewReceipt = Omit<Receipt, "id" | "createdAt">;
