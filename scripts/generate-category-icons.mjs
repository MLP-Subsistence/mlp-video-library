import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = path.join(process.cwd(), "public", "icons", "categories");
const navy = "#243447";
const red = "#A64026";
const muted = "#6B7C8F";

function svg(inner) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        ${inner}
      </g>
    </svg>
  `;
}

const icons = {
  "image-diaries": svg(`
    <rect x="92" y="126" width="294" height="234" rx="18" stroke="${navy}" stroke-width="18"/>
    <path d="M116 321l94-97 67 67 48-49 49 70" stroke="${navy}" stroke-width="18"/>
    <circle cx="324" cy="176" r="30" stroke="${red}" stroke-width="18"/>
    <path d="M402 171h28c22 0 40 18 40 40v190c0 22-18 40-40 40H164" stroke="${muted}" stroke-width="14" opacity=".35"/>
  `),
  doodle: svg(`
    <path d="M157 74h191c23 0 42 19 42 42v276c0 23-19 42-42 42H157c-23 0-42-19-42-42V116c0-23 19-42 42-42z" stroke="${navy}" stroke-width="18"/>
    <path d="M115 139H74M115 206H74M115 273H74M115 340H74" stroke="${navy}" stroke-width="18"/>
    <path d="M202 322c38 41 81-70 125-16 14 17 8 44-19 43-33-2-40-50-11-80 26-27 62-45 89-71" stroke="${red}" stroke-width="18"/>
    <path d="M358 107l76 76M347 118l-100 226 38 37 225-101-64-64" stroke="${muted}" stroke-width="16"/>
    <path d="M247 344l-22 58 60-21" stroke="${red}" stroke-width="16"/>
  `),
  animation: svg(`
    <rect x="93" y="184" width="326" height="217" rx="24" stroke="${navy}" stroke-width="18"/>
    <path d="M112 184l307-70 18 77M141 177l40-77M219 160l40-77M298 142l40-77M376 124l40-77" stroke="${navy}" stroke-width="18"/>
    <path d="M230 258l83 49-83 50z" stroke="${red}" stroke-width="18"/>
  `),
  videoscribe: svg(`
    <rect x="80" y="143" width="274" height="222" rx="24" stroke="${navy}" stroke-width="18"/>
    <path d="M191 215l81 48-81 48z" stroke="${red}" stroke-width="16"/>
    <path d="M353 77l79 79M337 93l-112 251 40 41 250-113-66-66" stroke="${muted}" stroke-width="16"/>
    <path d="M225 344l-23 61 63-20" stroke="${red}" stroke-width="16"/>
  `),
  global: svg(`
    <circle cx="256" cy="222" r="121" stroke="${navy}" stroke-width="18"/>
    <path d="M135 222h242M256 101c43 44 67 85 67 121s-24 77-67 121M256 101c-43 44-67 85-67 121s24 77 67 121" stroke="${navy}" stroke-width="16"/>
    <path d="M172 137c31 24 61 36 84 36s53-12 84-36M172 307c31-24 61-36 84-36s53 12 84 36" stroke="${red}" stroke-width="14"/>
    <path d="M256 345v78M190 423h132" stroke="${muted}" stroke-width="18"/>
  `),
  vocations: svg(`
    <rect x="86" y="165" width="340" height="232" rx="24" stroke="${navy}" stroke-width="18"/>
    <path d="M186 165v-39c0-22 18-40 40-40h60c22 0 40 18 40 40v39M86 249h340" stroke="${navy}" stroke-width="18"/>
    <rect x="219" y="220" width="74" height="58" rx="10" stroke="${red}" stroke-width="16"/>
    <path d="M256 232v33" stroke="${red}" stroke-width="14"/>
  `),
  online: svg(`
    <rect x="84" y="105" width="344" height="241" rx="22" stroke="${navy}" stroke-width="18"/>
    <path d="M123 407h266M178 346l-20 61M334 346l20 61" stroke="${navy}" stroke-width="18"/>
    <circle cx="256" cy="224" r="70" stroke="${red}" stroke-width="16"/>
    <path d="M186 224h140M256 154c27 28 42 51 42 70s-15 42-42 70M256 154c-27 28-42 51-42 70s15 42 42 70" stroke="${red}" stroke-width="13"/>
  `),
  introduction: svg(`
    <path d="M112 392V148c0-25 20-45 45-45h198c25 0 45 20 45 45v244" stroke="${navy}" stroke-width="18"/>
    <path d="M159 392h194M256 171v122M207 219l49-49 49 49" stroke="${red}" stroke-width="18"/>
    <path d="M159 331h194" stroke="${muted}" stroke-width="16"/>
  `),
  "general-marketplace-literacy": svg(`
    <path d="M95 205h322l-34-91H129z" stroke="${navy}" stroke-width="18"/>
    <path d="M95 205v48c0 29 24 53 53 53s53-24 53-53c0 29 24 53 53 53s53-24 53-53c0 29 24 53 53 53s53-24 53-53v-48" stroke="${red}" stroke-width="16"/>
    <path d="M128 306v94h256v-94M222 400V298h68v102" stroke="${navy}" stroke-width="18"/>
  `),
  "personal-and-professional-aspirations": svg(`
    <path d="M111 390c71-92 140-153 291-251" stroke="${navy}" stroke-width="18"/>
    <path d="M130 315h82v82M204 248h82v82M278 182h82v82" stroke="${muted}" stroke-width="16"/>
    <path d="M377 85l20 48 52 5-40 34 12 51-44-27-44 27 12-51-40-34 52-5z" stroke="${red}" stroke-width="16"/>
    <circle cx="111" cy="390" r="24" stroke="${red}" stroke-width="16"/>
  `),
  "consumer-literacy": svg(`
    <path d="M128 176h260l-32 202H160z" stroke="${navy}" stroke-width="18"/>
    <path d="M181 176c0-56 34-98 76-98s76 42 76 98" stroke="${navy}" stroke-width="18"/>
    <path d="M208 269h96M208 325h68" stroke="${muted}" stroke-width="16"/>
    <path d="M352 260l57-57 30 30-57 57zM375 293l-25 9 9-25" stroke="${red}" stroke-width="14"/>
  `),
  "entrepreneurial-literacy": svg(`
    <path d="M256 76c72 0 130 58 130 130 0 44-22 83-56 106-20 14-29 31-29 55h-90c0-24-9-41-29-55-34-23-56-62-56-106 0-72 58-130 130-130z" stroke="${navy}" stroke-width="18"/>
    <path d="M213 405h86M226 451h60M211 224l35 35 67-86" stroke="${red}" stroke-width="18"/>
  `),
  "sustainability-literacy": svg(`
    <path d="M116 334c58-8 92 9 139 44 39 29 85 39 141 19" stroke="${navy}" stroke-width="18"/>
    <path d="M262 310c-11-91 42-165 139-196 28 96-23 183-139 196z" stroke="${red}" stroke-width="18"/>
    <path d="M264 309c35-63 77-112 137-195" stroke="${red}" stroke-width="14"/>
    <path d="M196 333c-49-58-51-125-7-198 73 50 86 129 7 198z" stroke="${muted}" stroke-width="18"/>
    <path d="M196 333c-4-58-10-111-7-198" stroke="${muted}" stroke-width="14"/>
  `)
};

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });

for (const [name, source] of Object.entries(icons)) {
  const webp = await page.evaluate(async ({ source }) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 512, 512);
    ctx.drawImage(image, 0, 0, 512, 512);
    const dataUrl = canvas.toDataURL("image/webp", 0.92);
    return dataUrl.split(",")[1];
  }, { source });

  const filePath = path.join(outDir, `${name}.webp`);
  await fs.writeFile(filePath, Buffer.from(webp, "base64"));
}

await browser.close();

const files = await fs.readdir(outDir);
for (const file of files.filter((item) => item.endsWith(".webp")).sort()) {
  const stat = await fs.stat(path.join(outDir, file));
  console.log(`${file}\t${stat.size} bytes`);
}
