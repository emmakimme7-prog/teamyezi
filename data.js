const STORAGE_KEYS = {
  siteState: "fit_pick_site_state",
  adminSession: "fit_pick_admin_session",
  adminCredentials: "fit_pick_admin_credentials",
};
const ADMIN_SESSION_DURATION_MS = 60 * 60 * 1000;
const MEDIA_DB_NAME = "fit_pick_media_db";
const MEDIA_STORE_NAME = "media_assets";
const STATE_DB_NAME = "fit_pick_state_db";
const STATE_STORE_NAME = "site_state";
const STATE_RECORD_KEY = "current";
let remoteSyncInFlight = null;

function isRemoteMediaKey(key) {
  const value = String(key || "");
  return value.startsWith("mongo:") || value.startsWith("gfs:") || value.startsWith("gcs:");
}

const defaultSiteState = {
  main: {
    enabled: true,
    workListEnabled: true,
    heroTitle: "TY",
    heroImageName: "main.jpg",
    heroMediaType: "image",
    heroMediaKey: "",
    heroPosterKey: "",
    heroImageUrl: "",
    heroBackground: ["#f2f1ee", "#d8d7d3", "#ffffff"],
  },
  about: {
    enabled: true,
    imageEnabled: true,
    imageName: "main.mp4",
    mediaType: "image",
    mediaKey: "",
    posterKey: "",
    imageUrl: "",
    sections: [
      {
        id: "about",
        title: "About",
        content:
          "TY(teamyezi)는 비주얼 브랜딩과 크리에이티브 디렉팅에 기반한 Consultancy 팀입니다. 필드에서 활발하게 활동하는 전문적인 크루와 함께 전략과 장면을 연결해 우리만의 결과물을 만들어갑니다.",
        chips: ["브랜딩 디자인", "brand identity", "Logo / symbol / typo / brand color / label / SNS"],
      },
      {
        id: "services",
        title: "Services",
        content:
          "우리는 스타트업부터 기성 브랜드까지 브랜드의 니즈를 파악하고 디렉팅을 시작으로 스타일링 및 촬영, 비주얼 디자인, 마케팅까지의 전 영역을 제안하고 전개합니다.",
        chips: [],
      },
      {
        id: "contact-us",
        title: "Contact us",
        content:
          "Team_YEZ1는 브랜드의 도약을 준비하는 여러분을 기다리고 있습니다. 각 스테이션을 거치며 출발과 도착을 함께 설계합니다.",
        chips: ["문의 + pre question 작성", "견적 안내", "미팅", "계약", "촬영 기획", "촬영", "최종 납기"],
      },
    ],
  },
  branding: {
    logoLink: "",
  },
  categories: ["Visual branding", "Creative directing"],
  products: [
    {
      id: "first-project",
      slug: "first-project",
      category: "Visual branding",
      active: true,
      showOnMain: true,
      name: "Summer Pool Editorial",
      summary: "수면의 반사광과 여름 컬러를 중심으로 브랜드 무드를 재정리한 비주얼 브랜딩 프로젝트.",
      content:
        "브랜드의 시즌 키워드를 물성과 색으로 다시 해석해 에디토리얼 무드를 설계했습니다. 메인 비주얼, SNS 활용 컷, 상세 페이지용 톤앤매너를 하나의 흐름으로 맞추고 여름 시즌에 어울리는 선명한 인상을 만드는 데 집중했습니다.",
      thumbnailName: "main.jpg",
      thumbnailKey: "",
      thumbnailUrl: "",
      coverName: "cover.jpg",
      coverKey: "",
      coverUrl: "",
      gallery: [
        { id: "g1", name: "detail-1.jpg", url: "" },
        { id: "g2", name: "detail-2.jpg", url: "" },
        { id: "g3", name: "detail-3.jpg", url: "" },
        { id: "g4", name: "detail-4.jpg", url: "" },
      ],
      palette: ["#111111", "#444444", "#f0f0f0"],
      createdAt: "2026-03-26 14:00:00",
    },
    {
      id: "second-project",
      slug: "second-project",
      category: "Creative directing",
      active: true,
      showOnMain: true,
      name: "Resort Campaign Direction",
      summary: "룩의 텍스처와 바다의 온도를 연결해 촬영 콘셉트부터 결과물 활용까지 설계한 캠페인 디렉팅.",
      content:
        "촬영 콘셉트 제안, 레퍼런스 보드 정리, 현장 디렉팅, 최종 셀렉 기준 수립까지 전 과정을 담당했습니다. 결과물은 캠페인 비주얼과 썸네일, 상세 페이지 키 컷으로 확장될 수 있도록 구성했습니다.",
      thumbnailName: "main.jpg",
      thumbnailKey: "",
      thumbnailUrl: "",
      coverName: "cover.jpg",
      coverKey: "",
      coverUrl: "",
      gallery: [
        { id: "g1", name: "detail-1.jpg", url: "" },
        { id: "g2", name: "detail-2.jpg", url: "" },
        { id: "g3", name: "detail-3.jpg", url: "" },
        { id: "g4", name: "detail-4.jpg", url: "" },
      ],
      palette: ["#1b1b1b", "#765d4b", "#efe7df"],
      createdAt: "2026-03-26 14:10:00",
    },
    {
      id: "third-project",
      slug: "third-project",
      category: "Visual branding",
      active: true,
      showOnMain: true,
      name: "Launch Visual Kit",
      summary: "신규 브랜드 론칭에 맞춰 심벌, 컬러, 촬영 결과물을 한 톤으로 연결한 스타트업용 비주얼 패키지.",
      content:
        "브랜드의 첫 인상이 필요한 시점에 맞춰 로고 응용, 컬러 가이드, 상세 페이지용 메인 컷, SNS 오프닝 비주얼을 하나의 세트처럼 제안했습니다. 적은 자산으로도 밀도 있게 보이도록 편집 구조와 컷 구성을 함께 정리했습니다.",
      thumbnailName: "main.jpg",
      thumbnailKey: "",
      thumbnailUrl: "",
      coverName: "cover.jpg",
      coverKey: "",
      coverUrl: "",
      gallery: [
        { id: "g1", name: "detail-1.jpg", url: "" },
        { id: "g2", name: "detail-2.jpg", url: "" },
        { id: "g3", name: "detail-3.jpg", url: "" },
      ],
      palette: ["#191919", "#a48672", "#f3eee9"],
      createdAt: "2026-03-26 14:20:00",
    },
  ],
  inquiries: [
    {
      id: "inq-1",
      status: "완료",
      brand: "Marlow Studio",
      name: "박서윤",
      contact: "010-4821-1934",
      content: "브랜드 리뉴얼 시즌에 맞춰 룩북과 상세 페이지용 메인 촬영을 함께 진행할 수 있는지 문의드립니다.",
      receivedAt: "2026-03-26 10:00:00",
      completedAt: "2026-03-26 12:00:00",
      manager: "김정원",
      memo: "1차 미팅 후 견적서 전달 완료",
    },
    {
      id: "inq-2",
      status: "대기",
      brand: "Onda Swim",
      name: "이하린",
      contact: "010-7254-6621",
      content: "여름 시즌 캠페인 촬영 일정과 콘셉트 제안 범위를 먼저 상담받고 싶습니다.",
      receivedAt: "2026-03-26 13:00:00",
      completedAt: "",
      manager: "",
      memo: "",
    },
  ],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProduct(product, index) {
  const palette = Array.isArray(product.palette) && product.palette.length === 3
    ? [...product.palette]
    : ["#111111", "#666666", "#f0f0f0"];

  return {
    id: product.id || `product-${index + 1}`,
    slug: product.slug || product.id || `product-${index + 1}`,
    category: product.category || "Visual branding",
    active: Boolean(product.active),
    showOnMain: Boolean(product.showOnMain),
    name: product.name || "Untitled",
    summary: product.summary || "",
    content: product.content || "",
    thumbnailName: product.thumbnailName || "main.jpg",
    thumbnailKey: product.thumbnailKey || "",
    thumbnailUrl: product.thumbnailUrl || "",
    coverName: product.coverName || "cover.jpg",
    coverKey: product.coverKey || "",
    coverUrl: product.coverUrl || "",
    gallery: Array.isArray(product.gallery) && product.gallery.length
      ? product.gallery.map((item, galleryIndex) => ({
          id: item.id || `g-${galleryIndex + 1}`,
          name: item.name || `detail-${galleryIndex + 1}.jpg`,
          url: item.url || "",
        }))
      : [],
    palette,
    createdAt: product.createdAt || "",
  };
}

function normalizeSection(section, index) {
  return {
    id: section.id || `section-${index + 1}`,
    title: section.title || "",
    content: section.content || "",
    chips: Array.isArray(section.chips) ? [...section.chips] : [],
  };
}

function normalizeInquiry(inquiry, index) {
  const normalizedAttachments = Array.isArray(inquiry.attachments)
    ? inquiry.attachments
        .map((attachment, attachmentIndex) => ({
          id: attachment.id || `attachment-${index + 1}-${attachmentIndex + 1}`,
          key: attachment.key || "",
          name: attachment.name || "",
          type: attachment.type || "",
          size: Number(attachment.size || 0),
        }))
        .filter((attachment) => attachment.key || attachment.name)
    : [];
  const fallbackAttachment =
    !normalizedAttachments.length && (inquiry.attachmentKey || inquiry.attachmentName)
      ? [
          {
            id: `attachment-${index + 1}-1`,
            key: inquiry.attachmentKey || "",
            name: inquiry.attachmentName || "",
            type: inquiry.attachmentType || "",
            size: Number(inquiry.attachmentSize || 0),
          },
        ]
      : [];
  const attachments = normalizedAttachments.length ? normalizedAttachments : fallbackAttachment;

  return {
    id: inquiry.id || `inq-${index + 1}`,
    status: inquiry.status || "대기",
    brand: inquiry.brand || "",
    name: inquiry.name || "",
    contact: inquiry.contact || "",
    content: inquiry.content || "",
    attachmentKey: attachments[0]?.key || "",
    attachmentName: attachments[0]?.name || "",
    attachmentType: attachments[0]?.type || "",
    attachmentSize: Number(attachments[0]?.size || 0),
    attachments,
    privacyConsent: Boolean(inquiry.privacyConsent),
    privacyConsentAt: inquiry.privacyConsentAt || "",
    receivedAt: inquiry.receivedAt || "",
    completedAt: inquiry.completedAt || "",
    manager: inquiry.manager || "",
    memo: inquiry.memo || "",
  };
}

function normalizeSiteState(state) {
  const next = deepClone(defaultSiteState);
  const merged = { ...next, ...(state || {}) };

  merged.main = {
    ...next.main,
    ...(state?.main || {}),
    heroMediaType: state?.main?.heroMediaType || next.main.heroMediaType,
    heroMediaKey: state?.main?.heroMediaKey || next.main.heroMediaKey,
    heroPosterKey: state?.main?.heroPosterKey || next.main.heroPosterKey,
  };

  merged.about = {
    ...next.about,
    ...(state?.about || {}),
    mediaType: state?.about?.mediaType || next.about.mediaType,
    mediaKey: state?.about?.mediaKey || next.about.mediaKey,
    posterKey: state?.about?.posterKey || next.about.posterKey,
    sections: Array.isArray(state?.about?.sections)
      ? state.about.sections.map(normalizeSection)
      : next.about.sections.map(normalizeSection),
  };

  merged.branding = {
    ...next.branding,
    ...(state?.branding || {}),
  };

  merged.categories = Array.isArray(state?.categories) && state.categories.length
    ? state.categories.map((category) => String(category || "").trim()).filter(Boolean)
    : [...next.categories];

  merged.products = Array.isArray(state?.products)
    ? state.products.map((product, index) => {
        const normalized = normalizeProduct(product, index);
        if (!merged.categories.includes(normalized.category)) {
          merged.categories.push(normalized.category);
        }
        return normalized;
      })
    : next.products.map(normalizeProduct);

  merged.inquiries = Array.isArray(state?.inquiries)
    ? state.inquiries.map(normalizeInquiry)
    : next.inquiries.map(normalizeInquiry);

  return merged;
}

function migrateLegacyProjects() {
  try {
    const legacy = localStorage.getItem("ty_studio_projects");
    if (!legacy) return null;

    const parsed = JSON.parse(legacy);
    if (!Array.isArray(parsed) || !parsed.length) return null;

    return parsed.map((project, index) =>
      normalizeProduct(
        {
          id: project.id,
          slug: project.id,
          category: project.label || "Visual branding",
          active: true,
          showOnMain: Boolean(project.featured),
          name: project.title,
          summary: project.summary,
          content: project.summary,
          thumbnailName: "main.jpg",
          thumbnailKey: "",
          coverName: "cover.jpg",
          coverKey: "",
          palette: project.palette,
          createdAt: "2026-03-26 14:00:00",
        },
        index
      )
    );
  } catch (error) {
    return null;
  }
}

function readSiteState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.siteState);
    if (!raw) {
      const migratedProducts = migrateLegacyProjects();
      if (migratedProducts) {
        return sanitizeStateForStorage({ ...defaultSiteState, products: migratedProducts });
      }

      return sanitizeStateForStorage(defaultSiteState);
    }

    return sanitizeStateForStorage(JSON.parse(raw));
  } catch (error) {
    return sanitizeStateForStorage(defaultSiteState);
  }
}

