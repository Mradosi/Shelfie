import { useState, type SyntheticEvent } from "react";
import { navigate } from "astro:transitions/client";
import { PRODUCT_CATEGORY_LABELS, PRODUCT_CATEGORY_OPTIONS, type ProductCategory } from "@/lib/domain/product-domain";
import { parseIngredientText, type ProductReviewDraft } from "@/lib/integrations/product-intake-fallbacks";
import { clearNewProductReviewDraft, loadNewProductReviewDraft } from "@/lib/products/review-draft-storage";

interface ProductIntakeSubmitResponse {
  redirectTo?: string;
  error?: string;
}

interface NewProductReviewFormProps {
  serverError?: string | null;
}

export default function NewProductReviewForm({ serverError }: NewProductReviewFormProps) {
  const [draft, setDraft] = useState<ProductReviewDraft | null>(() => loadNewProductReviewDraft());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  async function handleReviewSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || !reviewReady || isSavingProduct) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitError(null);
    setIsSavingProduct(true);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Shelfie-Request": "product-intake",
        },
        body: formData,
      });

      const payload = (await response.json()) as ProductIntakeSubmitResponse;
      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.error ?? "Nie udało się zapisać produktu.");
      }

      clearNewProductReviewDraft();
      void navigate(payload.redirectTo);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Nie udało się zapisać produktu.");
    } finally {
      setIsSavingProduct(false);
    }
  }

  const reviewIngredients = draft ? parseIngredientText(draft.inciText) : [];
  const reviewReady = Boolean(draft?.name.trim()) && reviewIngredients.length > 0;
  const reviewImagePreviewUrl = draft ? draft.storedImageUrl || draft.sourceImageUrl : "";
  const loadError = draft ? null : "Nie znaleziono draftu do review. Wróć do intake i przygotuj produkt ponownie.";
  const errorMessage = serverError ?? loadError ?? submitError;

  if (!draft) {
    return (
      <div className="mt-8 space-y-6">
        {errorMessage && (
          <p className="rounded-2xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </p>
        )}
        <a
          href="/products/intake"
          className="inline-flex rounded-full border border-white/20 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/16"
        >
          Wróć do intake
        </a>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {errorMessage && (
        <p className="rounded-2xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      )}

      <div>
        <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Review nowego draftu</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Potwierdź lub popraw dane produktu przed zapisem</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/75">
          Ten ekran służy tylko dla nowych draftów z OBF, AI, photo extraction albo manual entry. Zmiany zapiszą
          confirmed product do shared bazy, a potem dodadzą go do Twojej półki.
        </p>
      </div>

      <form
        method="POST"
        action="/api/domain/products/intake"
        className="space-y-5 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5"
        onSubmit={handleReviewSubmit}
      >
        <input type="hidden" name="successRedirectTo" value="/products/intake/complete" />
        <input type="hidden" name="errorRedirectTo" value="/products/intake/review/new" />
        <input type="hidden" name="inciSource" value={draft.inciSource} />
        <input type="hidden" name="inciConfidence" value={draft.inciConfidence} />
        <input type="hidden" name="inciList" value={JSON.stringify(reviewIngredients)} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm text-blue-100/80">Nazwa produktu</span>
            <input
              type="text"
              name="name"
              value={draft.name}
              onChange={(event) => {
                setDraft((current) => (current ? { ...current, name: event.target.value } : current));
              }}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-blue-100/80">Marka</span>
            <input
              type="text"
              name="brand"
              value={draft.brand}
              onChange={(event) => {
                setDraft((current) => (current ? { ...current, brand: event.target.value } : current));
              }}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-blue-100/80">Kategoria</span>
            <select
              name="category"
              value={draft.category}
              onChange={(event) => {
                setDraft((current) =>
                  current ? { ...current, category: event.target.value as ProductCategory } : current,
                );
              }}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white focus:border-cyan-300/60 focus:outline-none"
            >
              {PRODUCT_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {PRODUCT_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-blue-100/80">Barcode</span>
            <input
              type="text"
              name="barcode"
              value={draft.barcode}
              onChange={(event) => {
                setDraft((current) => (current ? { ...current, barcode: event.target.value } : current));
              }}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm text-blue-100/80">URL zdjęcia produktu</span>
          <input
            type="text"
            name="sourceImageUrl"
            value={draft.sourceImageUrl}
            onChange={(event) => {
              setDraft((current) => (current ? { ...current, sourceImageUrl: event.target.value } : current));
            }}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
          />
        </label>

        <input type="hidden" name="storedImageUrl" value={draft.storedImageUrl} />

        {reviewImagePreviewUrl && (
          <div className="space-y-2 rounded-2xl border border-white/12 bg-white/5 p-4">
            <p className="text-sm text-blue-100/70">Podgląd zdjęcia produktu</p>
            <img
              src={reviewImagePreviewUrl}
              alt="Podgląd zdjęcia produktu w ekranie review"
              className="max-h-64 rounded-2xl border border-white/12 object-contain"
            />
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-sm text-blue-100/80">Lista INCI do potwierdzenia</span>
          <textarea
            rows={7}
            value={draft.inciText}
            onChange={(event) => {
              setDraft((current) => (current ? { ...current, inciText: event.target.value } : current));
            }}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
          />
        </label>

        <input type="hidden" name="inciUpdatedAt" value={new Date().toISOString()} />

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-blue-100/70">
          <p>
            Źródło zapisu: <span className="font-medium text-white">{draft.inciSource}</span> · confidence:{" "}
            <span className="font-medium text-white">{draft.inciConfidence}</span>
          </p>
          <p className="mt-2">W review mamy teraz {reviewIngredients.length} składników gotowych do zapisu.</p>
          {!reviewReady && (
            <p className="mt-2 text-amber-200">
              Uzupełnij nazwę i listę INCI, żeby odblokować finalny zapis produktu na półce.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <a
            href="/products/intake"
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
          >
            Wróć do intake
          </a>
          <button
            type="submit"
            disabled={!reviewReady || isSavingProduct}
            className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
          >
            {isSavingProduct ? "Zapisuję produkt..." : "Zapisz nowy produkt na półce"}
          </button>
        </div>
      </form>
    </div>
  );
}
