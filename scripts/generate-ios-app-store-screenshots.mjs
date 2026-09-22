import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.IOS_SCREENSHOT_BASE_URL || "https://marketplaceliteracyapp.org").replace(/\/$/, "");
const outputRoot = path.resolve("docs", "ios", "app-store-screenshots");

const shots = [
  {
    slug: "01-home",
    title: "Home",
    path: "/",
    description: "Marketplace Literacy App home screen",
  },
  {
    slug: "02-select-language",
    title: "Select Language",
    path: "/resources",
    description: "Language selection screen",
  },
  {
    slug: "03-resource-formats",
    title: "Resource Formats",
    path: "/resources/english",
    description: "Resource format selection screen",
  },
  {
    slug: "04-resource-clips",
    title: "Resource Clips",
    path: "/resources/english/image-diaries",
    fallbackPath: "/resources/english",
    description: "English Image Diaries resource clips",
  },
  {
    slug: "05-search",
    title: "Search",
    path: "/search",
    description: "Search and browse resources",
  },
];

const devices = [
  {
    name: "iphone-6-5",
    display: "iPhone 6.5-inch",
    width: 414,
    height: 896,
    scale: 3,
    expectedWidth: 1242,
    expectedHeight: 2688,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  {
    name: "ipad-12-9",
    display: "iPad Pro 12.9-inch",
    width: 1024,
    height: 1366,
    scale: 2,
    expectedWidth: 2048,
    expectedHeight: 2732,
    isMobile: false,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
];

function pngDimensions(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Screenshot is not a PNG file.");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function gotoWithFallback(page, shot) {
  const target = `${baseUrl}${shot.path}`;
  const response = await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });

  if (response && response.status() < 400) {
    return target;
  }

  if (!shot.fallbackPath) {
    return target;
  }

  const fallback = `${baseUrl}${shot.fallbackPath}`;
  await page.goto(fallback, { waitUntil: "networkidle", timeout: 60_000 });
  return fallback;
}

async function captureDevice(browser, device) {
  const outDir = path.join(outputRoot, device.name);
  await fs.mkdir(outDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: device.isMobile,
    hasTouch: true,
    userAgent: device.userAgent,
    locale: "en-US",
  });

  const rows = [];
  const page = await context.newPage();

  for (const shot of shots) {
    const visitedUrl = await gotoWithFallback(page, shot);
    await page.addStyleTag({
      content: `
        html, body { background: #f7f8fa !important; }
        * { -webkit-tap-highlight-color: transparent; }
      `,
    });
    await page.waitForTimeout(1200);

    const filename = `${shot.slug}-${device.name}.png`;
    const filePath = path.join(outDir, filename);
    await page.screenshot({ path: filePath, fullPage: false });

    const buffer = await fs.readFile(filePath);
    const dimensions = pngDimensions(buffer);
    const validSize =
      dimensions.width === device.expectedWidth && dimensions.height === device.expectedHeight;

    rows.push({
      device: device.display,
      folder: device.name,
      title: shot.title,
      description: shot.description,
      url: visitedUrl,
      file: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
      width: dimensions.width,
      height: dimensions.height,
      validSize,
    });

    if (!validSize) {
      throw new Error(
        `${filename} was ${dimensions.width}x${dimensions.height}; expected ${device.expectedWidth}x${device.expectedHeight}.`,
      );
    }
  }

  await context.close();
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const manifest = [];

  try {
    for (const device of devices) {
      console.log(`Capturing ${device.display} screenshots from ${baseUrl}`);
      manifest.push(...(await captureDevice(browser, device)));
    }
  } finally {
    await browser.close();
  }

  const jsonPath = path.join(outputRoot, "screenshot-manifest.json");
  const csvPath = path.join(outputRoot, "screenshot-manifest.csv");

  await fs.writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(
    csvPath,
    [
      "device,folder,title,description,url,file,width,height,validSize",
      ...manifest.map((row) =>
        [
          row.device,
          row.folder,
          row.title,
          row.description,
          row.url,
          row.file,
          row.width,
          row.height,
          row.validSize,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n") + "\n",
  );

  console.log(`Created ${manifest.length} App Store screenshots.`);
  console.log(`Manifest: ${path.relative(process.cwd(), jsonPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