function sanitizeStateForStorage(siteState) {
  const normalized = normalizeSiteState(siteState);
  if (isRemoteMediaKey(normalized.main.heroMediaKey)) {
    normalized.main.heroImageUrl = "";
  }

  if (isRemoteMediaKey(normalized.about.mediaKey)) {
    normalized.about.imageUrl = "";
  }

  normalized.products = normalized.products.map((product) => {
    const nextProduct = { ...product };
    if (isRemoteMediaKey(nextProduct.thumbnailKey)) {
      nextProduct.thumbnailUrl = "";
    }
    if (isRemoteMediaKey(nextProduct.coverKey)) {
      nextProduct.coverUrl = "";
    }
    return nextProduct;
  });

  return normalized;
}

function writeSiteState(siteState) {
  const sanitized = sanitizeStateForStorage(siteState);
  try {
    localStorage.setItem(STORAGE_KEYS.siteState, JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to write localStorage state", error);
  }
  saveStateSnapshotToIndexedDb(sanitized);
  queueRemoteStateSave(siteState);
}

async function uploadInlineDataUrlToRemote(dataUrl, fileName = "media-inline.jpg") {
  if (!isRemoteStorageEnabled()) return "";
  if (!String(dataUrl || "").startsWith("data:")) return "";

  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], fileName, {
      type: blob.type || "application/octet-stream",
    });
    return await saveMediaAssetToRemote(file);
  } catch (error) {
    console.error("Failed to upload inline data URL to remote", error);
    return "";
  }
}

