const adminApp = document.querySelector("#admin-app");

const routes = [
  {
    id: "main",
    label: "대문 관리",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 11h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    id: "about",
    label: "회사 소개 관리",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 19c1.5-3 4-4.5 6.5-4.5s5 1.5 6.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    id: "products",
    label: "상품 관리",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6V4.5M16 6V4.5M4 10.5h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    id: "inquiries",
    label: "문의 관리",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12h8M8 15h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    id: "branding",
    label: "로고 링크 관리",
    icon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8.5a3.5 3.5 0 1 1 0 7H7.5a3.5 3.5 0 1 1 0-7H9Zm7.5 0a3.5 3.5 0 1 1 0 7H15a3.5 3.5 0 1 1 0-7h1.5ZM10.5 12h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
];

let siteState = readSiteState();
let selectedProductId = siteState.products[0]?.id || null;
let selectedInquiryId = siteState.inquiries[0]?.id || null;
let selectedEditorImage = null;
let sessionTimerIntervalId = null;
let draggedEditorImage = null;
let selectedProductIds = new Set();
let draggedProductId = null;
let draggedCategoryIndex = null;
let savedEditorRange = null;
let productFilters = { name: "", status: "", category: "" };
let productFilterDraft = { ...productFilters };
let inquiryFilters = { status: "", name: "", manager: "" };
let inquiryFilterDraft = { ...inquiryFilters };
let editorDeleteBound = false;
let storageUsageAlertShown = false;

async function notifyMongoStorageUsage() {
  if (storageUsageAlertShown || !isRemoteStorageEnabled()) return;

  try {
    const result = await remoteRequest(`/storage-usage?_t=${Date.now()}`);
    if (!result?.overThreshold) return;

    storageUsageAlertShown = true;
    alert("500mb를 사용하셨습니다 곧 비용이 발생할 수 있습니다");
  } catch (error) {
    console.error("Failed to read MongoDB storage usage", error);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl, fileName = "image.jpg") {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

async function fileToCompressedImageDataUrl(file, maxSize = 2400, quality = 0.92) {
  const originalDataUrl = await fileToDataUrl(file);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(originalDataUrl);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => resolve(originalDataUrl);
    image.src = originalDataUrl;
  });
}

async function extractVideoPosterDataUrl(file, maxWidth = 320, quality = 0.42) {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    const fallback = () => {
      cleanup();
      resolve("");
    };

    video.addEventListener(
      "loadeddata",
      () => {
        try {
          const ratio = Math.min(1, maxWidth / Math.max(video.videoWidth || 1, video.videoHeight || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * ratio));
          canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * ratio));
          const context = canvas.getContext("2d");
          if (!context) {
            fallback();
            return;
          }

          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          cleanup();
          resolve(dataUrl);
        } catch (error) {
          fallback();
        }
      },
      { once: true }
    );

    video.addEventListener("error", fallback, { once: true });
  });
}

async function extractRemoteVideoPosterDataUrl(url, maxWidth = 480, quality = 0.68) {
  if (!url) return "";

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = url;

    const cleanup = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const fallback = () => {
      cleanup();
      resolve("");
    };

    video.addEventListener(
      "loadeddata",
      () => {
        try {
          const ratio = Math.min(1, maxWidth / Math.max(video.videoWidth || 1, 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * ratio));
          canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * ratio));
          const context = canvas.getContext("2d");
          if (!context) {
            fallback();
            return;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          cleanup();
          resolve(dataUrl);
        } catch (error) {
          fallback();
        }
      },
      { once: true }
    );

    video.addEventListener("error", fallback, { once: true });
  });
}

function pickSupportedVideoRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function compressVideoForUpload(file, options = {}) {
  const {
    maxWidth = 1280,
    fps = 24,
    videoBitsPerSecond = 2_400_000,
    minReductionRatio = 0.9,
    minFileSize = 18 * 1024 * 1024,
  } = options;

  if (file.size < minFileSize) {
    return file;
  }

  if (typeof MediaRecorder === "undefined") {
    return file;
  }

  const mimeType = pickSupportedVideoRecorderMimeType();
  if (!mimeType) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const optimized = await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.src = objectUrl;

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };

      const fail = (error) => {
        cleanup();
        reject(error);
      };

      video.addEventListener(
        "loadedmetadata",
        async () => {
          try {
            const ratio = Math.min(1, maxWidth / Math.max(video.videoWidth || 1, 1));
            const width = Math.max(2, Math.round((video.videoWidth || 1) * ratio));
            const height = Math.max(2, Math.round((video.videoHeight || 1) * ratio));

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context || typeof canvas.captureStream !== "function") {
              cleanup();
              resolve(file);
              return;
            }

            const stream = canvas.captureStream(fps);
            const recorder = new MediaRecorder(stream, {
              mimeType,
              videoBitsPerSecond,
            });
            const chunks = [];

            recorder.ondataavailable = (event) => {
              if (event.data && event.data.size) {
                chunks.push(event.data);
              }
            };

            recorder.onerror = () => fail(new Error("video-recording-failed"));
            recorder.onstop = () => {
              cleanup();
              const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
              if (!blob.size || blob.size >= file.size * minReductionRatio) {
                resolve(file);
                return;
              }

              const extension = blob.type.includes("mp4") ? "mp4" : "webm";
              const nextName = file.name.replace(/\.[^.]+$/, "") + `-optimized.${extension}`;
              resolve(new File([blob], nextName, { type: blob.type || mimeType }));
            };

            const drawFrame = () => {
              if (video.paused || video.ended) return;
              context.drawImage(video, 0, 0, width, height);
              requestAnimationFrame(drawFrame);
            };

            recorder.start(250);
            video.currentTime = 0;
            await video.play();
            drawFrame();

            video.onended = () => {
              if (recorder.state !== "inactive") {
                recorder.stop();
              }
            };
          } catch (error) {
            fail(error);
          }
        },
        { once: true }
      );

      video.addEventListener("error", () => fail(new Error("video-load-failed")), { once: true });
    });

    return optimized;
  } catch (error) {
    console.error("Video compression failed, using original file", error);
    URL.revokeObjectURL(objectUrl);
    return file;
  }
}

async function createVideoUploadPlan(file) {
  // 원본 품질 그대로 업로드
  return [{ file, label: "original" }];
}

function renderVideoMarkup(url) {
  return `<video src="${url}" muted autoplay loop playsinline webkit-playsinline preload="auto"></video>`;
}

