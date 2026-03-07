"""
Deep-dive into the job detail content area to map quick facts.
"""
import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = await ctx.new_page()
        
        await page.goto("https://co.computrabajo.com/trabajo-de-ingeniero", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)
        
        first_link = page.locator("article a, .box_offer a, a.js-o-link, h2 a").first
        href = await first_link.get_attribute("href")
        if href and not href.startswith("http"):
            href = "https://co.computrabajo.com" + href
        await page.goto(href, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)
        
        # Deep analysis of the content container
        data = await page.evaluate('''() => {
            const results = {};
            
            // The main content container
            const main = document.querySelector('main.detail_fs');
            if (!main) return {error: "No main.detail_fs found"};
            
            // Get ALL direct children of main with their classes and text
            const menuTop = main.querySelector('.box_border.menu_top');
            if (menuTop) {
                results.menuTopText = menuTop.innerText.substring(0, 200);
                // Get children of menuTop
                results.menuTopChildren = Array.from(menuTop.children).map(c => ({
                    tag: c.tagName,
                    class: c.className.substring(0, 100),
                    id: c.id,
                    textLength: c.innerText?.length || 0,
                    textSnippet: c.innerText?.substring(0, 120)
                }));
            }
            
            // Try alternative: get the DIV that contains the description
            // Look for #TextoOferta, .fs16, .mbB, p.mbB
            const descSelectors = [
                '#TextoOferta', '.fs16', '.mbB', 'p.mbB', '.fc_base',
                '.bWord', '.box_info', 'div.bWord', 'div.fs16',
                'ul.p0', 'ul.disc'
            ];
            results.descMatches = {};
            for (const sel of descSelectors) {
                try {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) {
                        results.descMatches[sel] = Array.from(els).slice(0, 3).map(el => ({
                            tag: el.tagName,
                            class: el.className,
                            textLength: el.innerText?.length || 0,
                            textSnippet: el.innerText?.substring(0, 150)
                        }));
                    }
                } catch(e) {}
            }
            
            // Look for the "Datos rapidos" section - tags, badges, etc.
            const tagSelectors = [
                '.tag', 'span.tag', '.p_tag', '.box_r_offer span',
                'p.fs16', 'p.fc_aux', '.fc_aux', '.fs13', '.fw_b',
                'ul.p0 li', 'ul.disc li'
            ];
            results.tagMatches = {};
            for (const sel of tagSelectors) {
                try {
                    const els = document.querySelectorAll(sel);
                    if (els.length > 0) {
                        results.tagMatches[sel] = Array.from(els).slice(0, 8).map(el => ({
                            text: el.innerText?.trim()?.substring(0, 80)
                        }));
                    }
                } catch(e) {}
            }
            
            // Finally, the full main content excluding nav
            const clonedMain = main.cloneNode(true);
            // Remove nav elements from the clone
            clonedMain.querySelectorAll('nav, .header, script, style, .js_popup').forEach(n => n.remove());
            results.cleanMainText = clonedMain.innerText?.substring(0, 500);
            results.cleanMainTextLength = clonedMain.innerText?.length;
            
            return results;
        }''')
        
        print(json.dumps(data, indent=2, ensure_ascii=False))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