async function promoteStateInlineMedia(siteState) {
  if (!isRemoteStorageEnabled()) return sanitizeStateForStorage(siteState);

  const nextState = sanitizeStateForStorage(siteState);

  if (!nextState.main.heroMediaKey && String(nextState.main.heroImageUrl || "").startsWith("data:")) {
    const key = await uploadInlineDataUrlToRemote(nextState.main.heroImageUrl, nextState.main.heroImageName || "main-image.jpg");
    if (key) {
      nextState.main.heroMediaKey = key;
      nextState.main.heroMediaType = "image";
      nextState.main.heroImageUrl = "";
    }
  }

  if (!nextState.about.mediaKey && String(nextState.about.imageUrl || "").startsWith("data:")) {
    const key = await uploadInlineDataUrlToRemote(nextState.about.imageUrl, nextState.about.imageName || "about-image.jpg");
    if (key) {
      nextState.about.mediaKey = key;
      nextState.about.mediaType = "image";
      nextState.about.imageUrl = "";
    }
  }

  nextState.products = await Promise.all(
    nextState.products.map(async (product) => {
      const nextProduct = { ...product };

      if (!nextProduct.thumbnailKey && String(nextProduct.thumbnailUrl || "").startsWith("data:")) {
        const key = await uploadInlineDataUrlToRemote(
          nextProduct.thumbnailUrl,
          nextProduct.thumbnailName || `${nextProduct.slug || nextProduct.id || "product"}-thumb.jpg`
        );
        if (key) {
          nextProduct.thumbnailKey = key;
          nextProduct.thumbnailUrl = "";
        }
      }

      if (!nextProduct.coverKey && String(nextProduct.coverUrl || "").startsWith("data:")) {
        const key = await uploadInlineDataUrlToRemote(
          nextProduct.coverUrl,
          nextProduct.coverName || `${nextProduct.slug || nextProduct.id || "product"}-cover.jpg`
        );
        if (key) {
          nextProduct.coverKey = key;
          nextProduct.coverUrl = "";
        }
      }

      return nextProduct;
    })
  );

  return sanitizeStateForStorage(nextState);
}