function primeVideoElement(video, url) {
  if (!(video instanceof HTMLVideoElement) || !url) return;
  video.src = url;
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("loop", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("preload", "auto");
  video.load();
  const tryPlay = () => video.play?.().catch(() => {});
  if (video.readyState >= 2) {
    tryPlay();
  } else {
    video.addEventListener("loadeddata", tryPlay, { once: true });
  }
}

async function hydrateStoredMedia(root = document) {
  const nodes = root.querySelectorAll("[data-media-key]");
  for (const node of nodes) {
    const key = node.getAttribute("data-media-key");
    const type = node.getAttribute("data-media-type") || "image";
    let url = "";
    try {
      url = await readMediaAssetUrl(key);
    } catch (error) {
      console.error("Failed to read media asset", error);
    }
    if (!url) continue;
    if (node instanceof HTMLImageElement) {
      node.src = url;
      continue;
    }
    if (node instanceof HTMLVideoElement) {
      primeVideoElement(node, url);
      continue;
    }
    node.innerHTML =
      type === "video"
        ? renderVideoMarkup(url)
        : `<img src="${url}" alt="" />`;
    if (type === "video") {
      const video = node.querySelector("video");
      primeVideoElement(video, url);
    }
  }
}

async function persistUploadedMedia(file, target) {
  try {
    const uploadCandidates = file.type.startsWith("video/")
      ? await createVideoUploadPlan(file)
      : [{ file, label: "image" }];
    const imageFallbackUrl = file.type.startsWith("image/")
      ? await fileToCompressedImageDataUrl(file)
      : await extractVideoPosterDataUrl(uploadCandidates[0]?.file || file);
    const uploadFile = file.type.startsWith("image/")
      ? await dataUrlToFile(imageFallbackUrl, file.name)
      : null;
    let mediaKey = "";
    let savedVideoFile = uploadCandidates[0]?.file || file;

    if (uploadFile) {
      // Remote storage: upload original file (no quality loss). Local fallback: use compressed.
      mediaKey = await saveMediaAsset(isRemoteStorageEnabled() ? file : uploadFile);
    } else {
      for (const candidate of uploadCandidates) {
        mediaKey = await saveMediaAsset(candidate.file);
        if (mediaKey) {
          savedVideoFile = candidate.file;
          break;
        }
      }
    }

    if (!mediaKey) {
      throw new Error("Remote media key missing");
    }

    let posterKey = "";
    if (savedVideoFile.type.startsWith("video/") && imageFallbackUrl) {
      const posterFile = await dataUrlToFile(imageFallbackUrl, `${file.name.replace(/\.[^.]+$/, "")}-poster.jpg`);
      posterKey = await saveMediaAsset(posterFile);
    }

    target.name = file.name;
    target.type = file.type.startsWith("video/") ? "video" : "image";
    target.key = mediaKey;
    target.url = isRemoteStorageEnabled() ? "" : imageFallbackUrl;
    if ("posterKey" in target) {
      target.posterKey = target.type === "video" ? posterKey : "";
    }
    if (target.section !== "main" && target.section !== "about") {
      const persisted = await persistSiteStateNow(siteState);
      if (!persisted) {
        throw new Error("Remote site state save failed");
      }

      if (isRemoteStorageEnabled()) {
        const refreshedState = await refreshSiteStateFromRemote();
        siteState = refreshedState;
        const targetName = file.name;
        const hasChanged = siteState.products.some(
          (product) =>
            product.thumbnailName === targetName ||
            product.coverName === targetName
        );

        if (!hasChanged) {
          throw new Error("Remote state verification failed");
        }
      }
    }
    return true;
  } catch (error) {
    console.error("Failed to save media asset", error);
    const detail = String(error?.message || error?.name || "알 수 없는 업로드 오류").trim();
    alert(
      `파일 업로드에 실패했습니다. 영상은 용량이 너무 크면 저장되지 않을 수 있어요. mp4(H.264) 또는 더 작은 파일로 다시 시도해 주세요.\n\n원인: ${detail}`
    );
    return false;
  }
}

async function cacheCurrentSiteStateLocally() {
  const sanitized = sanitizeStateForStorage(siteState);
  try {
    localStorage.setItem("fit_pick_site_state", JSON.stringify(sanitized));
  } catch (error) {
    console.error("Failed to cache local state", error);
  }
  await saveStateSnapshotToIndexedDb(sanitized);
}

async function persistSectionMedia(section) {
  if (!isRemoteStorageEnabled()) {
    return await persistSiteStateNow(siteState);
  }

  try {
    if (section === "main") {
      await remoteRequest("/site-media", {
        method: "POST",
        body: JSON.stringify({
          section: "main",
          payload: {
            heroImageName: siteState.main.heroImageName,
            heroMediaType: siteState.main.heroMediaType,
            heroMediaKey: siteState.main.heroMediaKey,
            heroPosterKey: siteState.main.heroPosterKey,
          },
        }),
      });
    }

    if (section === "about") {
      await remoteRequest("/site-media", {
        method: "POST",
        body: JSON.stringify({
          section: "about",
          payload: {
            imageName: siteState.about.imageName,
            mediaType: siteState.about.mediaType,
            mediaKey: siteState.about.mediaKey,
            posterKey: siteState.about.posterKey,
          },
        }),
      });
    }

    await cacheCurrentSiteStateLocally();
    siteState = await refreshSiteStateFromRemote();
    return true;
  } catch (error) {
    console.error(`Failed to persist ${section} media`, error);
    return false;
  }
}

async function ensureRemoteVideoPoster(target) {
  if (target.type !== "video" || !target.key || target.posterKey) {
    return true;
  }

  try {
    const posterDataUrl = await extractRemoteVideoPosterDataUrl(readRemoteMediaUrl(target.key));
    if (!posterDataUrl) return true;

    const posterFile = await dataUrlToFile(posterDataUrl, `${target.name.replace(/\.[^.]+$/, "")}-poster.jpg`);
    const posterKey = await saveMediaAsset(posterFile);
    if (!posterKey) {
      throw new Error("Poster upload failed");
    }
    target.posterKey = posterKey;
    return true;
  } catch (error) {
    console.error("Failed to ensure remote poster", error);
    return false;
  }
}

function previewMediaMarkup(url, mediaType, palette, mediaKey = "") {
  if (mediaKey) {
    return `<div class="preview-image" data-media-key="${mediaKey}" data-media-type="${mediaType}" style="${previewStyle(url, palette)}"></div>`;
  }
  if (!url) {
    return `<div class="preview-image" style="${previewStyle("", palette)}"></div>`;
  }

  if (mediaType === "video") {
    return `<div class="preview-image media-frame">${renderVideoMarkup(url)}</div>`;
  }

  return `<div class="preview-image media-frame"><img src="${url}" alt="" /></div>`;
}

function currentRoute() {
  const hash = location.hash.replace("#", "");
  return routes.some((route) => route.id === hash) ? hash : "main";
}

function previewStyle(url, palette = ["#ececec", "#d1d1d1", "#fafafa"]) {
  if (url) return `background-image:url('${url}')`;
  return `background:linear-gradient(145deg, ${palette[0]}, ${palette[1]} 60%, ${palette[2]})`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loginTemplate() {
  const credentials = readAdminCredentials();
  return `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <h2>TY관리자</h2>
        <p>관리자 로그인 후 각 페이지와 데이터를 수정할 수 있습니다.</p>
        <label>이메일<input type="email" name="email" placeholder="${credentials.email}" required></label>
        <label>비밀번호<input type="password" name="password" placeholder="••••••••" required></label>
        <button class="primary" type="submit">로그인</button>
        <p class="feedback" id="login-feedback">기본 계정: ${credentials.email} / ${credentials.password}</p>
      </form>
    </div>
  `;
}

function shellTemplate(route, title, content) {
  return `
    <div class="admin-layout">
      <aside class="sidebar">
        <h1>TY관리자</h1>
        <nav class="sidebar-nav">
          ${routes
            .map(
              (item) => `
                <a class="sidebar-link ${item.id === route ? "active" : ""}" href="#${item.id}">
                  <span class="sidebar-icon">${item.icon}</span>${item.label}
                </a>
              `
            )
            .join("")}
        </nav>
      </aside>
      <div class="admin-main">
        <header class="topbar">
          <div>${title}</div>
          <div class="topbar-user">
            <span class="session-timer" id="session-timer">남은 시간 60:00</span>
            <button class="session-extend" id="session-extend-button" type="button">연장</button>
            <span>admin@ty</span>
            <button class="secondary" id="logout-button" type="button">로그아웃</button>
          </div>
        </header>
        <section class="content">${content}</section>
      </div>
    </div>
  `;
}

async function saveAndNotify(message) {
  const saved = await persistSiteStateNow(siteState);
  if (!saved) {
    alert("저장 중 문제가 생겼습니다. 다시 시도해 주세요.");
    return false;
  }
  alert(message);
  return true;
}

async function saveSectionAndNotify(section, payload, message) {
  try {
    await remoteRequest("/site-state", {
      method: "POST",
      body: JSON.stringify({
        section,
        payload,
      }),
    });
    await cacheCurrentSiteStateLocally();
    siteState = await refreshSiteStateFromRemote();
    alert(message);
    return true;
  } catch (error) {
    console.error(`Failed to save ${section} section`, error);
    const detail = String(error?.message || "").trim();
    alert(`저장 중 문제가 생겼습니다. 다시 시도해 주세요.${detail ? `\n\n원인: ${detail}` : ""}`);
    return false;
  }
}

function renderLegacyIssueNotice(filterFn) {
  const issues = getLegacyMediaIssues(siteState).filter(filterFn);
  if (!issues.length) return "";

  return `
    <div class="danger-notice">
      <strong>재업로드가 필요한 파일이 있습니다.</strong>
      <ul>
        ${issues.map((issue) => `<li>${escapeHtml(issue.label)}: ${escapeHtml(issue.name)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function syncSelectedProducts() {
  const productIds = new Set(siteState.products.map((product) => product.id));
  selectedProductIds = new Set([...selectedProductIds].filter((id) => productIds.has(id)));
}

function categoryOptionsMarkup(currentCategory) {
  return siteState.categories
    .map((category) => `<option ${currentCategory === category ? "selected" : ""}>${category}</option>`)
    .join("");
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function parseDateTimeLocal(value) {
  if (!value) return "";
  return `${value.replace("T", " ")}:00`;
}

function dragHandleMarkup() {
  return `<span class="drag-handle" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></span>`;
}

function formatRemainingTime(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function stopSessionTimer() {
  if (sessionTimerIntervalId) {
    clearInterval(sessionTimerIntervalId);
    sessionTimerIntervalId = null;
  }
}

function startSessionTimer() {
  stopSessionTimer();

  const timerNode = document.querySelector("#session-timer");
  if (!timerNode) return;

  const tick = () => {
    const remainingMs = getAdminSessionRemainingMs();
    if (remainingMs <= 0) {
      stopSessionTimer();
      setAdminAuthenticated(false);
      alert("보안을 위해 1시간이 지나 자동 로그아웃되었습니다.");
      renderApp();
      return;
    }

    timerNode.textContent = `남은 시간 ${formatRemainingTime(remainingMs)}`;
  };

  tick();
  sessionTimerIntervalId = window.setInterval(tick, 1000);
}

function clearSelectedEditorImage(editor = document.querySelector("#product-content-editor")) {
  if (selectedEditorImage) {
    selectedEditorImage.classList.remove("is-selected-image");
  }
  selectedEditorImage = null;
  editor?.querySelectorAll("img").forEach((image) => image.classList.remove("is-selected-image"));
}

function applyEditorImageLayout(image) {
  const size = image.dataset.size || "full";
  const align = image.dataset.align || "center";

  image.style.maxWidth = "100%";
  image.style.height = "auto";
  image.style.verticalAlign = "top";
  image.style.float = "none";
  image.style.marginTop = "12px";
  image.style.marginBottom = "12px";
  image.style.marginLeft = "0";
  image.style.marginRight = "0";

  if (size === "half") {
    image.style.width = "50%";
    image.style.display = align === "center" ? "block" : "inline-block";
    image.style.margin = align === "center" ? "12px auto" : "12px 0";
    return;
  }

  if (size === "third") {
    image.style.width = "33.3333%";
    image.style.display = align === "center" ? "block" : "inline-block";
    image.style.margin = align === "center" ? "12px auto" : "12px 0";
    return;
  }

  if (size === "quarter") {
    image.style.width = "25%";
    image.style.display = align === "center" ? "block" : "inline-block";
    image.style.margin = align === "center" ? "12px auto" : "12px 0";
    return;
  }

  image.style.width = "100%";
  image.style.display = "block";
  image.style.margin =
    align === "left" ? "12px auto 12px 0" : align === "right" ? "12px 0 12px auto" : "12px auto";
}

function normalizeEditorImage(image) {
  if (!image.dataset.size) image.dataset.size = "full";
  if (!image.dataset.align) image.dataset.align = "center";
  image.draggable = true;
  applyEditorImageLayout(image);
}

function cleanupEditorImageSpacing(editor) {
  if (!editor) return;

  Array.from(editor.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
      const prev = node.previousSibling;
      const next = node.nextSibling;
      const nearImage =
        (prev instanceof HTMLImageElement || prev?.nodeName === "IMG") ||
        (next instanceof HTMLImageElement || next?.nodeName === "IMG");
      if (nearImage) {
        node.remove();
      }
    }

    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.nodeName === "BR" &&
      ((node.previousSibling && node.previousSibling.nodeName === "IMG") ||
        (node.nextSibling && node.nextSibling.nodeName === "IMG"))
    ) {
      node.remove();
    }
  });
}

function rememberEditorSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const editor = document.querySelector("#product-content-editor");
  const range = selection.getRangeAt(0);
  if (editor && editor.contains(range.commonAncestorContainer)) {
    savedEditorRange = range.cloneRange();
  }
}

function restoreEditorSelection(editor) {
  const selection = window.getSelection();
  if (!selection) return;

  if (savedEditorRange) {
    selection.removeAllRanges();
    selection.addRange(savedEditorRange);
    return;
  }

  if (!editor) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function createEditorImageNode({ previewUrl, fileName, mediaKey }) {
  const image = document.createElement("img");
  image.src = previewUrl;
  image.alt = fileName;
  image.dataset.size = "full";
  image.dataset.align = "center";
  if (mediaKey) {
    image.dataset.mediaKey = mediaKey;
    image.dataset.mediaType = "image";
  }
  applyEditorImageLayout(image);
  return image;
}

async function ensureEditorImagesRemote(editor) {
  const images = Array.from(editor?.querySelectorAll("img") || []);
  for (const image of images) {
    const existingKey = image.dataset.mediaKey || "";
    const currentSrc = image.getAttribute("src") || "";
    if (existingKey.startsWith("mongo:") || existingKey.startsWith("gfs:") ) {
      image.src = readRemoteMediaUrl(existingKey);
      continue;
    }

    try {
      let mediaKey = "";

      if (existingKey.startsWith("media-")) {
        mediaKey = await migrateLocalMediaKeyToRemote(existingKey, image.getAttribute("alt") || "editor-image.jpg");
      } else if (currentSrc.startsWith("data:")) {
        const file = await dataUrlToFile(currentSrc, image.getAttribute("alt") || "editor-image.jpg");
        mediaKey = await saveMediaAsset(file);
      }

      if (mediaKey) {
        image.dataset.mediaKey = mediaKey;
        image.dataset.mediaType = "image";
        image.src = readRemoteMediaUrl(mediaKey);
      }
    } catch (error) {
      console.error("Failed to migrate inline editor image", error);
    }
  }
}

function insertEditorImages(editor, images) {
  if (!editor || !images.length) return;

  editor.focus();
  restoreEditorSelection(editor);

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  let range = selection.getRangeAt(0);
  range.deleteContents();

  images.forEach((image, index) => {
    range.insertNode(image);
    range.setStartAfter(image);
    range.collapse(true);
    if (index !== images.length - 1) {
      const spacer = document.createTextNode("");
      range.insertNode(spacer);
      range.setStartAfter(spacer);
      range.collapse(true);
    }
  });

  selection.removeAllRanges();
  selection.addRange(range);
  savedEditorRange = range.cloneRange();
}

function removeSelectedEditorImage() {
  const editor = document.querySelector("#product-content-editor");
  if (!editor || !selectedEditorImage) return false;

  const imageToRemove = selectedEditorImage;
  clearSelectedEditorImage(editor);
  imageToRemove.remove();
  cleanupEditorImageSpacing(editor);
  rememberEditorSelection();
  return true;
}

function bindGlobalEditorDeletion() {
  if (editorDeleteBound) return;
  editorDeleteBound = true;

  document.addEventListener("keydown", (event) => {
    if (!selectedEditorImage) return;
    if (event.key !== "Backspace" && event.key !== "Delete") return;

    event.preventDefault();
    removeSelectedEditorImage();
  });
}

function bindProductEditor() {
  const editor = document.querySelector("#product-content-editor");
  if (!editor) return;

  editor.querySelectorAll("img").forEach(normalizeEditorImage);
  cleanupEditorImageSpacing(editor);
  if (editor.dataset.bound === "true") return;
  editor.dataset.bound = "true";

  editor.addEventListener("click", (event) => {
    rememberEditorSelection();
    if (event.target instanceof HTMLImageElement) {
      clearSelectedEditorImage(editor);
      selectedEditorImage = event.target;
      normalizeEditorImage(selectedEditorImage);
      selectedEditorImage.classList.add("is-selected-image");
      return;
    }

    clearSelectedEditorImage(editor);
  });

  editor.addEventListener("keyup", () => {
    rememberEditorSelection();
  });

  editor.addEventListener("mouseup", () => {
    rememberEditorSelection();
  });

  editor.addEventListener("focus", () => {
    rememberEditorSelection();
  });

  editor.addEventListener("dragstart", (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    draggedEditorImage = event.target;
    clearSelectedEditorImage(editor);
    selectedEditorImage = draggedEditorImage;
    selectedEditorImage.classList.add("is-selected-image");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "editor-image");
  });

  editor.addEventListener("dragover", (event) => {
    if (!draggedEditorImage) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  editor.addEventListener("drop", (event) => {
    if (!draggedEditorImage) return;
    event.preventDefault();

    const targetImage = event.target instanceof HTMLImageElement ? event.target : null;
    if (!targetImage || targetImage === draggedEditorImage) {
      return;
    }

    const rect = targetImage.getBoundingClientRect();
    const isBefore =
      targetImage.dataset.align === "center"
        ? event.clientY < rect.top + rect.height / 2
        : event.clientX < rect.left + rect.width / 2;
    targetImage.insertAdjacentElement(isBefore ? "beforebegin" : "afterend", draggedEditorImage);
    normalizeEditorImage(draggedEditorImage);
    cleanupEditorImageSpacing(editor);
  });

  editor.addEventListener("dragend", () => {
    cleanupEditorImageSpacing(editor);
    draggedEditorImage = null;
  });

  bindGlobalEditorDeletion();
}

function updateSelectedEditorImageSize(size) {
  if (!selectedEditorImage) {
    alert("먼저 편집할 이미지를 클릭해 주세요.");
    return;
  }

  selectedEditorImage.dataset.size = size;
  applyEditorImageLayout(selectedEditorImage);
}

function updateSelectedEditorImageAlign(align) {
  if (!selectedEditorImage) {
    alert("먼저 편집할 이미지를 클릭해 주세요.");
    return;
  }

  selectedEditorImage.dataset.align = align;
  applyEditorImageLayout(selectedEditorImage);
}

function removeProduct(productId) {
  if (siteState.products.length === 1) {
    alert("최소 한 개의 상품은 필요합니다.");
    return;
  }

  siteState.products = siteState.products.filter((product) => product.id !== productId);
  selectedProductId = siteState.products[0].id;
  saveAndNotify("상품이 삭제되었습니다.").then((saved) => {
    if (!saved) return;
    renderProductsManagement();
    bindLogout();
  });
}

function removeSelectedProducts() {
  syncSelectedProducts();
  if (!selectedProductIds.size) {
    alert("삭제할 상품을 먼저 선택해 주세요.");
    return;
  }

  if (selectedProductIds.size === siteState.products.length) {
    alert("최소 한 개의 상품은 필요합니다.");
    return;
  }

  siteState.products = siteState.products.filter((product) => !selectedProductIds.has(product.id));
  selectedProductIds.clear();
  selectedProductId = siteState.products[0]?.id || null;
  saveAndNotify("선택한 상품이 삭제되었습니다.").then((saved) => {
    if (!saved) return;
    renderProductsManagement();
    bindLogout();
  });
}

function reorderProducts(draggedId, targetId, position) {
  const draggedIndex = siteState.products.findIndex((product) => product.id === draggedId);
  const targetIndex = siteState.products.findIndex((product) => product.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return;

  const [dragged] = siteState.products.splice(draggedIndex, 1);
  let insertIndex = siteState.products.findIndex((product) => product.id === targetId);
  if (position === "after") insertIndex += 1;
  siteState.products.splice(insertIndex, 0, dragged);
  selectedProductId = dragged.id;
  writeSiteState(siteState);
}

function renderMainManagement() {
  const content = `
    <div class="panel">
      <h2 class="section-title">대문 관리</h2>
      ${renderLegacyIssueNotice((issue) => issue.area === "main")}
      <div class="switch-row"><strong>대문 사진</strong><input class="switch" id="main-enabled" type="checkbox" ${
        siteState.main.enabled ? "checked" : ""
      }></div>
      <div class="image-card-grid">
        <div class="image-card">
          ${previewMediaMarkup(siteState.main.heroImageUrl, siteState.main.heroMediaType, siteState.main.heroBackground, siteState.main.heroMediaKey)}
          <div>
            <label>파일명<input id="main-image-name" value="${siteState.main.heroImageName}" readonly></label>
            <label>파일 업로드<input id="main-image-file" type="file" accept="image/*,video/*"></label>
            <div id="main-upload-status" style="display:none;color:#888;font-size:0.85rem;margin-top:6px;">업로드 중... 완료 후 저장하세요.</div>
          </div>
        </div>
      </div>
      <div class="switch-row" style="margin-top:24px;"><strong>포폴 리스트</strong><input class="switch" id="main-work-list-enabled" type="checkbox" ${
        siteState.main.workListEnabled ? "checked" : ""
      }></div>
      <div class="button-row"><button class="primary" id="save-main-button" type="button">대문 사진 수정</button></div>
    </div>
  `;

  adminApp.innerHTML = shellTemplate("main", "대문 관리", content);
  hydrateStoredMedia(adminApp);

  document.querySelector("#save-main-button").addEventListener("click", async () => {
    siteState.main.enabled = document.querySelector("#main-enabled").checked;
    siteState.main.workListEnabled = document.querySelector("#main-work-list-enabled").checked;
    await ensureRemoteVideoPoster({
      name: siteState.main.heroImageName,
      type: siteState.main.heroMediaType,
      key: siteState.main.heroMediaKey,
      get posterKey() {
        return siteState.main.heroPosterKey;
      },
      set posterKey(value) {
        siteState.main.heroPosterKey = value;
      },
    });
    await saveSectionAndNotify(
      "main",
      {
        enabled: siteState.main.enabled,
        workListEnabled: siteState.main.workListEnabled,
        heroImageName: siteState.main.heroImageName,
        heroMediaType: siteState.main.heroMediaType,
        heroMediaKey: siteState.main.heroMediaKey,
        heroPosterKey: siteState.main.heroPosterKey,
        heroImageUrl: siteState.main.heroImageUrl,
        heroBackground: siteState.main.heroBackground,
      },
      "대문 설정이 저장되었습니다."
    );
  });

  document.querySelector("#main-image-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const saveBtn = document.querySelector("#save-main-button");
    const statusEl = document.querySelector("#main-upload-status");
    if (saveBtn) saveBtn.disabled = true;
    if (statusEl) statusEl.style.display = "block";
    const saved = await persistUploadedMedia(file, {
      section: "main",
      get name() {
        return siteState.main.heroImageName;
      },
      set name(value) {
        siteState.main.heroImageName = value;
      },
      get type() {
        return siteState.main.heroMediaType;
      },
      set type(value) {
        siteState.main.heroMediaType = value;
      },
      get key() {
        return siteState.main.heroMediaKey;
      },
      set key(value) {
        siteState.main.heroMediaKey = value;
      },
      get posterKey() {
        return siteState.main.heroPosterKey;
      },
      set posterKey(value) {
        siteState.main.heroPosterKey = value;
      },
      get url() {
        return siteState.main.heroImageUrl;
      },
      set url(value) {
        siteState.main.heroImageUrl = value;
      },
    });
    if (!saved) return;
    const persisted = await persistSectionMedia("main");
    if (!persisted) {
      alert("대문 파일 저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    renderMainManagement();
    bindLogout();
  });
}

function renderAboutManagement() {
  const sections = siteState.about.sections
    .map(
      (section, index) => `
        <div class="panel">
          <label>제목<input data-section-title="${index}" value="${section.title}"></label>
          <label>내용<textarea rows="5" data-section-content="${index}">${section.content}</textarea></label>
          <label>칩 목록(쉼표로 구분)<input data-section-chips="${index}" value="${section.chips.join(", ")}"></label>
        </div>
      `
    )
    .join("");

  const content = `
    <div class="panel">
      <h2 class="section-title">회사 소개 관리</h2>
      ${renderLegacyIssueNotice((issue) => issue.area === "about")}
      <div class="switch-row"><strong>회사 소개</strong><input class="switch" id="about-enabled" type="checkbox" ${
        siteState.about.enabled ? "checked" : ""
      }></div>
      ${sections}
      <div class="switch-row" style="margin-top:24px;"><strong>회사 이미지</strong><input class="switch" id="about-image-enabled" type="checkbox" ${
        siteState.about.imageEnabled ? "checked" : ""
      }></div>
      <div class="image-card">
        ${previewMediaMarkup(siteState.about.imageUrl, siteState.about.mediaType, siteState.main.heroBackground, siteState.about.mediaKey)}
        <div>
          <label>파일명<input id="about-image-name" value="${siteState.about.imageName}" readonly></label>
          <label>파일 업로드<input id="about-image-file" type="file" accept="image/*,video/*"></label>
          <div id="about-upload-status" style="display:none;color:#888;font-size:0.85rem;margin-top:6px;">업로드 중... 완료 후 저장하세요.</div>
        </div>
      </div>
      <div class="button-row"><button class="primary" id="save-about-button" type="button">회사 소개 저장</button></div>
    </div>
  `;

  adminApp.innerHTML = shellTemplate("about", "회사 소개 관리", content);
  hydrateStoredMedia(adminApp);

  document.querySelector("#save-about-button").addEventListener("click", async () => {
    siteState.about.enabled = document.querySelector("#about-enabled").checked;
    siteState.about.imageEnabled = document.querySelector("#about-image-enabled").checked;
    siteState.about.sections = siteState.about.sections.map((section, index) => ({
      ...section,
      title: document.querySelector(`[data-section-title="${index}"]`).value.trim(),
      content: document.querySelector(`[data-section-content="${index}"]`).value.trim(),
      chips: document
        .querySelector(`[data-section-chips="${index}"]`)
        .value.split(",")
        .map((chip) => chip.trim())
        .filter(Boolean),
    }));
    await ensureRemoteVideoPoster({
      name: siteState.about.imageName,
      type: siteState.about.mediaType,
      key: siteState.about.mediaKey,
      get posterKey() {
        return siteState.about.posterKey;
      },
      set posterKey(value) {
        siteState.about.posterKey = value;
      },
    });
    await saveSectionAndNotify(
      "about",
      {
        enabled: siteState.about.enabled,
        imageEnabled: siteState.about.imageEnabled,
        imageName: siteState.about.imageName,
        mediaType: siteState.about.mediaType,
        mediaKey: siteState.about.mediaKey,
        posterKey: siteState.about.posterKey,
        imageUrl: siteState.about.imageUrl,
        sections: siteState.about.sections,
      },
      "회사 소개가 저장되었습니다."
    );
  });

  document.querySelector("#about-image-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const saveBtn = document.querySelector("#save-about-button");
    const statusEl = document.querySelector("#about-upload-status");
    if (saveBtn) saveBtn.disabled = true;
    if (statusEl) statusEl.style.display = "block";
    const saved = await persistUploadedMedia(file, {
      section: "about",
      get name() {
        return siteState.about.imageName;
      },
      set name(value) {
        siteState.about.imageName = value;
      },
      get type() {
        return siteState.about.mediaType;
      },
      set type(value) {
        siteState.about.mediaType = value;
      },
      get key() {
        return siteState.about.mediaKey;
      },
      set key(value) {
        siteState.about.mediaKey = value;
      },
      get posterKey() {
        return siteState.about.posterKey;
      },
      set posterKey(value) {
        siteState.about.posterKey = value;
      },
      get url() {
        return siteState.about.imageUrl;
      },
      set url(value) {
        siteState.about.imageUrl = value;
      },
    });
    if (!saved) {
      if (saveBtn) saveBtn.disabled = false;
      if (statusEl) statusEl.style.display = "none";
      return;
    }
    const persisted = await persistSectionMedia("about");
    if (!persisted) {
      if (saveBtn) saveBtn.disabled = false;
      if (statusEl) statusEl.style.display = "none";
      alert("회사 소개 파일 저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    renderAboutManagement();
    bindLogout();
  });
}

function renderBrandingManagement() {
  const content = `
    <div class="panel">
      <h2 class="section-title">로고 링크 관리</h2>
      <div class="field-grid">
        <label class="wide-row">우측 하단 로고 심볼 링크
          <input id="branding-logo-link" type="url" value="${escapeHtml(siteState.branding.logoLink || "")}" placeholder="https://example.com">
        </label>
      </div>
      <p class="editor-hint">홈페이지 우측 하단 심볼을 클릭하면 이 링크가 새 창에서 열립니다.</p>
      <div class="button-row"><button class="primary" id="save-branding-button" type="button">링크 저장</button></div>
    </div>
  `;

  adminApp.innerHTML = shellTemplate("branding", "로고 링크 관리", content);

  document.querySelector("#save-branding-button").addEventListener("click", async () => {
    siteState.branding.logoLink = document.querySelector("#branding-logo-link").value.trim();
    await saveAndNotify("로고 링크가 저장되었습니다.");
  });
}

function selectedProduct() {
  return siteState.products.find((product) => product.id === selectedProductId) || siteState.products[0];
}

function renderProductsManagement() {
  syncSelectedProducts();
  const current = selectedProduct();
  const filteredProducts = siteState.products.filter((product) => {
    const matchesName = !productFilters.name || product.name.toLowerCase().includes(productFilters.name.toLowerCase());
    const matchesStatus =
      !productFilters.status ||
      (productFilters.status === "활성화" ? product.active : !product.active);
    const matchesCategory = !productFilters.category || product.category === productFilters.category;
    return matchesName && matchesStatus && matchesCategory;
  });
  const productRows = filteredProducts
    .map(
      (product, index) => `
        <tr draggable="true" data-product-id="${product.id}" style="${product.id === current.id ? "background:#f5f5f5;" : ""}">
          <td>${dragHandleMarkup()}</td>
          <td><input type="checkbox" data-product-checkbox="${product.id}" ${selectedProductIds.has(product.id) ? "checked" : ""}></td>
          <td>${index + 1}</td>
          <td><span class="status-badge ${product.showOnMain ? "active" : ""}">${product.showOnMain ? "노출" : "-"}</span></td>
          <td>${product.active ? "활성화" : "비활성화"}</td>
          <td>${product.category}</td>
          <td>${product.name}</td>
          <td>${product.createdAt}</td>
          <td>
            <div class="table-actions">
              <button class="mini-button" type="button" data-product-select="${product.id}">수정</button>
              <button class="mini-button danger" type="button" data-product-delete="${product.id}">삭제</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  const content = `
    <div class="panel">
      <h2 class="section-title">상품 관리</h2>
      <div class="field-grid product-filter-row" style="margin-bottom:18px;">
        <label>상품명 검색<input id="product-filter-name" value="${escapeHtml(productFilterDraft.name)}" placeholder="상품명"></label>
        <label>상태<select id="product-filter-status"><option value="">전체</option><option value="활성화" ${
          productFilterDraft.status === "활성화" ? "selected" : ""
        }>활성화</option><option value="비활성화" ${productFilterDraft.status === "비활성화" ? "selected" : ""}>비활성화</option></select></label>
        <label>카테고리<select id="product-filter-category"><option value="">전체</option>${siteState.categories
          .map((category) => `<option ${productFilterDraft.category === category ? "selected" : ""}>${category}</option>`)
          .join("")}</select></label>
      </div>
      <div class="button-row">
        <button class="secondary" id="product-filter-apply" type="button">검색</button>
        <button class="secondary" id="product-delete-selected" type="button">선택 삭제</button>
        <button class="secondary" id="product-add" type="button">상품 등록</button>
      </div>
    </div>
    <div class="panel">
      <div class="product-list-head">
        <strong>상품 리스트</strong>
        <span class="product-list-copy">체크박스로 여러 개 삭제할 수 있고, 행을 드래그해서 순서를 바꿀 수 있습니다.</span>
      </div>
      <div class="table-wrap"><table><thead><tr><th></th><th><input type="checkbox" id="product-select-all"></th><th>No</th><th>메인 노출</th><th>상태</th><th>카테고리</th><th>상품명</th><th>생성일시</th><th>관리</th></tr></thead><tbody>${productRows}</tbody></table></div>
    </div>
    <div class="panel">
      <h2 class="section-title">카테고리 관리</h2>
      <div class="field-grid">
        <label class="wide-row">새 카테고리<input id="category-new-name" placeholder="새 카테고리 이름"></label>
      </div>
      <div class="button-row">
        <button class="secondary" id="category-add" type="button">카테고리 추가</button>
      </div>
      <div class="table-wrap" style="margin-top:18px;">
        <table>
          <thead><tr><th></th><th>No</th><th>이름</th><th>관리</th></tr></thead>
          <tbody>
            ${siteState.categories
              .map(
                (category, index) => `
                  <tr draggable="true" data-category-row="${index}">
                    <td>${dragHandleMarkup()}</td>
                    <td>${index + 1}</td>
                    <td><input data-category-name="${index}" value="${escapeHtml(category)}"></td>
                    <td>
                      <div class="table-actions">
                        <button class="mini-button" type="button" data-category-save="${index}">수정</button>
                        <button class="mini-button danger" type="button" data-category-delete="${index}">삭제</button>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <h2 class="section-title">상품 상세</h2>
      ${renderLegacyIssueNotice((issue) => issue.area === "product" && issue.productId === current.id)}
      <div class="field-grid">
        <label>카테고리<select id="product-category">${categoryOptionsMarkup(current.category)}</select></label>
        <label>상태<select id="product-active"><option value="true" ${current.active ? "selected" : ""}>활성화</option><option value="false" ${
          !current.active ? "selected" : ""
        }>비활성화</option></select></label>
        <label>상품 ID<input id="product-id" value="${current.id}"></label>
        <label>Slug<input id="product-slug" value="${current.slug}"></label>
        <label>상품명<input id="product-name" value="${current.name}"></label>
        <label>상품 설명<input id="product-summary" value="${current.summary}"></label>
        <div class="wide-row image-card-grid">
          <div class="image-card">
            ${previewMediaMarkup(current.thumbnailUrl, "image", current.palette, current.thumbnailKey)}
            <div>
              <label>썸네일 파일명<input id="product-thumb-name" value="${current.thumbnailName}" readonly></label>
              <label>썸네일 업로드<input id="product-thumb-file" type="file" accept="image/*"></label>
            </div>
          </div>
          <div class="image-card">
            ${previewMediaMarkup(current.coverUrl, "image", current.palette, current.coverKey)}
            <div>
              <label>커버 파일명<input id="product-cover-name" value="${current.coverName}" readonly></label>
              <label>커버 업로드<input id="product-cover-file" type="file" accept="image/*"></label>
            </div>
          </div>
        </div>
        <div class="wide-row">
          <label>내용 에디터</label>
          <div class="editor-toolbar">
            <div class="editor-row">
              <span class="toolbar-label">텍스트</span>
              <div class="toolbar-group">
                <button class="toolbar-button" type="button" data-editor-command="bold">Bold</button>
                <button class="toolbar-button" type="button" data-editor-block="p">P</button>
                <button class="toolbar-button" type="button" data-editor-heading="h2">H2</button>
                <button class="toolbar-button" type="button" data-editor-heading="h3">H3</button>
                <div class="segmented-control">
                  <button class="icon-button" type="button" data-editor-command="justifyLeft" aria-label="텍스트 좌측 정렬" title="텍스트 좌측 정렬"><span class="align-icon left"><span></span></span></button>
                  <button class="icon-button" type="button" data-editor-command="justifyCenter" aria-label="텍스트 가운데 정렬" title="텍스트 가운데 정렬"><span class="align-icon center"><span></span></span></button>
                  <button class="icon-button" type="button" data-editor-command="justifyRight" aria-label="텍스트 우측 정렬" title="텍스트 우측 정렬"><span class="align-icon right"><span></span></span></button>
                </div>
              </div>
            </div>
            <div class="editor-row">
              <span class="toolbar-label">이미지</span>
              <div class="toolbar-group">
                <button class="toolbar-button upload-button" type="button" id="insert-image-button">이미지 업로드</button>
                <button class="toolbar-button" type="button" data-image-size="full">가득</button>
                <button class="toolbar-button" type="button" data-image-size="half">반폭</button>
                <button class="toolbar-button" type="button" data-image-size="third">1/3폭</button>
                <button class="toolbar-button" type="button" data-image-size="quarter">1/4폭</button>
                <div class="segmented-control">
                  <button class="icon-button" type="button" data-image-align="left" aria-label="이미지 좌측 정렬" title="이미지 좌측 정렬"><span class="image-align-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="9" y="5" width="10" height="6" rx="2" fill="currentColor"/><rect x="9" y="13" width="7" height="6" rx="2" fill="currentColor"/></svg></span></button>
                  <button class="icon-button" type="button" data-image-align="center" aria-label="이미지 가운데 정렬" title="이미지 가운데 정렬"><span class="image-align-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="7" y="5" width="10" height="6" rx="2" fill="currentColor"/><rect x="8.5" y="13" width="7" height="6" rx="2" fill="currentColor"/></svg></span></button>
                  <button class="icon-button" type="button" data-image-align="right" aria-label="이미지 우측 정렬" title="이미지 우측 정렬"><span class="image-align-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="5" width="10" height="6" rx="2" fill="currentColor"/><rect x="8" y="13" width="7" height="6" rx="2" fill="currentColor"/></svg></span></button>
                </div>
              </div>
            </div>
          </div>
          <p class="editor-hint">글자는 커서를 둔 문단 기준으로 정렬되고, 이미지는 클릭한 뒤 크기와 정렬을 바꿀 수 있습니다. 1/4폭까지 줄이면 최대 4장까지 한 줄에 나란히 배치할 수 있습니다.</p>
          <div id="product-content-editor" class="rich-editor" contenteditable="true">${current.content}</div>
        </div>
      </div>
      <div class="switch-row" style="margin-top:20px;"><strong>메인 노출 여부</strong><input class="switch" id="product-main-show" type="checkbox" ${
        current.showOnMain ? "checked" : ""
      }></div>
      <div class="button-row">
        <button class="secondary" id="product-delete" type="button">삭제</button>
        <button class="primary" id="save-product-button" type="button">상품 수정 저장</button>
      </div>
    </div>
  `;

  adminApp.innerHTML = shellTemplate("products", "상품 관리", content);
  hydrateStoredMedia(adminApp);
  clearSelectedEditorImage();
  bindProductEditor();

  document.querySelectorAll("[data-product-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedProductId = row.dataset.productId;
      renderProductsManagement();
      bindLogout();
    });

    row.addEventListener("dragstart", () => {
      draggedProductId = row.dataset.productId;
      row.classList.add("dragging");
    });

    row.addEventListener("dragover", (event) => {
      if (!draggedProductId) return;
      event.preventDefault();
    });

    row.addEventListener("drop", (event) => {
      if (!draggedProductId) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      reorderProducts(draggedProductId, row.dataset.productId, position);
      draggedProductId = null;
      renderProductsManagement();
      bindLogout();
    });

    row.addEventListener("dragend", () => {
      draggedProductId = null;
      row.classList.remove("dragging");
    });
  });

  document.querySelector("#product-filter-name").addEventListener("input", (event) => {
    productFilterDraft.name = event.target.value.trim();
  });

  document.querySelector("#product-filter-status").addEventListener("change", (event) => {
    productFilterDraft.status = event.target.value;
  });

  document.querySelector("#product-filter-category").addEventListener("change", (event) => {
    productFilterDraft.category = event.target.value;
  });

  document.querySelector("#product-filter-apply").addEventListener("click", () => {
    productFilters = { ...productFilterDraft };
    renderProductsManagement();
    bindLogout();
  });

  document.querySelectorAll("[data-product-checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedProductIds.add(checkbox.dataset.productCheckbox);
      else selectedProductIds.delete(checkbox.dataset.productCheckbox);
    });
  });

  document.querySelector("#product-select-all").addEventListener("change", (event) => {
    if (event.target.checked) {
      selectedProductIds = new Set(filteredProducts.map((product) => product.id));
    } else {
      selectedProductIds.clear();
    }
    renderProductsManagement();
    bindLogout();
  });

  document.querySelectorAll("[data-product-select]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedProductId = button.dataset.productSelect;
      renderProductsManagement();
      bindLogout();
    });
  });

  document.querySelectorAll("[data-product-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeProduct(button.dataset.productDelete);
    });
  });

  document.querySelector("#save-product-button").addEventListener("click", async () => {
    const product = selectedProduct();
    const editor = document.querySelector("#product-content-editor");
    await ensureEditorImagesRemote(editor);
    product.category = document.querySelector("#product-category").value;
    product.active = document.querySelector("#product-active").value === "true";
    product.id = document.querySelector("#product-id").value.trim();
    product.slug = document.querySelector("#product-slug").value.trim();
    product.name = document.querySelector("#product-name").value.trim();
    product.summary = document.querySelector("#product-summary").value.trim();
    product.content = editor.innerHTML.trim();
    product.showOnMain = document.querySelector("#product-main-show").checked;
    selectedProductId = product.id;
    await saveAndNotify("상품 정보가 저장되었습니다.");
  });

  document.querySelector("#product-thumb-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const product = selectedProduct();
    const saved = await persistUploadedMedia(file, {
      get name() {
        return product.thumbnailName;
      },
      set name(value) {
        product.thumbnailName = value;
      },
      get type() {
        return "image";
      },
      set type(_) {},
      get key() {
        return product.thumbnailKey;
      },
      set key(value) {
        product.thumbnailKey = value;
      },
      get url() {
        return product.thumbnailUrl;
      },
      set url(value) {
        product.thumbnailUrl = value;
      },
    });
    if (!saved) return;
    renderProductsManagement();
    bindLogout();
  });

  document.querySelector("#product-cover-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const product = selectedProduct();
    const saved = await persistUploadedMedia(file, {
      get name() {
        return product.coverName;
      },
      set name(value) {
        product.coverName = value;
      },
      get type() {
        return "image";
      },
      set type(_) {},
      get key() {
        return product.coverKey;
      },
      set key(value) {
        product.coverKey = value;
      },
      get url() {
        return product.coverUrl;
      },
      set url(value) {
        product.coverUrl = value;
      },
    });
    if (!saved) return;
    renderProductsManagement();
    bindLogout();
  });

  document.querySelector("#product-add").addEventListener("click", () => {
    const timestamp = Date.now();
    const newProduct = {
      id: `product-${timestamp}`,
      slug: `product-${timestamp}`,
      category: "Visual branding",
      active: true,
      showOnMain: false,
      name: "Untitled Visual Project",
      summary: "브랜드 콘셉트와 결과물을 한 흐름으로 소개하는 프로젝트 설명을 입력해 주세요.",
      content: "프로젝트 개요, 촬영 방향, 결과물 활용 범위를 이곳에 정리해 주세요.",
      thumbnailName: "main.jpg",
      thumbnailKey: "",
      thumbnailUrl: "",
      coverName: "cover.jpg",
      coverKey: "",
      coverUrl: "",
      gallery: [
        { id: "g1", name: "detail-1.jpg", url: "" },
        { id: "g2", name: "detail-2.jpg", url: "" },
      ],
      palette: ["#111111", "#777777", "#f0f0f0"],
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    siteState.products.unshift(newProduct);
    selectedProductId = newProduct.id;
    writeSiteState(siteState);
    renderProductsManagement();
    bindLogout();
  });

  document.querySelector("#product-delete-selected").addEventListener("click", () => {
    removeSelectedProducts();
  });

  document.querySelector("#category-add").addEventListener("click", () => {
    const input = document.querySelector("#category-new-name");
    const value = input.value.trim();
    if (!value) {
      alert("카테고리 이름을 입력해 주세요.");
      return;
    }
    if (siteState.categories.includes(value)) {
      alert("이미 있는 카테고리입니다.");
      return;
    }
    siteState.categories.push(value);
    writeSiteState(siteState);
    renderProductsManagement();
    bindLogout();
  });

  document.querySelectorAll("[data-category-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.categorySave);
      const input = document.querySelector(`[data-category-name="${index}"]`);
      const nextValue = input.value.trim();
      const currentValue = siteState.categories[index];
      if (!nextValue) {
        alert("카테고리 이름을 입력해 주세요.");
        return;
      }
      if (siteState.categories.some((category, categoryIndex) => categoryIndex !== index && category === nextValue)) {
        alert("이미 있는 카테고리입니다.");
        return;
      }
      siteState.categories[index] = nextValue;
      siteState.products = siteState.products.map((product) =>
        product.category === currentValue ? { ...product, category: nextValue } : product
      );
      writeSiteState(siteState);
      renderProductsManagement();
      bindLogout();
    });
  });

  document.querySelectorAll("[data-category-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.categoryDelete);
      const category = siteState.categories[index];
      const isUsed = siteState.products.some((product) => product.category === category);
      if (isUsed) {
        alert("상품에 사용 중인 카테고리는 삭제할 수 없습니다.");
        return;
      }
      if (siteState.categories.length === 1) {
        alert("최소 한 개의 카테고리는 필요합니다.");
        return;
      }
      siteState.categories.splice(index, 1);
      writeSiteState(siteState);
      renderProductsManagement();
      bindLogout();
    });
  });

  document.querySelectorAll("[data-category-row]").forEach((row) => {
    row.addEventListener("dragstart", () => {
      draggedCategoryIndex = Number(row.dataset.categoryRow);
      row.classList.add("dragging");
    });

    row.addEventListener("dragover", (event) => {
      if (draggedCategoryIndex === null) return;
      event.preventDefault();
    });

    row.addEventListener("drop", (event) => {
      if (draggedCategoryIndex === null) return;
      event.preventDefault();
      const targetIndex = Number(row.dataset.categoryRow);
      if (targetIndex === draggedCategoryIndex) return;
      const [moved] = siteState.categories.splice(draggedCategoryIndex, 1);
      const rect = row.getBoundingClientRect();
      const insertIndex = event.clientY < rect.top + rect.height / 2 ? targetIndex : targetIndex + 1;
      siteState.categories.splice(insertIndex > draggedCategoryIndex ? insertIndex - 1 : insertIndex, 0, moved);
      writeSiteState(siteState);
      draggedCategoryIndex = null;
      renderProductsManagement();
      bindLogout();
    });

    row.addEventListener("dragend", () => {
      draggedCategoryIndex = null;
      row.classList.remove("dragging");
    });
  });

  document.querySelectorAll("[data-editor-command]").forEach((button) => {
    button.addEventListener("click", () => {
      document.execCommand(button.dataset.editorCommand, false);
    });
  });

  document.querySelectorAll("[data-editor-block]").forEach((button) => {
    button.addEventListener("click", () => {
      document.execCommand("formatBlock", false, button.dataset.editorBlock);
    });
  });

  document.querySelectorAll("[data-editor-heading]").forEach((button) => {
    button.addEventListener("click", () => {
      document.execCommand("formatBlock", false, button.dataset.editorHeading);
    });
  });

  document.querySelector("#insert-image-button").addEventListener("click", () => {
    const editor = document.querySelector("#product-content-editor");
    rememberEditorSelection();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;

      const imageNodes = [];
      for (const file of files) {
        try {
          const previewUrl = await fileToCompressedImageDataUrl(file);
          const uploadFile = await dataUrlToFile(previewUrl, file.name);
          const mediaKey = await saveMediaAsset(uploadFile);
          if (!mediaKey) {
            throw new Error("Editor media key missing");
          }

          imageNodes.push(
            createEditorImageNode({
              previewUrl,
              fileName: file.name,
              mediaKey,
            })
          );
        } catch (error) {
          console.error("Failed to upload editor image", error);
          alert("에디터 이미지 업로드에 실패했습니다. 이미지 용량을 줄이거나 다시 시도해 주세요.");
          return;
        }
      }

      insertEditorImages(editor, imageNodes);
      bindProductEditor();
      hydrateStoredMedia(editor);
      cleanupEditorImageSpacing(editor);
      rememberEditorSelection();
    });
    input.click();
  });

  document.querySelectorAll("[data-image-size]").forEach((button) => {
    button.addEventListener("click", () => {
      rememberEditorSelection();
      updateSelectedEditorImageSize(button.dataset.imageSize);
    });
  });

  document.querySelectorAll("[data-image-align]").forEach((button) => {
    button.addEventListener("click", () => {
      rememberEditorSelection();
      updateSelectedEditorImageAlign(button.dataset.imageAlign);
    });
  });

  document.querySelector("#product-delete").addEventListener("click", () => {
    removeProduct(current.id);
  });
}

