import https from "node:https";

const HOST = "www.teamyezi.kr";
const IP = "136.110.186.175";

const productTemplates = [
  {
    category: "Visual branding",
    name: "Launch Visual Kit",
    summary: "신규 브랜드 론칭에 맞춰 심벌, 컬러, 촬영 결과물을 한 톤으로 연결한 스타트업용 비주얼 패키지.",
    content:
      "브랜드의 첫 인상이 필요한 시점에 맞춰 로고 응용, 컬러 가이드, 상세 페이지용 메인 컷, SNS 오프닝 비주얼을 하나의 세트처럼 제안했습니다. 적은 자산으로도 밀도 있게 보이도록 편집 구조와 컷 구성을 함께 정리했습니다.",
    palette: ["#191919", "#a48672", "#f3eee9"],
  },
  {
    category: "Visual branding",
    name: "Summer Pool Editorial",
    summary: "수면의 반사광과 여름 컬러를 중심으로 브랜드 무드를 재정리한 비주얼 브랜딩 프로젝트.",
    content:
      "브랜드의 시즌 키워드를 물성과 색으로 다시 해석해 에디토리얼 무드를 설계했습니다. 메인 비주얼, SNS 활용 컷, 상세 페이지용 톤앤매너를 하나의 흐름으로 맞추고 여름 시즌에 어울리는 선명한 인상을 만드는 데 집중했습니다.",
    palette: ["#111111", "#444444", "#f0f0f0"],
  },
  {
    category: "Creative directing",
    name: "Resort Campaign Direction",
    summary: "룩의 텍스처와 바다의 온도를 연결해 촬영 콘셉트부터 결과물 활용까지 설계한 캠페인 디렉팅.",
    content:
      "촬영 콘셉트 제안, 레퍼런스 보드 정리, 현장 디렉팅, 최종 셀렉 기준 수립까지 전 과정을 담당했습니다. 결과물은 캠페인 비주얼과 썸네일, 상세 페이지 키 컷으로 확장될 수 있도록 구성했습니다.",
    palette: ["#1b1b1b", "#765d4b", "#efe7df"],
  },
];

const inquiries = [
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
];

function requestJson(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: IP,
        servername: HOST,
        path,
        method,
        headers: {
          Host: HOST,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 400) {
            reject(new Error(`${method} ${path} failed: ${res.statusCode} ${raw}`));
            return;
          }

          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const current = await requestJson("GET", "/api/site-state");
const payload = current?.payload;

if (!payload || typeof payload !== "object") {
  throw new Error("Remote payload is missing");
}

payload.categories = ["Visual branding", "Creative directing"];
payload.products = Array.isArray(payload.products)
  ? payload.products.map((product, index) => ({
      ...product,
      category: productTemplates[index]?.category || product.category || "Visual branding",
      name: productTemplates[index]?.name || product.name || `Project ${index + 1}`,
      summary: productTemplates[index]?.summary || product.summary || "",
      content: productTemplates[index]?.content || product.content || "",
      palette: productTemplates[index]?.palette || product.palette || ["#111111", "#666666", "#f0f0f0"],
      active: true,
      showOnMain: true,
      createdAt: product.createdAt || `2026-03-26 14:${String(index).padStart(2, "0")}:00`,
    }))
  : [];
payload.inquiries = inquiries;

const result = await requestJson("POST", "/api/site-state", { payload });
console.log(JSON.stringify({ ok: true, result }, null, 2));