async function persistSiteStateNow(siteState) {
  const sanitized = await promoteStateInlineMedia(siteState);
  try {
    localStorage.setItem(STORAGE_KEYS.siteState, JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to write localStorage state", error);
  }

  await saveStateSnapshotToIndexedDb(sanitized);
  return await saveRemoteState(sanitized);
}

function resetSiteState() {
  localStorage.removeItem(STORAGE_KEYS.siteState);
  return normalizeSiteState(defaultSiteState);
}

function readAdminCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.adminCredentials);
    if (!raw) return { email: "admin@ty", password: "fitpick123!" };

    const parsed = JSON.parse(raw);
    if (!parsed?.email || !parsed?.password) {
      return { email: "admin@ty", password: "fitpick123!" };
    }

    return parsed;
  } catch (error) {
    return { email: "admin@ty", password: "fitpick123!" };
  }
}

function writeAdminCredentials(credentials) {
  localStorage.setItem(STORAGE_KEYS.adminCredentials, JSON.stringify(credentials));
}

function readAdminSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.adminSession);
    if (!raw) return null;

    if (raw === "authenticated") {
      const legacySession = {
        authenticated: true,
        expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS,
      };
      localStorage.setItem(STORAGE_KEYS.adminSession, JSON.stringify(legacySession));
      return legacySession;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.authenticated || typeof parsed.expiresAt !== "number") {
      localStorage.removeItem(STORAGE_KEYS.adminSession);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEYS.adminSession);
      return null;
    }

    return parsed;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEYS.adminSession);
    return null;
  }
}