function selectedInquiry() {
  return siteState.inquiries.find((inquiry) => inquiry.id === selectedInquiryId) || siteState.inquiries[0];
}

function renderInquiriesManagement() {
  const filteredInquiries = siteState.inquiries.filter((inquiry) => {
    const matchesStatus = !inquiryFilters.status || inquiry.status === inquiryFilters.status;
    const matchesName = !inquiryFilters.name || inquiry.name.toLowerCase().includes(inquiryFilters.name.toLowerCase());
    const matchesManager =
      !inquiryFilters.manager || inquiry.manager.toLowerCase().includes(inquiryFilters.manager.toLowerCase());
    return matchesStatus && matchesName && matchesManager;
  });
  const current =
    filteredInquiries.find((inquiry) => inquiry.id === selectedInquiryId) || filteredInquiries[0] || selectedInquiry();
  const inquiryRows = filteredInquiries
    .map(
      (inquiry, index) => `
        <tr data-inquiry-id="${inquiry.id}" style="${inquiry.id === current.id ? "background:#f5f5f5;" : ""}">
          <td>${index + 1}</td>
          <td><span class="status-badge ${inquiry.status === "완료" ? "active" : ""}">${inquiry.status}</span></td>
          <td>${inquiry.brand}</td>
          <td>${inquiry.name}</td>
          <td>${inquiry.contact}</td>
          <td>${inquiry.receivedAt}</td>
          <td>${inquiry.completedAt || "-"}</td>
        </tr>
      `
    )
    .join("");

  const content = `
    <div class="panel">
      <h2 class="section-title">문의 관리</h2>
      <div class="field-grid inquiry-filter-row" style="margin-bottom:18px;">
        <label>상태<select id="inquiry-filter-status"><option value="">전체</option>${["대기", "상담", "완료"]
          .map((status) => `<option ${inquiryFilterDraft.status === status ? "selected" : ""}>${status}</option>`)
          .join("")}</select></label>
        <label>담당자명 검색<input id="inquiry-filter-name" value="${escapeHtml(inquiryFilterDraft.name)}" placeholder="담당자명"></label>
        <label>관리자 이름 검색<input id="inquiry-filter-manager" value="${escapeHtml(inquiryFilterDraft.manager)}" placeholder="관리자 이름"></label>
      </div>
      <div class="button-row">
        <button class="secondary" id="inquiry-filter-apply" type="button">검색</button>
      </div>
      <div class="table-wrap"><table><thead><tr><th>No</th><th>상태</th><th>브랜드명</th><th>담당자 이름</th><th>담당자 연락처</th><th>문의 일시</th><th>완료 일시</th></tr></thead><tbody>${inquiryRows}</tbody></table></div>
    </div>
    <div class="panel">
      <h2 class="section-title">문의 상세</h2>
      <div class="field-grid">
        <label>문의 상태<select id="inquiry-status">${["대기", "상담", "완료"]
          .map((status) => `<option ${current.status === status ? "selected" : ""}>${status}</option>`)
          .join("")}</select></label>
        <label>문의 일시<input id="inquiry-received" value="${current.receivedAt}"></label>
        <label>상담 일시<input id="inquiry-completed" type="datetime-local" value="${formatDateTimeLocal(current.completedAt)}"></label>
        <label>담당자 이름<input id="inquiry-name" value="${current.name}"></label>
        <label>담당자 연락처<input id="inquiry-contact" value="${current.contact}"></label>
        <label>브랜드명<input id="inquiry-brand" value="${current.brand}"></label>
        <label class="wide-row">내용<textarea id="inquiry-content" rows="4">${current.content}</textarea></label>
        <label>관리자 이름<input id="inquiry-manager" value="${current.manager}"></label>
        <label class="wide-row">의견<textarea id="inquiry-memo" rows="4">${current.memo}</textarea></label>
      </div>
      <div class="button-row"><button class="primary" id="save-inquiry-button" type="button">문의 정보 저장</button></div>
    </div>
  `;

  adminApp.innerHTML = shellTemplate("inquiries", "문의 관리", content);

  document.querySelectorAll("[data-inquiry-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedInquiryId = row.dataset.inquiryId;
      renderInquiriesManagement();
      bindLogout();
    });
  });

  document.querySelector("#inquiry-filter-status").addEventListener("change", (event) => {
    inquiryFilterDraft.status = event.target.value;
  });

  document.querySelector("#inquiry-filter-name").addEventListener("input", (event) => {
    inquiryFilterDraft.name = event.target.value.trim();
  });

  document.querySelector("#inquiry-filter-manager").addEventListener("input", (event) => {
    inquiryFilterDraft.manager = event.target.value.trim();
  });

  document.querySelector("#inquiry-filter-apply").addEventListener("click", () => {
    inquiryFilters = { ...inquiryFilterDraft };
    renderInquiriesManagement();
    bindLogout();
  });

  document.querySelector("#save-inquiry-button").addEventListener("click", async () => {
    const inquiry = selectedInquiry();
    inquiry.status = document.querySelector("#inquiry-status").value;
    inquiry.receivedAt = document.querySelector("#inquiry-received").value.trim();
    inquiry.completedAt = parseDateTimeLocal(document.querySelector("#inquiry-completed").value.trim());
    inquiry.name = document.querySelector("#inquiry-name").value.trim();
    inquiry.contact = document.querySelector("#inquiry-contact").value.trim();
    inquiry.brand = document.querySelector("#inquiry-brand").value.trim();
    inquiry.content = document.querySelector("#inquiry-content").value.trim();
    inquiry.manager = document.querySelector("#inquiry-manager").value.trim();
    inquiry.memo = document.querySelector("#inquiry-memo").value.trim();
    await saveAndNotify("문의 정보가 저장되었습니다.");
  });
}

