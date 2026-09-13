import type { SharedProduct } from "@/lib/domain/product-domain";
import type { UserProductInterpretation } from "@/lib/domain/product-interpretation";
import type { RoutineAiAssessment } from "@/lib/domain/routine-ai";
import type { BaseRoutineDraft } from "@/lib/domain/routine-schedule";
import type { UserProfileInterpretationBasis, UserShelfCatalogItem } from "@/lib/domain/user-domain";

const TIMESTAMP = "2026-08-10T10:00:00.000Z";

export interface AiContractFixtures {
  profileBasis: UserProfileInterpretationBasis;
  products: SharedProduct[];
  shelfCatalog: UserShelfCatalogItem[];
  interpretations: UserProductInterpretation[];
  currentDraft: BaseRoutineDraft;
  validAssessment: RoutineAiAssessment;
}

export function createAiContractFixtures(): AiContractFixtures {
  const profileBasis: UserProfileInterpretationBasis = {
    skinType: "oily",
    skinAspects: {
      sensitivity: "medium",
      pigmentation: "low",
      firmness: "none",
      breakouts: "high",
      texture: "medium",
    },
    concerns: ["Niedoskonałości"],
    goals: ["Wspierać barierę skóry"],
  };

  const products: SharedProduct[] = [
    {
      id: "product-cleanser",
      name: "Delikatna pianka",
      brand: "Test Brand",
      category: "cleanser",
      barcode: null,
      normalizedName: "delikatna pianka",
      normalizedBrand: "test brand",
      inciList: ["Aqua", "Glycerin"],
      imageUrl: null,
      sourceImageUrl: null,
      storedImageUrl: null,
      inciSource: "manual",
      inciConfidence: "high",
      inciUpdatedAt: TIMESTAMP,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    {
      id: "product-serum",
      name: "Serum BHA",
      brand: "Test Brand",
      category: "exfoliant",
      barcode: null,
      normalizedName: "serum bha",
      normalizedBrand: "test brand",
      inciList: ["Aqua", "Salicylic Acid"],
      imageUrl: null,
      sourceImageUrl: null,
      storedImageUrl: null,
      inciSource: "manual",
      inciConfidence: "high",
      inciUpdatedAt: TIMESTAMP,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ];

  const shelfCatalog: UserShelfCatalogItem[] = [
    {
      id: "shelf-cleanser",
      userId: "user-test",
      productId: "product-cleanser",
      note: null,
      excludeFromAiRoutines: false,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      product: {
        id: "product-cleanser",
        name: "Delikatna pianka",
        brand: "Test Brand",
        category: "cleanser",
        imageUrl: null,
      },
    },
    {
      id: "shelf-serum",
      userId: "user-test",
      productId: "product-serum",
      note: null,
      excludeFromAiRoutines: false,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      product: {
        id: "product-serum",
        name: "Serum BHA",
        brand: "Test Brand",
        category: "exfoliant",
        imageUrl: null,
      },
    },
  ];

  const interpretations: UserProductInterpretation[] = products.map((product) => ({
    id: `interpretation-${product.id}`,
    userId: "user-test",
    productId: product.id,
    status: "ready",
    fitStatus: "recommended",
    fitScore: 80,
    confidence: "high",
    summaryShort: "Dopasowany do profilu testowego.",
    reasoningShort: "Fixture dla kontraktów AI.",
    recommendedFor: [],
    cautionFor: [],
    warnings: [],
    profileBasis,
    productBasis: {
      category: product.category,
      inciList: product.inciList,
      inciConfidence: product.inciConfidence,
      inciUpdatedAt: product.inciUpdatedAt,
    },
    modelVersion: "test-model-v1",
    promptVersion: "test-prompt-v1",
    generatedAt: TIMESTAMP,
    staleAt: null,
    staleReason: null,
    lastError: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  }));

  const currentDraft: BaseRoutineDraft = {
    morning: [
      { shelfItemId: "shelf-cleanser", routineRole: "cleanse" },
      { shelfItemId: "shelf-serum", routineRole: "exfoliate" },
    ],
    evening: [],
  };

  return {
    profileBasis,
    products,
    shelfCatalog,
    interpretations,
    currentDraft,
    validAssessment: {
      overallStatus: "considered",
      summary: "Nie wykryto istotnej interakcji w fixture testowym.",
      findings: [],
      compatibilityAudit: [
        {
          section: "morning",
          shelfItemIds: ["shelf-cleanser", "shelf-serum"],
          verdict: "no_material_interaction",
          reason: "Fixture obejmuje wymaganą parę produktów.",
          ingredientCitations: [],
        },
      ],
    },
  };
}
