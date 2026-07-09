import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import { navigate } from "astro:transitions/client";
import { PRODUCT_CATEGORY_LABELS, PRODUCT_CATEGORY_OPTIONS, type ProductCategory } from "@/lib/domain/product-domain";
import {
  buildManualDraft,
  buildPhotoVisionDraft,
  createReviewDraftFromCandidate,
  type ProductIntakeCandidate,
  type ProductReviewDraft,
} from "@/lib/integrations/product-intake-fallbacks";
import { saveNewProductReviewDraft } from "@/lib/products/review-draft-storage";

type SearchMode = "name" | "barcode";
type FlowStep = "search" | "fallback" | "disambiguation";
type FallbackMode = "ai_web_search" | "photo_vision" | "manual";
type PhotoSlot = "front" | "back";

interface SearchResponse {
  candidates?: ProductIntakeCandidate[];
  error?: string;
  sourceUsed?: "shared" | "open_beauty_facts";
}

interface ProductIntakeFlowProps {
  serverError?: string | null;
}

interface PhotoVisionResponse {
  draft?: ProductReviewDraft;
  error?: string;
}

interface AiWebSearchResponse {
  status?: "resolved" | "ambiguous";
  draft?: ProductReviewDraft;
  ambiguity?: {
    question: string;
    refinementHint: string;
    variants: {
      id: string;
      label: string;
      description: string;
      refinedName: string;
      refinedBrand: string;
    }[];
  };
  metadata?: {
    provider: string;
    model: string;
    supportingSource: string | null;
    sourceUrl: string | null;
    sourceType: "manufacturer" | "incidecoder" | "retailer" | "other";
    matchConfidence: "high" | "medium" | "low";
    exactVariantMatch: boolean;
    sourceTitle: string;
    quotedEvidence: string;
    reasoning: string;
    debugTraceId: string;
  };
  error?: string;
}

const STEP_LABELS: Record<FlowStep, string> = {
  search: "Wyszukiwanie",
  fallback: "Fallback",
  disambiguation: "Doprecyzowanie",
};

const EMPTY_REVIEW_DRAFT: ProductReviewDraft = {
  name: "",
  brand: "",
  category: "other",
  barcode: "",
  sourceImageUrl: "",
  storedImageUrl: "",
  inciText: "",
  inciSource: "manual",
  inciConfidence: "high",
};