function bindLogout() {
  document.querySelector("#logout-button")?.addEventListener("click", () => {
    stopSessionTimer();
    setAdminAuthenticated(false);
    renderApp();
  });

  document.querySelector("#session-extend-button")?.addEventListener("click", () => {
    if (!extendAdminSession()) {
      alert("세션을 연장할 수 없습니다. 다시 로그인해 주세요.");
      stopSessionTimer();
      setAdminAuthenticated(false);
      renderApp();
      return;
    }

    startSessionTimer();
  });
}

function renderDashboard() {
  siteState = readSiteState();
  const route = currentRoute();
  if (route === "main") renderMainManagement();
  if (route === "about") renderAboutManagement();
  if (route === "products") renderProductsManagement();
  if (route === "inquiries") renderInquiriesManagement();
  if (route === "branding") renderBrandingManagement();
  startSessionTimer();
  bindLogout();
  notifyMongoStorageUsage();
}

function renderApp() {
  stopSessionTimer();
  if (!isAdminAuthenticated()) {
    adminApp.innerHTML = loginTemplate();
    document.querySelector("#login-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const credentials = readAdminCredentials();
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "").trim();
      if (email === credentials.email && password === credentials.password) {
        setAdminAuthenticated(true);
        renderApp();
        return;
      }
      document.querySelector("#login-feedback").textContent = "로그인 정보가 올바르지 않습니다.";
    });
    return;
  }

  renderDashboard();
}

window.addEventListener("hashchange", renderDashboard);

async function bootAdmin() {
  const params = new URLSearchParams(location.search);
  if (params.get("importLocal") === "1") {
    const imported = await importLocalStateToRemote();
    if (imported) {
      params.delete("importLocal");
      const nextSearch = params.toString();
      history.replaceState({}, "", `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`);
      alert("이 브라우저에 저장된 데이터를 공용 DB로 가져왔습니다.");
    } else {
      alert("이 브라우저의 로컬 데이터를 가져오지 못했습니다.");
    }
  }
  renderApp();
  siteState = await refreshSiteStateFromRemote();
  siteState = await migrateSiteStateMediaToRemote(siteState);
  if (isAdminAuthenticated()) {
    renderDashboard();
  }
}

bootAdmin();
