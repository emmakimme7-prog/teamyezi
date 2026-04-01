const app = document.querySelector("#app");
const page = document.body.dataset.page;
let siteState = readSiteState();
let scrollRevealObserver = null;
let scrollFxFrame = null;
let scrollParallaxHandler = null;

function isRemoteKey(key) {
  const value = String(key || "");
  return value.startsWith("mongo:") || value.startsWith("gfs:") || value.startsWith("gcs:");
}

function sanitizeRichContentForPublic(html) {
  const markup = String(html || "").trim();
  if (!markup) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="detail-root">${markup}</div>`, "text/html");
  const root = doc.querySelector("#detail-root");
  if (!root) return markup;

  root.querySelectorAll("img, video").forEach((node) => {
    const key = node.getAttribute("data-media-key") || "";
    const src = node.getAttribute("src") || "";
    const shouldRemove =
      (key && !isRemoteKey(key)) ||
      src.startsWith("blob:") ||
      src.startsWith("data:");

    if (shouldRemove) {
      node.remove();
    }
  });

  return root.innerHTML;
}

function createGradient(palette = ["#111111", "#777777", "#f0f0f0"], angle = 145) {
  return `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]} 56%, ${palette[2]})`;
}

function mediaStyle(url, palette, angle) {
  if (url) return `background-image:url('${url}')`;
  return `background:${createGradient(palette, angle)}`;
}

function renderVideoMarkup(url) {
  return `<video src="${url}" autoplay muted loop playsinline webkit-playsinline preload="auto"></video>`;
}

function renderVideoMarkupWithPoster(url, posterUrl = "") {
  const videoPoster = posterUrl ? ` poster="${posterUrl}"` : "";
  return `
    <div class="hero-video-shell" data-video-src="${url}" data-video-poster="${posterUrl}">
      <video src="${url}" autoplay muted loop playsinline webkit-playsinline preload="auto"${videoPoster}></video>
    </div>
  `;
}

async function dataUrlToFileFromMain(dataUrl, fileName = "poster.jpg") {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

function primeVideoElement(video, url) {
  if (!(video instanceof HTMLVideoElement) || !url) return;
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
  if (!video.getAttribute("src")) {
    video.src = url;
    video.load();
  }
  const tryPlay = () => video.play?.().catch(() => {});
  if (video.readyState >= 2) {
    tryPlay();
  } else {
    video.addEventListener("loadeddata", tryPlay, { once: true });
  }
}

function bootDeferredHeroVideos(root = document) {
  const videos = Array.from(root.querySelectorAll(".hero-video-shell video"));
  videos.forEach((video) => {
    if (!(video instanceof HTMLVideoElement)) return;
    const src = video.getAttribute("src") || "";
    if (!src) return;
    primeVideoElement(video, src);
  });
}

function renderHeroMedia(url, type, className, palette, angle) {
  const key =
    className === "page-hero-image"
      ? siteState.main.heroMediaKey
      : className === "about-hero-image"
        ? siteState.about.mediaKey
        : "";
  const posterKey =
    className === "page-hero-image"
      ? siteState.main.heroPosterKey
      : className === "about-hero-image"
        ? siteState.about.posterKey
        : "";

  if (isRemoteKey(key)) {
    const remoteUrl = readRemoteMediaUrl(key);
    if (type === "video") {
      const posterUrl = isRemoteKey(posterKey) ? readRemoteMediaUrl(posterKey) : url;
      return `<div class="${className} media-frame" style="${mediaStyle(url, palette, angle)}">${renderVideoMarkupWithPoster(
        remoteUrl,
        posterUrl
      )}</div>`;
    }

    return `<div class="${className} media-frame"><img src="${remoteUrl}" alt="" loading="eager" fetchpriority="high" decoding="async" /></div>`;
  }

  if (!url) {
    return `<div class="${className}" style="${mediaStyle("", palette, angle)}"></div>`;
  }

  if (type === "video") {
    if (isSmallViewport) {
      return `<div class="${className} media-frame"><img src="${url}" alt="" loading="eager" fetchpriority="high" decoding="async" /></div>`;
    }
    return `<div class="${className} media-frame">${renderVideoMarkup(url)}</div>`;
  }

  return `<div class="${className} media-frame"><img src="${url}" alt="" loading="eager" fetchpriority="high" decoding="async" /></div>`;
}

async function hydrateStoredMedia(root = document) {
  const nodes = root.querySelectorAll("[data-media-key]");
  for (const node of nodes) {
    const key = node.getAttribute("data-media-key");
    const type = node.getAttribute("data-media-type") || "image";
    const url = await readMediaAssetUrl(key);
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

async function backfillHeroPoster(section) {
  return;
}

function extractFirstMedia(html) {
  const safeHtml = sanitizeRichContentForPublic(html);
  const imageMatch = String(safeHtml || "").match(/<img[^>]+src="([^"]+)"/i);
  if (imageMatch) return imageMatch[1];
  return "";
}

function productThumbnail(product) {
  return product.thumbnailUrl || extractFirstMedia(product.content);
}

function productCover(product) {
  return product.coverUrl || product.thumbnailUrl || extractFirstMedia(product.content);
}

function renderProductThumb(product) {
  const fallbackUrl = productThumbnail(product);
  if (isRemoteKey(product.thumbnailKey)) {
    return `<div class="tile-image media-frame"><img src="${readRemoteMediaUrl(product.thumbnailKey)}" alt="" loading="lazy" decoding="async" /></div>`;
  }

  return `<div class="tile-image" style="${mediaStyle(fallbackUrl, product.palette, 145)}"></div>`;
}

function renderProductCover(product) {
  const fallbackUrl = productCover(product);
  if (isRemoteKey(product.coverKey)) {
    return `<div class="detail-cover media-frame"><img src="${readRemoteMediaUrl(product.coverKey)}" alt="" loading="lazy" decoding="async" /></div>`;
  }

  return `<div class="detail-cover" style="${mediaStyle(fallbackUrl, product.palette, 135)}"></div>`;
}

function renderFloatingSymbol() {
  const link = String(siteState.branding?.logoLink || "").trim();
  const logoMarkup = `<picture><source srcset="./logo.webp?v=1" type="image/webp" /><img class="floating-logo-image" src="./logo.png?v=3" alt="TY" /></picture>`;
  if (!link) {
    return `<div class="floating-mark" aria-hidden="true">${logoMarkup}</div>`;
  }

  return `<a class="floating-mark floating-mark-link" href="${link}" target="_blank" rel="noreferrer noopener" aria-label="외부 링크 열기">${logoMarkup}</a>`;
}

function renderHome() {
  const mainProducts = siteState.products.filter((product) => product.active && product.showOnMain);
  app.innerHTML = `
    <section class="home-main">
      ${renderHeroMedia(
        siteState.main.heroImageUrl,
        siteState.main.heroMediaType,
        "page-hero-image",
        siteState.main.heroBackground,
        135
      )}
      ${
        siteState.main.workListEnabled
          ? `
            <section class="work-main">
              <div class="work-grid scroll-stagger">
                ${mainProducts
                  .map(
                    (product, index) => `
                      <a class="work-card scroll-reveal" data-reveal="fade-up" data-reveal-delay="${index * 0.08}" href="./work-detail.html?id=${product.slug}">
                        ${renderProductThumb(product)}
                        <strong>${product.name}</strong>
                        <p>${product.summary}</p>
                      </a>
                    `
                  )
                  .join("")}
              </div>
            </section>
          `
          : ""
      }
      ${renderFloatingSymbol()}
    </section>
  `;
  hydrateStoredMedia(app);
  bootDeferredHeroVideos(app);
}

function renderAbout() {
  if (!siteState.about.enabled) {
    app.innerHTML = "<main class='about-main'><p>About page is disabled.</p></main>";
    return;
  }

  app.innerHTML = `
    <main class="about-main">
      ${
        siteState.about.imageEnabled
          ? renderHeroMedia(
              siteState.about.imageUrl,
              siteState.about.mediaType,
              "about-hero-image",
              siteState.main.heroBackground,
              135
            )
          : ""
      }
      ${siteState.about.sections
        .map(
          (section, index) => `
            <section class="about-section scroll-reveal" data-reveal="fade-up" data-reveal-delay="${index * 0.1}">
              <h2>→ ${section.title}</h2>
              <div>
                <p>${section.content}</p>
                ${
                  section.chips.length
                    ? `<div class="chip-list">${section.chips
                        .map((chip) => `<span class="chip">${chip}</span>`)
                        .join("")}</div>`
                    : ""
                }
              </div>
            </section>
          `
        )
        .join("")}
      ${renderFloatingSymbol()}
    </main>
  `;
  hydrateStoredMedia(app);
  bootDeferredHeroVideos(app);
}

function renderContact() {
  app.innerHTML = `
    <section class="contact-main">
      <div class="scroll-reveal" data-reveal="fade-up">
        <h1>Contact with us</h1>
      </div>
      <form class="contact-form-public scroll-reveal" id="public-contact-form" data-reveal="fade-up" data-reveal-delay="0.08">
        <label>브랜드 명<input type="text" name="brand" placeholder="브랜드 명을 입력해 주세요." required></label>
        <label>담당자 이름<input type="text" name="name" placeholder="담당자 이름을 입력해 주세요." required></label>
        <label>담당자 연락처<input type="text" name="contact" placeholder="연락처를 입력해 주세요." required></label>
        <label>내용<textarea name="message" rows="4" placeholder="촬영 시기, 레퍼런스, 예산 등을 입력해 주세요." required></textarea></label>
        <label class="contact-file-field">
          사진 첨부
          <input type="file" name="attachment" id="contact-attachment" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
          <span class="contact-file-trigger">이미지 선택</span>
        </label>
        <div class="contact-file-meta" id="contact-file-meta">첨부된 파일이 없습니다. 최대 10장까지 업로드할 수 있습니다.</div>
        <div class="contact-attachment-grid" id="contact-attachment-grid" hidden></div>
        <p class="contact-consent-text">
          <button class="contact-policy-link" id="contact-policy-link" type="button">개인정보처리방침</button>에
          동의하셔야 문의등록이 가능합니다.
        </p>
        <button class="primary-button" type="submit">동의하고 문의등록</button>
        <p class="contact-feedback" id="contact-feedback" aria-live="polite"></p>
      </form>
      <div class="contact-policy-modal" id="contact-policy-modal" hidden>
        <div class="contact-policy-backdrop" id="contact-policy-close"></div>
        <div class="contact-policy-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-policy-title">
          <button class="contact-policy-icon-close" id="contact-policy-icon-close" type="button" aria-label="개인정보처리방침 닫기">×</button>
          <h2 id="contact-policy-title">개인정보처리방침</h2>
          <div class="contact-policy-body">
            <p>수집 항목: 브랜드명, 담당자 이름, 연락처, 문의 내용, 첨부 이미지</p>
            <p>이용 목적: 문의 확인, 상담 진행, 견적 및 프로젝트 논의 응대</p>
            <p>보관 기간: 문의 대응 완료 후 내부 운영 기준에 따라 보관 또는 파기</p>
            <p>동의를 거부할 권리가 있으나, 동의하지 않으실 경우 문의 등록이 제한될 수 있습니다.</p>
          </div>
        </div>
      </div>
      ${renderFloatingSymbol()}
    </section>
  `;

  const form = document.querySelector("#public-contact-form");
  const feedback = document.querySelector("#contact-feedback");
  const attachmentInput = document.querySelector("#contact-attachment");
  const attachmentMeta = document.querySelector("#contact-file-meta");
  const attachmentGrid = document.querySelector("#contact-attachment-grid");
  const submitButton = form.querySelector('button[type="submit"]');
  const policyLink = document.querySelector("#contact-policy-link");
  const policyModal = document.querySelector("#contact-policy-modal");
  const policyCloseButton = document.querySelector("#contact-policy-close");
  const policyIconCloseButton = document.querySelector("#contact-policy-icon-close");
  const maxFileSize = 10 * 1024 * 1024;
  const maxAttachmentCount = 10;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  let privacyConsent = false;
  let attachmentSequence = 0;
  let selectedAttachments = [];

  function formatFileSize(size) {
    if (!size) return "0B";
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  }

  function openPolicyModal() {
    privacyConsent = true;
    policyModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closePolicyModal() {
    policyModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function clearAttachments() {
    selectedAttachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    selectedAttachments = [];
  }

  function renderAttachmentPreview() {
    if (!selectedAttachments.length) {
      attachmentGrid.hidden = true;
      attachmentGrid.innerHTML = "";
      attachmentMeta.textContent = "첨부된 파일이 없습니다. 최대 10장까지 업로드할 수 있습니다.";
      return;
    }

    attachmentGrid.hidden = false;
    attachmentGrid.innerHTML = selectedAttachments
      .map(
        (item, index) => `
          <div class="contact-attachment-card">
            <img src="${item.previewUrl}" alt="첨부 이미지 ${index + 1}">
            <button class="contact-attachment-remove" type="button" data-attachment-id="${item.id}" aria-label="첨부 이미지 ${index + 1} 삭제">×</button>
          </div>
        `
      )
      .join("");
    attachmentMeta.textContent = `${selectedAttachments.length}장 첨부됨`;
  }

  policyLink.addEventListener("click", openPolicyModal);
  policyCloseButton.addEventListener("click", closePolicyModal);
  policyIconCloseButton.addEventListener("click", closePolicyModal);

  attachmentInput.addEventListener("change", () => {
    const files = Array.from(attachmentInput.files || []);
    attachmentInput.value = "";

    if (!files.length) {
      feedback.textContent = "";
      return;
    }

    const availableCount = maxAttachmentCount - selectedAttachments.length;
    if (availableCount <= 0) {
      feedback.textContent = "이미지는 최대 10장까지 첨부할 수 있습니다.";
      return;
    }

    const nextAttachments = [];
    let invalidTypeFound = false;
    let oversizedFound = false;

    files.slice(0, availableCount).forEach((file) => {
      if (!allowedTypes.includes(file.type)) {
        invalidTypeFound = true;
        return;
      }
      if (file.size > maxFileSize) {
        oversizedFound = true;
        return;
      }
      nextAttachments.push({
        id: `attachment-${Date.now()}-${attachmentSequence += 1}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });

    if (files.length > availableCount) {
      feedback.textContent = "이미지는 최대 10장까지 첨부할 수 있습니다.";
    } else if (invalidTypeFound) {
      feedback.textContent = "이미지 파일만 첨부할 수 있습니다.";
    } else if (oversizedFound) {
      feedback.textContent = "각 첨부 파일은 10MB 이하로 등록해 주세요.";
    } else {
      feedback.textContent = "";
    }

    selectedAttachments = [...selectedAttachments, ...nextAttachments];
    renderAttachmentPreview();
  });

  attachmentGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-attachment-id]");
    if (!(button instanceof HTMLElement)) return;

    const attachmentId = button.dataset.attachmentId;
    const removedAttachment = selectedAttachments.find((item) => item.id === attachmentId);
    if (removedAttachment) {
      URL.revokeObjectURL(removedAttachment.previewUrl);
    }
    selectedAttachments = selectedAttachments.filter((item) => item.id !== attachmentId);
    renderAttachmentPreview();
    feedback.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    privacyConsent = true;
    feedback.textContent = "";

    const data = new FormData(form);

    feedback.textContent = selectedAttachments.length
      ? "문의와 이미지를 등록하는 중입니다..."
      : "문의를 등록하는 중입니다...";
    submitButton.disabled = true;

    try {
      await createInquiry({
        brand: String(data.get("brand") || "").trim(),
        name: String(data.get("name") || "").trim(),
        contact: String(data.get("contact") || "").trim(),
        message: String(data.get("message") || "").trim(),
        attachments: selectedAttachments.map((item) => item.file),
        privacyConsent,
      });
      form.reset();
      clearAttachments();
      renderAttachmentPreview();
      feedback.textContent = "문의가 등록되었습니다. 확인 후 순차적으로 연락드리겠습니다.";
    } catch (error) {
      console.error("Failed to submit inquiry", error);
      feedback.textContent = "문의 등록 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

function renderWork() {
  const products = siteState.products.filter((product) => product.active);
  const categories = (siteState.categories || []).filter((category) =>
    products.some((product) => product.category === category)
  );
  const activeCategory = new URLSearchParams(location.search).get("category") || categories[0] || "";
  const filtered = products.filter((product) => product.category === activeCategory);

  app.innerHTML = `
    <main class="work-main">
      <div class="tab-bar scroll-reveal" data-reveal="fade-up">
        ${categories
          .map(
            (category) => `
              <a class="tab-link ${category === activeCategory ? "active" : ""}" href="./work.html?category=${encodeURIComponent(
                category
              )}">${category}</a>
            `
          )
          .join("")}
      </div>
      <div class="work-grid scroll-stagger">
        ${filtered
          .map(
            (product, index) => `
              <a class="work-card scroll-reveal" data-reveal="fade-up" data-reveal-delay="${index * 0.08}" href="./work-detail.html?id=${product.slug}">
                ${renderProductThumb(product)}
                <strong>${product.name}</strong>
                <p>${product.summary}</p>
              </a>
            `
          )
          .join("")}
      </div>
      ${renderFloatingSymbol()}
    </main>
  `;
  hydrateStoredMedia(app);
}