function isAdminAuthenticated() {
  return Boolean(readAdminSession());
}

function getAdminSessionRemainingMs() {
  const session = readAdminSession();
  if (!session) return 0;
  return Math.max(0, session.expiresAt - Date.now());
}

function setAdminAuthenticated(authenticated) {
  if (authenticated) {
    localStorage.setItem(
      STORAGE_KEYS.adminSession,
      JSON.stringify({
        authenticated: true,
        expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS,
      })
    );
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.adminSession);
}

async function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || null), type, quality);
  });
}

async function compressImageForUpload(file, options = {}) {
  if (!(file instanceof File)) return file;
  if (!file.type || !file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;

  const {
    maxDimension = 1600,
    type = "image/jpeg",
    quality = 0.82,
    minReductionRatio = 0.85,
    minFileSize = 800 * 1024,
  } = options;

  try {
    if (!file.size || file.size < minFileSize) return file;

    const bitmap = await createImageBitmap(file);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, type, quality);
    if (!blob) return file;

    if (blob.size >= file.size * minReductionRatio) return file;

    const baseName = (file.name || "attachment").replace(/\.[^.]+$/, "");
    const nextName = type === "image/webp" ? `${baseName}.webp` : `${baseName}.jpg`;
    return new File([blob], nextName, { type });
  } catch (error) {
    console.error("Failed to compress image, using original", error);
    return file;
  }
}

function extendAdminSession() {
  const session = readAdminSession();
  if (!session) return false;

  localStorage.setItem(
    STORAGE_KEYS.adminSession,
    JSON.stringify({
      authenticated: true,
      expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS,
    })
  );

  return true;
}

async function createInquiry(payload) {
  const siteState = readSiteState();
  const attachmentFiles = Array.isArray(payload.attachments)
    ? payload.attachments.filter((attachment) => attachment instanceof File && attachment.size > 0)
    : payload.attachment instanceof File && payload.attachment.size > 0
      ? [payload.attachment]
      : [];
  const attachments = await Promise.all(
    attachmentFiles.map(async (attachment, index) => {
      const uploadFile = await compressImageForUpload(attachment);
      return {
        id: `attachment-${Date.now()}-${index + 1}`,
        key: await saveMediaAsset(uploadFile),
        name: uploadFile?.name || attachment.name || "",
        type: uploadFile?.type || attachment.type || "",
        size: Number(uploadFile?.size || attachment.size || 0),
      };
    })
  );
  const primaryAttachment = attachments[0] || { key: "", name: "", type: "", size: 0 };

  const nextInquiry = normalizeInquiry(
    {
      id: `inq-${Date.now()}`,
      status: "대기",
      brand: payload.brand,
      name: payload.name,
      contact: payload.contact,
      content: payload.message,
      attachmentKey: primaryAttachment.key,
      attachmentName: primaryAttachment.name,
      attachmentType: primaryAttachment.type,
      attachmentSize: primaryAttachment.size,
      attachments,
      privacyConsent: Boolean(payload.privacyConsent),
      privacyConsentAt: payload.privacyConsent
        ? new Date().toISOString().slice(0, 19).replace("T", " ")
        : "",
      receivedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      completedAt: "",
      manager: "",
      memo: "",
    },
    siteState.inquiries.length
  );

  siteState.inquiries.unshift(nextInquiry);
  writeSiteState(siteState);
  return nextInquiry;
}

function openMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        db.createObjectStore(MEDIA_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveMediaAsset(file) {
  if (isRemoteStorageEnabled()) {
    const remoteKey = await saveMediaAssetToRemote(file);
    return remoteKey || "";
  }

  const db = await openMediaDb();
  const key = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE_NAME, "readwrite");
    tx.objectStore(MEDIA_STORE_NAME).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return key;
}

async function readMediaAssetBlob(key) {
  if (!key || isRemoteMediaKey(key)) return null;
  const db = await openMediaDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE_NAME, "readonly");
    const request = tx.objectStore(MEDIA_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

async function readMediaAssetUrl(key) {
  if (!key) return "";
  if (isRemoteMediaKey(key)) {
    return readRemoteMediaUrl(key);
  }
  const blob = await readMediaAssetBlob(key);
  return blob ? URL.createObjectURL(blob) : "";
}

function openStateDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STATE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE_NAME)) {
        db.createObjectStore(STATE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStateSnapshotToIndexedDb(siteState) {
  try {
    const db = await openStateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, "readwrite");
      tx.objectStore(STATE_STORE_NAME).put(siteState, STATE_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (error) {
    console.error("Failed to save state snapshot", error);
    return false;
  }
}

async function readStateSnapshotFromIndexedDb() {
  try {
    const db = await openStateDb();
    const state = await new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, "readonly");
      const request = tx.objectStore(STATE_STORE_NAME).get(STATE_RECORD_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return state ? normalizeSiteState(state) : null;
  } catch (error) {
    console.error("Failed to read state snapshot", error);
    return null;
  }
}

function getRemoteConfig() {
  const config = window.TY_CONFIG || {};
  return {
    apiBase: String(config.remoteApiBase || "/api").trim() || "/api",
  };
}

function isRemoteStorageEnabled() {
  return Boolean(window.fetch && window.location?.protocol !== "file:");
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(blob) {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.split(",", 2)[1] || "";
}

async function remoteRequest(path, options = {}) {
  const { apiBase } = getRemoteConfig();
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Remote request failed: ${response.status}`);
  }

  return response.json();
}

async function refreshSiteStateFromRemote(pageHint = "") {
  if (!isRemoteStorageEnabled()) {
    const indexedDbState = await readStateSnapshotFromIndexedDb();
    if (indexedDbState) {
      try {
        localStorage.setItem(STORAGE_KEYS.siteState, JSON.stringify(indexedDbState));
      } catch (error) {
        console.error("Failed to refresh local cache from indexedDB", error);
      }
      return indexedDbState;
    }
    return readSiteState();
  }
  if (remoteSyncInFlight) return remoteSyncInFlight;

  remoteSyncInFlight = (async () => {
    try {
      const query = pageHint ? `?page=${encodeURIComponent(pageHint)}&_t=${Date.now()}` : `?_t=${Date.now()}`;
      const result = await remoteRequest(`/site-state${query}`);
      if (result?.payload) {
        const baseState = readSiteState();
        const nextState = result.partial
          ? normalizeSiteState({
              ...baseState,
              ...result.payload,
              main: {
                ...baseState.main,
                ...(result.payload.main || {}),
              },
              about: {
                ...baseState.about,
                ...(result.payload.about || {}),
              },
              branding: {
                ...baseState.branding,
                ...(result.payload.branding || {}),
              },
              categories: Array.isArray(result.payload.categories)
                ? result.payload.categories
                : baseState.categories,
              products: Array.isArray(result.payload.products)
                ? result.payload.products
                : baseState.products,
            })
          : normalizeSiteState(result.payload);
        localStorage.setItem(STORAGE_KEYS.siteState, JSON.stringify(nextState));
        return nextState;
      }
    } catch (error) {
      console.error("Failed to refresh remote state", error);
    } finally {
      remoteSyncInFlight = null;
    }

    return readSiteState();
  })();

  return remoteSyncInFlight;
}

async function saveRemoteState(siteState) {
  if (!isRemoteStorageEnabled()) return false;

  try {
    const payload = normalizeSiteState(siteState);
    await remoteRequest("/site-state", {
      method: "POST",
      body: JSON.stringify({ payload }),
    });
    return true;
  } catch (error) {
    console.error("Failed to save remote state", error);
    return false;
  }
}

function queueRemoteStateSave(siteState) {
  if (!isRemoteStorageEnabled()) return;
  saveRemoteState(siteState);
}

async function migrateLocalMediaKeyToRemote(key, fileName = "media-file") {
  if (!key || isRemoteMediaKey(key)) return key;
  if (!isRemoteStorageEnabled()) return key;

  const blob = await readMediaAssetBlob(key);
  if (!blob) return key;

  const file = new File([blob], fileName, {
    type: blob.type || "application/octet-stream",
  });

  const remoteKey = await saveMediaAssetToRemote(file);
  return remoteKey || key;
}

async function migrateContentMediaKeysToRemote(html, filePrefix = "editor-image") {
  if (!html || (!html.includes('data-media-key="media-') && !html.includes('src="data:'))) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="content-root">${html}</div>`, "text/html");
  const root = doc.querySelector("#content-root");
  if (!root) return html;

  const mediaNodes = root.querySelectorAll("[data-media-key]");
  for (const [index, node] of Array.from(mediaNodes).entries()) {
    const key = node.getAttribute("data-media-key") || "";
    if (!key.startsWith("media-")) continue;
    const nextKey = await migrateLocalMediaKeyToRemote(key, `${filePrefix}-${index + 1}`);
    if (nextKey && nextKey !== key) {
      node.setAttribute("data-media-key", nextKey);
      node.setAttribute("src", readRemoteMediaUrl(nextKey));
    }
  }

  const inlineImages = root.querySelectorAll('img[src^="data:"]:not([data-media-key])');
  for (const [index, node] of Array.from(inlineImages).entries()) {
    try {
      const response = await fetch(node.getAttribute("src") || "");
      const blob = await response.blob();
      const file = new File([blob], node.getAttribute("alt") || `${filePrefix}-inline-${index + 1}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const nextKey = await saveMediaAssetToRemote(file);
      if (nextKey) {
        node.setAttribute("data-media-key", nextKey);
        node.setAttribute("data-media-type", "image");
        node.setAttribute("src", readRemoteMediaUrl(nextKey));
      }
    } catch (error) {
      console.error("Failed to migrate inline content image", error);
    }
  }

  return root.innerHTML;
}

async function migrateSiteStateMediaToRemote(siteState) {
  if (!isRemoteStorageEnabled()) return siteState;

  let changed = false;
  const nextState = normalizeSiteState(siteState);

  const nextHeroKey = await migrateLocalMediaKeyToRemote(nextState.main.heroMediaKey, nextState.main.heroImageName || "main-media");
  if (nextHeroKey !== nextState.main.heroMediaKey) {
    nextState.main.heroMediaKey = nextHeroKey;
    changed = true;
  }

  const nextAboutKey = await migrateLocalMediaKeyToRemote(nextState.about.mediaKey, nextState.about.imageName || "about-media");
  if (nextAboutKey !== nextState.about.mediaKey) {
    nextState.about.mediaKey = nextAboutKey;
    changed = true;
  }

  for (const product of nextState.products) {
    const nextThumbKey = await migrateLocalMediaKeyToRemote(product.thumbnailKey, product.thumbnailName || `${product.slug}-thumb`);
    if (nextThumbKey !== product.thumbnailKey) {
      product.thumbnailKey = nextThumbKey;
      changed = true;
    }

    const nextCoverKey = await migrateLocalMediaKeyToRemote(product.coverKey, product.coverName || `${product.slug}-cover`);
    if (nextCoverKey !== product.coverKey) {
      product.coverKey = nextCoverKey;
      changed = true;
    }

    const nextContent = await migrateContentMediaKeysToRemote(product.content, product.slug || product.id || "product");
    if (nextContent !== product.content) {
      product.content = nextContent;
      changed = true;
    }
  }

  if (!changed) return siteState;

  try {
    localStorage.setItem(STORAGE_KEYS.siteState, JSON.stringify(nextState));
  } catch (error) {
    console.error("Failed to update local storage during media migration", error);
  }

  await saveStateSnapshotToIndexedDb(nextState);
  await saveRemoteState(nextState);
  return nextState;
}

async function importLocalStateToRemote() {
  if (!isRemoteStorageEnabled()) return false;

  try {
    const localState = readSiteState();
    return await saveRemoteState(localState);
  } catch (error) {
    console.error("Failed to import local state to remote", error);
    return false;
  }
}

async function saveMediaAssetToRemote(file) {
  if (!isRemoteStorageEnabled()) return "";

  // Upload through the media API
  const uploadStrategies = [
    { singleUploadLimit: 96 * 1024, chunkSize: 96 * 1024 },
    { singleUploadLimit: 64 * 1024, chunkSize: 64 * 1024 },
    { singleUploadLimit: 32 * 1024, chunkSize: 32 * 1024 },
  ];
  let lastError = null;

  for (const strategy of uploadStrategies) {
    try {
      const totalChunks = Math.max(1, Math.ceil(file.size / strategy.chunkSize));

      if (file.size <= strategy.singleUploadLimit) {
        const dataUrl = await blobToDataUrl(file);
        const result = await remoteRequest("/media", {
          method: "POST",
          body: JSON.stringify({
            action: "single",
            name: file.name,
            type: file.type || "application/octet-stream",
            dataUrl,
          }),
        });
        return result?.key || "";
      }

      const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * strategy.chunkSize;
        const end = Math.min(file.size, start + strategy.chunkSize);
        const chunk = file.slice(start, end);
        const base64 = await blobToBase64(chunk);
        await remoteRequest("/media", {
          method: "POST",
          body: JSON.stringify({
            action: "chunk",
            uploadId,
            name: file.name,
            type: file.type || "application/octet-stream",
            totalChunks,
            chunkIndex: index,
            base64,
          }),
        });
      }

      const result = await remoteRequest("/media", {
        method: "POST",
        body: JSON.stringify({
          action: "complete",
          uploadId,
          name: file.name,
          type: file.type || "application/octet-stream",
          totalChunks,
        }),
      });

      return result?.key || "";
    } catch (error) {
      lastError = error;
    }
  }

  console.error("Failed to upload remote media", lastError);
  throw lastError || new Error("Remote media upload failed");
}

function readRemoteMediaUrl(key) {
  if (!isRemoteMediaKey(key)) return "";
  const { apiBase } = getRemoteConfig();
  return `${apiBase}/media-file?key=${encodeURIComponent(key)}`;
}

function countLegacyMediaReferences(siteState) {
  const state = normalizeSiteState(siteState);
  let count = 0;

  if (state.main.heroMediaKey && !isRemoteMediaKey(state.main.heroMediaKey)) count += 1;
  if (state.about.mediaKey && !isRemoteMediaKey(state.about.mediaKey)) count += 1;

  for (const product of state.products) {
    if (product.thumbnailKey && !isRemoteMediaKey(product.thumbnailKey)) count += 1;
    if (product.coverKey && !isRemoteMediaKey(product.coverKey)) count += 1;

    const legacyMatches = String(product.content || "").match(/data-media-key="media-[^"]+"/g);
    if (legacyMatches?.length) count += legacyMatches.length;

    const inlineMatches = String(product.content || "").match(/<img[^>]+src="data:[^"]+"/g);
    if (inlineMatches?.length) count += inlineMatches.length;
  }

  return count;
}

function getLegacyMediaIssues(siteState) {
  const state = normalizeSiteState(siteState);
  const issues = [];

  if (state.main.heroMediaKey && !isRemoteMediaKey(state.main.heroMediaKey)) {
    issues.push({ area: "main", label: "대문 미디어", name: state.main.heroImageName || "대문 파일" });
  }

  if (state.about.mediaKey && !isRemoteMediaKey(state.about.mediaKey)) {
    issues.push({ area: "about", label: "회사 소개 미디어", name: state.about.imageName || "회사 소개 파일" });
  }

  for (const product of state.products) {
    if (product.thumbnailKey && !isRemoteMediaKey(product.thumbnailKey)) {
      issues.push({ area: "product", productId: product.id, label: "썸네일", name: `${product.name} / ${product.thumbnailName || "thumbnail"}` });
    }

    if (product.coverKey && !isRemoteMediaKey(product.coverKey)) {
      issues.push({ area: "product", productId: product.id, label: "커버", name: `${product.name} / ${product.coverName || "cover"}` });
    }

    const legacyKeyMatches = String(product.content || "").match(/data-media-key="media-[^"]+"/g) || [];
    legacyKeyMatches.forEach((_, index) => {
      issues.push({ area: "product", productId: product.id, label: "본문 이미지", name: `${product.name} / 본문 이미지 ${index + 1}` });
    });

    const inlineMatches = String(product.content || "").match(/<img[^>]+src="(?:blob:|data:)[^"]+"/g) || [];
    inlineMatches.forEach((_, index) => {
      issues.push({ area: "product", productId: product.id, label: "본문 이미지", name: `${product.name} / 본문 이미지 ${index + 1}` });
    });
  }

  return issues;
}
