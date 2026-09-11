import { describe, expect, it } from "vitest";
import { parseOpenRouterJsonObject } from "@/lib/integrations/openrouter";

describe("parseOpenRouterJsonObject", () => {
  it.each(['{"name":"Serum"}', '```json\\n{"name":"Serum"}\\n```', 'Wynik: {"name":"Serum"}.'])(
    "accepts a JSON object from model content",
    (content) => {
      expect(parseOpenRouterJsonObject(content)).toEqual({ name: "Serum" });
    },
  );

  it("rejects content without an object", () => {
    expect(() => parseOpenRouterJsonObject("Brak danych")).toThrow("OpenRouter did not return a JSON object");
  });
});
