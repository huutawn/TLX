/// <reference lib="dom" />

import os from 'os';
import { chromium } from 'playwright';

interface UIElement {
  selector: string;
  tagName: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class EngineService {
  async getSystemStatus() {
    return {
      status: 'active',
      engine: 'TLX engine',
      platform: os.platform(),
      uptime: os.uptime(),
    };
  }

  /**
   * Thuat toan hinh hoc AABB Collision de kiem tra xem Element A co de len Element B khong.
   */
  private isOverlapping(elementA: UIElement, elementB: UIElement): boolean {
    return (
      elementA.x < elementB.x + elementB.width &&
      elementA.x + elementA.width > elementB.x &&
      elementA.y < elementB.y + elementB.height &&
      elementA.y + elementA.height > elementB.y
    );
  }

  async runProjectScan(targetUrl: string = 'http://localhost:3000') {
    console.log(`\n[EngineService] Khoi chay Playwright quet dich: ${targetUrl}`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const bugs: string[] = [];
    let elements: UIElement[] = [];

    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle' });

      elements = await page.evaluate(() => {
        const selectors = 'button, a, h1, p, input, div.__tlx-target';

        return Array.from(document.querySelectorAll<HTMLElement>(selectors))
          .map((el, index) => {
            const rect = el.getBoundingClientRect();

            return {
              selector: `${el.tagName.toLowerCase()}_${index}`,
              tagName: el.tagName,
              text: (el.textContent || '').trim().substring(0, 20),
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
          })
          .filter((item) => item.width > 0 && item.height > 0);
      });

      console.log(`[EngineService] Thu thap ${elements.length} phan tu. Bat dau phan tich...`);
      const startTime = performance.now();

      elements.sort((a, b) => a.x - b.x);

      for (let i = 0; i < elements.length; i++) {
        const elA = elements[i];
        if (!elA) {
          continue;
        }

        for (let j = i + 1; j < elements.length; j++) {
          const elB = elements[j];
          if (!elB) {
            continue;
          }

          if (elB.x >= elA.x + elA.width) {
            break;
          }

          if (this.isOverlapping(elA, elB)) {
            const bugMessage = `[Loi de lap] Phan tu [${elA.tagName}] ("${elA.text}") va [${elB.tagName}] ("${elB.text}") giao nhau.`;
            bugs.push(bugMessage);
          }
        }
      }

      const endTime = performance.now();
      console.log(`[EngineService] Hoan thanh phan tich trong ${(endTime - startTime).toFixed(2)} ms.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[EngineService Error] ${message}`);
      throw error;
    } finally {
      await browser.close();
    }

    return {
      success: true,
      totalElementsScanned: elements.length,
      bugsFound: bugs,
      timestamp: new Date().toISOString(),
    };
  }
}
