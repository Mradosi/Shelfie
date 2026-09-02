import type { APIRoute } from "astro";
import {
  createAiErrorResponse,
  createAiErrorResponseFromException,
} from "@/lib/domain/ai-error-contract";
import { isProductCategory, type ProductCategory } from "@/lib/domain/product-domain";
import { resolveAiWebSearchDraft } from "@/lib/integrations/openrouter";
import { resolvePhotoVisionDraft } from "@/lib/integrations/openrouter-vision";
import { createClient } from "@/lib/supabase";

const PHOTO_BUCKET = "product-images";
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

function normalizeOptionalText(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCategory(value: FormDataEntryValue | null): ProductCategory | null {
  if (typeof value !== "string") {
    return null;
  }

  return isProductCategory(value) ? value : null;
}

function toDataUrl(file: File, arrayBuffer: ArrayBuffer) {
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${file.type};base64,${base64}`;
}

function sanitizeFileName(name: string) {
  return name
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isImageFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

async function uploadPhoto(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  photo: File,
  prefix: string,
) {
  if (!photo.type.startsWith("image/")) {
    throw new Error("Photo extraction akceptuje tylko pliki graficzne.");
  }

  if (photo.size > MAX_PHOTO_SIZE_BYTES) {
    throw new Error("Zdjęcie jest za duże. Maksymalny rozmiar to 10 MB.");
  }

  const filePath = `${userId}/${prefix}-${crypto.randomUUID()}-${sanitizeFileName(photo.name || `${prefix}-product-photo`)}`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(filePath, photo, {
    contentType: photo.type,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Nie udało się zapisać zdjęcia produktu: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);

  return {
    file: photo,
    publicUrl,
    arrayBuffer: await photo.arrayBuffer(),
  };
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return createAiErrorResponse("provider_unavailable");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return createAiErrorResponse("unauthorized", 401);
  }

  if (!user) {
    return createAiErrorResponse("unauthorized", 401);
  }

  const form = await context.request.formData();
  const frontPhoto = form.get("frontPhoto");
  const backPhoto = form.get("backPhoto");

  if (!isImageFile(frontPhoto) && !isImageFile(backPhoto)) {
    return createAiErrorResponse("invalid_request", 400);
  }

  let uploadedFrontPhoto: Awaited<ReturnType<typeof uploadPhoto>> | null = null;
  let uploadedBackPhoto: Awaited<ReturnType<typeof uploadPhoto>> | null = null;

  try {
    if (isImageFile(frontPhoto)) {
      uploadedFrontPhoto = await uploadPhoto(supabase, user.id, frontPhoto, "front");
    }

    if (isImageFile(backPhoto)) {
      uploadedBackPhoto = await uploadPhoto(supabase, user.id, backPhoto, "back");
    }
  } catch (error) {
    return createAiErrorResponseFromException(error);
  }

  try {
    const primaryPhoto = uploadedBackPhoto ?? uploadedFrontPhoto;
    if (!primaryPhoto) {
      return createAiErrorResponse("invalid_request", 400);
    }

    const visionResult = await resolvePhotoVisionDraft({
      frontFileName: uploadedFrontPhoto?.file.name,
      frontMimeType: uploadedFrontPhoto?.file.type,
      frontImageDataUrl: uploadedFrontPhoto ? toDataUrl(uploadedFrontPhoto.file, uploadedFrontPhoto.arrayBuffer) : null,
      backFileName: uploadedBackPhoto?.file.name,
      backMimeType: uploadedBackPhoto?.file.type,
      backImageDataUrl: uploadedBackPhoto ? toDataUrl(uploadedBackPhoto.file, uploadedBackPhoto.arrayBuffer) : null,
      storedImageUrl: uploadedFrontPhoto?.publicUrl ?? uploadedBackPhoto?.publicUrl ?? "",
      sourceImageUrl: uploadedFrontPhoto?.publicUrl ?? "",
      suggestedName: normalizeOptionalText(form.get("name")),
      suggestedBrand: normalizeOptionalText(form.get("brand")),
      suggestedCategory: normalizeCategory(form.get("category")),
      suggestedBarcode: normalizeOptionalText(form.get("barcode")),
    });

    if (!visionResult.needsWebSearchFallback) {
      return new Response(JSON.stringify({ draft: visionResult.draft }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const fallbackName = (visionResult.draft.name || normalizeOptionalText(form.get("name"))) ?? primaryPhoto.file.name;
    const fallbackBrand = visionResult.draft.brand || normalizeOptionalText(form.get("brand"));
    const fallbackBarcode = visionResult.draft.barcode || normalizeOptionalText(form.get("barcode"));

    const fallbackResult = await resolveAiWebSearchDraft({
      name: fallbackName,
      brand: fallbackBrand,
      category: visionResult.draft.category,
      barcode: fallbackBarcode,
    });

    if (fallbackResult.status !== "resolved") {
      return new Response(
        JSON.stringify({
          draft: {
            ...visionResult.draft,
            storedImageUrl: uploadedFrontPhoto?.publicUrl ?? uploadedBackPhoto?.publicUrl ?? "",
            sourceImageUrl: visionResult.draft.sourceImageUrl || (uploadedFrontPhoto?.publicUrl ?? ""),
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const fallbackDraft = {
      ...fallbackResult.draft,
      storedImageUrl: uploadedFrontPhoto?.publicUrl ?? uploadedBackPhoto?.publicUrl ?? "",
      sourceImageUrl:
        fallbackResult.draft.sourceImageUrl ||
        visionResult.draft.sourceImageUrl ||
        (uploadedFrontPhoto?.publicUrl ?? ""),
    };

    return new Response(JSON.stringify({ draft: fallbackDraft }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return createAiErrorResponseFromException(error);
  }
};
