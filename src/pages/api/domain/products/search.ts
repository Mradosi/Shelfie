import type { APIRoute } from "astro";
import { findSharedProductMatch, searchSharedProductsByName, type SharedProduct } from "@/lib/domain/product-domain";
import {
  lookupOpenBeautyFactsByBarcode,
  searchOpenBeautyFactsByName,
  type OpenBeautyFactsProductResult,
} from "@/lib/integrations/open-beauty-facts";
import { createClient } from "@/lib/supabase";

type SearchMode = "name" | "barcode";

interface ProductSearchCandidate {
  id?: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  imageUrl: string | null;
  inciList: string[];
  source: "open_beauty_facts" | "photo_vision" | "manual" | "ai_web_search";
  confidence: "high" | "medium";
  incompleteInci: boolean;
  origin: "shared" | "external";
  originLabel: string;
}

function toJsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function parseSearchMode(value: string | null): SearchMode {
  if (value === "barcode") {
    return value;
  }

  return "name";
}

function mapSharedProductCandidate(product: SharedProduct): ProductSearchCandidate {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    inciList: product.inciList,
    source: product.inciSource ?? "manual",
    confidence: product.inciConfidence ?? "high",
    incompleteInci: product.inciList.length === 0,
    origin: "shared",
    originLabel: "Twoja baza produktów",
  };
}

function mapOpenBeautyFactsCandidate(product: OpenBeautyFactsProductResult): ProductSearchCandidate {
  return {
    id: undefined,
    name: product.name,
    brand: product.brand,
    category: product.category,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    inciList: product.inciList,
    source: product.source,
    confidence: product.confidence,
    incompleteInci: product.incompleteInci,
    origin: "external",
    originLabel: "Open Beauty Facts",
  };
}

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return toJsonError("Supabase nie jest skonfigurowane", 500);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return toJsonError(authError.message, 401);
  }

  if (!user) {
    return toJsonError("Musisz być zalogowany, żeby wyszukiwać produkty", 401);
  }

  const mode = parseSearchMode(context.url.searchParams.get("mode"));
  const query = context.url.searchParams.get("query")?.trim() ?? "";

  if (!query) {
    return toJsonError("Podaj nazwę albo barcode produktu");
  }

  try {
    if (mode === "barcode") {
      const localProduct = await findSharedProductMatch(supabase, { barcode: query });
      if (localProduct) {
        return Response.json({
          mode,
          candidates: [mapSharedProductCandidate(localProduct)],
          sourceUsed: "shared",
        });
      }

      const openBeautyFactsProduct = await lookupOpenBeautyFactsByBarcode(query);
      return Response.json({
        mode,
        candidates: openBeautyFactsProduct ? [mapOpenBeautyFactsCandidate(openBeautyFactsProduct)] : [],
        sourceUsed: "open_beauty_facts",
      });
    }

    const localProducts = await searchSharedProductsByName(supabase, { query, limit: 8 });
    if (localProducts.length > 0) {
      return Response.json({
        mode,
        candidates: localProducts.map(mapSharedProductCandidate),
        sourceUsed: "shared",
      });
    }

    const openBeautyFactsProducts = await searchOpenBeautyFactsByName(query, 8);
    return Response.json({
      mode,
      candidates: openBeautyFactsProducts.map(mapOpenBeautyFactsCandidate),
      sourceUsed: "open_beauty_facts",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się wyszukać produktu";
    return toJsonError(message, 500);
  }
};
