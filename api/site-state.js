const { getDb, json } = require("./_mongo");

const COLLECTION_NAME = "site_state";
const RECORD_ID = "default";

function isRemoteKey(value) {
  return /^(mongo:|gfs:)/.test(String(value || ""));
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeProducts(products) {
  return Array.isArray(products) ? products.filter((product) => product && typeof product === "object") : [];
}

function attachMediaAliases(payload) {
  const next = asObject(payload);
  const main = asObject(next.main);
  const about = asObject(next.about);
  const heroVideo = String(main.heroMediaKey || "").trim();
  const aboutMedia = String(about.mediaKey || "").trim();

  return {
    ...next,
    main: {
      ...main,
      hero: {
        ...(asObject(main.hero)),
        video: heroVideo,
      },
    },
    about: {
      ...about,
      media: aboutMedia,
    },
  };
}

function slimProduct(product) {
  const safeProduct = asObject(product);
  return {
    id: safeProduct.id || "",
    slug: safeProduct.slug || safeProduct.id || "",
    category: safeProduct.category || "",
    active: Boolean(safeProduct.active),
    showOnMain: Boolean(safeProduct.showOnMain),
    name: safeProduct.name || "",
    summary: safeProduct.summary || "",
    thumbnailName: safeProduct.thumbnailName || "",
    thumbnailKey: safeProduct.thumbnailKey || "",
    thumbnailUrl: safeProduct.thumbnailUrl || "",
    palette: Array.isArray(safeProduct.palette) ? safeProduct.palette : [],
  };
}

function buildPayloadForPage(payload, page) {
  if (!payload || typeof payload !== "object") return payload;

  const safePayload = attachMediaAliases(payload);

  if (page === "home") {
    return {
      main: asObject(safePayload.main),
      branding: asObject(safePayload.branding),
      products: safeProducts(safePayload.products)
        .filter((product) => Boolean(product.active) && Boolean(product.showOnMain))
        .map(slimProduct),
    };
  }

  if (page === "about") {
    return {
      main: {
        heroBackground: Array.isArray(safePayload.main?.heroBackground) ? safePayload.main.heroBackground : [],
      },
      about: asObject(safePayload.about),
      branding: asObject(safePayload.branding),
    };
  }

  return safePayload;
}

function stripHeavyVideoPoster(payload) {
  if (!payload || typeof payload !== "object") return payload;

  const next = JSON.parse(JSON.stringify(payload));
  next.main = asObject(next.main);
  next.about = asObject(next.about);

  if (isRemoteKey(next.main?.heroMediaKey) && String(next.main.heroImageUrl || "").startsWith("data:")) {
    next.main.heroImageUrl = "";
  }

  if (isRemoteKey(next.about?.mediaKey) && String(next.about.imageUrl || "").startsWith("data:")) {
    next.about.imageUrl = "";
  }

  if (Array.isArray(next.products)) {
    next.products = next.products
      .filter((product) => product && typeof product === "object")
      .map((product) => {
        const nextProduct = { ...product };
        if (
          (isRemoteKey(nextProduct.thumbnailKey) || String(nextProduct.thumbnailUrl || "").length > 120000) &&
          String(nextProduct.thumbnailUrl || "").startsWith("data:")
        ) {
          nextProduct.thumbnailUrl = "";
        }
        if (
          (isRemoteKey(nextProduct.coverKey) || String(nextProduct.coverUrl || "").length > 120000) &&
          String(nextProduct.coverUrl || "").startsWith("data:")
        ) {
          nextProduct.coverUrl = "";
        }
        if (String(nextProduct.content || "").length > 240000 && nextProduct.content.includes("data:image")) {
          nextProduct.content = "";
        }
        return nextProduct;
      });
  }

  return next;
}

module.exports = async function handler(request, response) {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  if (request.method === "GET") {
    const record = await collection.findOne({ _id: RECORD_ID });
    const page = String(request.query?.page || "");
    const payload = buildPayloadForPage(stripHeavyVideoPoster(record?.payload || null), page);
    if (page === "home" || page === "about") {
      response.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    } else {
      response.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    }
    return json(response, 200, { ok: true, partial: page === "home" || page === "about", payload });
  }

  if (request.method === "POST") {
    const section = String(request.body?.section || "").trim();
    const payload = stripHeavyVideoPoster(request.body?.payload);
    if (!payload || typeof payload !== "object") {
      return json(response, 400, { ok: false, message: "payload is required" });
    }

    if (section) {
      const record = await collection.findOne({ _id: RECORD_ID });
      const currentPayload = asObject(record?.payload);
      const currentSection = asObject(currentPayload[section]);
      await collection.updateOne(
        { _id: RECORD_ID },
        {
          $set: {
            [`payload.${section}`]: {
              ...currentSection,
              ...payload,
            },
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return json(response, 200, { ok: true });
    }

    await collection.updateOne(
      { _id: RECORD_ID },
      {
        $set: {
          payload,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return json(response, 200, { ok: true });
  }

  response.setHeader("Allow", "GET, POST");
  return json(response, 405, { ok: false, message: "Method not allowed" });
};