export default function ProductIntakeFlow({ serverError }: ProductIntakeFlowProps) {
  const [step, setStep] = useState<FlowStep>("search");
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ProductIntakeCandidate[]>([]);
  const [sourceUsed, setSourceUsed] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<ProductIntakeCandidate | null>(null);
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>("ai_web_search");
  const [fallbackDraft, setFallbackDraft] = useState<ProductReviewDraft>(EMPTY_REVIEW_DRAFT);
  const [isResolvingAiSearch, setIsResolvingAiSearch] = useState(false);
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const [aiSearchSource, setAiSearchSource] = useState<AiWebSearchResponse["metadata"] | null>(null);
  const [aiSearchAmbiguity, setAiSearchAmbiguity] = useState<AiWebSearchResponse["ambiguity"] | null>(null);
  const [aiSearchRefinement, setAiSearchRefinement] = useState("");
  const [frontPhotoFile, setFrontPhotoFile] = useState<File | null>(null);
  const [backPhotoFile, setBackPhotoFile] = useState<File | null>(null);
  const [frontPhotoPreviewUrl, setFrontPhotoPreviewUrl] = useState<string | null>(null);
  const [backPhotoPreviewUrl, setBackPhotoPreviewUrl] = useState<string | null>(null);
  const [isMobileCameraPreferred, setIsMobileCameraPreferred] = useState(false);
  const [isDesktopCameraOpen, setIsDesktopCameraOpen] = useState(false);
  const [desktopCameraError, setDesktopCameraError] = useState<string | null>(null);
  const [desktopCameraTarget, setDesktopCameraTarget] = useState<PhotoSlot>("back");
  const frontPhotoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const backPhotoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const frontPhotoCameraInputRef = useRef<HTMLInputElement | null>(null);
  const backPhotoCameraInputRef = useRef<HTMLInputElement | null>(null);
  const desktopCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const desktopCameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const desktopCameraStreamRef = useRef<MediaStream | null>(null);

  async function handleSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchError("Podaj nazwę albo barcode produktu.");
      return;
    }

    setSearchError(null);
    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/domain/products/search?mode=${encodeURIComponent(searchMode)}&query=${encodeURIComponent(trimmedQuery)}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload = (await response.json()) as SearchResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Nie udało się pobrać wyników wyszukiwania.");
      }

      startTransition(() => {
        setSearchResults(payload.candidates ?? []);
        setSourceUsed(payload.sourceUsed ?? null);
      });
    } catch (error) {
      setSearchResults([]);
      setSourceUsed(null);
      setSearchError(error instanceof Error ? error.message : "Nie udało się pobrać wyników wyszukiwania.");
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const syncPreference = () => {
      setIsMobileCameraPreferred(mediaQuery.matches);
    };

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => {
      mediaQuery.removeEventListener("change", syncPreference);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (frontPhotoPreviewUrl) {
        URL.revokeObjectURL(frontPhotoPreviewUrl);
      }

      if (backPhotoPreviewUrl) {
        URL.revokeObjectURL(backPhotoPreviewUrl);
      }

      const currentStream = desktopCameraStreamRef.current;
      currentStream?.getTracks().forEach((track) => {
        track.stop();
      });
      desktopCameraStreamRef.current = null;
    };
  }, [frontPhotoPreviewUrl, backPhotoPreviewUrl]);

  useLayoutEffect(() => {
    if (!isDesktopCameraOpen || !desktopCameraVideoRef.current || !desktopCameraStreamRef.current) {
      return;
    }

    const video = desktopCameraVideoRef.current;
    video.srcObject = desktopCameraStreamRef.current;

    void video.play().catch(() => {
      setDesktopCameraError("Nie udało się odtworzyć podglądu z kamerki.");
    });
  }, [isDesktopCameraOpen]);

  function resetSearchResults() {
    setSearchError(null);
    setSearchResults([]);
    setSourceUsed(null);
  }

  function navigateToNewDraftReview(draft: ProductReviewDraft) {
    saveNewProductReviewDraft(draft);
    void navigate("/products/intake/review/new");
  }

  function navigateToSharedReview(candidate: ProductIntakeCandidate) {
    if (!candidate.id) {
      setSearchError("Nie udało się przygotować potwierdzenia produktu z bazy.");
      return;
    }

    const url = new URL("/products/intake/review/shared", window.location.origin);
    url.searchParams.set("productId", candidate.id);
    void navigate(`${url.pathname}${url.search}`);
  }

  function getPrimaryActionLabel(candidate: ProductIntakeCandidate) {
    if (candidate.incompleteInci) {
      return "Uzupełnij fallback";
    }

    if (candidate.origin === "shared") {
      return "Potwierdź i dodaj";
    }

    return "Przejdź do edycji draftu";
  }

  function handleCandidateSelection(candidate: ProductIntakeCandidate) {
    if (candidate.incompleteInci) {
      openFallback(candidate);
      return;
    }

    if (candidate.origin === "shared") {
      navigateToSharedReview(candidate);
      return;
    }

    navigateToNewDraftReview(createReviewDraftFromCandidate(candidate));
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>, slot: PhotoSlot) {
    const nextFile = event.target.files?.[0] ?? null;
    const setFile = slot === "front" ? setFrontPhotoFile : setBackPhotoFile;
    const setPreview = slot === "front" ? setFrontPhotoPreviewUrl : setBackPhotoPreviewUrl;
    const previousPreviewUrl = slot === "front" ? frontPhotoPreviewUrl : backPhotoPreviewUrl;

    setFile(nextFile);

    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    if (nextFile) {
      setPreview(URL.createObjectURL(nextFile));
      return;
    }

    setPreview(null);
  }

  async function openDesktopCamera(slot: PhotoSlot) {
    if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setDesktopCameraError("Ta przeglądarka nie obsługuje dostępu do kamerki.");
      return;
    }

    setDesktopCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      });

      const currentStream = desktopCameraStreamRef.current;
      currentStream?.getTracks().forEach((track) => {
        track.stop();
      });
      desktopCameraStreamRef.current = stream;
      setDesktopCameraTarget(slot);
      setIsDesktopCameraOpen(true);
    } catch {
      setDesktopCameraError("Nie udało się uruchomić kamerki. Sprawdź uprawnienia przeglądarki.");
    }
  }

  function closeDesktopCamera() {
    const currentStream = desktopCameraStreamRef.current;
    currentStream?.getTracks().forEach((track) => {
      track.stop();
    });
    desktopCameraStreamRef.current = null;
    if (desktopCameraVideoRef.current) {
      desktopCameraVideoRef.current.srcObject = null;
    }
    setIsDesktopCameraOpen(false);
  }

  function resetFallbackArtifacts() {
    if (frontPhotoPreviewUrl) {
      URL.revokeObjectURL(frontPhotoPreviewUrl);
    }

    if (backPhotoPreviewUrl) {
      URL.revokeObjectURL(backPhotoPreviewUrl);
    }

    if (frontPhotoUploadInputRef.current) {
      frontPhotoUploadInputRef.current.value = "";
    }

    if (backPhotoUploadInputRef.current) {
      backPhotoUploadInputRef.current.value = "";
    }

    if (frontPhotoCameraInputRef.current) {
      frontPhotoCameraInputRef.current.value = "";
    }

    if (backPhotoCameraInputRef.current) {
      backPhotoCameraInputRef.current.value = "";
    }

    setFrontPhotoFile(null);
    setBackPhotoFile(null);
    setFrontPhotoPreviewUrl(null);
    setBackPhotoPreviewUrl(null);
    setAiSearchSource(null);
    setAiSearchAmbiguity(null);
    setAiSearchRefinement("");
    setDesktopCameraError(null);
    closeDesktopCamera();
  }

  async function captureDesktopPhoto() {
    const video = desktopCameraVideoRef.current;
    const canvas = desktopCameraCanvasRef.current;

    if (!video || !canvas) {
      setDesktopCameraError("Nie udało się przygotować podglądu z kamerki.");
      return;
    }

    if (!video.videoWidth || !video.videoHeight) {
      setDesktopCameraError("Kamerka nie zwróciła jeszcze obrazu. Spróbuj ponownie za chwilę.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setDesktopCameraError("Nie udało się przygotować zdjęcia z kamerki.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setDesktopCameraError("Nie udało się zapisać zdjęcia z kamerki.");
      return;
    }

    const slot = desktopCameraTarget;
    const setFile = slot === "front" ? setFrontPhotoFile : setBackPhotoFile;
    const setPreview = slot === "front" ? setFrontPhotoPreviewUrl : setBackPhotoPreviewUrl;
    const previousPreviewUrl = slot === "front" ? frontPhotoPreviewUrl : backPhotoPreviewUrl;

    const nextFile = new File([blob], `${slot}-desktop-camera.jpg`, { type: "image/jpeg" });
    setFile(nextFile);

    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    setPreview(URL.createObjectURL(nextFile));
    closeDesktopCamera();
  }

  function openFallback(candidate: ProductIntakeCandidate | null) {
    resetFallbackArtifacts();
    setSelectedCandidate(candidate);
    setSearchError(null);
    setFallbackMode("ai_web_search");
    setFallbackDraft(candidate ? createReviewDraftFromCandidate(candidate) : EMPTY_REVIEW_DRAFT);
    setStep("fallback");
  }

  function applyFallbackDraft() {
    if (fallbackMode === "ai_web_search") {
      void resolveAiWebSearchDraft();
      return;
    }

    const draftFactory = {
      photo_vision: buildPhotoVisionDraft,
      manual: buildManualDraft,
    }[fallbackMode];

    const nextDraft = draftFactory({
      name: fallbackDraft.name,
      brand: fallbackDraft.brand,
      category: fallbackDraft.category,
      barcode: fallbackDraft.barcode,
      sourceImageUrl: fallbackDraft.sourceImageUrl,
      storedImageUrl: fallbackDraft.storedImageUrl,
      inciText: fallbackDraft.inciText,
    });

    if (!nextDraft.name.trim()) {
      setSearchError("Fallback wymaga nazwy produktu przed przejściem dalej.");
      return;
    }

    setSearchError(null);
    navigateToNewDraftReview(nextDraft);
  }

  async function resolveAiWebSearchDraft(
    override?: Partial<Pick<ProductReviewDraft, "name" | "brand" | "category" | "barcode">>,
  ) {
    const aiSearchInput = {
      name: override?.name ?? fallbackDraft.name,
      brand: override?.brand ?? fallbackDraft.brand,
      category: override?.category ?? fallbackDraft.category,
      barcode: override?.barcode ?? fallbackDraft.barcode,
    };

    if (!aiSearchInput.name.trim()) {
      setSearchError("AI web search wymaga nazwy produktu przed rozpoczęciem wyszukiwania.");
      return;
    }

    setSearchError(null);
    setIsResolvingAiSearch(true);

    try {
      const response = await fetch("/api/domain/products/ai-web-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: aiSearchInput.name,
          brand: aiSearchInput.brand,
          category: aiSearchInput.category,
          barcode: aiSearchInput.barcode,
        }),
      });

      const payload = (await response.json()) as AiWebSearchResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "AI web search nie zwrócił draftu do review.");
      }

      if (payload.status === "ambiguous" && payload.ambiguity) {
        setAiSearchSource(payload.metadata ?? null);
        setAiSearchAmbiguity(payload.ambiguity);
        setAiSearchRefinement("");
        setFallbackDraft((current) => ({
          ...current,
          name: aiSearchInput.name,
          brand: aiSearchInput.brand,
          category: aiSearchInput.category,
          barcode: aiSearchInput.barcode,
        }));
        setStep("disambiguation");
        return;
      }

      if (!payload.draft) {
        throw new Error(payload.error ?? "AI web search nie zwrócił draftu do review.");
      }

      setAiSearchAmbiguity(null);
      setAiSearchSource(payload.metadata ?? null);
      navigateToNewDraftReview(payload.draft);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "AI web search nie powiódł się.");
    } finally {
      setIsResolvingAiSearch(false);
    }
  }

  async function handleAiVariantSelection(variant: NonNullable<AiWebSearchResponse["ambiguity"]>["variants"][number]) {
    const refinedBrand = variant.refinedBrand || fallbackDraft.brand;
    setFallbackDraft((current) => ({
      ...current,
      name: variant.refinedName,
      brand: refinedBrand,
    }));
    setAiSearchRefinement(variant.refinedName);
    await resolveAiWebSearchDraft({
      name: variant.refinedName,
      brand: refinedBrand,
    });
  }

  async function handleAiRefinementSubmit() {
    const refinedName = aiSearchRefinement.trim();
    if (!refinedName) {
      setSearchError("Wpisz dokładniejszą nazwę produktu, żeby zawęzić wynik AI web search.");
      return;
    }

    setFallbackDraft((current) => ({
      ...current,
      name: refinedName,
    }));
    await resolveAiWebSearchDraft({
      name: refinedName,
    });
  }

  async function handlePhotoVisionSubmit() {
    if (!frontPhotoFile && !backPhotoFile) {
      setSearchError("Dodaj co najmniej jedno zdjęcie produktu albo etykiety przed uruchomieniem photo extraction.");
      return;
    }

    setSearchError(null);
    setIsExtractingPhoto(true);

    try {
      const formData = new FormData();
      if (frontPhotoFile) {
        formData.set("frontPhoto", frontPhotoFile);
      }
      if (backPhotoFile) {
        formData.set("backPhoto", backPhotoFile);
      }
      formData.set("name", fallbackDraft.name);
      formData.set("brand", fallbackDraft.brand);
      formData.set("category", fallbackDraft.category);
      formData.set("barcode", fallbackDraft.barcode);

      const response = await fetch("/api/domain/products/photo-vision", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body: formData,
      });

      const payload = (await response.json()) as PhotoVisionResponse;
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error ?? "Nie udało się odczytać danych ze zdjęcia.");
      }

      navigateToNewDraftReview(payload.draft);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Nie udało się odczytać danych ze zdjęcia.");
    } finally {
      setIsExtractingPhoto(false);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-blue-100/70">
          <span>Krok produktu</span>
          <span>{STEP_LABELS[step]}</span>
        </div>
        <div className="h-2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-300 transition-all"
            style={{ width: step === "search" ? "34%" : step === "fallback" ? "67%" : "100%" }}
          />
        </div>
      </div>

      {(serverError ?? searchError) && (
        <p className="rounded-2xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {serverError ?? searchError}
        </p>
      )}

      {step === "search" && (
        <section className="space-y-6">
          <div>
            <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Krok 1</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Znajdź produkt po nazwie albo barcode</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/75">
              Najpierw sprawdzimy współdzieloną bazę produktów. Jeśli trafimy na istniejący produkt, na kolejnym ekranie
              tylko potwierdzisz dodanie go do swojej półki. Nowe drafty przejdą do osobnego review z edycją przed
              zapisem.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="space-y-5 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5"
          >
            <div className="flex flex-wrap gap-3">
              {(
                [
                  { value: "name", label: "Wyszukiwanie po nazwie" },
                  { value: "barcode", label: "Wyszukiwanie po barcode" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSearchMode(option.value);
                    resetSearchResults();
                  }}
                  className={[
                    "rounded-full border px-4 py-2 text-sm transition-colors",
                    searchMode === option.value
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : "border-white/12 bg-white/5 text-blue-100/75 hover:border-cyan-300/50 hover:text-white",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder={searchMode === "barcode" ? "np. 3337875597272" : "np. CeraVe Foaming Cleanser"}
                className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
              >
                {isSearching ? "Szukam..." : searchMode === "barcode" ? "Szukaj po barcode" : "Szukaj produktu"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-blue-100/60">
              <span>Nie znalazłeś wyniku albo brakuje INCI?</span>
              <button
                type="button"
                onClick={() => {
                  openFallback(null);
                }}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/12"
              >
                Przejdź od razu do fallbacków
              </button>
            </div>
          </form>

          {sourceUsed && (
            <p className="text-sm text-blue-100/70">
              Źródło wyników:{" "}
              <span className="font-medium text-white">
                {sourceUsed === "shared" ? "baza Shelfie" : "Open Beauty Facts"}
              </span>
            </p>
          )}

          {searchResults.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {searchResults.map((candidate, index) => (
                <article
                  key={`${candidate.origin}-${candidate.id ?? candidate.barcode ?? index}`}
                  className="rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm tracking-[0.18em] text-cyan-100/55 uppercase">{candidate.originLabel}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{candidate.name ?? "Produkt bez nazwy"}</h3>
                      <p className="mt-2 text-sm text-blue-100/70">
                        {[candidate.brand, candidate.category].filter(Boolean).join(" · ") ||
                          "Brak dodatkowych metadanych"}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-blue-100/75">
                      {candidate.barcode ? `barcode ${candidate.barcode}` : "bez barcode"}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-blue-100/70">
                    {candidate.incompleteInci
                      ? "To trafienie nie ma kompletnego INCI. Możesz przejść do fallbacków i uzupełnić skład przed review."
                      : candidate.origin === "shared"
                        ? "Ten produkt już istnieje w bazie Shelfie. Na następnym ekranie tylko potwierdzisz dodanie go do swojej półki."
                        : `${candidate.inciList.length} składników INCI gotowych do osobnego review przed zapisem.`}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        handleCandidateSelection(candidate);
                      }}
                      className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                    >
                      {getPrimaryActionLabel(candidate)}
                    </button>
                    {candidate.incompleteInci && (
                      <button
                        type="button"
                        onClick={() => {
                          openFallback(candidate);
                        }}
                        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
                      >
                        Wybierz AI / photo / manual
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {!isSearching && query.trim() && searchResults.length === 0 && !searchError && (
            <div className="rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5 text-sm leading-6 text-blue-100/70">
              Nie znaleźliśmy produktu w tej ścieżce. Możesz od razu przejść do fallbacków i zbudować draft do review.
            </div>
          )}
        </section>
      )}

      {step === "fallback" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Krok 2</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Uzupełnij draft przez fallback</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                resetFallbackArtifacts();
                setSelectedCandidate(null);
                setStep("search");
              }}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
            >
              Wróć do wyszukiwania
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {(
              [
                { value: "ai_web_search", label: "AI web search" },
                { value: "photo_vision", label: "Photo extraction" },
                { value: "manual", label: "Manual entry" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setFallbackMode(option.value);
                }}
                className={[
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  fallbackMode === option.value
                    ? "border-cyan-300 bg-cyan-300 text-slate-950"
                    : "border-white/12 bg-white/5 text-blue-100/75 hover:border-cyan-300/50 hover:text-white",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
            <p className="text-sm leading-6 text-blue-100/70">
              {fallbackMode === "ai_web_search" &&
                "Podaj nazwę produktu, opcjonalnie markę i wybierz kategorię. Shelfie spróbuje znaleźć wariant w sieci, a pełny draft otworzy dopiero na osobnym ekranie review. Dla precyzyjniejszych wyników wpisz też stężenie, SPF albo pełny wariant."}
              {fallbackMode === "photo_vision" &&
                "Dodaj zdjęcie produktu albo etykiety. Shelfie zapisze je u siebie, spróbuje odczytać nazwę i INCI przez model vision, a potem pokaże wynik w osobnym review."}
              {fallbackMode === "manual" &&
                "Wprowadź produkt ręcznie, jeśli żadne źródło nie zwróciło wystarczających danych."}
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-blue-100/80">Nazwa produktu</span>
                <input
                  type="text"
                  value={fallbackDraft.name}
                  onChange={(event) => {
                    setFallbackDraft((current) => ({ ...current, name: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-blue-100/80">Marka</span>
                <input
                  type="text"
                  value={fallbackDraft.brand}
                  onChange={(event) => {
                    setFallbackDraft((current) => ({ ...current, brand: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-blue-100/80">Kategoria</span>
                <select
                  value={fallbackDraft.category}
                  onChange={(event) => {
                    setFallbackDraft((current) => ({ ...current, category: event.target.value as ProductCategory }));
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

              {fallbackMode !== "ai_web_search" && (
                <label className="block">
                  <span className="mb-2 block text-sm text-blue-100/80">Barcode</span>
                  <input
                    type="text"
                    value={fallbackDraft.barcode}
                    onChange={(event) => {
                      setFallbackDraft((current) => ({ ...current, barcode: event.target.value }));
                    }}
                    className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                  />
                </label>
              )}
            </div>

            {fallbackMode === "photo_vision" ? (
              <div className="space-y-4 rounded-2xl border border-white/12 bg-white/5 p-4">
                <div className="space-y-3">
                  <span className="block text-sm text-blue-100/80">Zdjęcia produktu i etykiety</span>

                  <input
                    ref={frontPhotoUploadInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                    onChange={(event) => {
                      handlePhotoSelection(event, "front");
                    }}
                    className="hidden"
                  />

                  <input
                    ref={backPhotoUploadInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                    onChange={(event) => {
                      handlePhotoSelection(event, "back");
                    }}
                    className="hidden"
                  />

                  <input
                    ref={frontPhotoCameraInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/*"
                    capture="environment"
                    onChange={(event) => {
                      handlePhotoSelection(event, "front");
                    }}
                    className="hidden"
                  />

                  <input
                    ref={backPhotoCameraInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/*"
                    capture="environment"
                    onChange={(event) => {
                      handlePhotoSelection(event, "back");
                    }}
                    className="hidden"
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3 rounded-2xl border border-white/12 bg-slate-950/35 p-4">
                      <p className="text-sm font-semibold text-white">Przód produktu</p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            frontPhotoUploadInputRef.current?.click();
                          }}
                          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
                        >
                          Wybierz zdjęcie przodu
                        </button>
                        {isMobileCameraPreferred ? (
                          <button
                            type="button"
                            onClick={() => {
                              frontPhotoCameraInputRef.current?.click();
                            }}
                            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                          >
                            Zrób zdjęcie przodu
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void openDesktopCamera("front");
                            }}
                            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                          >
                            Otwórz kamerkę przodu
                          </button>
                        )}
                      </div>
                      {frontPhotoFile && (
                        <p className="text-xs text-blue-100/60">
                          Wybrane zdjęcie: <span className="font-medium text-white">{frontPhotoFile.name}</span>
                        </p>
                      )}
                      {frontPhotoPreviewUrl && (
                        <img
                          src={frontPhotoPreviewUrl}
                          alt="Podgląd zdjęcia przodu produktu"
                          className="max-h-56 rounded-2xl border border-white/12 object-contain"
                        />
                      )}
                    </div>

                    <div className="space-y-3 rounded-2xl border border-white/12 bg-slate-950/35 p-4">
                      <p className="text-sm font-semibold text-white">Tył / etykieta ze składem</p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            backPhotoUploadInputRef.current?.click();
                          }}
                          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
                        >
                          Wybierz zdjęcie etykiety
                        </button>
                        {isMobileCameraPreferred ? (
                          <button
                            type="button"
                            onClick={() => {
                              backPhotoCameraInputRef.current?.click();
                            }}
                            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                          >
                            Zrób zdjęcie etykiety
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void openDesktopCamera("back");
                            }}
                            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                          >
                            Otwórz kamerkę etykiety
                          </button>
                        )}
                      </div>
                      {backPhotoFile && (
                        <p className="text-xs text-blue-100/60">
                          Wybrane zdjęcie: <span className="font-medium text-white">{backPhotoFile.name}</span>
                        </p>
                      )}
                      {backPhotoPreviewUrl && (
                        <img
                          src={backPhotoPreviewUrl}
                          alt="Podgląd zdjęcia etykiety produktu"
                          className="max-h-56 rounded-2xl border border-white/12 object-contain"
                        />
                      )}
                    </div>
                  </div>

                  {desktopCameraError && <p className="text-sm text-red-200">{desktopCameraError}</p>}
                </div>

                {isDesktopCameraOpen && (
                  <div className="space-y-3 rounded-2xl border border-white/12 bg-slate-950/35 p-4">
                    <p className="text-sm text-blue-100/70">Podgląd z kamerki desktopowej</p>
                    <video
                      ref={desktopCameraVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="max-h-72 w-full rounded-2xl border border-white/12 object-contain"
                    />
                    <canvas ref={desktopCameraCanvasRef} className="hidden" />
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          void captureDesktopPhoto();
                        }}
                        className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                      >
                        {desktopCameraTarget === "front" ? "Zrób zdjęcie przodu" : "Zrób zdjęcie etykiety"}
                      </button>
                      <button
                        type="button"
                        onClick={closeDesktopCamera}
                        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
                      >
                        Zamknij kamerkę
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : fallbackMode === "manual" ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-blue-100/80">URL zdjęcia produktu</span>
                  <input
                    type="text"
                    value={fallbackDraft.sourceImageUrl}
                    onChange={(event) => {
                      setFallbackDraft((current) => ({ ...current, sourceImageUrl: event.target.value }));
                    }}
                    className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                  />
                </label>

                {fallbackDraft.sourceImageUrl && (
                  <div className="space-y-2 rounded-2xl border border-white/12 bg-white/5 p-4">
                    <p className="text-sm text-blue-100/70">Podgląd zdjęcia produktu</p>
                    <img
                      src={fallbackDraft.sourceImageUrl}
                      alt="Podgląd zdjęcia produktu z draftu manualnego"
                      className="max-h-64 rounded-2xl border border-white/12 object-contain"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/8 p-4 text-sm leading-6 text-blue-100/75">
                Ten krok służy tylko do znalezienia draftu. Jeśli wyszukiwanie się powiedzie, na kolejnym ekranie
                dostaniesz pełny formularz review z możliwością poprawy nazwy, zdjęcia, barcode i INCI.
              </div>
            )}

            {fallbackMode === "ai_web_search" ? (
              <p className="text-xs text-blue-100/50">
                W tym trybie INCI uzupełnia automatyczne wyszukiwanie. Jeśli nic nie znajdziemy, przełącz się na photo
                extraction albo manual entry.
              </p>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm text-blue-100/80">Lista INCI</span>
                <textarea
                  rows={6}
                  value={fallbackDraft.inciText}
                  onChange={(event) => {
                    setFallbackDraft((current) => ({ ...current, inciText: event.target.value }));
                  }}
                  placeholder="Wklej składniki rozdzielone przecinkami albo nowymi liniami"
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                />
                <span className="mt-2 block text-xs text-blue-100/50">
                  Na osobnym ekranie review będziesz jeszcze mogła poprawić draft przed zapisaniem produktu.
                </span>
              </label>
            )}

            {aiSearchSource && fallbackMode === "ai_web_search" && (
              <p className="text-xs text-blue-100/55">
                Ostatni draft AI web search: {aiSearchSource.provider} · model {aiSearchSource.model} · źródło główne:{" "}
                {aiSearchSource.sourceType}
                {` · pewność dopasowania: ${aiSearchSource.matchConfidence}`}
                {aiSearchSource.exactVariantMatch ? " · exact match wariantu" : " · bez exact match"}
                {aiSearchSource.sourceUrl ? ` · URL: ${aiSearchSource.sourceUrl}` : ""}
                {aiSearchSource.sourceTitle ? ` · tytuł strony: ${aiSearchSource.sourceTitle}` : ""}
                {aiSearchSource.quotedEvidence ? ` · cytat dowodowy: ${aiSearchSource.quotedEvidence}` : ""}
                {aiSearchSource.supportingSource ? ` · źródło pomocnicze: ${aiSearchSource.supportingSource}` : ""}
                {aiSearchSource.reasoning ? ` · reasoning: ${aiSearchSource.reasoning}` : ""}
                {aiSearchSource.debugTraceId ? ` · trace: ${aiSearchSource.debugTraceId}` : ""}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              {selectedCandidate && (
                <button
                  type="button"
                  onClick={() => {
                    navigateToNewDraftReview(createReviewDraftFromCandidate(selectedCandidate));
                  }}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
                >
                  Pomiń fallback i edytuj draft
                </button>
              )}
              <button
                type="button"
                onClick={fallbackMode === "photo_vision" ? handlePhotoVisionSubmit : applyFallbackDraft}
                disabled={
                  fallbackMode === "ai_web_search"
                    ? isResolvingAiSearch
                    : fallbackMode === "photo_vision"
                      ? isExtractingPhoto
                      : false
                }
                className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
              >
                {fallbackMode === "ai_web_search"
                  ? isResolvingAiSearch
                    ? "Szukam w sieci..."
                    : "Znajdź INCI i przejdź do review"
                  : fallbackMode === "photo_vision"
                    ? isExtractingPhoto
                      ? "Odczytuję zdjęcie..."
                      : "Odczytaj zdjęcie i przejdź do review"
                    : "Przejdź do review"}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "disambiguation" && aiSearchAmbiguity && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Krok 3</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Doprecyzuj wariant produktu</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep("fallback");
                setSearchError(null);
              }}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/12"
            >
              Wróć do fallbacku
            </button>
          </div>

          <div className="space-y-5 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">{aiSearchAmbiguity.question}</p>
              <p className="text-sm leading-6 text-blue-100/70">{aiSearchAmbiguity.refinementHint}</p>
            </div>

            <div className="grid gap-4">
              {aiSearchAmbiguity.variants.map((variant) => (
                <article key={variant.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold text-white">{variant.label}</h3>
                      {variant.description && (
                        <p className="text-sm leading-6 text-blue-100/70">{variant.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleAiVariantSelection(variant);
                      }}
                      disabled={isResolvingAiSearch}
                      className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
                    >
                      {isResolvingAiSearch ? "Szukam..." : "Mam na myśli ten wariant"}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="space-y-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/8 p-4">
              <div>
                <p className="text-sm font-semibold text-white">Nie widzisz swojego wariantu?</p>
                <p className="mt-2 text-sm leading-6 text-blue-100/70">
                  Wpisz dokładniejszą nazwę, np. ze stężeniem, pojemnością, SPF albo dopiskiem linii produktu.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={aiSearchRefinement}
                  onChange={(event) => {
                    setAiSearchRefinement(event.target.value);
                  }}
                  placeholder="np. BasicLab serum z retinalem 0,15%"
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleAiRefinementSubmit();
                  }}
                  disabled={isResolvingAiSearch}
                  className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
                >
                  {isResolvingAiSearch ? "Szukam..." : "Szukaj dokładniejszej nazwy"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