function renderWorkDetail() {
  const slug = new URLSearchParams(location.search).get("id");
  const product = siteState.products.find((item) => item.slug === slug) || siteState.products[0];
  const safeContent = sanitizeRichContentForPublic(product.content);

  app.innerHTML = `
    <main class="detail-main">
      ${renderProductCover(product)}
      <div class="detail-content-shell">
        <h1 class="scroll-reveal" data-reveal="fade-up">${product.name}</h1>
        <p class="scroll-reveal" data-reveal="fade-up" data-reveal-delay="0.08">${product.summary}</p>
        <div class="detail-rich scroll-reveal" data-reveal="fade-up" data-reveal-delay="0.16">${safeContent}</div>
      </div>
      ${renderFloatingSymbol()}
    </main>
  `;
  hydrateStoredMedia(app);
}

function initScrollEffects(root = document) {
  if (scrollRevealObserver) {
    scrollRevealObserver.disconnect();
  }
  if (scrollFxFrame) {
    cancelAnimationFrame(scrollFxFrame);
  }
  if (scrollParallaxHandler) {
    window.removeEventListener("scroll", scrollParallaxHandler);
    window.removeEventListener("resize", scrollParallaxHandler);
  }

  const revealNodes = Array.from(root.querySelectorAll(".scroll-reveal"));
  revealNodes.forEach((node) => {
    const delay = Number(node.getAttribute("data-reveal-delay") || 0);
    node.style.setProperty("--reveal-delay", `${delay}s`);
  });

  scrollRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          scrollRevealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  revealNodes.forEach((node) => scrollRevealObserver.observe(node));

  const parallaxNodes = Array.from(root.querySelectorAll(".floating-mark"));
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motionQuery.matches || !parallaxNodes.length) {
    parallaxNodes.forEach((node) => node.style.removeProperty("--scroll-shift"));
    return;
  }

  const applyParallax = () => {
    parallaxNodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const viewportCenter = window.innerHeight * 0.5;
      const elementCenter = rect.top + rect.height * 0.5;
      const distance = (elementCenter - viewportCenter) / window.innerHeight;
      const shift = Math.max(-36, Math.min(36, distance * -42));
      node.style.setProperty("--scroll-shift", `${shift.toFixed(2)}px`);
    });
    scrollFxFrame = null;
  };

  scrollParallaxHandler = () => {
    if (scrollFxFrame) return;
    scrollFxFrame = requestAnimationFrame(applyParallax);
  };

  window.addEventListener("scroll", scrollParallaxHandler, { passive: true });
  window.addEventListener("resize", scrollParallaxHandler);
  scrollParallaxHandler();
}

function renderPage() {
  if (page === "home") renderHome();
  if (page === "about") renderAbout();
  if (page === "contact") renderContact();
  if (page === "work") renderWork();
  if (page === "work-detail") renderWorkDetail();
  initScrollEffects(document);
}

async function bootPage() {
  renderPage();
  const remoteState = await refreshSiteStateFromRemote(page);
  siteState = remoteState;
  renderPage();
  if (page === "home") backfillHeroPoster("main");
  if (page === "about") backfillHeroPoster("about");
}

bootPage();
