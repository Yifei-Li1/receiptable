import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { ExtractionError, extractReceipt, type ImageMediaType } from "./extract.js";

const app = express();
app.use(express.json({ limit: "12mb" }));

const API_TOKEN = process.env.RECEIPTABLE_TOKEN; // optional shared secret between app and server
const MEDIA_TYPES = new Set<ImageMediaType>(["image/jpeg", "image/png", "image/webp", "image/gif"]);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/extract", async (req, res) => {
  if (API_TOKEN && req.get("authorization") !== `Bearer ${API_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { image, mediaType = "image/jpeg" } = req.body ?? {};
  if (typeof image !== "string" || image.length === 0) {
    res.status(400).json({ error: "Body must include base64 `image`." });
    return;
  }
  if (!MEDIA_TYPES.has(mediaType)) {
    res.status(400).json({ error: `Unsupported mediaType ${mediaType}` });
    return;
  }

  try {
    const receipt = await extractReceipt(image, mediaType);
    res.json({ receipt });
  } catch (err) {
    if (err instanceof ExtractionError) {
      res.status(422).json({ error: err.message });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Rate limited, try again shortly." });
    } else if (err instanceof Anthropic.BadRequestError) {
      res.status(400).json({ error: err.message });
    } else if (err instanceof Anthropic.APIError) {
      console.error(err);
      res.status(502).json({ error: "Upstream model error." });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal error." });
    }
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`receiptable server listening on :${port}`));
