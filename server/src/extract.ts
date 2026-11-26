import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

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

export const ReceiptSchema = z.object({
  is_receipt: z.boolean().describe("False if the image is not a receipt or is unreadable"),
  merchant: z.string().describe("Store or business name"),
  date: z.string().describe("Purchase date as YYYY-MM-DD, or empty string if not visible"),
  currency: z.string().describe("ISO 4217 code, e.g. USD, EUR, CNY"),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
  total: z.number().describe("Final amount paid, including tax and tip"),
  category: z.enum(CATEGORIES),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number().describe("Line total for this item"),
    }),
  ),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

const SYSTEM = `You read photos of purchase receipts and extract structured data.
- "total" is the final amount the customer paid (after tax, tip, discounts). If several totals appear, use the grand total / amount charged.
- Use the currency shown on the receipt; infer it from symbols or the store's country when not explicit.
- Dates: output YYYY-MM-DD. Resolve ambiguous day/month order using the store's locale. Leave empty if no date is printed.
- Pick the single best category for the whole purchase.
- List line items as printed; skip them only if they're illegible.
- If the image is not a receipt, set is_receipt to false and use empty/zero values elsewhere.`;

const client = new Anthropic();

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function extractReceipt(imageBase64: string, mediaType: ImageMediaType): Promise<Receipt> {
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Extract this receipt." },
        ],
      },
    ],
    output_config: { effort: "low", format: betaZodOutputFormat(ReceiptSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("The model declined to process this image.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("Receipt was too long to extract in one pass.");
  }
  if (!response.parsed_output) {
    throw new ExtractionError("Could not parse the receipt.");
  }
  return response.parsed_output;
}

export class ExtractionError extends Error {}
